const express = require('express');
const router = express.Router();
const { getZones, updateAllZones, pushAlert } = require('../services/firebase');

/**
 * POST /api/simulate
 * Simulates a massive "Halftime Rush" (Minute 43) scenario for hacking demo.
 * Causes food courts to spike to near-100% capacity/waits, pushes alerts, and broadcasts to clients.
 */
router.post('/', async (req, res, next) => {
  try {
    const zones = await getZones();
    const now = Date.now();
    const updates = {};

    zones.forEach(zone => {
      let cap = zone.capacity;
      if (zone.type === 'food') cap = Math.min(0.98, cap + 0.65); // Massive spike
      else if (zone.type === 'restroom') cap = Math.min(0.92, cap + 0.50); // Big spike
      else if (zone.type === 'gate') cap = Math.max(0.05, cap - 0.40); // Empty out

      updates[`zones/${zone.id}/capacity`] = cap;
      updates[`zones/${zone.id}/wait`] = Math.max(1, Math.round(cap * 22)); // Convert to wait time
      updates[`zones/${zone.id}/updatedAt`] = now;
    });

    // Write to Firebase
    await updateAllZones(updates);

    const io = req.app.get('io');

    // Manually fetch the updated ones to broadcast
    const updatedZones = zones.map(z => ({
      ...z,
      capacity: updates[`zones/${z.id}/capacity`],
      wait: updates[`zones/${z.id}/wait`],
    }));

    // Broadcast the red zones instantly
    if (io) {
      io.emit('zones:updated', updatedZones);
    }

    // --- PUSH: Halftime Surge Alert ---
    const rushAlertData = {
      title: 'Minute 43: Halftime rush detected',
      body: 'East & West Food Courts are at 90%+ capacity (> 19min wait). Order from your seat if possible to avoid congestion.',
      urgency: 'urgent',
      type: 'urgent',
      icon: '📈',
      source: 'simulation'
    };
    const rushId = await pushAlert(rushAlertData);
    if (io) {
      io.emit('alert:new', { id: rushId, ...rushAlertData, timestamp: now });
    }

    // --- PUSH: Staggered Exit Coordination Alert ---
    const exitAlerts = [
      { sections: ['A','B','C'], gate: 'North Gate', window: '85th minute' },
      { sections: ['D','E','F'], gate: 'East Gate',  window: '87th minute' },
      { sections: ['G','H','I'], gate: 'West Gate',  window: '87th minute' },
      { sections: ['J','K','L'], gate: 'South Gate', window: '89th minute' },
    ];
    const exitAlertData = {
      title: 'Staggered Exit Protocol Active',
      body: 'To prevent post-game gridlock, exit windows are now enforced. Check your section routing details in the Assistant or Map tab.',
      urgency: 'info',
      type: 'exit',
      icon: '🚨',
      source: 'simulation',
      exitAlerts
    };
    const exitId = await pushAlert(exitAlertData);
    if (io) {
      io.emit('alert:new', { id: exitId, ...exitAlertData, timestamp: now+100 });
      io.emit('exit:staggered', exitAlerts);
    }

    res.json({ success: true, message: 'Halftime simulation detonated.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
