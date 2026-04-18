# Google Services Integration — VenueIQ

This document details every Google Cloud and Google AI service integrated into VenueIQ, including configuration, usage patterns, and architecture decisions.

---

## 1. Gemini 2.0 Flash — Conversational AI Engine

**Package:** `@google/generative-ai` (v0.15+)
**Model:** `gemini-2.0-flash`
**File:** [`venueiq-backend/src/services/gemini.js`](venueiq-backend/src/services/gemini.js)

### How It's Used
- **Context-Aware Chat:** Every user query is enriched with live zone data (wait times, capacity percentages, trend predictions) before being sent to Gemini. The AI reasons over real-time constraints to provide specific, data-backed stadium navigation advice.
- **Proactive Alert Generation:** Every 5 minutes, the `alertScheduler` identifies congestion hotspots (>72% capacity) and asks Gemini to generate natural-language alerts with alternative routing suggestions.
- **Section-Aware Routing:** The user's seating section (A–L) is injected into every prompt alongside a walk-time penalty matrix, enabling Gemini to recommend the nearest low-wait zone rather than the globally shortest queue.

### Configuration
```env
GEMINI_API_KEY=your-gemini-api-key
```

### Architecture Pattern
```
User Query → Extract Section → Fetch Firebase Zones → Build Context String
  → Gemini 2.0 Flash (with systemInstruction + multi-turn history)
  → Parse Response → Return to Client
```

### Key Design Decisions
- **Lazy initialization:** The Gemini client (`GoogleGenerativeAI`) is instantiated on first use, not at boot, to avoid startup failures if the key is missing.
- **Temperature 0.7** for chat (creative but grounded), **0.6** for alerts (more deterministic).
- **maxOutputTokens: 300** to keep responses concise for mobile display.
- **Multi-turn history** is maintained (last 12 turns) for contextual follow-up questions.

---

## 2. Firebase Realtime Database — Live Data Layer

**Package:** `firebase-admin` (v12+)
**File:** [`venueiq-backend/src/services/firebase.js`](venueiq-backend/src/services/firebase.js)

### How It's Used
- **Zone Data Storage:** 8 stadium zones with real-time `capacity`, `wait`, `trend`, and `updatedAt` fields.
- **Alert History:** All Gemini-generated and manual alerts are persisted with timestamps for chronological retrieval.
- **Crowd Reports:** Fan-submitted crowd density reports are stored per-zone and aggregated to refine capacity estimates.
- **Group Sessions:** Meetup codes, member lists, and real-time location updates for group coordination.

### Database Structure
```
/zones/{zoneId}          → { id, name, type, wait, capacity, floor, updatedAt }
/alerts/{alertId}        → { title, body, urgency, type, icon, timestamp, source }
/reports/{zoneId}/{id}   → { type, userId, timestamp }
/meetups/{code}          → { creator, members, createdAt, expiresAt }
```

### Configuration
```env
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### Key Design Decisions
- **5-second in-memory cache** on zone reads to reduce Firebase billing and latency.
- **Atomic batch writes** via `updateAllZones()` for the heatmap scheduler.
- **Auto-seeding:** If the database is empty on boot, initial zone data is automatically written.
- **Firebase Admin SDK** (server-side) — no client-side Firebase keys are exposed to the browser.

---

## 3. Firebase Realtime Database — Security Rules

**File:** [`database.rules.json`](database.rules.json)

Custom security rules enforce read/write permissions per data path, ensuring:
- Zones can be read publicly but only written by authenticated server processes.
- Alerts are append-only from the server.
- Reports are write-once per fan per zone.

---

## 4. Google Cloud Run — Production Deployment

**File:** [`Dockerfile`](Dockerfile)

The backend is containerized for deployment on Google Cloud Run, enabling:
- **Auto-scaling** from 0 to N instances based on traffic.
- **Session affinity** for Socket.IO WebSocket persistence.
- **Cold start optimization** via lightweight Alpine-based Node.js image.

### Deployment Command
```bash
gcloud run deploy venueiq-backend \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --session-affinity \
  --set-env-vars GEMINI_API_KEY=xxx,FIREBASE_DATABASE_URL=xxx
```

---

## 5. Google Cloud Build — CI/CD Pipeline

**File:** [`cloudbuild.yaml`](cloudbuild.yaml)

Automated build pipeline that:
1. Installs dependencies
2. Runs the full Jest test suite
3. Builds the Docker container
4. Deploys to Cloud Run

---

## 6. Google Analytics 4 — Frontend Telemetry

**File:** [`public/app.html`](public/app.html), [`public/index.html`](public/index.html)

Google Analytics is integrated via `gtag.js` to track:
- Page views (landing page vs. app)
- Tab switches (Now, Assistant, Map, Alerts, Group)
- Chat message sends
- Simulation triggers
- Section selections

This data enables venue operators to understand fan behavior patterns and optimize stadium operations.

---

## 7. Firebase Analytics — Server-Side Event Tracking

**File:** [`venueiq-backend/src/services/firebase.js`](venueiq-backend/src/services/firebase.js)

Server-side analytics events are tracked via the `trackEvent()` function, writing to `analytics/events` in Firebase RTDB:
- `chat_message_sent` — every chat interaction
- `zone_viewed` — zone data requests
- `alert_generated` — Gemini-powered alert creation
- `section_set` — user section identification
- `snapshot_uploaded` — Cloud Storage snapshot events

---

## 8. Cloud Storage (Firebase) — Zone Snapshot Archive

**File:** [`venueiq-backend/src/services/storage.js`](venueiq-backend/src/services/storage.js)

Every 10 heatmap scheduler ticks (~20 minutes), a full JSON snapshot of all zone data is uploaded to Google Cloud Storage:
- **Path pattern:** `snapshots/zones-{timestamp}.json`
- **Purpose:** Historical crowd pattern analysis and trend validation
- **Access:** Via `GET /api/dashboard/snapshots` (operator-authenticated)
- **Graceful degradation:** If the bucket is not configured, uploads are silently skipped

---

## Service Integration Summary

| Google Service | SDK/Package | Purpose | File |
|---|---|---|---|
| **Gemini 2.0 Flash** | `@google/generative-ai` | AI chat + alert generation | `services/gemini.js` |
| **Firebase RTDB** | `firebase-admin` | Real-time zone/alert/report storage | `services/firebase.js` |
| **Firebase Admin SDK** | `firebase-admin` | Server-side authentication | `services/firebase.js` |
| **Firebase Analytics** | `firebase-admin` | Server-side event tracking | `services/firebase.js` |
| **Cloud Storage** | `firebase-admin/storage` | Zone snapshot archive for historical analysis | `services/storage.js` |
| **Cloud Run** | `Dockerfile` | Containerized backend deployment | `Dockerfile` |
| **Cloud Build** | `cloudbuild.yaml` | Automated CI/CD pipeline | `cloudbuild.yaml` |
| **Google Analytics 4** | `gtag.js` | Frontend usage telemetry | `public/app.html` |

---

## Why These Services?

1. **Gemini 2.0 Flash** was chosen over GPT-4 for its 1M context window, sub-second latency, and native structured output — critical for injecting 8 zones of live data into every prompt.
2. **Firebase RTDB** was chosen over Firestore for its lower latency on frequent small reads (zone polling every 2 minutes) and native WebSocket support.
3. **Cloud Storage** enables historical analysis of crowd patterns — essential for venue operators to plan staffing and logistics for future events.
4. **Cloud Run** was chosen over App Engine for its container-native scaling and WebSocket support (required for Socket.IO).
5. **Google Analytics** provides operator-facing insights without requiring a custom analytics backend.

