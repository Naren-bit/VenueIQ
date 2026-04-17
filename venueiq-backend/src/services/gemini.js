const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildLocationContext, getBestZoneForUser } = require('./venueLayout');

let genAI = null;

/**
 * Lazy-init the Gemini client.
 * Reads GEMINI_API_KEY from environment.
 */
function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in environment');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Helper to safely extract a user's section from the chat history.
 * Recognises:  "section B",  "sec B12",  "stand E",  "north",  or even a bare letter "C"
 * when the message is very short (likely a direct reply to "what section?").
 */
function extractSectionFromChat(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      const text = history[i].text.trim();
      // "section X", "sec X", "stand X"
      const m = text.match(/(?:section|sec|stand)\s+([a-zA-Z0-9]+)/i);
      if (m) return m[1];
      // explicit quadrants
      const q = text.match(/\b(north|south|east|west)\b/i);
      if (q) return q[1];
      // bare section letter (A-L), only when the message is very short (≤ 3 chars)
      // This handles replies like "C", "B", "E4" to "what section are you in?"
      if (text.length <= 3) {
        const bare = text.match(/^([A-La-l]\d{0,2})$/);
        if (bare) return bare[1];
      }
    }
  }
  return null;
}

// ===== System prompt — governs Gemini's personality and output format =====
const SYSTEM_PROMPT = `You are VenueIQ, an intelligent AI assistant embedded in a live stadium companion app.
You have real-time crowd data for every zone in the venue, updated every 2 minutes.

Your personality: confident, specific, genuinely helpful. Never hedge — give the best answer from the data.

Rules:
- ALWAYS use exact zone names, exact wait times from the provided data
- Bold key info using **text** (zone names, wait times, sections)
- 2-3 sentences max unless complex routing is needed
- Recommend best option first, then a backup with time savings: "saves ~8 min"
- One emoji per response, at the end
- Never say "I don't know"
- Never use markdown headers (no # or ##)`;

/**
 * Send a chat message to Gemini with live zone data as context.
 * Maintains multi-turn history for follow-up questions.
 * Now accepts optional forecasts parameter for trend-aware context.
 */
async function chat(userMessage, zones = [], history = [], userSection = null, forecasts = {}) {
  // Try to find the section in the full history so Gemini remembers context
  // Add the current userMessage as a dummy history item to check it too.
  const fullHistory = [...history, { role: 'user', text: userMessage }];
  const effectiveSection = userSection || extractSectionFromChat(fullHistory);

  const zoneContext = buildLocationContext(zones, effectiveSection, forecasts);

  const model = getClient().getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.7
    }
  });

  let pastHistory = history.length > 0 && history[history.length - 1].role === 'user'
    ? history.slice(0, -1)
    : history;

  pastHistory = pastHistory.slice(-12);
  while (pastHistory.length > 0 && pastHistory[0].role !== 'user') {
    pastHistory.shift();
  }

  const chatSession = model.startChat({
    history: pastHistory.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }))
  });

  const result = await chatSession.sendMessage(
    `Live venue data (sorted best to worst wait):\n${zoneContext}\n\nFan's question: ${userMessage}`
  );

  return result.response.text();
}

/**
 * Ask Gemini to generate a single proactive alert based on current zone congestion.
 * Returns parsed JSON: { title, body, urgency }
 */
async function generateAlert(zones) {
  const context = zones
    .map(z => `${z.name}: ${z.wait}min, ${Math.round(z.capacity * 100)}% full`)
    .join('\n');

  const model = getClient().getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      maxOutputTokens: 150,
      temperature: 0.6
    }
  });

  const result = await model.generateContent(
    `Stadium zone data:\n${context}\n\nGenerate ONE alert for the worst congestion with a specific better alternative. Respond ONLY with valid JSON (no markdown fencing, no backticks):\n{"title":"max 8 words","body":"max 22 words with specific alternative and time savings","urgency":"urgent or info"}`
  );

  const raw = result.response.text().replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

/**
 * Smart local fallback — provides genuinely useful answers using intent matching
 * when Gemini is unreachable (offline, quota, network error).
 */
