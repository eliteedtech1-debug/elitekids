'use strict';
/**
 * Socket.io server for parent↔child text chat.
 *
 * Auth: JWT via handshake query (same JWT_SECRET_KEY as REST API).
 * Rooms: `<school_id>:chat:<child_admission_no>` — parent + child join.
 *
 * Events:
 *   Client → Server:
 *     join-chat { child_admission_no }  — join a child's chat room
 *     send-message { child_admission_no, text } — send a message
 *     typing { child_admission_no } — typing indicator
 *
 *   Server → Client:
 *     message { id, child_admission_no, from_user_id, from_role, text, created_at }
 *     typing { from_user_id, from_role, child_admission_no }
 *     error { message }
 */
const jwt = require('jsonwebtoken');
const chatCtrl = require('./kidsChat');

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').replace(/^0/, '+234');
}

/**
 * Resolve the child admission numbers a user is allowed to chat with.
 * For parents: from kids_parent_links + parents↔students relationship.
 * For students: only their own admission_no.
 */
async function resolveAllowedChildren(user, dbm) {
  const children = [];
  const role = String(user.user_type || user.role || '').toLowerCase();

  if (role === 'parent') {
    const phone = normalizePhone(user.phone);
    // Source 1: kids_parent_links
    const [links] = await dbm().content.query(
      `SELECT child_admission_no FROM kids_parent_links WHERE parent_phone = :phone AND verified = 1`,
      { replacements: { phone } }
    );
    for (const r of (Array.isArray(links) ? links : [])) {
      if (r.child_admission_no && !children.includes(r.child_admission_no)) {
        children.push(r.child_admission_no);
      }
    }
    // Source 2: shared parents ↔ students (EliteSMS)
    if (user.id) {
      const [shared] = await dbm().sequelize.query(
        `SELECT s.admission_no FROM students s
         JOIN parents p ON p.parent_id = s.parent_id OR p.parent_id = s.guardian_id
         WHERE p.user_id = :uid AND s.admission_no IS NOT NULL`,
        { replacements: { uid: user.id } }
      );
      for (const r of (Array.isArray(shared) ? shared : [])) {
        if (r.admission_no && !children.includes(r.admission_no)) {
          children.push(r.admission_no);
        }
      }
    }
  } else if (role === 'student') {
    // Students can only chat in their own room
    const adm = String(user.admission_no || user.id || '');
    if (adm) children.push(adm);
  }

  return children;
}

/**
 * Attach Socket.io to an HTTP server.
 * @param {import('http').Server} server
 */
function attach(server) {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
    },
    path: '/kids/chat',
  });

  // Auth middleware — verify JWT on connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      socket.user = decoded;
      socket.allowedChildren = await resolveAllowedChildren(decoded, require('../models'));
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const role = String(user.user_type || user.role || '').toLowerCase();
    console.log(`💬 Chat connected: ${role} ${user.id || user.phone}`);

    // Join a child's chat room
    socket.on('join-chat', ({ child_admission_no } = {}) => {
      const adm = String(child_admission_no || '').trim();
      if (!adm) return socket.emit('error', { message: 'child_admission_no required' });
      if (!socket.allowedChildren.includes(adm)) {
        return socket.emit('error', { message: 'Not authorized for this child' });
      }

      const room = `chat:${adm}`;
      socket.join(room);
      socket.emit('joined', { child_admission_no: adm, room });
    });

    // Send a message
    socket.on('send-message', async ({ child_admission_no, text } = {}) => {
      try {
        const adm = String(child_admission_no || '').trim();
        const msg = String(text || '').trim();
        if (!adm || !msg) return socket.emit('error', { message: 'child_admission_no and text required' });
        if (!socket.allowedChildren.includes(adm)) {
          return socket.emit('error', { message: 'Not authorized for this child' });
        }
        if (msg.length > 2000) return socket.emit('error', { message: 'Message too long (max 2000 chars)' });

        const saved = await chatCtrl.saveMessage({
          childAdmissionNo: adm,
          fromUserId: String(user.id || user.phone || ''),
          fromRole: role === 'parent' ? 'parent' : role === 'student' ? 'student' : 'teacher',
          text: msg,
        });

        const room = `chat:${adm}`;
        io.to(room).emit('message', saved);
      } catch (err) {
        console.error('chat send-message error:', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', ({ child_admission_no } = {}) => {
      const adm = String(child_admission_no || '').trim();
      if (!adm || !socket.allowedChildren.includes(adm)) return;
      socket.to(`chat:${adm}`).emit('typing', {
        from_user_id: String(user.id || user.phone || ''),
        from_role: role === 'parent' ? 'parent' : 'student',
        child_admission_no: adm,
      });
    });

    socket.on('disconnect', () => {
      console.log(`💬 Chat disconnected: ${role} ${user.id || user.phone}`);
    });
  });

  console.log('💬 Chat WebSocket attached at /kids/chat');
  return io;
}

module.exports = { attach };
