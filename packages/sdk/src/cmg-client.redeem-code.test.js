import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CmgClient } from './cmg-client.js';

function makeCmg() {
  return new CmgClient({ host: 'https://cmg.example.com', namespace: 'bab' });
}

function mockFetchOnce(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

describe('CmgClient#redeemCode', () => {
  let cmg;

  beforeEach(() => {
    cmg = makeCmg();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces the human-readable message on a wrong-product rejection', async () => {
    mockFetchOnce(400, {
      isMember: false,
      error: 'wrong_product',
      codeRequired: true,
      message: 'That access code is for a different CogBot. It has not been used up — try it on the site it was issued for.',
    });

    const result = await cmg.redeemCode({ idToken: 'tok', code: 'AB3K-9F2M-RT7P' });

    expect(result.isMember).toBe(false);
    expect(result.error).toBe('wrong_product');
    expect(result.codeRequired).toBe(true);
    expect(result.message).toBe(
      'That access code is for a different CogBot. It has not been used up — try it on the site it was issued for.',
    );
  });

  it('leaves message null for the generic invalid_code failure, matching the anti-enumeration guarantee', async () => {
    mockFetchOnce(400, { isMember: false, error: 'invalid_code', codeRequired: true });

    const result = await cmg.redeemCode({ idToken: 'tok', code: 'BAD-CODE' });

    expect(result.error).toBe('invalid_code');
    expect(result.message).toBeNull();
  });

  it('leaves message null on success', async () => {
    mockFetchOnce(200, {
      isMember: true,
      autoProvisioned: true,
      roles: [{ namespace: 'bab', name: 'member_LRS3100' }],
    });

    const result = await cmg.redeemCode({ idToken: 'tok', code: 'GOOD-CODE' });

    expect(result.isMember).toBe(true);
    expect(result.error).toBeNull();
    expect(result.message).toBeNull();
  });

  it('sends idToken, namespace, and code in the request body', async () => {
    mockFetchOnce(200, { isMember: true });

    await cmg.redeemCode({ idToken: 'tok-123', code: 'CODE-123' });

    expect(fetch).toHaveBeenCalledWith(
      'https://cmg.example.com/auth/redeem-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'tok-123', namespace: 'bab', code: 'CODE-123' }),
      }),
    );
  });

  it('throws on 503 service-unavailable rather than returning a result', async () => {
    mockFetchOnce(503, { error: 'Access code service unavailable' });

    await expect(cmg.redeemCode({ idToken: 'tok', code: 'ANY' })).rejects.toThrow(
      'Access code service unavailable',
    );
  });
});
