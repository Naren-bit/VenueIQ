const express = require('express');
const router = express.Router();
const { getZones, updateZone } = require('../services/firebase');
const { getAllForecasts } = require('../services/predictor');

/**
 * GET /api/zones
 * Query: ?type=food|gate|restroom (optional filter)
 * Returns: { zones: [...], count: number, timestamp: number }
 */
router.get('/', async (req, res, next) => {
  try {
    const zones = await getZones();
    const { type } = req.query;

    const filtered = type
      ? zones.filter(z => z.type === type)
      : zones;

    // Sort by wait time ascending (best first)
    filtered.sort((a, b) => a.wait - b.wait);

    res.json({
      zones: filtered,
      count: filtered.length,
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/zones/forecast
 * Returns all zones with their 15-minute predicted wait times and trend.
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const zones = await getZones();
    const forecasts = await getAllForecasts(zones);

    const enriched = zones.map(zone => ({
      ...zone,
      forecast: forecasts[zone.id] || { predictedWait: null, trend: 'stable', confidence: 'low' },
    }));

    res.json({ zones: enriched, forecastHorizonMinutes: 15, timestamp: Date.now() });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/zones/:id
 * Returns a single zone by ID.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const zones = await getZones();
    const zone = zones.find(z => z.id === req.params.id);

    if (!zone) {
      return res.status(404).json({ error: `Zone '${req.params.id}' not found` });
    }

    res.json(zone);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/zones/:id
 * Body: { capacity?: number (0-1), wait?: number (>= 0) }
 * Updates a zone and broadcasts to all connected clients.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { capacity, wait } = req.body;
    const { id } = req.params;

    // Validate zone ID format
    if (!/^[a-z0-9-]{1,50}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid zone ID format' });
    }

    // Validation
    if (capacity === undefined && wait === undefined) {
      return res.status(400).json({ error: 'At least one of `capacity` or `wait` is required' });
    }
    if (capacity !== undefined && (typeof capacity !== 'number' || capacity < 0 || capacity > 1)) {
      return res.status(400).json({ error: '`capacity` must be a number between 0 and 1' });
    }
    if (wait !== undefined && (typeof wait !== 'number' || wait < 0)) {
      return res.status(400).json({ error: '`wait` must be a non-negative number' });
    }

    const update = {};
    if (capacity !== undefined) update.capacity = capacity;
    if (wait !== undefined) update.wait = wait;

    await updateZone(id, update);

    // Broadcast updated zones to all clients
    const io = req.app.get('io');
    if (io) {
      const zones = await getZones();
      io.emit('zones:updated', zones);
    }

    res.json({
      success: true,
      zoneId: id,
      updated: update
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
