const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getDatabase } = require('firebase-admin/database');
const { initializeApp } = require('firebase-admin/app');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors')({ origin: true });

initializeApp();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ===== SYSTEM PROMPT — Governs Gemini personality & output rules =====
const SYSTEM_PROMPT = `You are VenueIQ, an intelligent AI assistant embedded in a stadium companion app.
You have access to real-time crowd data for every zone in the venue.

Your personality: confident, helpful, specific. You never say "I don't know" — you always give the best answer from available data.

Response rules:
- Always be SPECIFIC with zone names, wait times, and directions from the provided data
- Bold key info using **text** (gate names, times, section numbers)
- Max 3 sentences unless complex routing is needed
- Recommend the BEST option first, then mention the second-best as backup
- Calculate time savings when suggesting alternatives ("saves ~8 min")
- Use 1 emoji per response maximum, placed at the end
- Never use markdown headers (no # or ##)
- If asked about something not in your data, give the most helpful response you can from the venue context`;

// ===== /api/chat — Main conversational AI endpoint =====
exports.chat = onRequest({ cors: true }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).end();

    const { message, zones = [], history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    try {
      // Fetch live zone data from Firebase RTDB
      const db = getDatabase();
      const snap = await db.ref('zones').once('value');
      const liveZones = snap.exists() ? Object.values(snap.val()) : zones;

      // Build zone context for Gemini
      const zoneContext = liveZones
        .sort((a, b) => a.wait - b.wait)
        .map(z => `${z.name}: ${z.wait} min wait, ${Math.round(z.capacity * 100)}% capacity`)
        .join('\n');

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Start chat with conversation history for multi-turn context
      const chat = model.startChat({
        history: history.slice(-6).map(h => ({
          role: h.role,
          parts: [{ text: h.text }]
        })),
        systemInstruction: SYSTEM_PROMPT
      });

      const result = await chat.sendMessage(
        `Current venue data (sorted by wait time, shortest first):\n${zoneContext}\n\nFan asks: ${message}`
      );

      res.json({
        reply: result.response.text(),
        timestamp: Date.now()
      });

    } catch (err) {
      console.error('Chat error:', err);
      res.status(500).json({
        error: 'AI temporarily unavailable',
        details: err.message
      });
    }
  });
});

// ===== /api/zones — Returns current zone data =====
exports.zones = onRequest({ cors: true }, async (req, res) => {
  cors(req, res, async () => {
    try {
      const snap = await getDatabase().ref('zones').once('value');
      res.json(snap.exists() ? snap.val() : {});
    } catch (err) {
      console.error('Zones fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch zones' });
    }
  });
});

// ===== /api/report-crowd — Crowdsource crowd density reports from fans =====
exports.reportCrowd = onRequest({ cors: true }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).end();

    const { zoneId, reportType } = req.body;
    if (!zoneId || !reportType) {
      return res.status(400).json({ error: 'missing zoneId or reportType' });
    }

    try {
      const db = getDatabase();

      // Store individual report
      await db.ref(`reports/${zoneId}`).push({
        type: reportType,
        timestamp: Date.now()
      });

      // Aggregate last 20 reports to update zone capacity
      const snap = await db
        .ref(`reports/${zoneId}`)
        .orderByChild('timestamp')
        .limitToLast(20)
        .once('value');

      if (snap.exists()) {
        const reports = Object.values(snap.val());
        const crowdedRatio = reports.filter(r => r.type === 'crowded').length / reports.length;

        await db.ref(`zones/${zoneId}`).update({
          capacity: Math.min(0.97, crowdedRatio),
          wait: Math.max(1, Math.round(crowdedRatio * 22)),
          updatedAt: Date.now()
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Report error:', err);
      res.status(500).json({ error: 'Failed to process report' });
    }
  });
});

// ===== Scheduled: Update heatmap every 2 minutes =====
// Simulates live crowd fluctuation. In production, replace with real IoT / ticketing API data.
exports.updateHeatmap = onSchedule('every 2 minutes', async () => {
  try {
    const db = getDatabase();
    const snap = await db.ref('zones').once('value');
    if (!snap.exists()) return;

    const updates = {};
    Object.entries(snap.val()).forEach(([id, zone]) => {
      // Slight upward bias (0.47 vs 0.5) simulates venue filling during events
      const drift = (Math.random() - 0.47) * 0.09;
      const cap = Math.max(0.05, Math.min(0.97, zone.capacity + drift));
      updates[`zones/${id}/capacity`] = cap;
      updates[`zones/${id}/wait`] = Math.max(1, Math.round(cap * 22));
      updates[`zones/${id}/updatedAt`] = Date.now();
    });

    await db.ref().update(updates);
    console.log('Heatmap updated:', Object.keys(updates).length / 3, 'zones');
  } catch (err) {
    console.error('Heatmap update error:', err);
  }
});

// ===== Scheduled: Gemini generates smart proactive alerts every 5 minutes =====
exports.generateAlerts = onSchedule('every 5 minutes', async () => {
  try {
    const db = getDatabase();
    const snap = await db.ref('zones').once('value');
    if (!snap.exists()) return;

    const zones = Object.values(snap.val());
    const worstZone = zones.sort((a, b) => b.capacity - a.capacity)[0];

    // Only generate alert if there's genuine congestion
    if (worstZone.capacity < 0.75) return;

    const bestAlternative = zones.sort((a, b) => a.capacity - b.capacity)[0];

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `Stadium zone data:\n${zones.map(z =>
      `${z.name}: ${z.wait}min wait, ${Math.round(z.capacity * 100)}% capacity`
    ).join('\n')}\n\nThe most congested zone is "${worstZone.name}" at ${Math.round(worstZone.capacity * 100)}%. The best alternative is "${bestAlternative.name}" at ${bestAlternative.wait}min.\n\nGenerate ONE stadium alert as JSON only (no markdown fencing):\n{"title":"max 8 words","body":"max 20 words, mention best alternative with time savings","urgency":"urgent or info"}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().replace(/```json|```/g, '').trim();

    const alertData = JSON.parse(responseText);
    await db.ref('alerts').push({
      ...alertData,
      type: alertData.urgency || 'info',
      icon: alertData.urgency === 'urgent' ? '⚠️' : 'ℹ️',
      timestamp: Date.now(),
      source: 'gemini'
    });

    console.log('Alert generated:', alertData.title);
  } catch (err) {
    console.error('Alert generation error:', err);
  }
});
