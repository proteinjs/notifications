/**
 * @jest-environment jsdom
 *
 * Hard reload guards (design ruling 2026-08-14): app-registered guards (an unsent composer
 * draft, a streaming/in-flight turn, a thought editor's debounced-save window) veto an
 * auto-reload in EVERY state — even a hidden tab must not reload over unsaved input. Guards
 * defer, never cancel: while vetoed the mechanism stays armed and retries, and the reload
 * fires at the first safe moment after the guard releases.
 */
import React, { useEffect } from 'react';
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

describe('reload guards veto in every state and defer, never cancel', () => {
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

  it('vetoes even the hidden reload, then reloads once the guard releases', async () => {
    let draftExists = true; // e.g. an unsent composer draft
    mountProbe();
    act(() => void api.registerReloadGuard(() => draftExists));

    visibility.set('hidden');
    await detectStale();
    expect(reloadSpy).not.toHaveBeenCalled(); // hidden would be a free reload, but the draft vetoes
    expect(flag()).toBe('true'); // deferred, not cancelled — still armed

    draftExists = false;
    await advance(6_000); // next retry sees the guard released and the tab still hidden
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('vetoes the idle reload until the guard releases', async () => {
    let streaming = true; // e.g. an in-flight streaming turn
    mountProbe();
    act(() => void api.registerReloadGuard(() => streaming));

    await detectStale();
    await advance(60_000); // idle window long open, but the turn is still streaming
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(flag()).toBe('true');

    streaming = false;
    await advance(10_000);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('unregistering a guard removes its veto', async () => {
    mountProbe();
    let unregister!: () => void;
    act(() => {
      unregister = api.registerReloadGuard(() => true);
    });

    await detectStale();
    await act(async () => visibility.change('hidden'));
    expect(reloadSpy).not.toHaveBeenCalled();

    act(() => unregister());
    await advance(6_000);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
