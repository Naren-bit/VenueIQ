// src/routes/meetup.js

const express = require('express');
const router = express.Router();
const { getDB } = require('../services/firebase');

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * POST /api/meetup
 * Create a new group meetup session.
 * Body: { creatorName: string, section?: string }
 * Returns: { code, sessionId, expiresAt }
 */
router.post('/', async (req, res, next) => {
  try {
    const { creatorName, section = null } = req.body;
    if (!creatorName || typeof creatorName !== 'string') {
      return res.status(400).json({ error: '`creatorName` is required' });
    }

    const code      = generateCode();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const session   = {
      code,
      createdAt: Date.now(),
      expiresAt,
      members: {
        [creatorName]: { name: creatorName, section, joinedAt: Date.now(), lastSeen: Date.now() }
      }
    };

    await getDB().ref(`meetups/${code}`).set(session);
    res.status(201).json({ code, expiresAt });
  } catch (err) { next(err); }
});

/**
 * POST /api/meetup/:code/join
 * Join an existing meetup session.
 * Body: { name: string, section?: string }
 */
router.post('/:code/join', async (req, res, next) => {
  try {
    const { name, section = null } = req.body;
    const { code } = req.params;
    if (!name) return res.status(400).json({ error: '`name` is required' });

    const snap = await getDB().ref(`meetups/${code}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Meetup code not found' });

    const session = snap.val();
    if (session.expiresAt < Date.now()) return res.status(410).json({ error: 'Session expired' });

    await getDB().ref(`meetups/${code}/members/${name}`).set({
      name, section, joinedAt: Date.now(), lastSeen: Date.now()
    });

    res.json({ success: true, code, members: Object.values({ ...session.members, [name]: { name, section } }) });
  } catch (err) { next(err); }
});

/**
 * POST /api/meetup/:code/leave
 * Remove a user from the active meetup session.
 */
router.post('/:code/leave', async (req, res, next) => {
  try {
    const { name } = req.body;
    const { code } = req.params;
    if (!name) return res.status(400).json({ error: '`name` is required' });

    await getDB().ref(`meetups/${code}/members/${name}`).remove();

    // Push update to WebSocket clients in this session room
    const io = req.app.get('io');
    if (io) {
      const updated = await getDB().ref(`meetups/${code}/members`).once('value');
      const emitData = updated.exists() ? Object.values(updated.val()) : [];
      io.to(`meetup:${code}`).emit('meetup:updated', emitData);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/meetup/:code/location
 * Update a member's section (called whenever user tells the app their location).
 * Body: { name: string, section: string }
 */
router.patch('/:code/location', async (req, res, next) => {
  try {
    const { name, section } = req.body;
    const { code } = req.params;
    if (!name || !section) return res.status(400).json({ error: '`name` and `section` required' });

    const snap = await getDB().ref(`meetups/${code}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Meetup not found' });

    await getDB().ref(`meetups/${code}/members/${name}`).update({ section, lastSeen: Date.now() });

    // Push update to WebSocket clients in this session room
    const io = req.app.get('io');
    if (io) {
      const updated = await getDB().ref(`meetups/${code}/members`).once('value');
      io.to(`meetup:${code}`).emit('meetup:updated', Object.values(updated.val()));
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/meetup/:code
 * Get all members and their sections for a session.
 */
router.get('/:code', async (req, res, next) => {
  try {
    const snap = await getDB().ref(`meetups/${req.params.code}`).once('value');
    if (!snap.exists()) return res.status(404).json({ error: 'Meetup not found' });

    const session = snap.val();
    if (session.expiresAt < Date.now()) return res.status(410).json({ error: 'Session expired' });

    res.json({
      code: req.params.code,
      members: Object.values(session.members),
      expiresAt: session.expiresAt,
    });
  } catch (err) { next(err); }
});

module.exports = router;
