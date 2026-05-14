import { describe, it, expect, beforeEach } from 'vitest';
import { CamClient } from './cam-client.js';
import { MemorySessionStore } from './session-store.js';

function makeCam() {
  return new CamClient({
    host: 'https://example.com',
    cogbotId: 'test-cogbot',
    sessionStore: new MemorySessionStore(),
  });
}

describe('CamClient – chat_id management', () => {
  let cam;

  beforeEach(() => {
    cam = makeCam();
  });

  it('_getChatId() returns a UUID string', () => {
    const id = cam._getChatId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('_getChatId() persists across calls', () => {
    const first = cam._getChatId();
    const second = cam._getChatId();
    expect(first).toBe(second);
  });

  it('_getChatId() stores under buddy_chat_id key', () => {
    const id = cam._getChatId();
    expect(cam.store.get('buddy_chat_id')).toBe(id);
  });

  it('rotateChatId() returns a new UUID', () => {
    const original = cam._getChatId();
    const rotated = cam.rotateChatId();
    expect(rotated).not.toBe(original);
    expect(rotated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('rotateChatId() is reflected by subsequent _getChatId() calls', () => {
    cam._getChatId();
    const rotated = cam.rotateChatId();
    expect(cam._getChatId()).toBe(rotated);
  });

  it('rotateChatId() produces distinct values on every call', () => {
    const a = cam.rotateChatId();
    const b = cam.rotateChatId();
    expect(a).not.toBe(b);
  });

  it('_buildMessageBody() includes chat_id', () => {
    const uid = cam._getUid();
    const body = cam._buildMessageBody('hello', uid);
    expect(body).toHaveProperty('chat_id');
    expect(body.chat_id).toBe(cam._getChatId());
  });

  it('_buildMessageBody() chat_id matches _getChatId()', () => {
    const uid = cam._getUid();
    const chatId = cam._getChatId();
    const body = cam._buildMessageBody('test', uid);
    expect(body.chat_id).toBe(chatId);
  });

  it('two CamClient instances maintain independent chat_ids', () => {
    const cam2 = makeCam();
    const id1 = cam._getChatId();
    const id2 = cam2._getChatId();
    expect(id1).not.toBe(id2);
  });
});
