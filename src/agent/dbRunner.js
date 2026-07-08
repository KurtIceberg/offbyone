async function runDbStage(context) {
  return context.generators.db(context);
}

module.exports = { runDbStage };
