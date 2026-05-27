import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CamClient } from './cam-client.js';
import { MemorySessionStore } from './session-store.js';

const FAKE_SCHEMA = {
  version: 1,
  sections: [
    {
      key: 'parent',
      label: 'Parent',
      section_type: 'object',
      fields: [
        {
          key: 'firstName',
          label: 'First name',
          field_type: 'text',
          required: true,
        },
      ],
    },
  ],
  extras_bucket: {
    key: 'other',
    label: 'Other notes',
    include_in_prompt: true,
  },
};

function makeCam() {
  return new CamClient({
    host: 'https://example.com',
    cogbotId: 'test-cogbot',
    sessionStore: new MemorySessionStore(),
  });
}

describe('CamClient – fetchProfileSchema', () => {
  let cam;
  let fetchSpy;

  beforeEach(() => {
    cam = makeCam();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FAKE_SCHEMA,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch exactly once', async () => {
    await cam.fetchProfileSchema();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('URL contains /api/cogbots/test-cogbot/profile-schema', async () => {
    await cam.fetchProfileSchema();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/api/cogbots/test-cogbot/profile-schema');
  });

  it('URL ends with /profile-schema (no trailing query params)', async () => {
    await cam.fetchProfileSchema();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/profile-schema$/);
  });

  it('uses credentials: include', async () => {
    await cam.fetchProfileSchema();
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.credentials).toBe('include');
  });

  it('returns the parsed JSON body on 200', async () => {
    const result = await cam.fetchProfileSchema();
    expect(result).toEqual(FAKE_SCHEMA);
  });

  it('returns null on 404', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404 });
    const result = await cam.fetchProfileSchema();
    expect(result).toBeNull();
  });

  it('throws on 401', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401 });
    await expect(cam.fetchProfileSchema()).rejects.toThrow('401');
  });

  it('throws on 500', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 });
    await expect(cam.fetchProfileSchema()).rejects.toThrow('500');
  });

  it('error message mentions fetchProfileSchema', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 403 });
    await expect(cam.fetchProfileSchema()).rejects.toThrow('fetchProfileSchema');
  });

  it('URL-encodes a cogbotId that contains special characters', async () => {
    const specialCam = new CamClient({
      host: 'https://example.com',
      cogbotId: 'mc_0091:full',
      sessionStore: new MemorySessionStore(),
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FAKE_SCHEMA,
    });
    await specialCam.fetchProfileSchema();
    const [url] = fetch.mock.calls[0];
    expect(url).toContain('mc_0091%3Afull');
  });

  it('URL is built from the host option', async () => {
    await cam.fetchProfileSchema();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/example\.com\//);
  });
});
