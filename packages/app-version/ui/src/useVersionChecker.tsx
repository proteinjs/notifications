import { useState, useEffect, useCallback, useRef } from 'react';
import { getVersionCheckerService } from '@proteinjs/app-version-common';
import { Socket } from 'socket.io-client';
import { Debouncer } from '@proteinjs/util';

/** A window blur → focus gap longer than this counts as a real absence. */
const VISIBILITY_CHANGE_THRESHOLD_MS = 30000;

/**
 * How long after a qualifying refocus a resolving check may still auto-reload the page.
 * Covers the reconnect → debounce → service round trip that resolves after the focus handler
 * has already run (socket.io reconnect backoff + the 1s check debounce + request latency).
 */
const POST_REFOCUS_RELOAD_WINDOW_MS = 10000;

/**
 * A visible tab auto-reloads once the user has gone this long without interacting (and no
 * text input holds focus): a user reading a static page eats one navigation-style refresh,
 * which is the accepted cost of keeping clients current.
 */
const IDLE_RELOAD_AFTER_MS = 45000;

/**
 * While an auto-reload is wanted but deferred (the user is active, or a reload guard vetoes),
 * re-attempt on this cadence so the reload fires at the first safe moment — the idle window
 * opening or a guard releasing produce no DOM event of their own. Local evaluation only; no
 * server traffic.
 */
const RELOAD_RETRY_INTERVAL_MS = 5000;

/**
 * Return `true` while an auto-reload must not happen — e.g. an unsent composer draft exists,
 * a streaming turn is in flight, or an editor holds a not-yet-persisted edit. A veto defers
 * the reload (it re-attempts and fires at the first safe moment after release); it never
 * cancels it.
 */
export type ReloadGuard = () => boolean;

const hasFocusedEditable = () => {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement ||
    (activeElement as HTMLElement).isContentEditable === true
  );
};

/**
 * A hook that exposes `needToUpdate`, which indicates whether or not the client's
 * bundle is stale and the new version has been marked as significant enough to
 * notify the client that they should update. See `LatestVersionRequiringUpdate` in
 * `@proteinjs/app-version-common` for more details on implementing the server-side logic.
 *
 * The check runs when the socket receives a `connect` event and when the tab returns to
 * visibility (the reconnect covers a returning tab only incidentally — a socket that
 * survived the absence never reconnects).
 *
 * The response to a stale result is level-triggered and biased toward actually reloading —
 * the update affordance is the fallback, not the default:
 *
 * - Hidden or blurred tab → reload immediately (the user is not looking; the next focus
 *   lands fresh).
 * - Visible tab whose user just returned from a 30s+ absence → reload: after a long absence
 *   the socket was torn down, so the reconnect-triggered check resolves AFTER the focus
 *   handler ran — the handler records the qualifying refocus and the check's resolution
 *   applies the reload the handler could not (pre-2.0, the handler read the stale
 *   `needToUpdate === false` and the first refocus could never reload by construction).
 * - Visible tab whose user is idle (no focused text input, no interaction for
 *   `IDLE_RELOAD_AFTER_MS`) → reload.
 * - Visible tab in active use → `needToUpdate` flips true so the app can show its update
 *   affordance, and the reload fires at the next safe transition: the tab going
 *   hidden/blurred, or the idle window opening.
 *
 * `registerReloadGuard` lets the app veto auto-reloads over unsaved user state (see
 * `ReloadGuard`) — guards apply in EVERY state, including hidden, and defer rather than
 * cancel.
 *
 * Prefer mounting `VersionCheckerProvider` once at the app root over calling this hook from
 * chrome (e.g. a toolbar): a hook called from conditional chrome only runs while that chrome
 * is mounted.
 *
 * @param currentVersion the version of the bundle currently on the client
 * @param socket a Socket.IO `Socket`
 * @returns `needToUpdate` — `true` if the client should be notified to update to the latest
 * version — and `registerReloadGuard`
 */
