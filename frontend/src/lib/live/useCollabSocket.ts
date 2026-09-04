/**
 * useCollabSocket — realtime hook for Q3 Classroom Collaboration.
 *
 * Connects to /kids/teams/ws, joins the student's class/team/quest rooms,
 * and subscribes the caller to the Q3 broadcast events:
 *   team:created, team:joined, team:left
 *   challenge:started, challenge:tick, challenge:answer, challenge:ended
 *   class-quest:progress, class-quest:completed
 *   peer-teach:new
 *
 * Thread-safe, single socket per mount via event registration (not recreate
 * on every keystroke). Fires the onEvent callback for matching events.
 */
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_CONFIG, STORAGE_KEYS } from '@/lib/utils/constants';

export type CollabEvent =
  | 'team:created'
  | 'team:joined'
  | 'team:left'
  | 'challenge:started'
  | 'challenge:tick'
  | 'challenge:answer'
  | 'challenge:ended'
  | 'class-quest:progress'
  | 'class-quest:completed'
  | 'peer-teach:new';

interface UseCollabSocketOptions {
  rooms: string[]; // e.g. ['class:12', 'team:3', 'quest:9']
  onEvent?: (event: CollabEvent, payload: Record<string, any>) => void;
  enabled?: boolean;
}

const EVENTS: CollabEvent[] = [
  'team:created',
  'team:joined',
  'team:left',
  'challenge:started',
  'challenge:tick',
  'challenge:answer',
  'challenge:ended',
  'class-quest:progress',
  'class-quest:completed',
  'peer-teach:new',
];

export function useCollabSocket({ rooms, onEvent, enabled = true }: UseCollabSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || '';
    const wsUrl = (API_CONFIG.BASE_URL || '').replace(/^http/, 'ws').replace(/\/api\/?$/, '');
    const socket = io(wsUrl, {
      path: '/kids/teams/ws',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      rooms.forEach((r) => {
        if (r) socket.emit('join-room', { room: r });
      });
    });

    EVENTS.forEach((ev) => {
      socket.on(ev, (payload: Record<string, any>) => {
        onEventRef.current?.(ev, payload || {});
      });
    });

    socket.on('disconnect', () => { /* reconnect handled by socket.io */ });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rooms.join('|')]);

  return socketRef;
}
