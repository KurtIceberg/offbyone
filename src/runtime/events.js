const fs = require('fs');
const path = require('path');
const { sanitizeForRuntimeResponse } = require('./policy');

const RUNTIME_EVENT_VERSION = 'offbyone-runtime-event-v1';

function createEvent(type, payload = {}, options = {}) {
  if (!type) throw new Error('event type is required');
  const now = options.now || (() => new Date());
  const createdAt = options.createdAt || toIso(now());
  return {
    version: RUNTIME_EVENT_VERSION,
    type: String(type),
    createdAt,
    payload: sanitizeForRuntimeResponse(payload || {})
  };
}

function appendJsonlEvent(file, event) {
  if (!file) throw new Error('event file is required');
  const normalized = normalizeEvent(event);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(normalized) + '\n', 'utf8');
  return normalized;
}

function readJsonlEvents(file, options = {}) {
  if (!file || !fs.existsSync(file)) return [];
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(0, Number(options.limit)) : null;
  const after = options.after == null ? 0 : Math.max(0, Number(options.after) || 0);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const windowed = lines.slice(after);
  const selected = limit == null ? windowed : windowed.slice(Math.max(0, windowed.length - limit));
  const baseIndex = limit == null ? after : after + Math.max(0, windowed.length - limit);
  const events = [];
  for (let index = 0; index < selected.length; index += 1) {
    const line = selected[index];
    try {
      events.push(Object.assign({ offset: baseIndex + index + 1 }, normalizeEvent(JSON.parse(line))));
    } catch (_) {
      events.push(Object.assign({ offset: baseIndex + index + 1 }, createEvent('runtime.invalid-jsonl', { line: '[unreadable]' }, { createdAt: '' })));
    }
  }
  return events;
}

function compactEvent(event) {
  const normalized = normalizeEvent(event);
  const payload = normalized.payload || {};
  return {
    type: normalized.type,
    createdAt: normalized.createdAt,
    stage: payload.stage || '',
    status: payload.status || '',
    message: compactString(payload.message || payload.summary || '', 240),
    offset: event.offset || 0
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('event object is required');
  return {
    version: event.version || RUNTIME_EVENT_VERSION,
    type: String(event.type || 'runtime.event'),
    createdAt: String(event.createdAt || new Date().toISOString()),
    payload: sanitizeForRuntimeResponse(event.payload || {})
  };
}

function compactString(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

module.exports = {
  RUNTIME_EVENT_VERSION,
  createEvent,
  appendJsonlEvent,
  readJsonlEvents,
  compactEvent,
  normalizeEvent
};
