# 🏟️ VenueIQ — Smart Stadium Companion

[![Express](https://img.shields.io/badge/Express-4.x-000?style=for-the-badge&logo=express)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=for-the-badge&logo=socket.io)](https://socket.io)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Gemini AI](https://img.shields.io/badge/Gemini_1.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Jest](https://img.shields.io/badge/Tested_with_Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io)

> **AI-powered real-time crowd intelligence for stadium fans.** Ask about queues, navigate gates, and get smart alerts — all from your phone during the live event.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      FAN'S PHONE (PWA)                         │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────────┐  │
│  │ 💬 Chat  │  │ 🗺️  Heatmap  │  │ 🔔 Smart Alerts        │  │
│  │          │  │ (Canvas API)  │  │ (Gemini-generated)     │  │
│  └────┬─────┘  └───────┬───────┘  └────────────┬────────────┘  │
│       │ fetch           │ Socket.IO             │ Socket.IO    │
└───────┼─────────────────┼───────────────────────┼──────────────┘
        │                 │                       │
        ▼                 ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│              EXPRESS + SOCKET.IO SERVER (Node.js)             │
│                                                              │
│  ┌─────────────────────── Routes ──────────────────────────┐ │
│  │ POST /api/chat    → Gemini 1.5 Flash (+ zone context)  │ │
│  │ GET  /api/zones   → Read live zone data                 │ │
│  │ PATCH /api/zones  → Update + broadcast via WS           │ │
│  │ GET  /api/alerts  → Alert history                       │ │
│  │ POST /api/alerts  → Manual alerts + WS broadcast        │ │
│  │ POST /api/reports → Fan crowdsource reports             │ │
│  └────────────────────────┬────────────────────────────────┘ │
│                           │                                  │
│  ┌──── Schedulers ────────┼────────────────────────────────┐ │
│  │ heatmapScheduler: crowd drift every 2 min → WS push    │ │
│  │ alertScheduler:   Gemini alerts every 5 min → WS push  │ │
│  └────────────────────────┼────────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────────┐ │
│  │              Firebase Realtime Database                 │ │
│  │  zones/   → live wait times + capacity per zone         │ │
│  │  alerts/  → Gemini-generated + manual alerts            │ │
│  │  reports/ → crowdsourced fan reports                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. 📊 Crowd Intelligence Engine
Every zone (gates, food courts, restrooms, bars) is tracked with real-time **wait times** and **capacity percentages**. The `heatmapScheduler` updates data every 2 minutes and pushes changes to all connected clients via Socket.IO. Fan crowdsource reports further refine accuracy.

### 2. 🤖 Gemini AI — Context-Aware Conversations
When a fan asks *"Which food queue is shortest?"*, the backend:
1. Fetches **live zone data** from Firebase
2. Injects it as context into **Gemini 1.5 Flash**
3. Returns a **specific, data-backed answer**: *"West Food Court has a 6-min wait vs East at 12 min. Saves ~6 minutes."*

Multi-turn conversation history is maintained for follow-up questions.

### 3. 🗺️ Live Crowd Heatmap
Canvas-rendered aerial stadium view with:
- **Radial gradient blobs** sized by capacity, colored by congestion
- **Wait time badges** on each zone
- **Gate markers** with labels
- Redraws in real-time via Socket.IO pushes

### 4. 🔔 Gemini-Powered Smart Alerts
Every 5 minutes, the `alertScheduler`:
1. Identifies congestion hotspots (>72% capacity)
2. Throttles if a recent alert exists (10-min cooldown)
3. Asks Gemini to generate a natural-language alert with alternatives
4. Falls back to template if Gemini is unavailable
5. Pushes via Socket.IO — appears instantly on all phones

---

## Backend Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check with uptime + WS count |
| `POST` | `/api/chat` | Chat with Gemini (zone context injected) |
| `GET` | `/api/zones` | All zones sorted by wait time |
| `GET` | `/api/zones?type=food` | Filter zones by type |
| `GET` | `/api/zones/:id` | Single zone by ID |
| `PATCH` | `/api/zones/:id` | Update zone capacity/wait |
| `GET` | `/api/alerts` | Recent alerts (default 20, max 50) |
| `POST` | `/api/alerts` | Create manual alert |
| `POST` | `/api/reports` | Submit fan crowd report |

## WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `zones:updated` | Server → Client | Full zones array after heatmap update |
| `alert:new` | Server → Client | New alert object with `id`, `title`, `body`, `urgency` |

---

## Google Services Integration

| Service | How It's Used | Why |
|---|---|---|
| **Gemini 1.5 Flash** | Conversational AI with zone context; proactive alert generation | Fast inference, structured output, 1M context window |
| **Firebase Realtime Database** | Live zone data, alerts, crowd reports | Low-latency sync, serverless scaling, free tier |
| **Firebase Admin SDK** | Server-side DB reads/writes from Express | Secure credential management, no client-side keys |

---

## Local Development Setup

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- A Firebase project with **Realtime Database** enabled
- A [Gemini API key](https://aistudio.google.com/apikey)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/venueiq.git
cd venueiq

# Install backend
cd venueiq-backend
npm install

# Copy env template
cp .env.example .env
# Edit .env with your keys
```

### 2. Configure Environment

Edit `venueiq-backend/.env`:
```
GEMINI_API_KEY=your_gemini_api_key
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
PORT=3001
FRONTEND_URL=http://localhost:5000
```

### 3. Start Backend

```bash
cd venueiq-backend
npm run dev
# → http://localhost:3001 (Express + Socket.IO)
```

### 4. Start Frontend

```bash
# In a separate terminal, from the project root
npx serve public -l 5000
# → http://localhost:5000 (PWA)
```

### 5. Run Tests

```bash
cd venueiq-backend
npm test              # All tests
npm run test:coverage # With coverage report
```

---

## Deployment

### Backend → Cloud Run / Railway / Render

```bash
# Cloud Run
gcloud run deploy venueiq-backend \
  --source ./venueiq-backend \
  --set-env-vars GEMINI_API_KEY=xxx,FIREBASE_DATABASE_URL=xxx

# Railway / Render
# Set env vars in dashboard, deploy from git
```

### Frontend → Firebase Hosting

```bash
firebase login
firebase init hosting
firebase deploy --only hosting
```

---

## Project Structure

```
venueiq/
├── public/                         ← Frontend PWA
│   ├── index.html                  ← Single-file PWA (HTML + CSS + JS)
│   ├── manifest.json               ← PWA manifest
│   └── sw.js                       ← Service worker
│
├── venueiq-backend/                ← Express backend
│   ├── src/
│   │   ├── server.js               ← Entry point (Express + Socket.IO)
│   │   ├── routes/
│   │   │   ├── chat.js             ← POST /api/chat
│   │   │   ├── zones.js            ← GET/PATCH /api/zones
│   │   │   ├── alerts.js           ← GET/POST /api/alerts
│   │   │   └── reports.js          ← POST /api/reports
│   │   ├── services/
│   │   │   ├── firebase.js         ← Admin SDK + DB helpers
│   │   │   ├── gemini.js           ← Gemini chat + alerts + fallback
│   │   │   ├── heatmapScheduler.js ← Crowd drift every 2 min
│   │   │   └── alertScheduler.js   ← Gemini alerts every 5 min
│   │   └── middleware/
│   │       ├── errorHandler.js
│   │       └── requestLogger.js
│   ├── tests/
│   │   └── api.test.js             ← 22 tests (Jest + Supertest)
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
│
├── functions/                      ← Firebase Cloud Functions (alternative)
│   ├── index.js
│   └── package.json
├── firebase.json
├── firebase-seed.json
├── database.rules.json
├── package.json
├── .gitignore
└── README.md
```

---

## Key Engineering Decisions

1. **Real server, not just Cloud Functions.** The Express + Socket.IO server provides a persistent process for WebSocket connections, scheduled tasks, and rate limiting — things that serverless functions can't do well. The Cloud Functions setup is kept as an alternative deployment option.

2. **Socket.IO for real-time pushes.** Instead of polling the database, zone updates and new alerts are pushed *to* the browser the instant they happen. This makes the heatmap and alert feed feel genuinely live.

3. **Local fallback intelligence.** The `localFallback()` function uses intent matching to provide genuinely useful answers even when Gemini, Firebase, or the entire backend is unreachable. The app works perfectly offline — graceful degradation is a feature, not an afterthought.

4. **Gemini as a data narrator.** Every Gemini call receives freshly-fetched zone data as context. This transforms Gemini from a generic chatbot into a venue-specific expert with real numbers. The same approach powers the alert system — Gemini doesn't just report congestion, it calculates alternatives and time savings.

---

## Testing

The test suite covers all API routes with mocked services:

```
✓ GET /health — returns status ok
✓ GET /api/zones — returns all zones sorted by wait
✓ GET /api/zones?type=food — filters by type
✓ GET /api/zones/:id — found
✓ GET /api/zones/:id — 404 for unknown
✓ POST /api/chat — valid message
✓ POST /api/chat — with history
✓ POST /api/chat — rejects missing message
✓ POST /api/chat — rejects too-long message
✓ GET /api/alerts — returns alerts
✓ POST /api/alerts — valid creation
✓ POST /api/alerts — rejects invalid urgency
✓ POST /api/reports — valid report
✓ POST /api/reports — rejects invalid type
... and 8 more
```

---

## Assumptions

- **Zone data source:** Simulated via `heatmapScheduler` with random drift. Production: IoT sensors / ticketing APIs / camera-based counting.
- **Single venue:** Current model assumes one venue. Multi-venue requires namespacing under venue IDs.
- **No auth:** Stadium apps need frictionless access for tens of thousands of fans. Security rules protect backend data.
- **Portrait-only PWA:** One-handed use while walking. Intentional UX choice.

---

<p align="center">
  Built for <strong>PromptWars Hackathon</strong> 🏆<br/>
  <em>Making live events smarter, one queue at a time.</em>
</p>
