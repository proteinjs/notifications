/**
 * @jest-environment jsdom
 *
 * Reload guards DEFER, bounded — never veto. A consumer registers a guard for a moment the page
 * must not be torn down in (a request in flight whose loss it could not recover from); while the
 * guard holds, the reload waits and re-asks on a short cadence, and it fires at the first release.
 * A guard cannot hold forever: `RELOAD_DEFER_MAX_MS` after staleness was detected the reload fires
 * whatever the guards say. State the page can restore by itself after a reload (an unsent draft its
 * editor persists) is not a reason to guard, and a guard that reads such state indefinitely was the
 * failure mode this bound exists for.
 */
import React, { useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { useVersionChecker, RELOAD_DEFER_MAX_MS, RELOAD_RETRY_INTERVAL_MS } from '../src/useVersionChecker';
import {
  FakeSocket,
  VisibilityController,
  Deferred,
  mount,
  installReloadSpy,
  advance,
  flush,
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

type CheckerApi = { registerReloadGuard: (guard: () => boolean) => () => void };

const ApiProbe = ({
  currentVersion,
  socket,
  onReady,
}: {
  currentVersion: string;
  socket: Socket | null;
  onReady: (api: CheckerApi) => void;
}) => {
  const { needToUpdate, registerReloadGuard } = useVersionChecker(currentVersion, socket);
  useEffect(() => {
    onReady({ registerReloadGuard });
  }, [registerReloadGuard]);
  return <div data-flag={String(needToUpdate)} />;
};

const reloadSpy = installReloadSpy();
const visibility = new VisibilityController();

describe('reload guards defer for a bounded time, never veto', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;
  let api!: CheckerApi;

  const flag = () => mounted!.container.querySelector('[data-flag]')!.getAttribute('data-flag');

  const mountProbe = () => {
    mounted = mount(
      <ApiProbe currentVersion='1.0.0' socket={socket.asSocket()} onReady={(readyApi) => (api = readyApi)} />
    );
  };

  /** Connect and resolve one check as true (stale). */
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

  it('a holding guard defers the reload; the reload fires at the first release', async () => {
    let requestInFlight = true;
    mountProbe();
    act(() => void api.registerReloadGuard(() => requestInFlight));

    await detectStale();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true'); // stale is known — deferred, not cancelled

    requestInFlight = false;
    await advance(RELOAD_RETRY_INTERVAL_MS);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a guard that never releases is overridden at the bound', async () => {
    mountProbe();
    act(() => void api.registerReloadGuard(() => true));

    await detectStale();
    await advance(RELOAD_DEFER_MAX_MS - RELOAD_RETRY_INTERVAL_MS - 1);
    expect(reloadSpy).not.toHaveBeenCalled(); // inside the bound the guard still holds

    await advance(RELOAD_RETRY_INTERVAL_MS + 1);
    expect(reloadSpy).toHaveBeenCalledTimes(1); // the bound passed: the guard no longer counts
  });

  it('a guard defers a hidden page exactly the same way', async () => {
    let requestInFlight = true;
    visibility.set('hidden');
    mountProbe();
    act(() => void api.registerReloadGuard(() => requestInFlight));

    await detectStale();
    expect(reloadSpy).not.toHaveBeenCalled();

    requestInFlight = false;
    await advance(RELOAD_RETRY_INTERVAL_MS);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('unregistering a guard removes its deferral', async () => {
    mountProbe();
    let unregister!: () => void;
    act(() => {
      unregister = api.registerReloadGuard(() => true);
    });

    await detectStale();
    expect(reloadSpy).not.toHaveBeenCalled();

    act(() => unregister());
    await advance(RELOAD_RETRY_INTERVAL_MS);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('a second stale answer while deferred neither restarts the bound nor doubles the reload', async () => {
    mountProbe();
    act(() => void api.registerReloadGuard(() => true));

    await detectStale();
    await advance(RELOAD_DEFER_MAX_MS / 2);
    // The page comes back to visibility mid-deferral: another check, another stale answer.
    mockNeedToUpdateService.mockResolvedValue(true);
    await act(async () => visibility.change('hidden'));
    await act(async () => visibility.change('visible'));
    await advance(1000);
    await flush();
    expect(reloadSpy).not.toHaveBeenCalled();

    // The bound counts from the FIRST detection.
    await advance(RELOAD_DEFER_MAX_MS / 2 + RELOAD_RETRY_INTERVAL_MS);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    await advance(RELOAD_DEFER_MAX_MS);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
