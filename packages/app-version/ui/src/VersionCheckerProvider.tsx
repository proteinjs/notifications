import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { useVersionChecker, ReloadGuard } from './useVersionChecker';

export type VersionCheckerContextValue = {
  /** `true` once the client's bundle is known to be stale — the reload is already under way (see `useVersionChecker`) */
  needToUpdate: boolean;
  /**
   * Register a guard that DEFERS the reload while it returns `true`, for a bounded time (see
   * `ReloadGuard`) — a request in flight the page could not recover from losing. Returns an
   * unregister function.
   */
  registerReloadGuard: (guard: ReloadGuard) => () => void;
};

const VersionCheckerContext = createContext<VersionCheckerContextValue | null>(null);

/**
 * Headless owner of the version-check machinery (`useVersionChecker`). Mount once at the app
 * root — anywhere below your socket provider, independent of any toolbar/chrome — so the version
 * check and the reload it makes run for every page state (the check itself runs only while a
 * session exists; see `useVersionChecker`). Nothing needs to be rendered for the reload to
 * happen; a view may consume `useVersionCheckerContext` for a transient notice, and whether it is
 * mounted has no effect on the mechanism. Surfaces with a request in flight register reload
 * guards through the same context (bounded deferral, never a veto).
 */
export const VersionCheckerProvider = ({
  currentVersion,
  socket,
  children,
}: {
  /** the version of the bundle currently on the client */
  currentVersion: string;
  /** a Socket.IO `Socket` */
  socket: Socket | null;
  children: ReactNode;
}) => {
  const { needToUpdate, registerReloadGuard } = useVersionChecker(currentVersion, socket);
  const value = useMemo(() => ({ needToUpdate, registerReloadGuard }), [needToUpdate, registerReloadGuard]);
  return <VersionCheckerContext.Provider value={value}>{children}</VersionCheckerContext.Provider>;
};

/**
 * Consume the state owned by `VersionCheckerProvider` (to register a reload guard, or to render a
 * transient notice). Throws if no provider is mounted above the caller.
 */
export const useVersionCheckerContext = (): VersionCheckerContextValue => {
  const context = useContext(VersionCheckerContext);
  if (!context) {
    throw new Error('useVersionCheckerContext must be used within a VersionCheckerProvider');
  }

  return context;
};
