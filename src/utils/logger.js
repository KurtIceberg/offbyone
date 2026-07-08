function createLogger(options = {}) {
  const quiet = Boolean(options.quiet);
  return {
    info: (...args) => { if (!quiet) console.log(...args); },
    warn: (...args) => { if (!quiet) console.warn(...args); },
    error: (...args) => console.error(...args)
  };
}

module.exports = { createLogger };
