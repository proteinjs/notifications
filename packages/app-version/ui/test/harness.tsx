/**
 * Shared jsdom harness for the version-checker tests: a fake socket, observable
 * `window.location.reload`, `document.visibilityState` control, deferred service results,
 * and act-wrapped mount/timer helpers.
 *
 * Not a test file (the jest `testRegex` only matches `*.test.tsx`). Each test file supplies
 * its own `jest.mock('@proteinjs/app-version-common', ...)` — module mocks are per-file.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Socket } from 'socket.io-client';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A minimal Socket.IO stand-in: registers/removes handlers and fires events on demand. */
export class FakeSocket {
  private handlers: Map<string, Set<(...args: any[]) => void>> = new Map();

  asSocket(): Socket {
    return this as unknown as Socket;
  }

  /** Fire `event` synchronously to all registered handlers (wrap in `act` when it updates state). */
  fire(event: string) {
    this.handlers.get(event)?.forEach((handler) => handler());
  }

  on(event: string, handler: (...args: any[]) => void) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }
}

/** Overrides `document.visibilityState` and fires `visibilitychange` like a real tab switch. */
export class VisibilityController {
  private state: DocumentVisibilityState = 'visible';

  constructor() {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => this.state,
    });
  }

  /** Set the state AND dispatch `visibilitychange`, like a real tab switch. */
  change(state: DocumentVisibilityState) {
    this.state = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  /** Set the state without an event (the tab was already in this state). */
  set(state: DocumentVisibilityState) {
    this.state = state;
  }
}

/** A promise whose resolution the test controls — to sequence service results against events. */
export class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

export type Mounted = { root: Root; container: HTMLDivElement; unmount: () => void };

export const mount = (element: React.ReactElement): Mounted => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    root,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

/**
 * Replace jsdom's unimplemented `window.location` with an observable stub.
 * Call once per test file (jsdom shares the window across tests in a file).
 */
export const installReloadSpy = (): jest.Mock => {
  const reloadSpy = jest.fn();
  Reflect.deleteProperty(window, 'location');
  (window as any).location = { reload: reloadSpy };
  return reloadSpy;
};

/** Advance fake timers inside `act`, flushing any state updates they cause. */
export const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** Flush pending microtasks (e.g. a just-resolved service promise) inside `act`. */
export const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

export const blurWindow = () =>
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });

export const focusWindow = () =>
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
