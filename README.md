# 🏟️ VenueIQ — Smart Stadium Companion

[![Express](https://img.shields.io/badge/Express-4.x-000?style=for-the-badge&logo=express)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?style=for-the-badge&logo=socket.io)](https://socket.io)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Gemini AI](https://img.shields.io/badge/Gemini_2.0_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Jest](https://img.shields.io/badge/Tested_with_Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io)

> **AI-powered real-time crowd intelligence for stadium fans.** Ask about queues, navigate gates, and get smart alerts — all from your phone during the live event.

---

## Problem Statement Alignment

This project directly addresses every dimension of the PromptWars challenge:

| Challenge Dimension | VenueIQ Solution |
|---|---|
| **Crowd movement** | Walk-time proximity scoring routes fans via least-congested paths, not just shortest queues |
| **Waiting times** | Live Firebase data + EWMA forecasting predicts queues 15 min ahead |
| **Real-time coordination** | Socket.IO pushes zone updates, alerts, and exit coordination to all fans simultaneously |
| **Seamless experience** | PWA: no app download, works offline, installable, service worker cached |
| **Enjoyable experience** | Conversational AI gives specific, actionable answers in natural language |
| **Large-scale venues** | Operator dashboard for venue staff; group meetup for fan coordination; staggered exit system |

---

## ✨ What Makes VenueIQ Different

- 🎯 **Section-Aware Intelligence** — Pick your seat once. Every recommendation is personalized with walk-time estimates from YOUR section.
- 🤖 **Gemini 2.0 Flash** — Not a chatbot. A venue-specific AI expert with live data injected on every query.
- 📡 **Real-Time Push** — Zone data refreshes every 2 minutes via WebSocket. No refresh button required.
- 🌑 **Stadium Ops Centre UI** — Dark, data-dense, designed for noisy stadiums. Feels like mission control.
- ✈️ **Works Offline** — Smart local fallback engine provides useful answers even without internet.
- 👥 **Group Coordination** — Share a code, see your group's sections, plan meetups mid-event.

---

## 🎨 UI Design: "Stadium Ops Centre"

The frontend follows a dark, precise, data-forward aesthetic — designed for one-handed use in a dark, noisy stadium.

| Design Token | Value |
|---|---|
| **Background** | `#07080f` (near-black) |
| **Surface** | `#0f1018` / `#161720` (layered cards) |
| **Accent** | `#39d98a` (stadium green) |
| **Secondary** | `#7c6af7` (vivid purple) |
| **Warning** | `#f5a623` / **Danger** `#f26464` |
| **Data Font** | Space Mono (monospaced for numbers) |
| **UI Font** | DM Sans (clean body text) |

### Key UI Components
- **Header** — Back arrow, Space Mono logo, WS status pill, LIVE indicator with breathing dot
- **Tab Bar** — 5 tabs (Now, Assistant, Map, Alerts, Group) with animated underline indicator
- **Chat Bubbles** — User messages in accent green, bot in surface card with timestamp
- **Zone Cards** — Inline 2×2 grid with wait time, capacity bar, color-coded by severity
- **Section Picker** — Grid of A–L sections mapped to North/East/West/South stands
- **Quick Reply Chips** — Horizontally scrollable pills with emoji prefixes
- **Heatmap** — Canvas-rendered with radial gradient blobs and glassmorphic legend overlay

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
│  │ POST /api/chat    → Gemini 2.0 Flash (+ zone context)  │ │
│  │ GET  /api/zones   → Read live zone data                 │ │
│  │ PATCH /api/zones  → Update + broadcast via WS           │ │
│  │ GET  /api/alerts  → Alert history                       │ │
│  │ POST /api/alerts  → Manual alerts + WS broadcast        │ │
│  │ POST /api/reports → Fan crowdsource reports             │ │
│  │ Meetup endpoints  → Group coordination                  │ │
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
│  │  meetups/ → group sessions + member locations           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. 📊 Crowd Intelligence Engine
Every zone (gates, food courts, restrooms, bars) is tracked with real-time **wait times** and **capacity percentages**. The `heatmapScheduler` updates data every 2 minutes and pushes changes to all connected clients via Socket.IO. Fan crowdsource reports further refine accuracy.

### 2. 🤖 Gemini AI — Section-Aware Conversations
When a fan asks *"Which food queue is shortest?"*, the backend:
1. Fetches **live zone data** from Firebase
2. Reads the fan's **section** from the request (set via the section picker)
3. Computes **walk-time penalties** from the fan's section to each zone
4. Injects everything as context into **Gemini 2.0 Flash**
5. Returns a **specific, proximity-aware answer**: *"West Food Court is your best bet — 6 min wait, ~3 min walk from Section B."*

Multi-turn conversation history is maintained. Changing sections **automatically clears chat** for fresh context.

### 3. 🗺️ Live Crowd Heatmap
Canvas-rendered aerial stadium view with:
- **Radial gradient blobs** sized by capacity, colored by congestion
- **Wait time badges** on each zone
- **Gate markers** with labels
- **Glassmorphic legend overlay** with blur effect
- Redraws in real-time via Socket.IO pushes

### 4. 🔔 Gemini-Powered Smart Alerts
Every 5 minutes, the `alertScheduler`:
1. Identifies congestion hotspots (>72% capacity)
2. Throttles if a recent alert exists (10-min cooldown)
3. Asks Gemini to generate a natural-language alert with alternatives
4. Falls back to template if Gemini is unavailable
5. Pushes via Socket.IO — appears instantly on all phones

### 5. 👥 Group Coordination
- Create a group → get a shareable 6-character code
- Friends join with the code → everyone sees each other's sections
- Real-time member location updates via the meetup API

### 6. ⚡ Now Dashboard
At-a-glance view showing the **best food, gate, and restroom** for your section with:
- Live wait times (color-coded: green/amber/red)
- Trend indicators (rising ↑ / easing ↓ / stable →)
- Tap any card to ask the assistant for details

---

## 🏟️ The Data: Live Mock Architecture

Because live stadium security and crowd-sensing APIs are highly proprietary, VenueIQ is built around a **Live Mock Data Engine** specifically configured for **Wembley Stadium**. This ensures the app can be fully demonstrated with realistic, breathing data during the judging parameters.

### WHY we use mock data
To demonstrate the absolute power of Gemini AI when paired with real-time sensor ingestion, we needed a live stream of changing variables. Static data makes the AI look like a simple lookup table. By feeding it fluctuating pseudo-random "live" data, the AI has to dynamically reason about changing conditions (e.g., "North Gate is full *now*, go East instead") exactly as it would in a real stadium.

### WHAT is being mocked
We successfully modeled 8 critical zones of Wembley Stadium:
- **Gates:** North Gate, South Gate
- **Food/Beverage:** West Food Court, East Food Court, Main Bar L2, Terrace Bar
- **Facilities:** Restrooms North, Restrooms South

For each zone, we track:
- `capacity`: A fluid percentage (0-100%) indicating how crowded the physical space is.
- `wait`: The calculated physical wait time in minutes, mapped logarithmically to the capacity.
- `trend`: Is the crowd rising, falling, or stable?

### HOW it works
The backend runs a headless Node.js `heatmapScheduler`. Every 2 minutes, this scheduler:
1. Calculates a "drift" for each zone (crowds randomly surge or disperse based on realistic constraints).
2. Updates the capacity and wait times.
3. Automatically writes the fresh data to the **Firebase Realtime Database**.
4. Pushes the new state directly to all connected mobile clients over a **Socket.IO** WebSocket connection.

### WHERE the data lives
- **Primary Datastore:** Firebase Realtime Database. This acts as our "sensor hub".
- **AI Context Window:** Every time a user asks a question, the backend fetches the latest Firebase snapshot and invisibly attaches it to the prompt sent to `Gemini 1.5 Flash`.
- **Offline Fallback Engine:** If Firebase or the API disconnects, the frontend's Service Worker intercepts queries and uses a hardcoded local fallback map containing realistic baseline heuristics for Wembley, ensuring zero downtime for the fan.

---

## Backend Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check with uptime + WS count |
| `POST` | `/api/chat` | Chat with Gemini (zone + section context injected) |
| `GET` | `/api/zones` | All zones sorted by wait time |
| `GET` | `/api/zones?type=food` | Filter zones by type |
| `GET` | `/api/zones/:id` | Single zone by ID |
| `PATCH` | `/api/zones/:id` | Update zone capacity/wait |
| `GET` | `/api/zones/forecast` | Trend predictions per zone |
| `GET` | `/api/alerts` | Recent alerts (default 20, max 50) |
| `POST` | `/api/alerts` | Create manual alert |
| `POST` | `/api/reports` | Submit fan crowd report |
| `POST` | `/api/meetup` | Create group session |
| `POST` | `/api/meetup/:code/join` | Join a group |
| `PATCH` | `/api/meetup/:code/location` | Update member location |
| `GET` | `/api/meetup/:code/members` | Get group members |

## WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `zones:updated` | Server → Client | Full zones array after heatmap update |
| `alert:new` | Server → Client | New alert object with `id`, `title`, `body`, `urgency` |

---

## Google Services Integration

| Service | How It's Used | Why |
|---|---|---|
| **Gemini 2.0 Flash** | Conversational AI with zone + section context; proactive alert generation | Fast inference, structured output, 1M context window |
| **Firebase Realtime Database** | Live zone data, alerts, crowd reports, group sessions | Low-latency sync, serverless scaling, free tier |
| **Firebase Admin SDK** | Server-side DB reads/writes from Express | Secure credential management, no client-side keys |
| **Google Cloud Run** | Containerized backend deployment | Auto-scaling, WebSocket support, session affinity |
| **Google Cloud Build** | Automated CI/CD pipeline | Test → Build → Deploy on every push |
| **Google Analytics 4** | Frontend usage telemetry via gtag.js | Page views, tab switches, chat interactions |

> 📖 **For detailed integration documentation, see [GOOGLE_SERVICES.md](GOOGLE_SERVICES.md)**

---

## Deployment

### Frontend (Vercel)
The `public/` directory is deployed as a static site on Vercel with CDN edge caching.

### Backend (Google Cloud Run / Render)
The backend is containerized via the included `Dockerfile` and deployed with:
- **Session affinity** enabled for Socket.IO WebSocket persistence
- **Auto-scaling** from 0 to 10 instances based on traffic
- **CI/CD** via `cloudbuild.yaml` for automated test → build → deploy

```bash
# Deploy to Cloud Run
gcloud run deploy venueiq-backend --source . --region asia-south1 --allow-unauthenticated --session-affinity
```

---

## Local Development Setup

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- A Firebase project with **Realtime Database** enabled
- A [Gemini API key](https://aistudio.google.com/apikey)

### 1. Clone & Install

```bash
git clone https://github.com/Naren-bit/VenueIQ.git
cd VenueIQ

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

### 3. Seed Firebase (Optional)

```bash
# Import sample zone data
firebase database:set / firebase-seed.json
```

### 4. Start Development

```bash
# From the project root
npm run dev
# → Backend: http://localhost:3001
# → Frontend: http://localhost:3000 (served by Express)
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
VenueIQ/
├── public/                         ← Frontend PWA
│   ├── index.html                  ← Landing page (marketing site)
│   ├── app.html                    ← Main PWA application
│   ├── manifest.json               ← PWA manifest
│   └── sw.js                       ← Service worker (offline support)
│
├── venueiq-backend/                ← Express backend
│   ├── src/
│   │   ├── server.js               ← Entry point (Express + Socket.IO)
│   │   ├── routes/
│   │   │   ├── chat.js             ← POST /api/chat (section-aware)
│   │   │   ├── zones.js            ← GET/PATCH /api/zones
│   │   │   ├── alerts.js           ← GET/POST /api/alerts
│   │   │   ├── reports.js          ← POST /api/reports
│   │   │   └── meetup.js           ← Group coordination endpoints
│   │   ├── services/
│   │   │   ├── firebase.js         ← Admin SDK + DB helpers
│   │   │   ├── gemini.js           ← Gemini chat + alerts + fallback
│   │   │   ├── venueLayout.js      ← Walk-time matrix + routing
│   │   │   ├── predictor.js        ← Zone trend forecasting
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

3. **Section-aware routing.** Every chat request carries the user's section. The backend computes walk-time penalties from that section to each zone, so "nearest food" actually means nearest — not just globally shortest wait.

4. **Chat clears on section change.** When a user changes their seat, the entire conversation history resets. This prevents stale location context from contaminating new recommendations.

5. **Local fallback intelligence.** The `localFallback()` function uses intent matching to provide genuinely useful answers even when Gemini, Firebase, or the entire backend is unreachable. The app works perfectly offline — graceful degradation is a feature, not an afterthought.

6. **Gemini as a data narrator.** Every Gemini call receives freshly-fetched zone data as context. This transforms Gemini from a generic chatbot into a venue-specific expert with real numbers. The same approach powers the alert system — Gemini doesn't just report congestion, it calculates alternatives and time savings.

7. **Stadium Ops Centre design.** The dark, monospaced, data-dense UI was designed specifically for stadium conditions — bright sunlight, dark stands, one-handed use, glanceable information. Not a generic chat skin.

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
✓ POST /api/chat — with history and section
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

## Accessibility

- **ARIA attributes** on all interactive elements (`role="tab"`, `aria-selected`, `aria-live`)
- **Keyboard navigation** for tab bar (ArrowLeft/ArrowRight)
- **Focus-visible outlines** for keyboard users
- **`prefers-reduced-motion`** — disables all animations for users who need it
- **WCAG AA color contrast** on dark backgrounds
- **44px minimum touch targets** for stadium-glove-friendly tapping

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
