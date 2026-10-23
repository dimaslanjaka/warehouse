const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
// eslint-disable-next-line n/no-unsupported-features/node-builtins
const { registerHooks } = require('node:module');

const colors = {
  reset: '\x1B[0m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
  gray: '\x1B[90m'
};

const timestamp = () => new Date().toISOString();

function log(level, message, color = colors.gray) {
  console.error(
    `${colors.gray}${timestamp()}${colors.reset} `
    + `${color}[resolve-ts]${colors.reset} ${message}`
  );
}

function logError(message, error) {
  log('error', message, colors.red);

  if (error) {
    console.error(
      `${colors.red}[resolve-ts] ${error.stack || error.message || error}${colors.reset}`
    );
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      !specifier.startsWith('.')
      || !specifier.endsWith('.js')
      || !context.parentURL?.startsWith('file:')
    ) {
      return nextResolve(specifier, context);
    }

    let parentPath;

    try {
      parentPath = fileURLToPath(context.parentURL);

      const tsPath = path.resolve(
        path.dirname(parentPath),
        `${specifier.slice(0, -3)}.ts`
      );

      if (!fs.existsSync(tsPath)) {
        return nextResolve(specifier, context);
      }

      const url = pathToFileURL(tsPath).href;

      log(
        'info',
        `${specifier} -> ${tsPath}`,
        colors.green
      );

      return {
        url,
        shortCircuit: true
      };
    } catch (error) {
      logError(
        `Failed to resolve "${specifier}" from "${context.parentURL}"`,
        error
      );

      throw error;
    }
  }
});