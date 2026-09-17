/**
 * @jest-environment jsdom
 *
 * A stale bundle reloads the moment staleness is known — in every page state. The earlier
 * level-triggered design deferred a visible, actively-used tab to an "update" affordance and
 * reloaded only at a safe transition (hide, blur, a 45s idle window, a return from a 30s+
 * absence); a consumer that cannot promise backwards compatibility between builds cannot leave
 * the reload to the user, and a deferral the user can outwait is a reload that never happens.
 * Only a registered guard delays the reload, for a bounded time (reloadGuards.test.tsx).
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
  signedIn,
} from './harness';

// The check is a signed-in read (sessionGate.test.tsx owns that contract).
beforeAll(() => signedIn());
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

describe('a stale bundle reloads at detection, whatever the tab is doing', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;

  const flag = () => mounted!.container.querySelector('[data-flag]')!.getAttribute('data-flag');

  /** Connect and resolve one check with `stale`. */
  const check = async (stale: boolean) => {
    const result = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(result.promise);
    act(() => socket.fire('connect'));
    await advance(1000); // check debounce
    result.resolve(stale);
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

  it('a visible tab the user just interacted with reloads at once', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });

    await check(true);

    expect(mockNeedToUpdateService).toHaveBeenCalledWith('1.0.0');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a tab with a focused text input reloads at once', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    expect(document.activeElement).toBe(textarea);

    await check(true);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it('a hidden tab reloads at once', async () => {
    visibility.set('hidden');
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    await check(true);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a blurred window reloads at once', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    blurWindow();

    await check(true);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a return to visibility checks by itself — no socket event — and a stale answer reloads', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const result = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(result.promise);

    await act(async () => visibility.change('hidden'));
    await advance(60_000);
    expect(mockNeedToUpdateService).not.toHaveBeenCalled();

    // The page comes back (a phone app resumed, a tab re-selected): the check runs, the
    // socket having survived the absence and so never reconnecting.
    await act(async () => visibility.change('visible'));
    await advance(1000); // check debounce
    expect(mockNeedToUpdateService).toHaveBeenCalledTimes(1);

    result.resolve(true);
    await flush();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a current bundle never reloads and never reads stale', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    await check(false);
    await advance(120_000);

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('false');
  });

  it('reloads once, not once per trigger', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    await check(true);
    // A visibility bounce after the reload was initiated (the old document still running for a
    // beat) must not start a second one.
    mockNeedToUpdateService.mockResolvedValue(true);
    await act(async () => visibility.change('hidden'));
    await act(async () => visibility.change('visible'));
    await advance(1000);
    await flush();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
