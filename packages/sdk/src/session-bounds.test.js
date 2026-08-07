import { describe, it, expect } from 'vitest';
import {
  SessionBounds,
  DEFAULT_IDLE_MINUTES,
  DEFAULT_ABSOLUTE_HOURS,
  IDLE_EXPIRY,
  ABSOLUTE_EXPIRY,
} from './session-bounds.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function makeThrowingStorage() {
  return {
    getItem: () => {
      throw new Error('SecurityError: storage disabled');
    },
    setItem: () => {
      throw new Error('SecurityError: storage disabled');
    },
    removeItem: () => {
      throw new Error('SecurityError: storage disabled');
    },
  };
}

function makeBounds(overrides = {}, storage = makeFakeStorage()) {
  return new SessionBounds({
    getStorage: () => storage,
    key: 'test-key',
    ...overrides,
  });
}

describe('SessionBounds – defaults', () => {
  it('exports 30 minutes and 12 hours as the default bounds', () => {
    expect(DEFAULT_IDLE_MINUTES).toBe(30);
    expect(DEFAULT_ABSOLUTE_HOURS).toBe(12);
  });

  it('derives idleTimeoutMs and absoluteCapMs from the defaults when no options are given', () => {
    const bounds = makeBounds();

    expect(bounds.idleTimeoutMs).toBe(30 * MINUTE_MS);
    expect(bounds.absoluteCapMs).toBe(12 * HOUR_MS);
  });

  it('IDLE_EXPIRY and ABSOLUTE_EXPIRY are the string reasons check() returns', () => {
    expect(IDLE_EXPIRY).toBe('idle');
    expect(ABSOLUTE_EXPIRY).toBe('absolute');
  });
});

describe('SessionBounds – start()', () => {
  it('writes both stamps, and a freshly started session checks as in-bounds', () => {
    const bounds = makeBounds();

    bounds.start(1_000_000);

    expect(bounds.check(1_000_000)).toBeNull();
    expect(bounds.hasRecord()).toBe(true);
  });
});

describe('SessionBounds – idle bound', () => {
  const IDLE_MS = 5 * MINUTE_MS;

  function idleOnlyBounds() {
    // Absolute cap disabled so only the idle bound is under test.
    return makeBounds({ idleTimeoutMinutes: 5, absoluteCapHours: 0 });
  }

  it('is in-bounds just under the idle window', () => {
    const bounds = idleOnlyBounds();
    bounds.start(0);

    expect(bounds.check(IDLE_MS - 1)).toBeNull();
  });

  it('expires as idle exactly at the idle window', () => {
    const bounds = idleOnlyBounds();
    bounds.start(0);

    expect(bounds.check(IDLE_MS)).toBe(IDLE_EXPIRY);
  });

  it('expires as idle past the idle window', () => {
    const bounds = idleOnlyBounds();
    bounds.start(0);

    expect(bounds.check(IDLE_MS + 1)).toBe(IDLE_EXPIRY);
  });
});

describe('SessionBounds – absolute bound', () => {
  const ABSOLUTE_MS = HOUR_MS;

  function absoluteOnlyBounds() {
    // Idle disabled so only the absolute cap is under test.
    return makeBounds({ idleTimeoutMinutes: 0, absoluteCapHours: 1 });
  }

  it('is in-bounds just under the cap', () => {
    const bounds = absoluteOnlyBounds();
    bounds.start(0);

    expect(bounds.check(ABSOLUTE_MS - 1)).toBeNull();
  });

  it('expires as absolute exactly at the cap', () => {
    const bounds = absoluteOnlyBounds();
    bounds.start(0);

    expect(bounds.check(ABSOLUTE_MS)).toBe(ABSOLUTE_EXPIRY);
  });

  it('expires as absolute past the cap', () => {
    const bounds = absoluteOnlyBounds();
    bounds.start(0);

    expect(bounds.check(ABSOLUTE_MS + 1)).toBe(ABSOLUTE_EXPIRY);
  });
});

describe('SessionBounds – precedence when both bounds are exceeded', () => {
  it('reports absolute, not idle, once both have been crossed', () => {
    const bounds = makeBounds({ idleTimeoutMinutes: 10, absoluteCapHours: 1 });
    bounds.start(0);

    // 3,700,000ms is past both the 10-minute idle window (600,000ms) and the
    // 1-hour cap (3,600,000ms) measured from the same start time.
    expect(bounds.check(3_700_000)).toBe(ABSOLUTE_EXPIRY);
  });
});

describe('SessionBounds – touch()', () => {
  it('extends the idle window without moving startedAt', () => {
    const bounds = makeBounds({ idleTimeoutMinutes: 10, absoluteCapHours: 1 });
    bounds.start(0);

    bounds.touch(500_000);
    // Idle window measured from the touch, not the original start: 599,999ms
    // after the touch is still under the 10-minute (600,000ms) idle window.
    expect(bounds.check(500_000 + 599_999)).toBeNull();
  });

  it('does not extend the absolute cap: a repeatedly touched session still expires at the cap', () => {
    const bounds = makeBounds({ idleTimeoutMinutes: 10, absoluteCapHours: 1 });
    bounds.start(0);

    bounds.touch(100_000);
    bounds.touch(200_000);
    // Touched 1ms before the cap, so idle has just been reset...
    bounds.touch(HOUR_MS - 1);

    // ...but the absolute cap still fires at the top-of-hour mark regardless.
    expect(bounds.check(HOUR_MS)).toBe(ABSOLUTE_EXPIRY);
  });

  it('does not adopt a session with no existing record', () => {
    const bounds = makeBounds();

    bounds.touch(1000);

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check(1000)).toBe(ABSOLUTE_EXPIRY);
  });
});

