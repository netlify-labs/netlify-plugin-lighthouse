require('dotenv').config();
const { join, dirname } = require('path');
const express = require('express');
const compression = require('compression');
const chalk = require('chalk');
const fs = require('fs').promises;
const { getConfiguration } = require('./config');
const { getBrowserPath, runLighthouse } = require('./lighthouse');

const getServer = ({ serveDir, auditUrl }) => {
  if (auditUrl) {
    // return a mock server for readability
    const server = {
      listen: async (func) => {
        console.log(`Scanning url ${chalk.magenta(auditUrl)}`);
        await func();
      },
      close: () => undefined,
      url: auditUrl,
    };
    return { server };
  }

  if (!serveDir) {
    throw new Error('Empty publish dir');
  }

  const app = express();
  app.use(compression());
  app.use(express.static(serveDir));

  const port = 5000;
  const host = 'localhost';
  const server = {
    listen: (func) => {
      console.log(
        `Serving and scanning site from directory ${chalk.magenta(serveDir)}`,
      );
      return app.listen(port, host, func);
    },
    close: (instance) => instance.close(),
    url: `http://${host}:${port}`,
  };
  return { server };
};

const belowThreshold = (id, expected, categories) => {
  const category = categories.find((c) => c.id === id);
  if (!category) {
    console.warn(`Could not find category ${chalk.yellow(id)}`);
  }
  const actual = category ? category.score : Number.MAX_SAFE_INTEGER;
  return actual < expected;
};

const getError = (id, expected, categories, audits) => {
  const category = categories.find((c) => c.id === id);

  const categoryError = `Expected category ${chalk.cyan(
    category.title,
  )} to be greater or equal to ${chalk.green(expected)} but got ${chalk.red(
    category.score !== null ? category.score : 'unknown',
  )}`;

  const categoryAudits = category.auditRefs
    .filter(({ weight, id }) => weight > 0 && audits[id].score < 1)
    .map((ref) => {
      const audit = audits[ref.id];
      return `   '${chalk.cyan(
        audit.title,
      )}' received a score of ${chalk.yellow(audit.score)}`;
    })
    .join('\n');

  return { message: categoryError, details: categoryAudits };
};

const formatResults = ({ results, thresholds }) => {
  const categories = Object.values(results.lhr.categories).map(
    ({ title, score, id, auditRefs }) => ({ title, score, id, auditRefs }),
  );

  const categoriesBelowThreshold = Object.entries(thresholds).filter(
    ([id, expected]) => belowThreshold(id, expected, categories),
  );

  const errors = categoriesBelowThreshold.map(([id, expected]) =>
    getError(id, expected, categories, results.lhr.audits),
  );

  const summary = {
    results: categories.map(({ title, score, id }) => ({
      title,
      score,
      id,
      ...(thresholds[id] ? { threshold: thresholds[id] } : {}),
    })),
  };

  const shortSummary = categories
    .map(({ title, score }) => `${title}: ${score * 100}`)
    .join(', ');

  return { summary, shortSummary, errors };
};

const persistResults = async ({ results, path }) => {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, results.report);
};

const getUtils = ({ utils }) => {
  const failBuild =
    (utils && utils.build && utils.build.failBuild) ||
    ((message, { error } = {}) => {
      console.error(message, error && error.message);
      process.exitCode = 1;
    });

  const show =
    (utils && utils.status && utils.status.show) ||
    (({ summary }) => console.log(summary));

  return { failBuild, show };
};

const runAudit = async ({
  path,
  url,
  thresholds,
  output_path,
  extra_headers,
}) => {
  try {
    const { server } = getServer({ serveDir: path, auditUrl: url });
    const browserPath = await getBrowserPath();
    const { error, results } = await new Promise((resolve) => {
      const instance = server.listen(async () => {
        try {
          const results = await runLighthouse(browserPath, server.url, {
            extraHeaders: extra_headers,
          });
          resolve({ error: false, results });
        } catch (error) {
          resolve({ error });
        } finally {
          server.close(instance);
        }
      });
    });

    if (error) {
      return { error };
    } else {
      const { summary, shortSummary, errors } = formatResults({
        results,
        thresholds,
      });

      if (output_path) {
        await persistResults({ results, path: join(path, output_path) });
      }

      return {
        summary,
        shortSummary,
        errors,
      };
    }
  } catch (error) {
    return { error };
  }
};

const prefixString = ({ path, url, str }) => {
  if (path) {
    return `\n${chalk.red('Error')} for directory '${chalk.cyan(
      path,
    )}':\n${str}`;
  } else if (url) {
    return `\n${chalk.red('Error')} for url '${chalk.cyan(url)}':\n${str}`;
  } else {
    return `\n${str}`;
  }
};

const processResults = ({ summaries, errors }) => {
  if (errors.length > 0) {
    const error = errors.reduce(
      (acc, { path, url, errors }) => {
        const message = prefixString({
          path,
          url,
          str: errors.map((e) => e.message).join('\n'),
        });
        const details = prefixString({
          path,
          url,
          str: errors.map((e) => `${e.message}\n${e.details}`).join('\n'),
        });

        return {
          message: `${acc.message}\n${message}`,
          details: `${acc.details}\n${details}`,
        };
      },
      {
        message: '',
        details: '',
      },
    );
    return {
      error,
    };
  } else {
    return {
      summary: summaries
        .map(({ path, url, summary }) => {
          if (path) {
            return `Summary for directory '${chalk.magenta(path)}': ${summary}`;
          }
          if (url) {
            return `Summary for url '${chalk.magenta(url)}': ${summary}`;
          }
          return `${summary}`;
        })
        .join('\n'),
    };
  }
};

module.exports = {
  onPostBuild: async ({ constants, utils, inputs } = {}) => {
    const { failBuild, show } = getUtils({ utils });

    try {
      const { audits } = getConfiguration({
        constants,
        inputs,
      });

      const allErrors = [];
      const summaries = [];
      for (const {
        path,
        url,
        thresholds,
        output_path,
        extra_headers,
      } of audits) {
        const { errors, summary, shortSummary } = await runAudit({
          path,
          url,
          thresholds,
          output_path,
          extra_headers,
        });
        if (summary) {
          console.log(summary);
        }
        if (Array.isArray(errors) && errors.length > 0) {
          allErrors.push({ path, url, errors });
        } else {
          summaries.push({ path, url, summary: shortSummary });
        }
      }

      const { error, summary } = processResults({
        summaries,
        errors: allErrors,
        show,
      });

      if (error) {
        throw error;
      }
      show({ summary });
    } catch (error) {
      if (error.details) {
        console.error(error.details);
        failBuild(`${chalk.red('Failed with error:\n')}${error.message}`);
      } else {
        failBuild(`${chalk.red('Failed with error:\n')}`, { error });
      }
    }
  },
};
