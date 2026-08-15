/**
 * @jest-environment jsdom
 *
 * Reload bias (design ruling 2026-08-14): the net result should be MORE auto reloads — the
 * affordance is the fallback, not the default. A stale tab that is hidden OR blurred reloads
 * immediately; a visible tab whose user has gone idle (no focused text input and no
 * interaction for the idle window) auto-reloads too — a user reading a static page eats one
 * navigation-style refresh. Only a genuinely ACTIVE tab defers to the affordance, and it
 * still reloads at the next safe transition (hide/blur or the idle window opening).
 */
import React from 'react';
import { Socket } from 'socket.io-client';
import { useVersionChecker } from '../src/useVersionChecker';
import {
  FakeSocket,
  VisibilityController,
  Deferred,
  mount,
  installReloadSpy,
  advance,
  flush,
  blurWindow,
} from './harness';
import { act } from 'react-dom/test-utils';

const mockNeedToUpdateService = jest.fn<Promise<boolean>, [string]>();
jest.mock('@proteinjs/app-version-common', () => ({
  getVersionCheckerService: () => ({
    needToUpdate: (currentVersion: string) => mockNeedToUpdateService(currentVersion),
  }),
}));

const Probe = ({ currentVersion, socket }: { currentVersion: string; socket: Socket | null }) => {
  const { needToUpdate } = useVersionChecker(currentVersion, socket);
  return <div data-flag={String(needToUpdate)} />;
};

const reloadSpy = installReloadSpy();
const visibility = new VisibilityController();

describe('reload bias: visible-idle and blurred tabs auto-reload', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;

  const flag = () => mounted!.container.querySelector('[data-flag]')!.getAttribute('data-flag');

  /** Mount, connect, and resolve one check as true (stale). */
  const detectStale = async () => {
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);
    act(() => socket.fire('connect'));
    await advance(1000); // check debounce
    check.resolve(true);
    await flush();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    socket = new FakeSocket();
    reloadSpy.mockClear();
    mockNeedToUpdateService.mockReset();
    visibility.set('visible');
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    jest.useRealTimers();
  });

  it('reloads immediately when the check resolves true while the window is blurred', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    blurWindow(); // another app has focus; the page may still be on screen

    await detectStale();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('auto-reloads a visible tab once the user has been idle for the idle window', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    await detectStale();

    // Active at detection (the mount just happened) — affordance first, no yank.
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');

    // The user reads on without touching anything: the idle window opens and the tab reloads.
    await advance(50_000);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('defers the idle reload while the user keeps interacting', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    await detectStale();

    await advance(30_000);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    await advance(30_000); // only 30s since the keydown — still active
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');

    await advance(20_000); // the idle window opens
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('never idle-reloads out from under a focused text input', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    await detectStale();
    await advance(60_000); // idle time satisfied, but a text input holds focus
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');

    // Leaving the field is itself a user action (a click-out or Tab in a real browser; jsdom
    // models it as a window focus event), so the idle window restarts — and once it reopens
    // with nothing focused, the reload fires.
    act(() => textarea.blur());
    await advance(50_000);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    textarea.remove();
  });
});
