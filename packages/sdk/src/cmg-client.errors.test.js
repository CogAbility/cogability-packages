import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CmgClient, CmgError } from './cmg-client.js';

function makeCmg() {
  return new CmgClient({ host: 'https://cmg.example.com', namespace: 'bab' });
}

function mockFetchOnce(status, body, ok = status >= 200 && status < 300) {
  global.fetch = vi.fn().mockResolvedValue({
    status,
    ok,
    json: async () => body,
  });
}

describe('CmgError', () => {
  it('constructs with message, status, and body', () => {
    const body = { error: 'test_error', code: 'test_code' };
    const err = new CmgError('Test message', 400, body);

    expect(err.message).toBe('Test message');
    expect(err.status).toBe(400);
    expect(err.body).toEqual(body);
    expect(err.code).toBe('test_code');
    expect(err.name).toBe('CmgError');
    expect(err instanceof Error).toBe(true);
  });

  it('omits code property when body.code is not present', () => {
    const body = { error: 'test_error' };
    const err = new CmgError('Test message', 400, body);

    expect(err.code).toBeUndefined();
    expect('code' in err).toBe(false);
  });
});

describe('CmgClient#validateMembership - error handling', () => {
  let cmg;

  beforeEach(() => {
    cmg = makeCmg();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers body.message over body.error when both are present', async () => {
    mockFetchOnce(400, {
      error: 'Invalid token',
      message: 'email address on this token has not been verified',
      code: 'email_not_verified',
    });

    try {
      await cmg.validateMembership('bad-token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err instanceof CmgError).toBe(true);
      expect(err.message).toBe('email address on this token has not been verified');
      expect(err.code).toBe('email_not_verified');
      expect(err.status).toBe(400);
      expect(err.body).toEqual({
        error: 'Invalid token',
        message: 'email address on this token has not been verified',
        code: 'email_not_verified',
      });
    }
  });

  it('uses body.error when body.message is not present', async () => {
    mockFetchOnce(401, {
      error: 'Token expired',
      code: 'token_expired',
    });

    try {
      await cmg.validateMembership('expired-token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err instanceof CmgError).toBe(true);
      expect(err.message).toBe('Token expired');
      expect(err.code).toBe('token_expired');
      expect(err.status).toBe(401);
    }
  });

  it('uses generic fallback when neither body.message nor body.error are present', async () => {
    mockFetchOnce(500, {});

    try {
      await cmg.validateMembership('some-token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err instanceof CmgError).toBe(true);
      expect(err.message).toBe('CmgClient: validateMembership failed (500)');
      expect(err.status).toBe(500);
      expect(err.code).toBeUndefined();
    }
  });

  it('includes full response body for advanced error handling', async () => {
    mockFetchOnce(403, {
      error: 'Forbidden',
      message: 'Access denied for this namespace',
      code: 'access_denied',
      details: { namespace: 'bab', requiredRole: 'admin' },
    });

    try {
      await cmg.validateMembership('token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.body).toEqual({
        error: 'Forbidden',
        message: 'Access denied for this namespace',
        code: 'access_denied',
        details: { namespace: 'bab', requiredRole: 'admin' },
      });
    }
  });

  it('is backward compatible - error message is still readable via err.message', async () => {
    mockFetchOnce(400, { error: 'Bad request' });

    try {
      await cmg.validateMembership('token');
      expect.fail('Should have thrown');
    } catch (err) {
      // Old code that just reads err.message still works
      expect(err.message).toBe('Bad request');
      expect(typeof err.message).toBe('string');
    }
  });
});

describe('CmgClient#saveProfile - error handling', () => {
  let cmg;

  beforeEach(() => {
    cmg = makeCmg();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers body.message over body.error', async () => {
    mockFetchOnce(400, {
      error: 'Invalid profile',
      message: 'Profile validation failed: children[0].birthYear is required',
      code: 'profile_validation_error',
    });

    try {
      await cmg.saveProfile('token', { children: [{ name: 'Alice' }] });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err instanceof CmgError).toBe(true);
      expect(err.message).toBe('Profile validation failed: children[0].birthYear is required');
      expect(err.code).toBe('profile_validation_error');
      expect(err.status).toBe(400);
    }
  });

  it('uses body.error when body.message is not present', async () => {
    mockFetchOnce(401, { error: 'Unauthorized' });

    try {
      await cmg.saveProfile('bad-token', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Unauthorized');
      expect(err.status).toBe(401);
    }
  });

  it('uses generic fallback when no error information is available', async () => {
    mockFetchOnce(503, {});

    try {
      await cmg.saveProfile('token', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('CmgClient: saveProfile failed (503)');
      expect(err.status).toBe(503);
    }
  });
});

describe('CmgClient#getProfile - error handling', () => {
  let cmg;

  beforeEach(() => {
    cmg = makeCmg();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers body.message over body.error', async () => {
    mockFetchOnce(404, {
      error: 'Not found',
      message: 'No profile exists for this user',
      code: 'profile_not_found',
    });

    try {
      await cmg.getProfile('token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err instanceof CmgError).toBe(true);
      expect(err.message).toBe('No profile exists for this user');
      expect(err.code).toBe('profile_not_found');
      expect(err.status).toBe(404);
    }
  });

  it('uses body.error when body.message is not present', async () => {
    mockFetchOnce(401, { error: 'Invalid token', code: 'invalid_token' });

    try {
      await cmg.getProfile('bad-token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('Invalid token');
      expect(err.code).toBe('invalid_token');
      expect(err.status).toBe(401);
    }
  });

  it('uses generic fallback when no error information is available', async () => {
    mockFetchOnce(500, {});

    try {
      await cmg.getProfile('token');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.message).toBe('CmgClient: getProfile failed (500)');
      expect(err.status).toBe(500);
      expect(err.code).toBeUndefined();
    }
  });

  it('includes full response body for debugging', async () => {
    mockFetchOnce(400, {
      error: 'Bad request',
      message: 'Invalid idToken format',
      code: 'invalid_token_format',
      hint: 'Token should be a valid JWT',
    });

    try {
      await cmg.getProfile('not-a-jwt');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.body).toEqual({
        error: 'Bad request',
        message: 'Invalid idToken format',
        code: 'invalid_token_format',
        hint: 'Token should be a valid JWT',
      });
    }
  });
});
