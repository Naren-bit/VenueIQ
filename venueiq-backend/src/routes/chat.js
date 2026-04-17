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

    let replyText = '';
    let matchedZones = [];
    let askedForSection = false;

    try {
      replyText = await chat(trimmedMessage, zones, history, section, forecasts);
    } catch (err) {
      console.warn('[Chat] Gemini unavailable, using local fallback:', err.message);
      const fb = localFallback(trimmedMessage, zones, history, section);
      
      // localFallback can return strings or objects now.
      if (typeof fb === 'string') {
        replyText = fb;
      } else {
        replyText = fb.reply;
        matchedZones = fb.zones || [];
        askedForSection = fb.askedForSection || false;
      }
    }

    // Attempt to extract zones from the generated text if missing
    if (matchedZones.length === 0 && replyText && typeof replyText === 'string') {
      zones.forEach(z => {
        // Simple case-insensitive name match
        if (replyText.toLowerCase().includes(z.name.toLowerCase())) {
          matchedZones.push(z);
        }
      });
      // Sort to best wait
      matchedZones.sort((a,b) => a.wait - b.wait);
    }

    res.json({
      reply: replyText,
      zones: matchedZones,
      askedForSection,
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
