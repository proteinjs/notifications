import { useState, useEffect, useCallback, useRef } from 'react';
import { getVersionCheckerService } from '@proteinjs/app-version-common';
import { Socket } from 'socket.io-client';
import { Debouncer } from '@proteinjs/util';

/**
 * A hook that exposes `needToUpdate`, which indicates whether or not the client's
 * bundle is stale and the new version has been marked as significant enough to
 * notify the client that they should update. See `LatestVersionRequiringUpdate` in
 * `@proteinjs/app-version-common` for more details on implementing the server-side logic.
 *
 * This hook will check with the server if the client should update when the socket
 * receives a `connect` event.
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

  useEffect(() => {
    needToUpdateRef.current = needToUpdate;
  }, [needToUpdate]);

  const checkVersion = useCallback(async () => {
    try {
      const newNeedToUpdate = await getVersionCheckerService().needToUpdate(currentVersion);
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

  return { needToUpdate };
};
