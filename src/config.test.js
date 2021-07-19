const { getConfiguration } = require('./config');

jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.mock('chalk', () => {
  return {
    green: (m) => m,
    yellow: (m) => m,
    red: (m) => m,
  };
});

describe('config', () => {
  beforeEach(() => {
    delete process.env.PUBLISH_DIR;
    delete process.env.AUDIT_URL;
    delete process.env.THRESHOLDS;
    delete process.env.AUDITS;
    jest.clearAllMocks();
  });
  it('should empty config when constants, inputs are undefined', () => {
    const config = getConfiguration();

    expect(config).toEqual({
      audits: [
        {
          path: undefined,
          url: undefined,
          thresholds: {},
        },
      ],
    });
  });

  it('should return config from process.env when constants, inputs are undefined', () => {
    process.env.PUBLISH_DIR = 'PUBLISH_DIR';
    process.env.AUDIT_URL = 'AUDIT_URL';
    process.env.THRESHOLDS = JSON.stringify({ performance: 0.9 });
    const config = getConfiguration();

    expect(config).toEqual({
      audits: [
        {
          path: 'PUBLISH_DIR',
          url: 'AUDIT_URL',
          thresholds: { performance: 0.9 },
        },
      ],
    });
  });

  it('should return config from process.env.AUDITS', () => {
    process.env.PUBLISH_DIR = 'PUBLISH_DIR';
    process.env.AUDITS = JSON.stringify([
      { url: 'https://www.test.com', thresholds: { performance: 0.9 } },
      { path: 'route1', thresholds: { seo: 0.9 } },
    ]);
    const config = getConfiguration();

    expect(config).toEqual({
      audits: [
        { url: 'https://www.test.com', thresholds: { performance: 0.9 } },
        { path: 'PUBLISH_DIR/route1', thresholds: { seo: 0.9 } },
      ],
    });
  });

  it('should print deprecated warning when using audit_url', () => {
    const constants = {};
    const inputs = { audit_url: 'url' };
    getConfiguration({ constants, inputs });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      'inputs.audit_url is deprecated, please use inputs.audits',
    );
  });

  it('should return config from constants and inputs', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      audit_url: 'url',
      thresholds: { seo: 1 },
      output_path: 'reports/lighthouse.html',
      extra_headers: { Authorization: 'test' },
    };
    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [
        {
          path: 'PUBLISH_DIR',
          url: 'url',
          thresholds: { seo: 1 },
          output_path: 'reports/lighthouse.html',
          extra_headers: { Authorization: 'test' },
        },
      ],
    });
  });

  it('should append audits path to PUBLISH_DIR', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = { audits: [{ path: 'route1', thresholds: { seo: 1 } }] };
    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [{ path: 'PUBLISH_DIR/route1', thresholds: { seo: 1 } }],
    });
  });

  it('should use default thresholds when no audit thresholds is configured', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      thresholds: { performance: 1 },
      audits: [{ path: 'route1', thresholds: { seo: 1 } }, { path: 'route2' }],
    };
    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [
        { path: 'PUBLISH_DIR/route1', thresholds: { seo: 1 } },
        { path: 'PUBLISH_DIR/route2', thresholds: { performance: 1 } },
      ],
    });
  });

  it('should throw error on path traversal', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      thresholds: { performance: 1 },
      audits: [{ path: '../' }],
    };

    expect(() => getConfiguration({ constants, inputs })).toThrow(
      new Error(
        'resolved path for ../ is outside publish directory PUBLISH_DIR',
      ),
    );
  });

  it('should treat audit path as relative path', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      audits: [{ path: '/a/b' }],
    };

    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [{ path: 'PUBLISH_DIR/a/b', thresholds: {} }],
    });
  });

  it('should throw error on invalid thresholds json input', () => {
    const constants = { THRESHOLDS: 'PUBLISH_DIR' };
    const inputs = {
      thresholds: 'invalid_json',
      audits: [{}],
    };

    expect(() => getConfiguration({ constants, inputs })).toThrow(
      new Error(
        `Invalid JSON for 'thresholds' input: Unexpected token i in JSON at position 0`,
      ),
    );
  });

  it('should throw error on invalid audits json input', () => {
    const constants = { THRESHOLDS: 'PUBLISH_DIR' };
    const inputs = {
      thresholds: { performance: 1 },
      audits: 'invalid_json',
    };

    expect(() => getConfiguration({ constants, inputs })).toThrow(
      new Error(
        `Invalid JSON for 'audits' input: Unexpected token i in JSON at position 0`,
      ),
    );
  });

  it('should use specific audit output_path when configured', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      output_path: 'reports/lighthouse.html',
      audits: [
        { path: 'route1' },
        { path: 'route2', output_path: 'reports/route2.html' },
      ],
    };
    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [
        {
          path: 'PUBLISH_DIR/route1',
          output_path: 'reports/lighthouse.html',
          thresholds: {},
        },
        {
          path: 'PUBLISH_DIR/route2',
          output_path: 'reports/route2.html',
          thresholds: {},
        },
      ],
    });
  });

  it('should use specific audit extra_headers when configured', () => {
    const constants = { PUBLISH_DIR: 'PUBLISH_DIR' };
    const inputs = {
      extra_headers: { Authorization: 'authorization' },
      audits: [
        { path: 'route1' },
        { path: 'route2', extra_headers: { Other: 'other' } },
      ],
    };
    const config = getConfiguration({ constants, inputs });

    expect(config).toEqual({
      audits: [
        {
          path: 'PUBLISH_DIR/route1',
          extra_headers: { Authorization: 'authorization' },
          thresholds: {},
        },
        {
          path: 'PUBLISH_DIR/route2',
          extra_headers: { Other: 'other' },
          thresholds: {},
        },
      ],
    });
  });
});
