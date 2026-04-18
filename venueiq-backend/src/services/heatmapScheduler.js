/**
 * @fileoverview Heatmap scheduler service for VenueIQ.
 * Simulates live crowd dynamics by updating zone capacity and wait times
 * every 2 minutes. Pushes updates to all connected clients via Socket.IO
 * and records snapshots for predictive forecasting. Uploads zone snapshots
 * to Google Cloud Storage every 10 ticks (~20 minutes) for historical analysis.
 * @module heatmapScheduler
 */

const { getZones, updateAllZones, pushAlert } = require('./firebase');
const { recordSnapshot } = require('./predictor');
const { uploadZoneSnapshot } = require('./storage');

/** @type {NodeJS.Timeout|null} */
let intervalId = null;

/** @type {number} Tick counter for Cloud Storage snapshot scheduling */
let tickCount = 0;

/**
 * Start the heatmap scheduler. Updates all zone capacities every 2 minutes
 * with realistic crowd drift based on time-of-day heuristics.
 * Pushes staggered exit alerts at minute 82 and halftime surge warnings at minute 43.
 *
 * @param {import('socket.io').Server} io - Socket.IO server instance for broadcasting
 * @returns {void}
 */
function startHeatmapScheduler(io) {
  if (intervalId) return;
  console.log('[Heatmap] Scheduler started — updating every 2 minutes');

  async function tick() {
    try {
      const zones = await getZones();
      const now = Date.now();
      const minutes = new Date().getMinutes();
      const hour = new Date().getHours();

      const isPreMatch  = hour >= 17 && hour < 19;
      const isHalftime  = minutes >= 43 && minutes <= 48;
      const isPreExodus = minutes >= 82 && minutes <= 85; // 8–5 min before FT

      const updates = {};
      zones.forEach(zone => {
        let drift;
        switch (zone.type) {
          case 'gate':
            drift = (Math.random() - 0.47) * 0.12 * (isPreMatch ? 1.4 : isPreExodus ? 1.6 : 1.0);
            break;
          case 'food':
            drift = (Math.random() - 0.45) * 0.08 * (isHalftime ? 1.8 : 0.9);
            break;
          case 'restroom':
            drift = (Math.random() - 0.46) * 0.07 * (isHalftime ? 1.3 : 1.0);
            break;
          default:
            drift = (Math.random() - 0.5) * 0.06;
        }
        const cap = Math.max(0.04, Math.min(0.97, zone.capacity + drift));
        updates[`zones/${zone.id}/capacity`] = cap;
        updates[`zones/${zone.id}/wait`]     = Math.max(1, Math.round(cap * 22));
        updates[`zones/${zone.id}/updatedAt`] = now;
      });

      await updateAllZones(updates);

      // Record to history for predictive forecasting
      const updatedZones = zones.map(z => ({
        ...z,
        capacity: updates[`zones/${z.id}/capacity`],
        wait:     updates[`zones/${z.id}/wait`],
      }));
      await recordSnapshot(updatedZones);

      // Upload zone snapshot to Google Cloud Storage every 10 ticks (~20 min)
      tickCount++;
      if (tickCount % 10 === 0) {
        uploadZoneSnapshot(updatedZones).catch(() => {}); // async, non-blocking
      }

      // Push live update to all connected WebSocket clients
      io.emit('zones:updated', updatedZones);

      // ── Staggered exit push at minute 82 ──
      // Warn fans 8 minutes before typical full-time
      if (isPreExodus) {
        const exitAlerts = [
          { sections: ['A','B','C'], gate: 'North Gate', window: '85th minute' },
          { sections: ['D','E','F'], gate: 'East Gate',  window: '87th minute' },
          { sections: ['G','H','I'], gate: 'West Gate',  window: '87th minute' },
          { sections: ['J','K','L'], gate: 'South Gate', window: '89th minute' },
        ];
        // Push one combined exit-coordination alert
        await pushAlert({
          title: 'Plan your exit now',
          body: 'Staggered exit times active. North stand: 85th min via Gate N. East/West: 87th min. South: 89th min.',
          urgency: 'info',
          icon: '🚶',
          source: 'exit-coordinator',
          type: 'exit',
          exitAlerts,
        });
        io.emit('exit:staggered', exitAlerts);
        console.log('[Heatmap] Exit coordination alert pushed');
      }

      // ── Halftime surge warning ──
      if (isHalftime && minutes === 43) {
        await pushAlert({
          title: 'Halftime rush starting',
          body: 'Head to West Food Court now (6 min wait) before the surge. East Court will hit 18+ min in the next 5 minutes.',
          urgency: 'urgent',
          icon: '⏱️',
          source: 'halftime-predictor',
        });
        io.emit('alert:new', { title: 'Halftime rush starting', urgency: 'urgent' });
      }

      console.log(`[Heatmap] Updated ${zones.length} zones at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('[Heatmap] Error:', err.message);
    }
  }

  tick();
  intervalId = setInterval(tick, 2 * 60 * 1000);
}

/**
 * Stop the heatmap scheduler and clear the interval.
 *
 * @returns {void}
 */
function stopHeatmapScheduler() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

module.exports = { startHeatmapScheduler, stopHeatmapScheduler };
