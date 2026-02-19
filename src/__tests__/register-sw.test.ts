/**
 * Tests for the service worker update-check logic in register-sw.ts.
 *
 * We mock the browser Service Worker API (navigator.serviceWorker,
 * ServiceWorkerRegistration, ServiceWorker) because this runs in a
 * Node test environment.
 */

// ---------------------------------------------------------------------------
// Helpers — lightweight EventTarget mock
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void;

function createEventTarget() {
  const listeners: Record<string, Set<Listener>> = {};
  return {
    addEventListener: jest.fn((event: string, cb: Listener) => {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(cb);
    }),
    removeEventListener: jest.fn((event: string, cb: Listener) => {
      listeners[event]?.delete(cb);
    }),
    _emit(event: string) {
      listeners[event]?.forEach((cb) => cb());
    },
  };
}

interface MockServiceWorker extends ReturnType<typeof createEventTarget> {
  state: string;
  postMessage: jest.Mock;
  _setState(newState: string): void;
}

function createMockSW(initialState = "installing"): MockServiceWorker {
  const target = createEventTarget();
  let state = initialState;
  // Use defineProperties so the `state` getter stays live (Object.assign
  // would snapshot the value at assignment time).
  Object.defineProperties(target, {
    state: {
      get() { return state; },
      enumerable: true,
      configurable: true,
    },
    _setState: {
      value(newState: string) {
        state = newState;
        target._emit("statechange");
      },
      enumerable: true,
    },
    postMessage: {
      value: jest.fn(),
      enumerable: true,
    },
  });
  return target as unknown as MockServiceWorker;
}

interface MockRegistration extends ReturnType<typeof createEventTarget> {
  waiting: MockServiceWorker | null;
  installing: MockServiceWorker | null;
  update: jest.Mock;
}

function createMockRegistration(opts: {
  waiting?: MockServiceWorker | null;
  installing?: MockServiceWorker | null;
} = {}): MockRegistration {
  const target = createEventTarget();
  return Object.assign(target, {
    waiting: opts.waiting ?? null,
    installing: opts.installing ?? null,
    update: jest.fn().mockResolvedValue(undefined),
  });
}

