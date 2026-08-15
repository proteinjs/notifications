import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { Socket } from 'socket.io-client';
import { useVersionChecker, ReloadGuard } from './useVersionChecker';

export type VersionCheckerContextValue = {
  /** `true` if the client's bundle is stale and the user should update (see `useVersionChecker`) */
  needToUpdate: boolean;
  /**
   * Register a guard that vetoes auto-reloads while it returns `true` (see `ReloadGuard`) —
   * e.g. an unsent composer draft or a streaming turn. Returns an unregister function.
   */
  registerReloadGuard: (guard: ReloadGuard) => () => void;
};

const VersionCheckerContext = createContext<VersionCheckerContextValue | null>(null);

/**
 * Headless owner of the version-check machinery (`useVersionChecker`). Mount once at the app
 * root — anywhere below your socket provider, independent of any toolbar/chrome — so version
 * checking and auto-reload run for every page state. Views that surface the update affordance
 * (e.g. a toolbar update button) consume `useVersionCheckerContext`; they are only views, and
 * whether they are mounted has no effect on the mechanism. Surfaces holding unsaved user
 * state register reload guards through the same context.
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
 * Consume the state owned by `VersionCheckerProvider` (e.g. from an update button, or to
 * register a reload guard). Throws if no provider is mounted above the caller.
 */
export const useVersionCheckerContext = (): VersionCheckerContextValue => {
  const context = useContext(VersionCheckerContext);
  if (!context) {
    throw new Error('useVersionCheckerContext must be used within a VersionCheckerProvider');
  }

  return context;
};
