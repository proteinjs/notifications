import { useState, useEffect, useCallback, useRef } from 'react';
import { getVersionCheckerService } from '@proteinjs/app-version-common';
import { ServiceClient } from '@proteinjs/service';
import { Socket } from 'socket.io-client';
import { Debouncer } from '@proteinjs/util';

const VISIBILITY_CHANGE_THRESHOLD_MS = 30000;

/**
 * A hook that exposes `needToUpdate`, which indicates whether or not the client's
 * bundle is stale and the new version has been marked as significant enough to
 * notify the client that they should update. See `LatestVersionRequiringUpdate` in
 * `@proteinjs/app-version-common` for more details on implementing the server-side logic.
 *
 * This hook will check with the server if the client should update when the socket
 * receives a `connect` event.
 *
 * When `needToUpdate` is `true`, the hook will also automatically reload the page
 * when the tab regains focus after being hidden for at least 30 seconds. This
 * ensures background tabs pick up new versions without user interaction.
 *
 * Reason:
 *
 * When a new version is deployed, the server process will terminate. The socket will always
 * need to reconnect in this scenario. Additionally, an explicit `version-updated` event
 * from the server can be missed (ie. the user's laptop is closed).
 *
 * @param currentVersion the version of the bundle currently on the client
 * @param socket a Socket.IO `Socket`
 * @returns `true` if the client should be notified to update to the latest version (ie. by reloading the page)
 */
export const useVersionChecker = (currentVersion: string, socket: Socket | null) => {
  const [needToUpdate, setNeedToUpdate] = useState(false);
  const debouncerRef = useRef<Debouncer>(new Debouncer(1000));
  const needToUpdateRef = useRef(needToUpdate); // having `needToUpdate` in the `checkVersion` dep array was causing double checks, despite debouncer
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    needToUpdateRef.current = needToUpdate;
  }, [needToUpdate]);

  const checkVersion = useCallback(async () => {
    try {
      // markBackground: the check is machine-initiated (fires on socket reconnect, not on a
      // person doing something), so its request carries the background marker — dev tooling
      // (the serve-package request-activity hold) must not count it as real activity.
      const newNeedToUpdate = await ServiceClient.markBackground(() =>
        getVersionCheckerService().needToUpdate(currentVersion)
      );
      if (needToUpdateRef.current !== newNeedToUpdate) {
        setNeedToUpdate(newNeedToUpdate);
      }
    } catch (error) {
      console.error('Failed to check version:', error);
    }
  }, [currentVersion]);

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

  // Auto-reload when the window regains focus after being blurred for 30s+.
  // Uses window blur/focus rather than document visibilitychange so that
  // switching to another desktop app (not just another browser tab) is detected.
  useEffect(() => {
    const handleBlur = () => {
      hiddenAtRef.current = Date.now();
    };

    const handleFocus = () => {
      if (
        needToUpdateRef.current &&
        hiddenAtRef.current &&
        Date.now() - hiddenAtRef.current > VISIBILITY_CHANGE_THRESHOLD_MS
      ) {
        window.location.reload();
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return { needToUpdate };
};
