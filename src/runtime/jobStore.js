const fs = require('fs');
const path = require('path');
const { sanitizeForRuntimeResponse } = require('./policy');
const { createEvent, appendJsonlEvent, readJsonlEvents, compactEvent } = require('./events');

const JOB_STORE_VERSION = 'offbyone-runtime-job-v1';
const TERMINAL_STATUSES = new Set(['succeeded', 'completed_with_warnings', 'failed', 'canceled']);
const CANCEL_MARKER_FILE = 'cancel-requested.json';

function createJobStore(options = {}) {
  const clock = options.now || (() => new Date());
  const idFactory = options.idFactory || createDefaultIdFactory(clock);
  const output = options.output ? path.resolve(options.output) : '';
  const jobsRoot = resolveJobsRoot({ output, jobRoot: options.jobRoot, jobsRoot: options.jobsRoot });

  function nowIso() {
    const value = clock();
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  function jobDir(jobId) {
    const id = assertJobId(jobId);
    const dir = path.resolve(jobsRoot, id);
    assertInsideOrEqual(jobsRoot, dir, 'job directory escapes job root');
    return dir;
  }

  function jobFile(jobId) {
    return path.join(jobDir(jobId), 'job.json');
  }

  function eventsFile(jobId) {
    return path.join(jobDir(jobId), 'events.jsonl');
  }

  function cancelMarkerFile(jobId) {
    return path.join(jobDir(jobId), CANCEL_MARKER_FILE);
  }

  function createJob(input = {}) {
    const id = assertJobId(input.jobId || idFactory(input));
    const dir = jobDir(id);
    if (fs.existsSync(jobFile(id)) && input.force !== true) throw new Error('Job already exists: ' + id);
    fs.mkdirSync(dir, { recursive: true });
    const createdAt = nowIso();
    const job = normalizeJob({
      version: JOB_STORE_VERSION,
      id,
      status: input.status || 'queued',
      stage: input.stage || 'queued',
      kind: input.kind || 'runtime-task',
      output: input.output ? path.resolve(input.output) : output,
      jobRoot: jobsRoot,
      createdAt,
      updatedAt: createdAt,
      input: sanitizeForRuntimeResponse(input.input || {}),
      result: null,
      error: null,
      eventCount: 0,
      controls: createControlState(input),
      plan: createPlanState(input)
    });
    writeJob(job);
    appendEvent(id, 'job.created', { status: job.status, stage: job.stage, message: 'Job created.' });
    return readJob(id);
  }

  function readJob(jobId, options = {}) {
    const file = jobFile(jobId);
    if (!fs.existsSync(file)) return null;
    const job = normalizeJob(JSON.parse(fs.readFileSync(file, 'utf8')));
    const marker = readCancelMarker(job.id);
    if (marker) {
      job.controls.cancelRequested = true;
      job.controls.cancelMarker = cancelMarkerFile(job.id);
      job.controls.cancelRequestedAt = marker.requestedAt || job.controls.cancelRequestedAt || '';
      job.controls.cancelReason = job.controls.cancelReason || marker.reason || '';
      job.controls.requestedBy = marker.requestedBy || job.controls.requestedBy || '';
    }
    job.eventCount = Math.max(Number(job.eventCount || 0), countEventLines(eventsFile(job.id)));
    if (options.includeEvents) job.events = readEvents(job.id, options.events || {});
    return job;
  }

  function readStatus(jobId) {
    const job = requireJob(jobId);
    return compactJob(job);
  }

  function updateStatus(jobId, status, patch = {}) {
    if (!status) throw new Error('status is required');
    const job = requireJob(jobId);
    if (TERMINAL_STATUSES.has(job.status) && patch.force !== true) throw new Error('Cannot update terminal job: ' + job.id);
    job.status = String(status);
    job.stage = patch.stage || job.stage || String(status);
    job.updatedAt = nowIso();
    if (patch.result !== undefined) job.result = sanitizeForRuntimeResponse(patch.result);
    if (patch.error !== undefined) job.error = compactError(patch.error);
    if (patch.plan !== undefined) job.plan = mergePlan(job.plan, patch.plan);
    if (patch.controls !== undefined) job.controls = mergeControls(job.controls, patch.controls);
    writeJob(job);
    appendEvent(job.id, patch.eventType || 'job.status', {
      status: job.status,
      stage: job.stage,
      message: patch.message || '',
      result: patch.result === undefined ? undefined : job.result,
      error: patch.error === undefined ? undefined : job.error,
      plan: patch.plan === undefined ? undefined : job.plan,
      controls: patch.controls === undefined ? undefined : job.controls
    });
    return readJob(job.id);
  }

  function appendEvent(jobId, type, payload = {}) {
    const job = requireJob(jobId, { allowMissing: type === 'job.created' });
    const event = appendJsonlEvent(eventsFile(jobId), createEvent(type, payload, { now: clock }));
    if (job) {
      job.eventCount = countEventLines(eventsFile(job.id));
      job.updatedAt = nowIso();
      writeJob(job);
    }
    return event;
  }

  function readEvents(jobId, options = {}) {
    return readJsonlEvents(eventsFile(jobId), options);
  }

  function requestCancel(jobId, options = {}) {
    const job = requireJob(jobId);
    if (TERMINAL_STATUSES.has(job.status) && options.force !== true) {
      throw new Error('Cannot cancel terminal job: ' + job.id);
    }
    const requestedAt = nowIso();
    const marker = sanitizeForRuntimeResponse({
      version: JOB_STORE_VERSION,
      jobId: job.id,
      requestedAt,
      reason: options.reason || options.message || 'Cancel requested.',
      requestedBy: options.requestedBy || 'runtime'
    });
    writeJsonAtomic(cancelMarkerFile(job.id), marker);
    job.controls = mergeControls(job.controls, {
      cancelRequested: true,
      cancelMarker: cancelMarkerFile(job.id),
      cancelRequestedAt: requestedAt,
      cancelReason: marker.reason,
      requestedBy: marker.requestedBy
    });
    job.status = options.status || (job.status === 'queued' ? 'canceling' : job.status);
    job.stage = options.stage || job.stage || 'canceling';
    job.updatedAt = requestedAt;
    writeJob(job);
    appendEvent(job.id, 'job.cancel.requested', {
      status: job.status,
      stage: job.stage,
      message: marker.reason,
      controls: job.controls
    });
    return readJob(job.id);
  }

  function readCancelMarker(jobId) {
    const file = cancelMarkerFile(jobId);
    if (!fs.existsSync(file)) return null;
    try {
      return sanitizeForRuntimeResponse(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (_) {
      return { version: JOB_STORE_VERSION, jobId: assertJobId(jobId), requestedAt: '', reason: 'Cancel marker is unreadable.' };
    }
  }

  function isCancelRequested(jobId) {
    const job = requireJob(jobId);
    return Boolean((job.controls && job.controls.cancelRequested) || fs.existsSync(cancelMarkerFile(job.id)));
  }

  function assertNotCanceled(jobId) {
    if (!isCancelRequested(jobId)) return true;
    const err = new Error('Job cancel requested: ' + jobId);
    err.code = 'OFFBYONE_JOB_CANCEL_REQUESTED';
    err.jobId = assertJobId(jobId);
    throw err;
  }

  function markCanceled(jobId, reason) {
    const marker = readCancelMarker(jobId);
    return updateStatus(jobId, 'canceled', {
      stage: 'canceled',
      error: { code: 'OFFBYONE_JOB_CANCELED', message: reason || marker && marker.reason || 'Job canceled.' },
      controls: {
        cancelRequested: true,
        cancelMarker: cancelMarkerFile(jobId),
        cancelReason: reason || marker && marker.reason || 'Job canceled.',
        requestedBy: marker && marker.requestedBy || ''
      },
      eventType: 'job.canceled',
      message: reason || marker && marker.reason || 'Job canceled.'
    });
  }

  function planRetry(jobId, options = {}) {
    const job = requireJob(jobId);
    const previous = job.plan || {};
    const attempt = Number(options.attempt || previous.attempt || 0) + 1;
    const retryJobId = options.retryJobId ? assertJobId(options.retryJobId) : job.id + '-retry-' + String(attempt).padStart(2, '0');
    const plan = mergePlan(previous, {
      canRetry: options.canRetry !== false,
      retryOf: job.id,
      retryJobId,
      attempt,
      maxRetries: options.maxRetries == null ? previous.maxRetries || 1 : Number(options.maxRetries),
      nextAttemptAt: options.nextAttemptAt || '',
      reason: options.reason || 'Retry planned.',
      updatedAt: nowIso()
    });
    job.plan = plan;
    job.updatedAt = plan.updatedAt;
    writeJob(job);
    appendEvent(job.id, 'job.retry.planned', { status: job.status, stage: job.stage, message: plan.reason, plan });
    return readJob(job.id);
  }

  function planResume(jobId, options = {}) {
    const job = requireJob(jobId);
    const resumeJobId = options.resumeJobId ? assertJobId(options.resumeJobId) : job.id + '-resume';
    const plan = mergePlan(job.plan, {
      canResume: options.canResume !== false,
      resumeOf: job.id,
      resumeJobId,
      resumeFromStage: options.resumeFromStage || job.stage || '',
      reason: options.reason || 'Resume planned.',
      updatedAt: nowIso()
    });
    job.plan = plan;
    job.updatedAt = plan.updatedAt;
    writeJob(job);
    appendEvent(job.id, 'job.resume.planned', { status: job.status, stage: job.stage, message: plan.reason, plan });
    return readJob(job.id);
  }

  function markSuccess(jobId, result = {}) {
    return updateStatus(jobId, 'succeeded', { stage: 'done', result, eventType: 'job.succeeded', message: 'Job succeeded.' });
  }

  function markFailure(jobId, error = {}, options = {}) {
    const patch = { stage: 'failed', error, eventType: 'job.failed', message: 'Job failed.' };
    if (options.plan) patch.plan = options.plan;
    return updateStatus(jobId, 'failed', patch);
  }

  function compactSummary(jobId, options = {}) {
    const job = requireJob(jobId);
    const events = readEvents(job.id, { limit: options.eventLimit == null ? 5 : options.eventLimit }).map(compactEvent);
    const lastEvent = events.length ? events[events.length - 1] : null;
    return Object.assign(compactJob(job), {
      input: options.includeInput ? compactValue(job.input, 600) : undefined,
      result: compactValue(job.result, options.maxResultLength || 600),
      error: job.error || null,
      plan: compactPlan(job.plan),
      controls: compactControls(job.controls),
      progress: {
        eventCount: Number(job.eventCount || 0),
        nextEventAfter: Number(job.eventCount || 0),
        lastEventOffset: lastEvent && lastEvent.offset || 0,
        lastEventType: lastEvent && lastEvent.type || '',
        lastEventStage: lastEvent && lastEvent.stage || job.stage || '',
        lastEventStatus: lastEvent && lastEvent.status || job.status || '',
        lastEventMessage: lastEvent && lastEvent.message || ''
      },
      recentEvents: events
    });
  }

  function listJobs(options = {}) {
    if (!fs.existsSync(jobsRoot)) return [];
    const limit = options.limit == null ? 50 : Math.max(0, Number(options.limit));
    const jobs = fs.readdirSync(jobsRoot)
      .filter((name) => isValidJobId(name) && fs.existsSync(path.join(jobsRoot, name, 'job.json')))
      .map((id) => {
        try {
          return readJob(id, { includeEvents: options.includeEvents === true, events: options.events || {} });
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .filter((job) => !options.status || job.status === options.status)
      .filter((job) => !options.kind || job.kind === options.kind)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, limit);
    if (options.compact === false) return jobs;
    return jobs.map((job) => options.summary ? compactSummary(job.id, options) : compactJob(job));
  }

  function readJobSummary(jobId, options = {}) {
    return compactSummary(jobId, options);
  }

  function listSummaries(options = {}) {
    return listJobs(Object.assign({}, options, { summary: true }));
  }

  function requireJob(jobId, options = {}) {
    const job = readJob(jobId);
    if (!job && !options.allowMissing) throw new Error('Job not found: ' + jobId);
    return job;
  }

  function writeJob(job) {
    fs.mkdirSync(jobDir(job.id), { recursive: true });
    writeJsonAtomic(jobFile(job.id), normalizeJob(sanitizeForRuntimeResponse(job)));
  }

  return {
    version: JOB_STORE_VERSION,
    output,
    jobsRoot,
    jobDir,
    jobFile,
    eventsFile,
    cancelMarkerFile,
    createJob,
    readJob,
    readStatus,
    listJobs,
    updateStatus,
    appendEvent,
    readEvents,
    requestCancel,
    readCancelMarker,
    isCancelRequested,
    assertNotCanceled,
    markCanceled,
    planRetry,
    planResume,
    markSuccess,
    markFailure,
    compactSummary,
    readJobSummary,
    listSummaries
  };
}

function resolveJobsRoot(options = {}) {
  const explicit = options.jobRoot || options.jobsRoot;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (options.output) {
      assertInsideOrEqual(options.output, resolved, 'job root must stay inside output root');
    }
    return resolved;
  }
  if (!options.output) throw new Error('output or jobRoot is required');
  return path.join(path.resolve(options.output), '.agent', 'jobs');
}

function createDefaultIdFactory(clock) {
  let counter = 0;
  return function defaultIdFactory() {
    counter += 1;
    const value = clock();
    const stamp = (value instanceof Date ? value : new Date(value)).toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    return 'job-' + stamp + '-' + String(counter).padStart(4, '0');
  };
}

function isValidJobId(jobId) {
  const id = String(jobId || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id) && id !== '.' && id !== '..';
}

function assertJobId(jobId) {
  const id = String(jobId || '').trim();
  if (!isValidJobId(id)) throw new Error('Invalid job id: ' + id);
  return id;
}

function assertInsideOrEqual(root, target, message) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
  throw new Error(message + ': ' + target);
}

function normalizeJob(job) {
  const normalized = Object.assign({}, job || {});
  normalized.version = normalized.version || JOB_STORE_VERSION;
  normalized.id = assertJobId(normalized.id);
  normalized.status = String(normalized.status || 'unknown');
  normalized.stage = String(normalized.stage || '');
  normalized.kind = String(normalized.kind || 'runtime-task');
  normalized.output = normalized.output || '';
  normalized.jobRoot = normalized.jobRoot || '';
  normalized.createdAt = normalized.createdAt || '';
  normalized.updatedAt = normalized.updatedAt || normalized.createdAt || '';
  normalized.input = sanitizeForRuntimeResponse(normalized.input || {});
  normalized.result = normalized.result == null ? null : sanitizeForRuntimeResponse(normalized.result);
  normalized.error = normalized.error == null ? null : compactError(normalized.error);
  normalized.eventCount = Number(normalized.eventCount || 0);
  normalized.controls = mergeControls({}, normalized.controls || {});
  normalized.plan = mergePlan({}, normalized.plan || {});
  return normalized;
}

function createControlState(input = {}) {
  return mergeControls({}, {
    cancelRequested: false,
    cancelMarker: '',
    cancelRequestedAt: '',
    cancelReason: '',
    requestedBy: input.requestedBy || ''
  });
}

function createPlanState(input = {}) {
  return mergePlan({}, {
    attempt: Number(input.attempt || 0),
    maxRetries: Number(input.maxRetries || 0),
    canRetry: input.canRetry === true,
    retryOf: input.retryOf || '',
    retryJobId: input.retryJobId || '',
    canResume: input.canResume === true,
    resumeOf: input.resumeOf || '',
    resumeJobId: input.resumeJobId || '',
    resumeFromStage: input.resumeFromStage || '',
    nextAttemptAt: input.nextAttemptAt || '',
    reason: input.planReason || input.reason || '',
    updatedAt: input.planUpdatedAt || ''
  });
}

function mergeControls(base = {}, patch = {}) {
  return sanitizeForRuntimeResponse(Object.assign({
    cancelRequested: false,
    cancelMarker: '',
    cancelRequestedAt: '',
    cancelReason: '',
    requestedBy: ''
  }, base || {}, patch || {}));
}

function mergePlan(base = {}, patch = {}) {
  return sanitizeForRuntimeResponse(Object.assign({
    attempt: 0,
    maxRetries: 0,
    canRetry: false,
    retryOf: '',
    retryJobId: '',
    canResume: false,
    resumeOf: '',
    resumeJobId: '',
    resumeFromStage: '',
    nextAttemptAt: '',
    reason: '',
    updatedAt: ''
  }, base || {}, patch || {}));
}

function compactJob(job) {
  const normalized = normalizeJob(job);
  const controls = compactControls(normalized.controls);
  const plan = compactPlan(normalized.plan);
  return {
    version: normalized.version || JOB_STORE_VERSION,
    id: normalized.id,
    status: normalized.status || 'unknown',
    stage: normalized.stage || '',
    kind: normalized.kind || '',
    output: normalized.output || '',
    jobDir: path.join(normalized.jobRoot || '', normalized.id || ''),
    createdAt: normalized.createdAt || '',
    updatedAt: normalized.updatedAt || '',
    eventCount: Number(normalized.eventCount || 0),
    cancelRequested: controls.cancelRequested,
    retry: plan.canRetry ? { retryOf: plan.retryOf, retryJobId: plan.retryJobId, attempt: plan.attempt, maxRetries: plan.maxRetries } : null,
    resume: plan.canResume ? { resumeOf: plan.resumeOf, resumeJobId: plan.resumeJobId, resumeFromStage: plan.resumeFromStage } : null
  };
}

function compactControls(controls = {}) {
  const normalized = mergeControls({}, controls);
  return {
    cancelRequested: Boolean(normalized.cancelRequested),
    cancelRequestedAt: normalized.cancelRequestedAt || '',
    cancelReason: normalized.cancelReason || '',
    cancelMarker: normalized.cancelMarker || '',
    requestedBy: normalized.requestedBy || ''
  };
}

function compactPlan(plan = {}) {
  const normalized = mergePlan({}, plan);
  return {
    attempt: Number(normalized.attempt || 0),
    maxRetries: Number(normalized.maxRetries || 0),
    canRetry: Boolean(normalized.canRetry),
    retryOf: normalized.retryOf || '',
    retryJobId: normalized.retryJobId || '',
    canResume: Boolean(normalized.canResume),
    resumeOf: normalized.resumeOf || '',
    resumeJobId: normalized.resumeJobId || '',
    resumeFromStage: normalized.resumeFromStage || '',
    nextAttemptAt: normalized.nextAttemptAt || '',
    reason: compactString(normalized.reason || '', 240),
    updatedAt: normalized.updatedAt || ''
  };
}

function compactError(error) {
  if (!error) return null;
  if (error instanceof Error) return sanitizeForRuntimeResponse({ name: error.name, message: error.message, code: error.code || '' });
  if (typeof error === 'string') return sanitizeForRuntimeResponse({ message: error });
  return sanitizeForRuntimeResponse(error);
}

function compactValue(value, maxLength) {
  if (value == null) return value;
  const sanitized = sanitizeForRuntimeResponse(value);
  const text = JSON.stringify(sanitized);
  if (text.length <= maxLength) return sanitized;
  return { compacted: true, text: text.slice(0, maxLength - 1) + '…' };
}

function compactString(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function countEventLines(file) {
  try {
    if (!fs.existsSync(file)) return 0;
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).length;
  } catch (_) {
    return 0;
  }
}

function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = {
  JOB_STORE_VERSION,
  CANCEL_MARKER_FILE,
  TERMINAL_STATUSES,
  createJobStore,
  resolveJobsRoot,
  compactJob,
  compactPlan,
  compactControls,
  isValidJobId,
  assertJobId
};