function localFallback(message, zones, history = [], explicitSection = null) {
  const m = message.toLowerCase();

  const fullHistory = [...history, { role: 'user', text: message }];
  const userSection = explicitSection || extractSectionFromChat(fullHistory);

  // If the message contains no explicit intent keywords, but does contain a location,
  // scan history for the most recent intent keyword to reply to the pending question.
  let activeText = m;
  const intentRegex = /\b(foods?|eats?|queues?|concessions?|drinks?|hungry|burgers?|snacks?|pizzas?|gates?|way outs?|enters?|entrances?|exits?|doors?|leaves?|restrooms?|toilets?|bathrooms?|loos?|washrooms?|wcs?|parks?|parking|cars?|vehicles?|lots?|drives?|ubers?|taxis?|rides?|seats?|sections?|rows?|blocks?|finds?|where am i|busy|crowds?|packed|full|congestion|capacity|overview|help|options?)\b/i;

  if (!m.match(intentRegex) && userSection) {
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      if (fullHistory[i].role === 'user' && fullHistory[i].text.match(intentRegex)) {
        activeText = fullHistory[i].text.toLowerCase();
        break;
      }
    }
  }

  const newlySetSection = extractSectionFromChat([{ role: 'user', text: message }]);
  const actionableIntentRegex = /\b(foods?|eats?|queues?|concessions?|drinks?|hungry|burgers?|snacks?|pizzas?|gates?|way outs?|enters?|entrances?|exits?|doors?|leaves?|restrooms?|toilets?|bathrooms?|loos?|washrooms?|wcs?|parks?|parking|cars?|vehicles?|lots?|drives?|ubers?|taxis?|rides?|finds?|where am i)\b/i;

  if (newlySetSection && !activeText.match(actionableIntentRegex)) {
    return `Got it! You're in the **${newlySetSection.toUpperCase()}** stand. Would you like to know the nearest food, gate, or restroom? 📍`;
  }

  if (activeText.match(/\b(foods?|eats?|queues?|concessions?|drinks?|hungry|burgers?|snacks?|pizzas?)\b/)) {
    const { best, runner, locationKnown } = getBestZoneForUser(zones, 'food', userSection);
    if (!locationKnown) return `To give you the nearest option, **what section are you sitting in?** (Globally, **${best?.name}** has the shortest wait: ${best?.wait} min) 🍔`;
    const savedWait = runner ? ` That saves ~${runner.wait - best.wait} min vs **${runner.name}** queue` : '';
    return `**${best?.name}** has the best overall balance — just **${best?.wait} min** wait right now, and it's a ~${best.walkMinutes} min walk from your section.${savedWait} 🍔`;
  }

  if (activeText.match(/\b(gates?|enters?|entrances?|exits?|way outs?|leaves?|doors?)\b/)) {
    const { best, locationKnown } = getBestZoneForUser(zones, 'gate', userSection);
    if (!locationKnown) return `To find your closest exit, **what section are you in?** (Globally, **${best?.name}** is shortest: ${best?.wait} min) 🚪`;
    return `**${best?.name}** is your best bet — only **${best?.wait} min** wait (~${best.walkMinutes} min walk). 🚪`;
  }

  if (activeText.match(/\b(restrooms?|toilets?|bathrooms?|loos?|washrooms?|wcs?)\b/)) {
    const { best, locationKnown } = getBestZoneForUser(zones, 'restroom', userSection);
    if (!locationKnown) return `To find the closest restroom, **what section are you in?** (Globally, **${best?.name}** is shortest: ${best?.wait} min) 🚻`;
    return `Nearest low-wait option: **${best?.name}** — just **${best?.wait} min** right now, plus a ~${best.walkMinutes} min walk. 🚻`;
  }

  if (activeText.match(/\b(parks?|parking|cars?|vehicles?|lots?|drives?|ubers?|taxis?|rides?)\b/)) {
    return `Post-game: head to **Lot A or D** — space available. Lot C is nearly full. Leave 10 min before the final whistle to beat the rush. 🚗`;
  }

  if (activeText.match(/\b(seats?|sections?|rows?|blocks?|finds?|where am i)\b/)) {
    return `Match your section letter to the nearest gate: **A–C → North**, **D–F → East**, **G–J → South**. Check signage at any concourse entry. 📍`;
  }

  if (activeText.match(/\b(busy|crowd|crowds|packed|full|congestion|capacity|overview)\b/)) {
    const sorted = [...zones].sort((a, b) => b.capacity - a.capacity);
    return `Most congested: **${sorted[0].name}** at ${Math.round(sorted[0].capacity * 100)}%. Quietest: **${sorted[sorted.length - 1].name}** at ${Math.round(sorted[sorted.length - 1].capacity * 100)}%. 📊`;
  }

  if (activeText.match(/\b(help|what can you|how do|menus?|options?)\b/)) {
    return `I can help with: **food queue** wait times, **gate** congestion, **restroom** locations, **parking** tips, and **seat finding**. Just ask! 🎯`;
  }

  return `I have live data on **${zones.length} venue zones** right now. Ask me about food queues, gate wait times, restrooms, parking, or how to find your seat! 🏟️`;
}

module.exports = { chat, generateAlert, localFallback };
