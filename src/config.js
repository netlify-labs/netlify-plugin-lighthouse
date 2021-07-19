const chalk = require('chalk');
const { join } = require('path');

const getServePath = (dir, path) => {
  if (typeof path !== 'string' || typeof dir !== 'string') {
    return { path: undefined };
  }

  const resolvedPath = join(dir, path);
  if (!resolvedPath.startsWith(dir)) {
    throw new Error(
      chalk.red(
        `resolved path for ${chalk.red(
          path,
        )} is outside publish directory ${chalk.red(dir)}`,
      ),
    );
  }

  return { path: resolvedPath };
};

const maybeParseJSON = ({ value, name }) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Invalid JSON for '${name}' input: ${e.message}`);
  }
};

const getConfiguration = ({ constants, inputs } = {}) => {
  const serveDir =
    (constants && constants.PUBLISH_DIR) || process.env.PUBLISH_DIR;

  const auditUrl = (inputs && inputs.audit_url) || process.env.AUDIT_URL;

  const output_path = (inputs && inputs.output_path) || process.env.OUTPUT_PATH;

  if (auditUrl) {
    console.warn(
      `${chalk.yellow(
        'inputs.audit_url',
      )} is deprecated, please use ${chalk.green('inputs.audits')}`,
    );
  }

  const thresholds = maybeParseJSON({
    value: (inputs && inputs.thresholds) || process.env.THRESHOLDS || {},
    name: 'thresholds',
  });

  const extra_headers = maybeParseJSON({
    value: (inputs && inputs.extra_headers) || process.env.EXTRA_HEADERS,
    name: 'extra_headers',
  });

  let audits = maybeParseJSON({
    value: (inputs && inputs.audits) || process.env.AUDITS,
    name: 'audits',
  });

  if (!Array.isArray(audits)) {
    audits = [
      { path: serveDir, url: auditUrl, thresholds, output_path, extra_headers },
    ];
  } else {
    audits = audits.map((a) => {
      return {
        ...a,
        thresholds: a.thresholds || thresholds,
        output_path: a.output_path || output_path,
        extra_headers: a.extra_headers || extra_headers,
        ...getServePath(serveDir, a.path),
      };
    });
  }

  return { audits };
};

module.exports = {
  getConfiguration,
};