export const useVersionChecker = (currentVersion: string, socket: Socket | null) => {
  const [needToUpdate, setNeedToUpdate] = useState(false);
  const debouncerRef = useRef<Debouncer>(new Debouncer(1000));
  const staleRef = useRef(false); // deliberately not `needToUpdate` state: reading state from the async check caused double checks, and the reload decision must not wait a render
  const reloadInitiatedRef = useRef(false);
  const guardsRef = useRef<Set<ReloadGuard>>(new Set());
  // Assume focused at mount and let blur/focus events track from there: a tab that mounts
  // unfocused is already covered by the hidden and idle rules.
  const isBlurredRef = useRef(false);
  const blurredAtRef = useRef<number | null>(null);
  const qualifyingRefocusAtRef = useRef<number | null>(null);
  const lastInteractionAtRef = useRef(Date.now());

  const registerReloadGuard = useCallback((guard: ReloadGuard) => {
    guardsRef.current.add(guard);
    return () => {
      guardsRef.current.delete(guard);
    };
  }, []);

  /**
   * Reload now if the client is stale and this is a safe moment (per the rules in the hook
   * doc); otherwise do nothing — the retry interval and the event handlers re-attempt at the
   * next candidate moment.
   */
  const attemptReload = useCallback(() => {
    if (reloadInitiatedRef.current || !staleRef.current) {
      return;
    }

    for (const guard of guardsRef.current) {
      if (guard()) {
        return; // vetoed — defer, never cancel
      }
    }

    const reload = () => {
      reloadInitiatedRef.current = true;
      window.location.reload();
    };

    if (document.visibilityState === 'hidden' || isBlurredRef.current) {
      reload();
      return;
    }

    const qualifyingRefocusAt = qualifyingRefocusAtRef.current;
    if (qualifyingRefocusAt && Date.now() - qualifyingRefocusAt <= POST_REFOCUS_RELOAD_WINDOW_MS) {
      reload();
      return;
    }

    if (!hasFocusedEditable() && Date.now() - lastInteractionAtRef.current >= IDLE_RELOAD_AFTER_MS) {
      reload();
      return;
    }

    // Visible and actively used: the affordance shows; the reload fires at the next safe
    // transition (hide/blur, or the idle window opening).
  }, []);

  /** Check with the server, then act on the result per the level-triggered rules above. */
  const checkVersion = useCallback(async () => {
    try {
      const newNeedToUpdate = await getVersionCheckerService().needToUpdate(currentVersion);
      staleRef.current = newNeedToUpdate;
      if (!newNeedToUpdate) {
        setNeedToUpdate(false);
        return;
      }

      attemptReload();
      if (!reloadInitiatedRef.current) {
        setNeedToUpdate(true);
      }
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

  // A stale tab reloads itself the moment it goes hidden (free — the next focus lands fresh),
  // and every return to visibility triggers a fresh check (shared debouncer, so a check the
  // reconnect also triggers coalesces into one).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        attemptReload();
        return;
      }

      lastInteractionAtRef.current = Date.now(); // returning to the tab is a user action
      debouncerRef.current.debounce(checkVersion);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVersion, attemptReload]);

  // Window blur/focus rather than only document visibilitychange so that switching to another
  // desktop app (not just another browser tab) is detected. A blur is a safe reload moment; a
  // focus arriving 30s+ after a blur is a return from absence.
  useEffect(() => {
    const handleBlur = () => {
      isBlurredRef.current = true;
      blurredAtRef.current = Date.now();
      attemptReload();
    };

    const handleFocus = () => {
      isBlurredRef.current = false;
      lastInteractionAtRef.current = Date.now();
      const blurredAt = blurredAtRef.current;
      blurredAtRef.current = null; // each absence is acted on once — a later focus event without a new blur is not a return from absence
      if (!blurredAt || Date.now() - blurredAt <= VISIBILITY_CHANGE_THRESHOLD_MS) {
        return;
      }

      // The stale flag can be behind by construction here (see the hook doc): record the
      // qualifying refocus so the in-flight check's resolution can apply the reload, and
      // attempt directly for the case where staleness is already known.
      qualifyingRefocusAtRef.current = Date.now();
      attemptReload();
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [attemptReload]);

  // Presence tracking for the idle rule: any interaction marks the user active.
  useEffect(() => {
    const interactionEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    const markInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };

    interactionEvents.forEach((event) =>
      window.addEventListener(event, markInteraction, { capture: true, passive: true })
    );
    return () => {
      interactionEvents.forEach((event) => window.removeEventListener(event, markInteraction, { capture: true }));
    };
  }, []);

  // While stale and not yet reloaded, re-attempt on a cadence: the idle window opening and a
  // guard releasing produce no DOM event, so a deferred reload needs a tick to fire on.
  useEffect(() => {
    if (!needToUpdate) {
      return;
    }

    const retryInterval = setInterval(attemptReload, RELOAD_RETRY_INTERVAL_MS);
    return () => clearInterval(retryInterval);
  }, [needToUpdate, attemptReload]);

  return { needToUpdate, registerReloadGuard };
};
