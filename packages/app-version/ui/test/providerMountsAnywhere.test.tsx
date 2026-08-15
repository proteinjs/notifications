/**
 * @jest-environment jsdom
 *
 * Gap 3 — chrome-coupled mount (prod finding 2026-08-15): pre-fix the checker only ran where
 * the toolbar rendered it — a collapsed toolbar meant the version mechanism never mounted at
 * all. Post-fix `VersionCheckerProvider` is a headless mount-anywhere owner of the machinery:
 * the app mounts it once at the root, and chrome (the toolbar star) is only a view over
 * `useVersionCheckerContext`.
 */
import React from 'react';
import { VersionCheckerProvider, useVersionCheckerContext } from '../src/VersionCheckerProvider';
import { FakeSocket, VisibilityController, Deferred, mount, installReloadSpy, advance, flush } from './harness';
import { act } from 'react-dom/test-utils';

const mockNeedToUpdateService = jest.fn<Promise<boolean>, [string]>();
jest.mock('@proteinjs/app-version-common', () => ({
  getVersionCheckerService: () => ({
    needToUpdate: (currentVersion: string) => mockNeedToUpdateService(currentVersion),
  }),
}));

const ContextProbe = () => {
  const { needToUpdate } = useVersionCheckerContext();
  return <div data-flag={String(needToUpdate)} />;
};

class ErrorCatcher extends React.Component<{ children: React.ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return <div data-error={this.state.message} />;
    }
    return this.props.children;
  }
}

const reloadSpy = installReloadSpy();
const visibility = new VisibilityController();

describe('VersionCheckerProvider mounts anywhere', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;

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

  it('runs the check machinery with no chrome mounted at all', async () => {
    mockNeedToUpdateService.mockResolvedValue(false);
    mounted = mount(
      <VersionCheckerProvider currentVersion='1.2.3' socket={socket.asSocket()}>
        <div />
      </VersionCheckerProvider>
    );

    act(() => socket.fire('connect'));
    await advance(1000); // check debounce

    expect(mockNeedToUpdateService).toHaveBeenCalledWith('1.2.3');
  });

  it('exposes needToUpdate to consuming views via context', async () => {
    const check = new Deferred<boolean>();
    mockNeedToUpdateService.mockReturnValue(check.promise);
    mounted = mount(
      <VersionCheckerProvider currentVersion='1.2.3' socket={socket.asSocket()}>
        <ContextProbe />
      </VersionCheckerProvider>
    );
    expect(mounted.container.querySelector('[data-flag]')!.getAttribute('data-flag')).toBe('false');

    act(() => socket.fire('connect'));
    await advance(1000);
    check.resolve(true);
    await flush();

    expect(mounted.container.querySelector('[data-flag]')!.getAttribute('data-flag')).toBe('true');
  });

  it('useVersionCheckerContext outside a provider throws', () => {
    // Silence React's error-boundary console noise for this intentional throw.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mounted = mount(
        <ErrorCatcher>
          <ContextProbe />
        </ErrorCatcher>
      );
      const error = mounted.container.querySelector('[data-error]')!.getAttribute('data-error');
      expect(error).toMatch(/VersionCheckerProvider/);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
