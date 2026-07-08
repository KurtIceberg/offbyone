const { toComponentName } = require('./parsers');

const MAX_OFFBYONE_PAGES = 6;

function deriveRequestedPages(input = {}) {
  const fromBrief = pagesFromOracleBrief(input.oracleBrief || input.brief);
  const pages = fromBrief.length ? fromBrief : pagesFromEnhancedPrompt(input.prompt || input.userPrompt || '');
  return normalizeRequestedPages(pages).slice(0, MAX_OFFBYONE_PAGES);
}

function pagesFromOracleBrief(oracleBrief) {
  const pages = oracleBrief && oracleBrief.sitePlan && Array.isArray(oracleBrief.sitePlan.pages)
    ? oracleBrief.sitePlan.pages : [];
  return pages.map((page) => ({
    displayName: text(page && (page.name || page.title || page.page)),
    goal: text(page && page.goal),
    sections: Array.isArray(page && page.sections) ? page.sections.map(text).filter(Boolean) : [],
    primaryCta: text(page && page.primaryCta)
  })).filter((page) => page.displayName);
}

function pagesFromEnhancedPrompt(prompt) {
  const src = String(prompt || '').replace(/\r\n/g, '\n');
  if (!/Plan Mode|结构化 Site Brief|Page list \(1[–-](?:3|6) pages\)|页面列表 \/ Page Plan/i.test(src)) return [];

  const listMatch = src.match(/Page list \(1[–-](?:3|6) pages\):\s*([^\n]+)/i);
  if (listMatch && listMatch[1]) {
    const pages = splitPageList(listMatch[1]).map((name) => ({ displayName: name }));
    if (pages.length) return pages;
  }

  const blockMatch = src.match(/页面列表 \/ Page Plan：\n([\s\S]*?)(?:\n\s*\n|\n页面结构|\n视觉与内容方向|$)/);
  if (!blockMatch) return [];
  return blockMatch[1].split('\n').map((line) => {
    const match = line.match(/^\s*[-*]\s+([^：:]+)[：:]\s*(.*)$/);
    if (!match) return null;
    const rest = match[2] || '';
    const sectionMatch = rest.match(/区块[:：]\s*([^。\n]+)/);
    const ctaMatch = rest.match(/CTA[:：]\s*([^。\n]+)/i);
    return {
      displayName: match[1].trim(),
      goal: rest.replace(/区块[:：][\s\S]*$/u, '').trim(),
      sections: sectionMatch ? sectionMatch[1].split(/[、,]/).map((s) => s.trim()).filter(Boolean) : [],
      primaryCta: ctaMatch ? ctaMatch[1].trim() : ''
    };
  }).filter(Boolean);
}

function splitPageList(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter((item) => item && item !== '-');
}

function normalizeRequestedPages(pages) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(pages) ? pages : []) {
    const displayName = text(raw && (raw.displayName || raw.name || raw.title || raw.page));
    if (!displayName) continue;
    const componentName = safeComponentName(displayName);
    const key = componentName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: componentName + '.jsx',
      componentName,
      displayName,
      content: requestedPageContent({ ...raw, displayName }, componentName)
    });
  }
  return out;
}

function safeComponentName(displayName) {
  const component = toComponentName(String(displayName || '').replace(/&/g, ' And '));
  return /^[A-Za-z]/.test(component) ? component : 'Page' + component;
}

function requestedPageContent(page, componentName) {
  const sections = Array.isArray(page.sections) ? page.sections.map(text).filter(Boolean) : [];
  const lines = [
    'Plan Mode requested page: ' + page.displayName + '.',
    'Generate component/file: ' + componentName + '.jsx.',
    'Preserve visible page title/intent: ' + page.displayName + '.',
    page.goal ? 'Page goal: ' + page.goal : '',
    sections.length ? 'Required section focus: ' + sections.join(' / ') + '.' : '',
    page.primaryCta ? 'Primary CTA: ' + page.primaryCta + '.' : '',
    'Visible copy must be prompt-specific and must avoid Lorem ipsum, TODO, debug, localhost, scaffold filler, and irrelevant placeholders.'
  ].filter(Boolean);
  return lines.join('\n');
}

function renderRequestedPagesPlan(pages, existingPlan = '') {
  const src = String(existingPlan || '').replace(/\r\n/g, '\n');
  const theme = extractBlock(src, /======\s*全局样式theme\.css开始\s*======\n?[\s\S]*?\n?======\s*全局样式theme\.css结束\s*======/);
  const layout = extractBlock(src, /======\s*根布局Layout\.jsx规划开始\s*======\n?[\s\S]*?\n?======\s*根布局Layout\.jsx规划结束\s*======/);
  return [
    theme || defaultThemeBlock(),
    '',
    layout || defaultLayoutBlock(pages),
    '',
    ...pages.map((page) => [
      '====== 页面' + page.name + '规划开始 ======',
      page.content,
      '====== 页面' + page.name + '规划结束 ======'
    ].join('\n'))
  ].join('\n').trim() + '\n';
}

function extractBlock(src, re) {
  const match = String(src || '').match(re);
  return match ? match[0].trim() : '';
}

function defaultThemeBlock() {
  return ['====== 全局样式theme.css开始 ======', ':root {', '--color-primary: #7c3aed;', '--color-secondary: #312e81;', '--color-accent: #a78bfa;', '--color-dark: #050816;', '--color-light: #f8fafc;', '--color-muted: #94a3b8;', '--color-surface: #ffffff;', "--font-base: 'Inter', sans-serif;", "--font-heading: 'Inter', sans-serif;", '--radius-lg: 1rem;', '--shadow-md: 0 18px 60px rgba(15, 23, 42, 0.18);', '}', '====== 全局样式theme.css结束 ======'].join('\n');
}

function defaultLayoutBlock(pages) {
  const nav = pages.map((page) => page.displayName || page.componentName).join('、');
  return ['====== 根布局Layout.jsx规划开始 ======', '## 功能模块', '- Header(页头)：Logo、导航菜单（' + nav + '）、主 CTA', '- Content(内容插槽)：渲染当前页面', '- Footer(页脚)：联系信息、可信声明、快速导航', '## 布局说明', '- Header 位于顶部；Content 居中；Footer 位于末尾。', '## 设计风格', '- 遵循客户提示与设计系统；使用 theme.css 变量；避免脚手架/调试/localhost 可见文案。', '====== 根布局Layout.jsx规划结束 ======'].join('\n');
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

module.exports = { deriveRequestedPages, normalizeRequestedPages, renderRequestedPagesPlan, safeComponentName, MAX_OFFBYONE_PAGES };
