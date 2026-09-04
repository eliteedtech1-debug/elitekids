'use strict';
/**
 * Socket.io hub for Q3 Classroom Collaboration — /kids/teams/ws.
 *
 * Rooms: `class:<class_id>`, `team:<team_id>`, `quest:<quest_id>`.
 * Events (server → client):
 *   team:created, team:joined, team:left
 *   challenge:started, challenge:tick, challenge:answer, challenge:ended
 *   class-quest:progress, class-quest:completed
 *   peer-teach:new
 *
 * Uses lazy `dbm()` (never eagerly require models). Attached from index.js.
 * Reuses JWT handshake auth (same JWT_SECRET_KEY as the REST API).
 */
const jwt = require('jsonwebtoken');
const { hasClassAccess } = require('../services/routesHelper');

/**
 * Notify the REST controller so its writes fan out to rooms.
 * @param {string} room — e.g. 'class:5' | 'team:3' | 'quest:9'
 * @param {string} event
 * @param {object} payload
 */
function attach(server) {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
    },
    path: '/kids/teams/ws',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  // Wire a notifier back into the REST controller so controller.js writes fan out.
  const controller = require('../controllers/kidsCollaboration');
  controller.setNotifier((room, event, payload) => {
    return new Promise((resolve) => {
      io.to(room).emit(event, payload);
      resolve();
    });
  });

  const ROOM_PATTERN = /^(class|team|quest):[A-Za-z0-9_-]+$/;

  io.on('connection', (socket) => {
    const user = socket.user;
    const role = String(user.user_type || user.role || '').toLowerCase();
    console.log(`👥 Collab connected: ${role} ${user.id || user.phone}`);

    // Client explicitly joins a room it is authorized for. Server keeps clients
    // in rooms they declare, but the broadcast logic in the controller scopes
    // by class/team/quest so a client only receives data for rooms it joined.
    socket.on('join-room', async ({ room } = {}) => {
      const r = String(room || '').trim();
      if (!ROOM_PATTERN.test(r)) return socket.emit('error', { message: 'Invalid room. Use class:<id>, team:<id> or quest:<id>.' });
      try {
        const [kind, rawId] = r.split(':');
        let classId = rawId;
        if (kind === 'team' || kind === 'quest') {
          const db = require('../models');
          const model = kind === 'team' ? db.KidTeam : db.KidClassQuest;
          const row = await model.findByPk(Number(rawId));
          if (!row) return socket.emit('error', { message: 'Room not found.' });
          classId = row.class_id;
        }
        if (!(await hasClassAccess(socket.user, classId))) {
          return socket.emit('error', { message: 'You do not have access to this room.' });
        }
        socket.join(r);
        socket.emit('room:joined', { room: r });
      } catch {
        socket.emit('error', { message: 'Unable to authorize room.' });
      }
    });

    socket.on('leave-room', ({ room } = {}) => {
      const r = String(room || '').trim();
      socket.leave(r);
    });

    socket.on('disconnect', () => {
      console.log(`👥 Collab disconnected: ${role} ${user.id || user.phone}`);
    });
  });

  console.log('👥 Collab WebSocket attached at /kids/teams/ws');
  return io;
}

module.exports = { attach };
