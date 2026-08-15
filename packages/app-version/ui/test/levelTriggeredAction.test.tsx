/**
 * @jest-environment jsdom
 *
 * Gap 1 — edge-triggered action (prod finding 2026-08-15): pre-fix, a true check result only
 * ever set the `needToUpdate` flag; the ONLY reload path was a focus event arriving 30s+ after
 * a blur with the flag ALREADY true. A tab that was hidden when staleness was detected never
 * reloaded on detection, and a continuously-used tab never reloaded at all — the user saw
 * nothing but the toolbar star.
 *
 * Post-fix the mechanism is level-triggered on the check RESULT:
 * - stale + hidden at detection → reload immediately (a hidden reload is free);
 * - stale + visible → affordance shows, and the tab reloads itself the moment it goes hidden;
 * - stale + visible + actively used → never yanked (affordance only).
 */
import React from 'react';
import { Socket } from 'socket.io-client';
import { useVersionChecker } from '../src/useVersionChecker';
import { FakeSocket, VisibilityController, Deferred, mount, installReloadSpy, advance, flush } from './harness';
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

describe('level-triggered action on a true check result', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;

  const flag = () => mounted!.container.querySelector('[data-flag]')!.getAttribute('data-flag');

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

  it('reloads immediately when the check resolves true while the tab is hidden', async () => {
    // The tab is hidden when the (reconnect-triggered) check runs — e.g. a deploy killed the
    // server while this tab sat in the background and the socket reconnected.
    visibility.set('hidden');
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);
    act(() => socket.fire('connect'));
    await advance(1000); // check debounce
    expect(mockNeedToUpdateService).toHaveBeenCalledWith('1.0.0');

    check.resolve(true);
    await flush();

    // A hidden reload is free — the user is not looking; the next focus lands fresh.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads a stale never-blurred tab the moment it goes hidden', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    // The flag flips true while the tab is visible, focused, and has never blurred — the
    // exact continuously-used-tab shape that pre-fix could never reload.
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);
    act(() => socket.fire('connect'));
    await advance(1000);
    check.resolve(true);
    await flush();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true'); // affordance shows while the user is active

    // The user switches away: the stale tab reloads itself while nobody is looking.
    await act(async () => visibility.change('hidden'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('never yanks an actively-used visible tab — affordance only', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);

    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);
    act(() => socket.fire('connect'));
    await advance(1000);
    check.resolve(true);
    await flush();

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');
  });
});
