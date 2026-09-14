/**
 * @jest-environment jsdom
 *
 * The version check is a signed-in read. Its server half (`VersionChecker`, `allUsers`) refuses a
 * call without a session, so a check fired from a page with no session — the socket connects and
 * the tab regains visibility on a login page exactly as on any other — could only be refused,
 * and every unauthenticated load logged "Failed to check version: User not authorized …".
 * Post-fix the hook reads the same primitive the service gate reads (`UserAuth.isLoggedIn`): no
 * session → no call, no error line; the first trigger with a session checks once. Signing in is
 * a full page load, so the socket connect of the signed-in load is that trigger.
 *
 * The service mock answers like the server half: a session is answered, no session is refused.
 */
import React from 'react';
import { UserAuth } from '@proteinjs/user-auth';
import { VersionCheckerProvider } from '../src/VersionCheckerProvider';
import {
  FakeSocket,
  VisibilityController,
  mount,
  installReloadSpy,
  advance,
  flush,
  signedIn,
  signedOut,
  clearSession,
} from './harness';
import { act } from 'react-dom/test-utils';

const UNAUTHORIZED = 'User not authorized to run service: VersionCheckerService.needToUpdate';
const mockNeedToUpdateService = jest.fn<Promise<boolean>, [string]>();
jest.mock('@proteinjs/app-version-common', () => ({
  getVersionCheckerService: () => ({
    needToUpdate: (currentVersion: string) => mockNeedToUpdateService(currentVersion),
  }),
}));

installReloadSpy();
const visibility = new VisibilityController();

describe('the version check is a signed-in read', () => {
  let socket: FakeSocket;
  let mounted: ReturnType<typeof mount> | undefined;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = new FakeSocket();
    visibility.set('visible');
    mockNeedToUpdateService.mockReset();
    // The server half's answer, keyed on the same primitive the client gate reads.
    mockNeedToUpdateService.mockImplementation(async () => {
      if (!UserAuth.isLoggedIn()) {
        throw new Error(UNAUTHORIZED);
      }
      return false;
    });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    consoleErrorSpy.mockRestore();
    clearSession();
    jest.useRealTimers();
  });

  const mountProvider = () => {
    mounted = mount(
      <VersionCheckerProvider currentVersion='1.2.3' socket={socket.asSocket()}>
        <div />
      </VersionCheckerProvider>
    );
  };

  it('no session: a socket connect runs no check and logs no error', async () => {
    signedOut();
    mountProvider();

    act(() => socket.fire('connect'));
    await advance(1000); // check debounce
    await flush();

    expect(mockNeedToUpdateService).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('no session: a return to visibility runs no check either', async () => {
    signedOut();
    mountProvider();

    act(() => visibility.change('hidden'));
    act(() => visibility.change('visible'));
    await advance(1000);
    await flush();

    expect(mockNeedToUpdateService).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('after sign-in, the next connect checks once', async () => {
    signedOut();
    mountProvider();
    act(() => socket.fire('connect'));
    await advance(1000);
    await flush();
    expect(mockNeedToUpdateService).not.toHaveBeenCalled();

    // Sign-in is a full page load whose socket connects afresh.
    signedIn();
    act(() => socket.fire('connect'));
    await advance(1000);
    await flush();

    expect(mockNeedToUpdateService).toHaveBeenCalledTimes(1);
    expect(mockNeedToUpdateService).toHaveBeenCalledWith('1.2.3');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
