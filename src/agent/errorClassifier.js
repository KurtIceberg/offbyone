function classifyError(err) {
  const message = String((err && err.message) || err || '');
  const details = collectMessages(err).join(' ');
  const lower = (message + ' ' + details).toLowerCase();
  if (/enotfound|getaddrinfo|could not resolve host/.test(lower)) return typed('gateway_dns_failed', false, message);
  if (/401|unauthorized|invalid api key|api key/.test(lower)) return typed('gateway_auth_failed', false, message);
  if (/429|rate limit|too many requests/.test(lower)) return typed('gateway_rate_limited', true, message);
  if (/timeout|timed out|etimedout|aborterror/.test(lower)) return typed('gateway_timeout', true, message);
  if (/curl transport failed|command failed: curl|und_err_socket|econnreset|empty reply|socket|incomplete chunked read|remoteprotocolerror|other side closed|fetch failed/.test(lower)) return typed('gateway_socket_failed', true, message);
  if (/\b50[2-4]\b|bad gateway|service unavailable|gateway timeout/.test(lower)) return typed('gateway_5xx_failed', true, message);
  if (/json|parse|schema/.test(lower)) return typed('llm_parse_failed', false, message);
  return typed('unknown_llm_failed', true, message);
}

function typed(type, retryable, message) {
  return { type, errorType: type, retryable, message: safeErrorText(message), safeDetails: [safeErrorText(message)].filter(Boolean) };
}

function collectMessages(err, out = []) {
  if (!err || typeof err !== 'object') return out;
  for (const key of ['code', 'errno', 'syscall', 'hostname', 'host', 'status', 'stderr', 'stdout']) {
    if (err[key] != null) out.push(String(err[key]));
  }
  if (err.cause && err.cause !== err) collectMessages(err.cause, out);
  return out;
}

function safeErrorText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|key|token|secret)(["'\s:=]+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1$2[REDACTED]')
    .replace(/([?&](?:api[_-]?key|key|token|secret)=)[^\s&]+/gi, '$1[REDACTED]')
    .slice(0, 2000);
}

module.exports = { classifyError, safeErrorText };
