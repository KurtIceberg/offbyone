function extractSql(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const blocks = [];
  const fenceRe = /```\s*(sql|sqlite)?\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(src)) !== null) {
    if (!m[1] || /sql|sqlite/i.test(m[1])) blocks.push(m[2].trim());
  }
  const candidates = blocks.length ? blocks : [extractRawSql(src)];
  for (const candidate of candidates) {
    const normalized = normalizeSqlForSqlite(candidate);
    if (isUsableSql(normalized)) return normalized;
  }
  return '';
}

function extractRawSql(src) {
  const text = String(src || '');
  const keyword = /\b(CREATE\s+TABLE|INSERT\s+INTO|CREATE\s+INDEX|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
  const match = keyword.exec(text);
  if (!match) return '';
  const tail = text.slice(match.index);
  const statements = splitSqlStatements(tail).filter((stmt) => /\b(CREATE\s+TABLE|INSERT\s+INTO|CREATE\s+INDEX|ALTER\s+TABLE)\b/i.test(stmt));
  return statements.join('\n');
}

function normalizeSqlForSqlite(sql) {
  let out = String(sql || '').replace(/\r\n/g, '\n').trim();
  if (!out) return '';
  out = out.replace(/^```[a-zA-Z0-9_-]*\s*/g, '').replace(/\s*```$/g, '').trim();
  out = out.replace(/--.*$/gm, (line) => line);
  out = out.replace(/`([^`]+)`/g, '"$1"');
  out = out.replace(/\bSERIAL\b/gi, 'INTEGER');
  out = out.replace(/\bBIGSERIAL\b/gi, 'INTEGER');
  out = out.replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
  out = out.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  out = out.replace(/\bDOUBLE\s+PRECISION\b/gi, 'REAL');
  out = out.replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  out = out.replace(/\bDATETIME\b/gi, 'TEXT');
  out = out.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  out = out.replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT');
  out = out.replace(/\bGENERATED\s+ALWAYS\s+AS\s+IDENTITY\b/gi, '');
  out = out.replace(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ');
  out = out.replace(/,\s*\)/g, '\n)');
  const statements = splitSqlStatements(out)
    .map((stmt) => stmt.trim())
    .filter(Boolean)
    .filter((stmt) => !/^DROP\s+/i.test(stmt));
  return statements.map((stmt) => stmt.endsWith(';') ? stmt : stmt + ';').join('\n\n');
}

function defaultSql(input = {}) {
  const prompt = String(input.prompt || '').trim();
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const topic = prompt || pages.map((p) => p.componentName || p.name).filter(Boolean).join(' ') || 'Generated project';
  const productPrefix = inferProductPrefix(topic);
  const category = inferCategory(topic);
  const productRows = [
    [productPrefix + ' Essential', 'A polished starter offer for ' + topic.slice(0, 90), 39.99, category],
    [productPrefix + ' Pro', 'Premium materials and thoughtful details for demanding customers.', 69.99, category],
    [productPrefix + ' Signature', 'Flagship bundle seeded by the offbyone v3 scaffold.', 99.99, 'Signature']
  ];
  const metricRows = [
    ['Generated pages', String(Math.max(pages.length, 1))],
    ['Lead capture', 'enabled'],
    ['API status', 'ready']
  ];
  return [
    'CREATE TABLE IF NOT EXISTS products (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  description TEXT,\n  price REAL,\n  category TEXT,\n  created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);',
    'CREATE TABLE IF NOT EXISTS leads (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT,\n  email TEXT,\n  message TEXT,\n  created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);',
    'CREATE TABLE IF NOT EXISTS metrics (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  label TEXT NOT NULL,\n  value TEXT NOT NULL,\n  created_at TEXT DEFAULT CURRENT_TIMESTAMP\n);',
    ...productRows.map((r) => insertIfMissing('products', ['name', 'description', 'price', 'category'], r, 'name')),
    insertIfMissing('leads', ['name', 'email', 'message'], ['Alex Demo', 'alex@example.com', 'Interested in ' + productPrefix + ' products.'], 'email'),
    ...metricRows.map((r) => insertIfMissing('metrics', ['label', 'value'], r, 'label'))
  ].join('\n\n') + '\n';
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < String(sql || '').length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    current += ch;
    if (quote) {
      if (ch === quote && next === quote) { current += next; i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"') { quote = ch; continue; }
    if (ch === ';') { statements.push(current.trim()); current = ''; }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function isUsableSql(sql) {
  return /\bCREATE\s+TABLE\b/i.test(sql);
}

function insert(table, columns, values) {
  return 'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES (' + values.map(sqlValue).join(', ') + ');';
}

function insertIfMissing(table, columns, values, uniqueColumn) {
  const uniqueIndex = columns.indexOf(uniqueColumn);
  if (uniqueIndex < 0) return insert(table, columns, values);
  return 'INSERT INTO ' + table + ' (' + columns.join(', ') + ')\n' +
    'SELECT ' + values.map(sqlValue).join(', ') + '\n' +
    'WHERE NOT EXISTS (SELECT 1 FROM ' + table + ' WHERE ' + uniqueColumn + ' = ' + sqlValue(values[uniqueIndex]) + ');';
}

function sqlValue(value) {
  if (typeof value === 'number') return String(value);
  if (value == null) return 'NULL';
  return '\'' + String(value).replace(/'/g, "''") + '\'';
}

function inferProductPrefix(topic) {
  if (/(宠物|猫|狗|pet|puppy|kitten|dog|cat)/i.test(topic)) return 'Pet Care';
  if (/iphone|case|phone/i.test(topic)) return 'iPhone Case';
  if (/coffee/i.test(topic)) return 'Coffee';
  if (/btc|bitcoin|crypto/i.test(topic)) return 'Crypto Dashboard';
  if (/saas/i.test(topic)) return 'SaaS Plan';
  return 'Premium Product';
}

function inferCategory(topic) {
  if (/(宠物|猫|狗|pet|puppy|kitten|dog|cat)/i.test(topic)) return 'Pet Supplies';
  if (/iphone|case|phone/i.test(topic)) return 'Accessories';
  if (/dashboard|btc|metric/i.test(topic)) return 'Analytics';
  return 'Featured';
}

module.exports = { extractSql, defaultSql, normalizeSqlForSqlite, splitSqlStatements };
