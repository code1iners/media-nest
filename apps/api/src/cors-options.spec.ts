import { createCorsOptions, isCorsOriginAllowed } from './cors-options';

describe('CORS options', () => {
  it('allows no-origin requests and the production web origin in production', () => {
    expect(isCorsOriginAllowed(undefined, { nodeEnv: 'production' })).toBe(
      true,
    );
    expect(
      isCorsOriginAllowed('https://mytube-extract-web.codeliners.cc', {
        nodeEnv: 'production',
      }),
    ).toBe(true);
  });

  it('rejects local and unknown web origins in production', () => {
    expect(
      isCorsOriginAllowed('http://localhost:5173', { nodeEnv: 'production' }),
    ).toBe(false);
    expect(
      isCorsOriginAllowed('https://evil.example', { nodeEnv: 'production' }),
    ).toBe(false);
  });

  it('rejects extension origins until a fixed extension ID is known', () => {
    expect(
      isCorsOriginAllowed('chrome-extension://abc123', {
        nodeEnv: 'production',
      }),
    ).toBe(false);
    expect(
      isCorsOriginAllowed('extension://abc123', { nodeEnv: 'production' }),
    ).toBe(false);
  });

  it('allows local preview and web dev origins outside production', () => {
    expect(
      isCorsOriginAllowed('http://localhost:3000', { nodeEnv: 'development' }),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('http://127.0.0.1:3000', { nodeEnv: 'development' }),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('http://localhost:5173', { nodeEnv: 'test' }),
    ).toBe(true);
    expect(
      isCorsOriginAllowed('http://127.0.0.1:5173', { nodeEnv: 'test' }),
    ).toBe(true);
  });

  it('keeps media download response headers exposed to browser clients', () => {
    expect(createCorsOptions().exposedHeaders).toEqual([
      'Content-Disposition',
      'Content-Type',
    ]);
  });
});
