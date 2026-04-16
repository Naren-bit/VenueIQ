// src/routes/dashboard.js

const express = require('express');
const router = express.Router();
const { getZones, updateZone, pushAlert, getAlerts } = require('../services/firebase');
const { getAllForecasts } = require('../services/predictor');

// Simple token auth middleware — replace DASHBOARD_TOKEN in .env
function requireOpsAuth(req, res, next) {
  const token = req.headers['x-ops-token'] || req.query.token;
  if (!process.env.DASHBOARD_TOKEN || token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — provide X-Ops-Token header' });
  }
  next();
}

router.use(requireOpsAuth);

/**
 * GET /api/dashboard/overview
 * Full venue state: all zones + forecasts + recent alerts.
 */
router.get('/overview', async (req, res, next) => {
  try {
    const [zones, alerts] = await Promise.all([getZones(), getAlerts(10)]);
    const forecasts = await getAllForecasts(zones);

    const enriched = zones.map(z => ({
      ...z,
      forecast: forecasts[z.id] || null,
      status: z.capacity > 0.8 ? 'critical' : z.capacity > 0.6 ? 'busy' : 'clear',
    }));

    res.json({
      zones: enriched,
      recentAlerts: alerts,
      summary: {
        criticalZones: enriched.filter(z => z.status === 'critical').length,
        busyZones:     enriched.filter(z => z.status === 'busy').length,
        clearZones:    enriched.filter(z => z.status === 'clear').length,
        avgWait:       Math.round(enriched.reduce((s, z) => s + z.wait, 0) / enriched.length),
      },
      timestamp: Date.now(),
    });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/dashboard/zone/:id
 * Manually override a zone's capacity and wait time.
 * Body: { capacity?: number, wait?: number, closed?: boolean, note?: string }
 */
router.patch('/zone/:id', async (req, res, next) => {
  try {
    const { capacity, wait, closed, note } = req.body;
    const update = {};
    if (capacity !== undefined) update.capacity = Math.max(0, Math.min(1, capacity));
    if (wait !== undefined)     update.wait     = Math.max(0, wait);
    if (closed !== undefined)   update.closed   = Boolean(closed);
    if (note !== undefined)     update.operatorNote = note;

    await updateZone(req.params.id, update);

    // Push WebSocket update
    const io = req.app.get('io');
    if (io) {
      const zones = await getZones();
      io.emit('zones:updated', zones);
    }

    res.json({ success: true, zoneId: req.params.id, applied: update });
  } catch (err) { next(err); }
});

/**
 * POST /api/dashboard/broadcast
 * Push an alert to all fans immediately.
 * Body: { title, body, urgency, icon?, gateRedirect? }
 * gateRedirect: { from: 'south-gate', to: 'north-gate' } — triggers a UI redirect banner
 */
router.post('/broadcast', async (req, res, next) => {
  try {
    const { title, body, urgency = 'urgent', icon, gateRedirect } = req.body;
    if (!title || !body) return res.status(400).json({ error: '`title` and `body` required' });

    const alertData = {
      title, body, urgency,
      icon: icon || '📢',
      source: 'operator',
      gateRedirect: gateRedirect || null,
    };

    const alertId = await pushAlert(alertData);
    const io = req.app.get('io');
    if (io) io.emit('alert:new', { id: alertId, ...alertData, timestamp: Date.now() });

    res.status(201).json({ success: true, alertId });
  } catch (err) { next(err); }
});

/**
 * POST /api/dashboard/close-gate
 * Convenience: mark a gate as closed and redirect fans.
 * Body: { closedGateId, redirectToGateId, reason? }
 */
router.post('/close-gate', async (req, res, next) => {
  try {
    const { closedGateId, redirectToGateId, reason = 'Operational closure' } = req.body;
    if (!closedGateId || !redirectToGateId) {
      return res.status(400).json({ error: '`closedGateId` and `redirectToGateId` required' });
    }

    await updateZone(closedGateId, { closed: true, capacity: 0, wait: 0 });

    const zones = await getZones();
    const closedZone   = zones.find(z => z.id === closedGateId);
    const redirectZone = zones.find(z => z.id === redirectToGateId);

    const alertData = {
      title: `${closedZone?.name || closedGateId} is closed`,
      body:  `${reason}. Please use ${redirectZone?.name || redirectToGateId} instead.`,
      urgency: 'urgent',
      icon: '🚧',
      source: 'operator',
      gateRedirect: { from: closedGateId, to: redirectToGateId },
    };

    const alertId = await pushAlert(alertData);
    const io = req.app.get('io');
    if (io) {
      io.emit('zones:updated', await getZones());
      io.emit('alert:new', { id: alertId, ...alertData, timestamp: Date.now() });
    }

    res.json({ success: true, alertId });
  } catch (err) { next(err); }
});

module.exports = router;
