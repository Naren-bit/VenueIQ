const express = require('express');
const router = express.Router();
const { pushCrowdReport, getRecentReports, updateZone } = require('../services/firebase');

const VALID_TYPES = ['crowded', 'empty', 'fast-moving', 'slow-moving'];

/**
 * POST /api/reports
 * Body: { zoneId: string, reportType: string, userId?: string }
 *
 * Fans crowdsource crowd density by submitting reports.
 * After 3+ reports for a zone, we aggregate and update the zone's capacity.
 */
router.post('/', async (req, res, next) => {
  try {
    const { zoneId, reportType, userId = 'anonymous' } = req.body;

    // Validation
    if (!zoneId || typeof zoneId !== 'string') {
      return res.status(400).json({ error: '`zoneId` is required' });
    }
    if (!/^[a-z0-9-]{1,50}$/.test(zoneId)) {
      return res.status(400).json({ error: '`zoneId` contains invalid characters' });
    }
    if (typeof userId !== 'string' || userId.length > 100) {
      return res.status(400).json({ error: '`userId` must be a string (max 100 chars)' });
    }
    if (!VALID_TYPES.includes(reportType)) {
      return res.status(400).json({
        error: `\`reportType\` must be one of: ${VALID_TYPES.join(', ')}`
      });
    }

    // Store the report
    await pushCrowdReport(zoneId, { type: reportType, userId });

    // Aggregate recent reports to adjust zone capacity
    const reports = await getRecentReports(zoneId, 20);
    if (reports.length >= 3) {
      const crowded = reports.filter(r => ['crowded', 'slow-moving'].includes(r.type)).length;
      const empty   = reports.filter(r => ['empty', 'fast-moving'].includes(r.type)).length;
      const ratio   = crowded / reports.length;
      const delta   = (ratio - empty / reports.length) * 0.15;
      const cap     = Math.max(0.05, Math.min(0.97, 0.5 + delta * 2));

      await updateZone(zoneId, {
        capacity: cap,
        wait: Math.max(1, Math.round(cap * 22))
      });
    }

    res.status(201).json({
      success: true,
      message: 'Report recorded. Thanks for helping other fans!'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
