const express = require('express');
const router = express.Router();
const { chat, localFallback } = require('../services/gemini');
const { getZones } = require('../services/firebase');
const { getAllForecasts } = require('../services/predictor');

/**
 * POST /api/chat
 * Body: { message: string, history?: [{role, text}] }
 * Returns: { reply: string, timestamp: number }
 *
 * Fetches live zone data, passes it to Gemini as context.
 * Falls back to local intent-matching if Gemini is unavailable.
 */
router.post('/', async (req, res, next) => {
  try {
    const { message, history = [], section = null } = req.body;

    // Validation
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '`message` (string) is required' });
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({ error: '`message` cannot be empty' });
    }
    if (trimmedMessage.length > 500) {
      return res.status(400).json({ error: 'Message too long (max 500 characters)' });
    }
    if (!Array.isArray(history)) {
      return res.status(400).json({ error: '`history` must be an array' });
    }

    // Get current zone data for context injection
    const zones = await getZones();

    // Fetch forecasts (non-critical — fallback to empty)
    let forecasts = {};
    try { forecasts = await getAllForecasts(zones); } catch { /* non-critical */ }

    let reply;
    try {
      reply = await chat(trimmedMessage, zones, history, section, forecasts);
    } catch (err) {
      console.warn('[Chat] Gemini unavailable, using local fallback:', err.message);
      reply = localFallback(trimmedMessage, zones, history, section);
    }

    res.json({
      reply,
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
