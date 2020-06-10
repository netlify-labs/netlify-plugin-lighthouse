const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

const getBrowserPath = async () => {
  const browserFetcher = puppeteer.createBrowserFetcher();
  const revisions = await browserFetcher.localRevisions();
  if (revisions.length <= 0) {
    throw new Error('Could not find local browser');
  }
  const info = await browserFetcher.revisionInfo(revisions[0]);
  return info.executablePath;
};

const runLighthouse = async (browserPath, url) => {
  let chrome;
  try {
    chrome = await chromeLauncher.launch({
      chromePath: browserPath,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    });
    const results = await lighthouse(url, {
      port: chrome.port,
    });
    if (results.lhr.runtimeError) {
      throw new Error(results.lhr.runtimeError.message);
    }
    return results;
  } finally {
    if (chrome) {
      await chrome.kill().catch(() => undefined);
    }
  }
};

module.exports = {
  getBrowserPath,
  runLighthouse,
};