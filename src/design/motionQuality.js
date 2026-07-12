const MOTION_QUALITY_VERSION = 'emil-kowalski-motion-quality@1.0.0';
const MOTION_QUALITY_SOURCE = 'emilkowalski/skills-local-distillation';

const MOTION_TOKENS = {
  easing: {
    uiEaseOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
    uiEaseInOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
    drawerEase: 'cubic-bezier(0.32, 0.72, 0, 1)'
  },
  duration: {
    press: '100-160ms',
    tooltipPopover: '125-200ms',
    dropdownSelect: '150-250ms',
    routineUiMax: '<=300ms',
    modalDrawer: '200-500ms'
  },
  physicality: {
    pressScale: 'scale(0.97)',
    enterScale: 'scale(0.95) + opacity: 0',
    popoverOrigin: 'trigger-aware transform-origin',
    reducedMotion: 'drop transform movement; keep opacity/color feedback'
  }
};

const BASE_DIRECTIVES = [
  'Animate only when motion clarifies hierarchy, state, spatial relationship, product flow, or prevents a jarring change.',
  'Frequent and keyboard-driven actions should be instant; command-palette-like surfaces should not pay an open/close animation tax.',
  'Use transform and opacity for routine UI motion; avoid layout-property animation and unbounded transition-all.',
  'Use strong ease-out for enter/exit feedback and strong ease-in-out for on-screen movement; avoid ease-in on UI because it feels delayed.',
  'Keep routine UI motion under 300ms; button press 100-160ms, tooltips/popovers 125-200ms, dropdown/select 150-250ms.',
  'Pressable elements need subtle pointer-down feedback around scale(0.97), not noisy hover decoration.',
  'Popover, dropdown, and tooltip motion should originate from the trigger; modals may stay centered.',
  'Never enter from scale(0); use a near-final scale such as scale(0.95) plus opacity instead.',
  'Honor reduced motion by removing movement/position transforms while preserving gentle opacity or color feedback.'
];

const QA_SIGNALS = [
  'purposeful motion',
  'responsive easing',
  'sub-300ms routine UI',
  'trigger-aware origin',
  'transform/opacity performance',
  'reduced-motion support'
];

const RED_FLAGS = [
  'transition-all or transition: all',
  'ease-in on UI interactions',
  'scale(0) or scale-0 entrances',
  'routine UI duration over 300ms',
  'layout-property animation',
  'missing reduced-motion handling when motion is present',
  'center-origin popover/dropdown/tooltip motion'
];

function normalizeMotionLevel(value) {
  const text = String(value || '').toLowerCase();
  if (/none|no|zero/.test(text)) return 'none';
  if (/low/.test(text)) return 'low';
  if (/high/.test(text)) return 'medium-high';
  if (/medium/.test(text)) return 'medium';
  return 'low-medium';
}

function createMotionQualityGate(input = {}) {
  const profile = input.profile || {};
  const dials = input.tasteDials || {};
  const stylePack = input.stylePack || null;
  const intensity = normalizeMotionLevel(dials.motion || profile.motion || (stylePack && stylePack.motionHints));
  const siteType = profile.siteType || 'general-business';
  const density = profile.density || (stylePack && stylePack.density) || 'medium';
  const directives = BASE_DIRECTIVES.slice();
  if (siteType === 'enterprise-b2b-admin' || density === 'high') {
    directives.unshift('For dense operational screens, prefer near-instant state feedback and restrained motion over decorative reveal effects.');
  }
  if (siteType === 'premium-consumer') {
    directives.unshift('For premium/editorial pages, motion may support image reveal and section rhythm, but it must stay quiet and physically plausible.');
  }
  if (siteType === 'ai-saas-devtool') {
    directives.unshift('For SaaS/devtool pages, motion should make product state, workflow progress, and activation feedback feel precise.');
  }
  return {
    version: MOTION_QUALITY_VERSION,
    source: MOTION_QUALITY_SOURCE,
    sourceNotes: 'Local OffByOne distillation of design-engineering and animation-review rules from emilkowalski/skills; values are stored as abstract guidance, not upstream prompt dumps.',
    intensity,
    motionRead: 'Motion is product hand-feel: it should make the interface feel responsive, oriented, and intentional rather than merely animated.',
    tokens: MOTION_TOKENS,
    generationDirectives: directives,
    qaSignals: QA_SIGNALS.slice(),
    redFlags: RED_FLAGS.slice(),
    nonInfringementBoundary: 'Use motion craft principles and timing values as generic interaction guidance; do not copy course content, brand identity, protected assets, or full upstream skill text.'
  };
}

