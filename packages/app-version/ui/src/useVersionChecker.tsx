import { useState, useEffect, useCallback, useRef } from 'react';
import { getVersionCheckerService } from '@proteinjs/app-version-common';
import { UserAuth } from '@proteinjs/user-auth';
import { Socket } from 'socket.io-client';
import { Debouncer } from '@proteinjs/util';

/**
 * A stale bundle reloads at most this long after staleness was detected, whatever the reload
 * guards say. A guard covers a moment that must not be interrupted; a moment cannot last forever,
 * and a client the server may no longer be compatible with cannot stay up indefinitely.
 */
export const RELOAD_DEFER_MAX_MS = 10000;

/**
 * While the reload is deferred by a guard, the guards are re-read on this cadence — a guard
 * releasing produces no DOM event of its own. Local evaluation only; no server traffic.
 */
export const RELOAD_RETRY_INTERVAL_MS = 1000;

/**
 * Return `true` while the page must not be torn down — a request is in flight whose loss the
 * page could not recover from (a message being sent and not yet acknowledged, an upload still
 * landing, a live audio capture). A guard DEFERS the reload: while it holds, the reload waits and
 * re-asks every `RELOAD_RETRY_INTERVAL_MS`; it fires at the first release, and in any case
 * `RELOAD_DEFER_MAX_MS` after staleness was detected. A guard never cancels a reload and never
 * holds one indefinitely. State the page restores by itself after a reload (an unsent draft its
 * editor persists) is not a reason to guard.
 */
export type ReloadGuard = () => boolean;

/**
 * A hook that exposes `needToUpdate` — `true` once the client's bundle is known to be stale (the
 * server's `LatestVersionRequiringUpdate` is newer than `currentVersion`, clamped to the version
 * the server itself runs; see `@proteinjs/app-version-common`) — and reloads the page to the
 * served bundle as soon as that is known.
 *
 * The check runs when the socket receives a `connect` event (every deploy reconnects every
 * client) and when the tab returns to visibility (a phone app resumed, a tab re-selected — the
 * socket may have survived the absence and so never reconnects).
 *
 * The check is a SIGNED-IN read. Its server half (`VersionChecker`, `allUsers`) refuses a call
 * without a session, and a page without one has nothing to converge: signing in is a full page
 * load, which fetches the served bundle and connects the socket, so the first signed-in check
 * runs then. A trigger with no session is skipped, not queued — the next trigger with a session
 * (a reconnect, a return to visibility) checks. Both halves read the same primitive,
 * `UserAuth.isLoggedIn()`, so they cannot disagree; a consumer with no authenticated-user repo
 * registered never checks — the same consumer the service would refuse.
 *
 * A stale result RELOADS — in every page state. There is no "update" affordance to leave to the
 * user and no safe-moment heuristic (hidden, blurred, idle) to wait for: a consumer that cannot
 * promise compatibility between the served build and an older bundle cannot leave the reload to
 * chance, and a deferral the user can outwait is a reload that never happens. The only delay is a
 * registered `ReloadGuard`, bounded by `RELOAD_DEFER_MAX_MS`. `needToUpdate` reads `true` from
 * detection until the page goes away — a consumer may render a transient notice from it, but no
 * consumer action is required for the reload to happen.
 *
 * Prefer mounting `VersionCheckerProvider` once at the app root over calling this hook from
 * chrome (e.g. a toolbar): a hook called from conditional chrome only runs while that chrome is
 * mounted.
 *
 * @param currentVersion the version of the bundle currently on the client
 * @param socket a Socket.IO `Socket`
 * @returns `needToUpdate` — `true` once the client's bundle is known to be stale — and
 * `registerReloadGuard`
 */
export const useVersionChecker = (currentVersion: string, socket: Socket | null) => {
  const [needToUpdate, setNeedToUpdate] = useState(false);
  const debouncerRef = useRef<Debouncer>(new Debouncer(1000));
  // When staleness was first detected (null = the bundle is current as far as we know). A ref, not
  // state: the reload decision must not wait a render, and the deferral bound counts from the
  // FIRST detection — a later check re-answering stale must not restart it.
  const staleSinceRef = useRef<number | null>(null);
  const reloadInitiatedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardsRef = useRef<Set<ReloadGuard>>(new Set());

  const registerReloadGuard = useCallback((guard: ReloadGuard) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  /**
   * Reload now unless a guard holds and the deferral bound has not passed; while deferred, ask
   * again after `RELOAD_RETRY_INTERVAL_MS`. One retry timer at a time, whichever trigger arrives.
   */
  const attemptReload = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const staleSince = staleSinceRef.current;
    if (reloadInitiatedRef.current || staleSince === null) {
      return;
    }

    const withinBound = Date.now() - staleSince < RELOAD_DEFER_MAX_MS;
    if (withinBound && Array.from(guardsRef.current).some((guard) => guard())) {
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        attemptReload();
      }, RELOAD_RETRY_INTERVAL_MS);
      return;
    }

    reloadInitiatedRef.current = true;
    window.location.reload();
  }, []);

  /**
   * Check with the server and reload on a stale answer — only while a session exists (see the
   * hook doc); without one there is no call and no error line.
   */
  const checkVersion = useCallback(async () => {
    try {
      if (!UserAuth.isLoggedIn()) {
        return;
      }

      const stale = await getVersionCheckerService().needToUpdate(currentVersion);
      if (!stale) {
        staleSinceRef.current = null;
        setNeedToUpdate(false);
        return;
      }

      if (staleSinceRef.current === null) {
        staleSinceRef.current = Date.now();
      }
      setNeedToUpdate(true);
      attemptReload();
    } catch (error) {
      console.error('Failed to check version:', error);
    }
  }, [currentVersion, attemptReload]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConnect = () => {
      debouncerRef.current.debounce(checkVersion);
    };

    socket.on('connect', handleConnect);

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket, checkVersion]);

  // Every return to visibility triggers a fresh check (shared debouncer, so a check the reconnect
  // also triggers coalesces into one).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debouncerRef.current.debounce(checkVersion);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVersion]);

  // A deferred reload's retry timer goes with the hook.
  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    },
    []
  );

  return { needToUpdate, registerReloadGuard };
};
