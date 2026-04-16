const { getZones, pushAlert, getAlerts } = require('./firebase');
const { generateAlert } = require('./gemini');

let intervalId = null;

/**
 * Alert scheduler — generates Gemini-powered proactive alerts every 5 minutes.
 *
 * Logic:
 * 1. Check if any zone exceeds 72% capacity
 * 2. Throttle: skip if a Gemini alert was pushed in the last 10 minutes
 * 3. Ask Gemini to generate a natural-language alert with a specific alternative
 * 4. Falls back to template-based alert if Gemini is unavailable
 * 5. Pushes to Firebase + broadcasts via Socket.IO
 */
function startAlertScheduler(io) {
  if (intervalId) return;
  console.log('[Alerts] Scheduler started — checks every 5 min');

  async function tick() {
    try {
      const zones = await getZones();

      // Only alert when there's genuine congestion
      const congested = zones.filter(z => z.capacity > 0.72);
      if (congested.length === 0) {
        return;
      }

      // Throttle: don't spam alerts — check if we pushed one recently
      const recentAlerts = await getAlerts(3);
      const tenMinAgo = Date.now() - 10 * 60 * 1000;
      if (recentAlerts.some(a => a.timestamp > tenMinAgo && a.source === 'gemini')) {
        return;
      }

      let alertData;
      try {
        // Ask Gemini to generate a contextual alert
        alertData = await generateAlert(zones);
      } catch (geminiErr) {
        // Fallback to template-based alert if Gemini is down
        console.warn('[Alerts] Gemini unavailable, using fallback:', geminiErr.message);

        const worst = [...zones].sort((a, b) => b.capacity - a.capacity)[0];
        const sameType = zones.filter(z => z.type === worst.type);
        const best = sameType.sort((a, b) => a.capacity - b.capacity)[0];

        alertData = {
          title: `High congestion at ${worst.name}`,
          body: `${worst.wait} min wait. ${best?.id !== worst.id ? `Try ${best.name} — ${best.wait} min.` : 'Allow extra time.'}`,
          urgency: worst.capacity > 0.85 ? 'urgent' : 'info'
        };
      }

      // Enrich alert data
      const fullAlert = {
        ...alertData,
        type: alertData.urgency || 'info',
        icon: alertData.urgency === 'urgent' ? '⚠️' : 'ℹ️',
        source: 'gemini'
      };

      const alertId = await pushAlert(fullAlert);

      // Broadcast to all connected clients
      io.emit('alert:new', {
        id: alertId,
        ...fullAlert,
        timestamp: Date.now()
      });

      console.log(`[Alerts] Pushed: "${alertData.title}"`);
    } catch (err) {
      console.error('[Alerts] Tick error:', err.message);
    }
  }

  // Run immediately, then every 5 minutes
  tick();
  intervalId = setInterval(tick, 5 * 60 * 1000);
}

function stopAlertScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Alerts] Scheduler stopped');
  }
}

module.exports = { startAlertScheduler, stopAlertScheduler };