function addFinding(findings, id, severity, label, evidence, recommendation, penalty) {
  findings.push({ id, severity, label, evidence, recommendation, penalty });
}

function inspectMotionSourceText(text) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const findings = [];

  if (/transition\s*:\s*all\b|\btransition-all\b/i.test(source)) {
    addFinding(findings, 'transition_all', 'high', 'Unbounded transition detected', 'transition-all / transition: all', 'Specify exact transform/opacity/color properties instead of transition-all.', 8);
  }

  if (/(^|[^a-z0-9-])ease-in([^a-z0-9-]|$)/i.test(source)) {
    addFinding(findings, 'ease_in_ui', 'high', 'ease-in timing detected', 'ease-in', 'Use strong ease-out for enter/exit UI feedback; reserve ease-in-out for on-screen movement.', 8);
  }

  if (/scale\s*\(\s*0(?:\.0+)?\s*\)|\b(?:scale|scale-x|scale-y)-\[?0\]?\b|\b(?:zoom-in|zoom-out)-0\b|scale\s*:\s*0(?!\.)/i.test(source)) {
    addFinding(findings, 'scale_zero', 'high', 'scale(0) entrance detected', 'scale(0) / scale-0 / scale-axis-0 / zoom-in-0', 'Start from scale(0.9-0.97) with opacity: 0 so elements do not appear from nowhere.', 8);
  }

  if (/\bduration-(?:[4-9]\d{2}|\[(?:[4-9]\d{2}|[1-9]\d{3,})ms\]|\[(?:0?\.[4-9]|[1-9](?:\.\d+)?)s\])(?=$|[^a-z0-9_-])|duration\s*:\s*(?:(?:[4-9]\d{2}|[1-9]\d{3,})ms|(?:0?\.[4-9]|[1-9](?:\.\d+)?)s)/i.test(source)) {
    addFinding(findings, 'slow_routine_ui', 'medium', 'Routine UI duration appears over 300ms', 'duration > 300ms', 'Keep routine UI under 300ms unless it is a rare marketing/explanatory sequence.', 5);
  }

  if (/transition(?:-property)?\s*:\s*(height|width|margin|padding|top|left|max-height|max-width)|\btransition-\[?(height|width|margin|padding|top|left|max-height|max-width)\]?\b/i.test(source)) {
    addFinding(findings, 'layout_property_motion', 'medium', 'Layout-property animation detected', 'height/width/margin/padding/top/left/max-height/max-width transition', 'Prefer transform/opacity or a measured non-janky pattern for motion-sensitive UI.', 5);
  }

  const hasMovementMotion = /framer-motion|motion\.|whilehover|whiletap|initial=|animate=|@keyframes|animate-|transition-transform|transition\s*:[^;]*(transform|all)|\b(?:transform|scale|translate|rotate)-|transform\s*:/i.test(source);
  const hasReducedMotion = /prefers-reduced-motion|usereducedmotion|motion-reduce|motion-safe|reducemotion/i.test(lower);
  if (hasMovementMotion && !hasReducedMotion) {
    addFinding(findings, 'missing_reduced_motion', 'medium', 'Motion present without reduced-motion handling', 'no prefers-reduced-motion / useReducedMotion / motion-reduce marker', 'Add reduced-motion handling: drop movement transforms while retaining gentle opacity/color feedback.', 5);
  }

  if (/(popover|dropdown|tooltip|menu)[\s\S]{0,280}(transform-origin\s*:\s*center|\borigin-center\b)/i.test(source)) {
    addFinding(findings, 'center_origin_anchor', 'medium', 'Anchored overlay uses center origin', 'popover/dropdown/tooltip + center origin', 'Use trigger-aware transform-origin for anchored overlays; keep center origin for true modals only.', 4);
  }

  return {
    version: MOTION_QUALITY_VERSION,
    source: MOTION_QUALITY_SOURCE,
    findings,
    scorePenalty: findings.reduce((sum, item) => sum + (item.penalty || 0), 0),
    redFlagCount: findings.length,
    passed: findings.length === 0
  };
}

module.exports = {
  MOTION_QUALITY_VERSION,
  MOTION_QUALITY_SOURCE,
  MOTION_TOKENS,
  createMotionQualityGate,
  inspectMotionSourceText
};
