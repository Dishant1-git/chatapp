'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { logoutAndRedirect } from '@/lib/client';

// Opens one Socket.IO connection for the logged-in user. It connects to the
// frontend's own origin, which forwards it to the backend (see next.config.mjs),
// so the auth cookie is sent automatically.
export function useSocket(enabled) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const newSocket = io({ withCredentials: true });

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('connect_error', (err) => {
      setIsConnected(false);
      // The login expired — send the user back to the login page
      if (err.message === 'unauthorized') logoutAndRedirect();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return { socket, isConnected };
}
