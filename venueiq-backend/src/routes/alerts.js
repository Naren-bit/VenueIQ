const express = require('express');
const router = express.Router();
const { getAlerts, pushAlert } = require('../services/firebase');

/**
 * GET /api/alerts
 * Query: ?limit=20 (max 50)
 * Returns: { alerts: [...], count: number }
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const alerts = await getAlerts(limit);

    res.json({
      alerts,
      count: alerts.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/alerts
 * Body: { title: string, body: string, urgency?: 'urgent'|'info', icon?: string }
 * Creates a manual alert and broadcasts to all clients.
 */
router.post('/', async (req, res, next) => {
  try {
    const { title, body, urgency = 'info', icon } = req.body;

    // Validation
    if (!title || !body) {
      return res.status(400).json({ error: '`title` and `body` are required' });
    }
    if (!['urgent', 'info'].includes(urgency)) {
      return res.status(400).json({ error: 'Invalid urgency — must be "urgent" or "info"' });
    }

    const alertData = {
      title,
      body,
      urgency,
      type: urgency,
      icon: icon || (urgency === 'urgent' ? '⚠️' : 'ℹ️'),
      source: 'manual'
    };

    const alertId = await pushAlert(alertData);

    // Broadcast to connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('alert:new', {
        id: alertId,
        ...alertData,
        timestamp: Date.now()
      });
    }

    res.status(201).json({
      success: true,
      alertId
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