/**
 * Flush pending microtasks so that the async function under test can
 * progress past its `await` points before we simulate events.
 * Each `await Promise.resolve()` yields one microtask tick; the function
 * under test has two `await`s (getRegistration + update), so we need
 * at least two yields plus one for safety.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Test setup — mock browser globals, reimport module per test
// ---------------------------------------------------------------------------

let mockGetRegistration: jest.Mock;
const savedNavigator = global.navigator;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick"] });
  jest.resetModules();

  mockGetRegistration = jest.fn();

  // Provide the minimal browser globals that register-sw.ts checks for
  (global as Record<string, unknown>).window = global;
  Object.defineProperty(global, "navigator", {
    value: {
      serviceWorker: {
        getRegistration: mockGetRegistration,
        controller: {},
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  delete (global as Record<string, unknown>).window;
  Object.defineProperty(global, "navigator", {
    value: savedNavigator,
    writable: true,
    configurable: true,
  });
});

/** Import the module fresh (after globals are set up). */
function loadModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/lib/register-sw") as typeof import("@/lib/register-sw");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkForServiceWorkerUpdate", () => {
  it("returns false when window is undefined", async () => {
    delete (global as Record<string, unknown>).window;
    const { checkForServiceWorkerUpdate } = loadModule();

    expect(await checkForServiceWorkerUpdate()).toBe(false);
  });

  it("returns false when serviceWorker is not in navigator", async () => {
    Object.defineProperty(global, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });
    const { checkForServiceWorkerUpdate } = loadModule();

    expect(await checkForServiceWorkerUpdate()).toBe(false);
  });

  it("returns false when no registration exists", async () => {
    mockGetRegistration.mockResolvedValue(undefined);
    const { checkForServiceWorkerUpdate } = loadModule();

    expect(await checkForServiceWorkerUpdate()).toBe(false);
  });

  it("returns true immediately when a waiting worker exists after update()", async () => {
    const waiting = createMockSW("installed");
    const reg = createMockRegistration({ waiting });
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate, onServiceWorkerUpdate } = loadModule();
    const cb = jest.fn();
    onServiceWorkerUpdate(cb);

    const result = await checkForServiceWorkerUpdate();

    expect(result).toBe(true);
    expect(reg.update).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(reg);
  });

  it("returns true when an installing worker transitions to installed", async () => {
    const installing = createMockSW("installing");
    const reg = createMockRegistration({ installing });
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate, onServiceWorkerUpdate } = loadModule();
    const cb = jest.fn();
    onServiceWorkerUpdate(cb);

    const promise = checkForServiceWorkerUpdate();

    // Flush the two awaits (getRegistration + update) so the function
    // reaches waitForUpdate and starts listening for state changes.
    await flushMicrotasks();

    // Simulate the worker finishing install
    installing._setState("installed");

    expect(await promise).toBe(true);
    expect(cb).toHaveBeenCalledWith(reg);
  });

  it("returns true when updatefound fires after update() and worker installs", async () => {
    // This is the race condition scenario: after registration.update(),
    // neither waiting nor installing is set yet.
    const reg = createMockRegistration();
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate, onServiceWorkerUpdate } = loadModule();
    const cb = jest.fn();
    onServiceWorkerUpdate(cb);

    const promise = checkForServiceWorkerUpdate();
    await flushMicrotasks();

    // Simulate the browser asynchronously finding a new SW
    const newSW = createMockSW("installing");
    reg.installing = newSW;
    reg._emit("updatefound");

    // Then the new SW finishes installing
    newSW._setState("installed");

    expect(await promise).toBe(true);
    expect(cb).toHaveBeenCalledWith(reg);
  });

  it("returns false after timeout when no update materialises", async () => {
    const reg = createMockRegistration();
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate, onServiceWorkerUpdate } = loadModule();
    const cb = jest.fn();
    onServiceWorkerUpdate(cb);

    const promise = checkForServiceWorkerUpdate();
    await flushMicrotasks();

    // Advance past the 10s timeout
    jest.advanceTimersByTime(10_000);

    expect(await promise).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it("cleans up the updatefound listener on timeout", async () => {
    const reg = createMockRegistration();
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate } = loadModule();

    const promise = checkForServiceWorkerUpdate();
    await flushMicrotasks();

    // The function should have added an updatefound listener
    expect(reg.addEventListener).toHaveBeenCalledWith(
      "updatefound",
      expect.any(Function)
    );

    jest.advanceTimersByTime(10_000);
    await promise;

    // After timeout, the listener should have been removed
    expect(reg.removeEventListener).toHaveBeenCalledWith(
      "updatefound",
      expect.any(Function)
    );
  });

  it("cleans up the updatefound listener on success", async () => {
    const reg = createMockRegistration();
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate } = loadModule();

    const promise = checkForServiceWorkerUpdate();
    await flushMicrotasks();

    // Simulate update found → installed
    const newSW = createMockSW("installed");
    reg.installing = newSW;
    reg._emit("updatefound");

    await promise;

    expect(reg.removeEventListener).toHaveBeenCalledWith(
      "updatefound",
      expect.any(Function)
    );
  });

  it("does not resolve twice if updatefound fires after installing is already set", async () => {
    // Edge case: installing is set AND updatefound fires
    const installing = createMockSW("installing");
    const reg = createMockRegistration({ installing });
    mockGetRegistration.mockResolvedValue(reg);

    const { checkForServiceWorkerUpdate, onServiceWorkerUpdate } = loadModule();
    const cb = jest.fn();
    onServiceWorkerUpdate(cb);

    const promise = checkForServiceWorkerUpdate();
    await flushMicrotasks();

    // Worker finishes installing
    installing._setState("installed");

    expect(await promise).toBe(true);
    // Callback called exactly once
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