describe('SessionBounds – fail closed', () => {
  it('check() returns absolute and hasRecord() is false when there is no record at all', () => {
    const bounds = makeBounds();

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check()).toBe(ABSOLUTE_EXPIRY);
  });

  it('treats a non-JSON stored value as no record', () => {
    const storage = makeFakeStorage();
    storage.setItem('test-key', 'not-json-at-all{{{');
    const bounds = makeBounds({}, storage);

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check()).toBe(ABSOLUTE_EXPIRY);
  });

  it('treats JSON without numeric stamps as no record', () => {
    const storage = makeFakeStorage();
    storage.setItem('test-key', JSON.stringify({ startedAt: 'nope', lastActivityAt: 'nope' }));
    const bounds = makeBounds({}, storage);

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check()).toBe(ABSOLUTE_EXPIRY);
  });

  it('treats JSON missing the stamp fields entirely as no record', () => {
    const storage = makeFakeStorage();
    storage.setItem('test-key', JSON.stringify({ foo: 'bar' }));
    const bounds = makeBounds({}, storage);

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check()).toBe(ABSOLUTE_EXPIRY);
  });
});

describe('SessionBounds – clear()', () => {
  it('removes the record', () => {
    const bounds = makeBounds();
    bounds.start(0);
    expect(bounds.hasRecord()).toBe(true);

    bounds.clear();

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check(0)).toBe(ABSOLUTE_EXPIRY);
  });
});

describe('SessionBounds – disabling bounds', () => {
  it('idleTimeoutMinutes: 0 disables only the idle bound', () => {
    // Idle disabled; absolute given a very large value so it cannot fire
    // within this test and interfere with the isolation.
    const bounds = makeBounds({ idleTimeoutMinutes: 0, absoluteCapHours: 1000 });
    bounds.start(0);

    expect(bounds.idleTimeoutMs).toBeNull();
    expect(bounds.disabled).toBe(false);
    // Past the default 30-minute idle window, but idle is disabled here.
    expect(bounds.check(2 * HOUR_MS)).toBeNull();
  });

  it('absoluteCapHours: 0 disables only the cap', () => {
    // Absolute disabled; idle given a very large value so it cannot fire
    // within this test and interfere with the isolation.
    const bounds = makeBounds({ idleTimeoutMinutes: 6000, absoluteCapHours: 0 });
    bounds.start(0);

    expect(bounds.absoluteCapMs).toBeNull();
    expect(bounds.disabled).toBe(false);
    // Past the default 12-hour cap, but the cap is disabled here.
    expect(bounds.check(20 * HOUR_MS)).toBeNull();
  });

  it('both set to 0 makes disabled true and check() returns null even with no record', () => {
    const bounds = makeBounds({ idleTimeoutMinutes: 0, absoluteCapHours: 0 });

    expect(bounds.disabled).toBe(true);
    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check()).toBeNull();
  });
});

describe('SessionBounds – custom non-default durations', () => {
  it('honors a custom idleTimeoutMinutes and absoluteCapHours', () => {
    const bounds = makeBounds({ idleTimeoutMinutes: 5, absoluteCapHours: 2 });

    expect(bounds.idleTimeoutMs).toBe(5 * MINUTE_MS);
    expect(bounds.absoluteCapMs).toBe(2 * HOUR_MS);
  });
});

describe('SessionBounds – storage that throws (Safari privacy mode, quota errors, etc.)', () => {
  it('does not throw out of any method, and fails closed', () => {
    const storage = makeThrowingStorage();
    const bounds = makeBounds({}, storage);

    expect(() => bounds.start(0)).not.toThrow();
    expect(() => bounds.touch(0)).not.toThrow();
    expect(() => bounds.clear()).not.toThrow();
    expect(() => bounds.hasRecord()).not.toThrow();
    expect(() => bounds.check(0)).not.toThrow();

    expect(bounds.hasRecord()).toBe(false);
    expect(bounds.check(0)).toBe(ABSOLUTE_EXPIRY);
  });

  it('does not throw when getStorage() itself throws', () => {
    const bounds = new SessionBounds({
      getStorage: () => {
        throw new Error('window.localStorage getter threw');
      },
      key: 'test-key',
    });

    expect(() => bounds.start(0)).not.toThrow();
    expect(bounds.check(0)).toBe(ABSOLUTE_EXPIRY);
    expect(bounds.hasRecord()).toBe(false);
  });
});

describe('SessionBounds – key namespacing', () => {
  it('two instances with different keys over the same storage do not see each other\'s records', () => {
    const sharedStorage = makeFakeStorage();
    const boundsA = new SessionBounds({ getStorage: () => sharedStorage, key: 'client-a' });
    const boundsB = new SessionBounds({ getStorage: () => sharedStorage, key: 'client-b' });

    boundsA.start(0);

    expect(boundsA.hasRecord()).toBe(true);
    expect(boundsB.hasRecord()).toBe(false);
    expect(boundsB.check(0)).toBe(ABSOLUTE_EXPIRY);
  });
});
