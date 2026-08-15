/**
 * @jest-environment jsdom
 *
 * Gap 2 — first-refocus race (prod finding 2026-08-15): after a long absence the socket is
 * torn down; on refocus the reconnect → 1s debounce → service round trip resolves AFTER the
 * focus handler has already read `needToUpdate === false`, so pre-fix the first refocus could
 * never reload BY CONSTRUCTION — the handler read the stale flag and gave up.
 *
 * Post-fix the focus handler records the qualifying refocus (a return from a 30s+ absence)
 * and the check's RESOLUTION applies the reload the handler could not: a check resolving true
 * shortly after a qualifying refocus reloads. Returning to visibility also triggers a check
 * directly (pre-fix the socket reconnect covered this only incidentally).
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
  focusWindow,
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

describe('first-refocus race', () => {
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

  it('reloads when the reconnect-triggered check resolves true just after a qualifying refocus', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);

    // The user leaves for an hour (socket torn down while away)...
    blurWindow();
    await act(async () => visibility.change('hidden'));
    await advance(3_600_000);

    // ...and returns: visible + focused. The flag is still false — the check has not run yet.
    await act(async () => visibility.change('visible'));
    focusWindow();
    expect(reloadSpy).not.toHaveBeenCalled(); // pre-fix, this is where the story ended

    // The socket reconnects and the debounced check resolves true AFTER the focus handler ran.
    act(() => socket.fire('connect'));
    await advance(1000);
    expect(mockNeedToUpdateService).toHaveBeenCalledWith('1.0.0');
    check.resolve(true);
    await flush();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('returning to visibility triggers a check without any socket event', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    mockNeedToUpdateService.mockResolvedValue(false);

    await act(async () => visibility.change('hidden'));
    await advance(60_000);
    expect(mockNeedToUpdateService).not.toHaveBeenCalled();

    await act(async () => visibility.change('visible'));
    await advance(1000); // check debounce
    expect(mockNeedToUpdateService).toHaveBeenCalledTimes(1);
  });

  it('does not yank when the check resolves true long after the refocus — affordance only', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);

    blurWindow();
    await act(async () => visibility.change('hidden'));
    await advance(3_600_000);
    await act(async () => visibility.change('visible'));
    focusWindow();
    act(() => socket.fire('connect'));
    await advance(1000);

    // The user has been back and active for a while by the time the result lands.
    await advance(11_000);
    check.resolve(true);
    await flush();

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');
  });

  it('does not treat a short blur as an absence — a true result after a quick app-switch shows the affordance', async () => {
    mounted = mount(<Probe currentVersion='1.0.0' socket={socket.asSocket()} />);
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);

    blurWindow();
    await advance(10_000); // under the 30s absence threshold
    focusWindow();
    act(() => socket.fire('connect'));
    await advance(1000);
    check.resolve(true);
    await flush();

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');
  });
});
