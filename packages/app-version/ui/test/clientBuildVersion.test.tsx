/**
 * @jest-environment jsdom
 *
 * The provider is the app's one statement of the client's build version — the `currentVersion`
 * it hands the version checker. The service layer needs the same fact on every request
 * (@proteinjs/service ClientBuildVersion: the `x-client-version` header ServiceRouter compares
 * with the server's build when a request names a service path it does not register), so
 * mounting the provider installs it — BEFORE any child renders, because a child's first service
 * call is issued from its own mount and must already carry the header.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { ClientBuildVersion } from '@proteinjs/service';
import { VersionCheckerProvider } from '../src/VersionCheckerProvider';
import { FakeSocket, mount, installReloadSpy, signedOut } from './harness';

jest.mock('@proteinjs/app-version-common', () => ({
  getVersionCheckerService: () => ({ needToUpdate: async () => false }),
}));

installReloadSpy();
// Signed out: the version check itself stays quiet (sessionGate.test.tsx owns that contract);
// the install is not gated on a session — a build version is a fact of the bundle, not the user.
beforeAll(() => signedOut());

describe('VersionCheckerProvider installs the client build version', () => {
  afterEach(() => ClientBuildVersion.set(undefined));

  it('a child rendering for the first time already sees the version installed', () => {
    let seenDuringRender: string | undefined = 'never rendered';
    const Child = () => {
      seenDuringRender = ClientBuildVersion.get();
      return null;
    };

    const mounted = mount(
      <VersionCheckerProvider currentVersion='1.27.0' socket={new FakeSocket().asSocket()}>
        <Child />
      </VersionCheckerProvider>
    );

    expect(seenDuringRender).toBe('1.27.0');
    expect(ClientBuildVersion.headers()).toEqual({ 'x-client-version': '1.27.0' });
    mounted.unmount();
  });

  it('follows the prop: a re-render with another version re-installs it', () => {
    const socket = new FakeSocket().asSocket();
    const mounted = mount(
      <VersionCheckerProvider currentVersion='1.27.0' socket={socket}>
        <div />
      </VersionCheckerProvider>
    );
    expect(ClientBuildVersion.get()).toBe('1.27.0');

    act(() => {
      mounted.root.render(
        <VersionCheckerProvider currentVersion='1.27.1' socket={socket}>
          <div />
        </VersionCheckerProvider>
      );
    });

    expect(ClientBuildVersion.get()).toBe('1.27.1');
    mounted.unmount();
  });
});
