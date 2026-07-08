function renderTemplate(template, variables = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key] == null ? '' : String(variables[key]);
    }
    return match;
  });
}

module.exports = { renderTemplate };
