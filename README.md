# DeskGuard — Library Seat Booking & Anti-Hoarding App

DeskGuard is a full-stack web application designed to eliminate "ghost seats" and hoarding in busy libraries. It combines a live, interactive desk map with QR-based check-ins and an automated background sweep system to ensure that seats are only occupied by active users.

## 🌐 Live Demo

| Page | URL |
|------|-----|
| 🏠 **Marketing Site** | [deskguard-jade.vercel.app](https://deskguard-jade.vercel.app) |
| 🗺️ **Live Map** | [deskguard-jade.vercel.app/live](https://deskguard-jade.vercel.app/live) |
| 📷 **QR Scanner** | [deskguard-jade.vercel.app/scan](https://deskguard-jade.vercel.app/scan) |
| 🛡️ **Librarian Dashboard** | [deskguard-jade.vercel.app/librarian](https://deskguard-jade.vercel.app/librarian) |
| ⚙️ **Backend API** | [deskguard-api-2lgn.onrender.com/api/health](https://deskguard-api-2lgn.onrender.com/api/health) |

> **Note:** The backend is hosted on Render's free tier and may take ~30 seconds to wake up on first request. The app shows a "server may be waking up" message while it waits.
>
> **CORS:** Set `ALLOWED_ORIGINS` on Render to `https://deskguard-jade.vercel.app`. Preview deployments are **not** allowed automatically any more; add them with `ALLOWED_ORIGIN_PATTERN` if you need them.

---

## 🔴 The Problem: "Ghost Seats"

In high-demand environments like university libraries, two major issues prevent efficient seat utilization:

1.  **The Ghost Seat:** A student leaves their belongings (books, laptops) to "reserve" a spot for hours while they are elsewhere (lunch, classes, or even sleeping at home).
2.  **Lack of Visibility:** Students waste time walking through multiple floors looking for a free desk, only to find that the "empty" desks are actually claimed by bags.
3.  **Manual Enforcement:** Librarians cannot manually track how long every individual has been away from their desk without intrusive or labor-intensive patrolling.

## 🟢 The Solution: DeskGuard

DeskGuard digitizes library occupancy management with a "Trust but Verify" approach:

-   **Real-time Visibility:** An interactive isometric map allows students to check desk availability *before* they even arrive at the library.
-   **QR-Verified Presence:** To claim a desk, a user must be physically present to scan a unique QR code.
-   **Enforced Activity:** The system assumes a desk is abandoned unless the user actively maintains their session.
-   **Automated Reclamation:** If a user is away for too long or fails a "Still Here?" check, the server automatically releases the desk, making it available for someone else.

---

## 🏗 System Architecture

DeskGuard is built as a distributed system with a focus on real-time synchronization and server-owned state.

### 1. Dual-Frontend Strategy
-   **Marketing Site (`/client/marketing`):** Static, crawlable HTML pages (home, contact, privacy, terms, changelog, 404) with vanilla JS, a WebGL shader background and GSAP animations. GSAP and fonts are self-hosted, so the site makes no third-party requests.
-   **Interactive Application (`/client/src`):** A sophisticated **React** application that handles the live map (CSS Isometric transforms), the QR scanner, and the Librarian dashboard.

### 2. State-Machine Backend
The backend is the "Source of Truth". It doesn't just store data; it manages the lifecycle of a desk session:
-   **Express.js API:** Handles all CRUD operations and state transitions.
-   **Server-Sent Events (SSE):** Instead of polling, the server maintains a persistent connection to all clients, pushing "diffs" whenever a desk status changes. This ensures every user sees the same map state within milliseconds.

### 3. Background Sweep Engine
A `node-cron` job runs every 60 seconds, acting as the system's "Enforcer". It checks against Redis-backed timers to identify abandoned or expired sessions.

---

## 🗄 Database & Persistence

DeskGuard utilizes a **Hybrid Storage Strategy** to balance persistence with high-frequency state changes.

### 1. Persistent Layer: PostgreSQL
Stores the structural data of the library and a historical audit trail.

-   **`desks` Table:** Tracks the identity, location (zone, row, col), and current status of every desk.
-   **`activity_log` Table:** Stores every state change (check-in, check-out, auto-reclamation) for administrative review.

**Schema Overview:**
```sql
CREATE TYPE desk_status AS ENUM ('free','occupied','away','still_here_pending','abandoned');

CREATE TABLE desks (
  id          TEXT PRIMARY KEY,
  zone        TEXT NOT NULL,
  status      desk_status NOT NULL DEFAULT 'free',
  checkin_at  TIMESTAMPTZ,
  away_at     TIMESTAMPTZ,
  state_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Volatile Layer: Redis
Handles the high-frequency "Heartbeat" of the system. We use Redis TTL (Time-To-Live) keys to manage session expirations.

-   **`checkin:{id}`**: 2-hour expiry. When it disappears, the "Still Here?" flow is triggered.
-   **`away:{id}`**: 20-minute expiry. When it disappears, the desk is reclaimed.
-   **`grace:{id}`**: 30-second expiry. The window the user has to respond to a "Still Here?" prompt.

### Connection Configuration
The system expects the following environment variables (defined in `server/.env`):

-   `DATABASE_URL`: `postgresql://user:pass@host:port/dbname`
-   `REDIS_URL`: `redis://host:port`

---

## 🛠 Tech Stack

### Frontend
- **React (Vite)** + **CSS Modules**, route-level code splitting
- **GSAP** + a WebGL shader (marketing animations)
- **HTML5-QRCode** (Scanner, loaded only on `/scan`)

### Backend
- **Node.js (Express)**
- **PostgreSQL** (via `pg` pool)
- **Redis** (via `ioredis`)
- **Server-Sent Events (SSE)**

### Infrastructure
- **Docker Compose** for local DB orchestration.

---

## 🚦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker & Docker Compose](https://www.docker.com/)

### Installation & Run

1.  **Clone & Install:**
    ```bash
    git clone https://github.com/aayush2724/DeskGuard.git
    npm run install:all
    ```
2.  **Environment:**
    ```bash
    cp server/.env.example server/.env
    # then set LIBRARIAN_API_KEY to a random 16+ character value, e.g.
    node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
    ```
3.  **Launch Infrastructure:**
    ```bash
    npm run db:up
    ```
4.  **Seed the desks** (first run only — this replaces the desks table):
    ```bash
    cd server && node src/db/seed.js
    ```
5.  **Start Development:**
    ```bash
    npm run dev
    ```
    Open http://localhost:6111 — Vite serves the marketing pages and the React app, and proxies `/api` to the server on :3001.

### Checks

```bash
cd client && npm run lint && npm test && npm run build
cd server && npm test   # unit tests; set TEST_DATABASE_URL + TEST_REDIS_URL (disposable!) to run the API integration tests — see server/test/api.test.js
```

---

---

## 📡 API Reference

DeskGuard provides a clean REST API for desk management and a real-time SSE stream for state synchronization.

### Base URL
- Development: `http://localhost:3001/api`
- Production: `https://deskguard-api-2lgn.onrender.com/api`

### Desk Operations
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/desks` | Returns the status of all desks. |
| `POST` | `/desks/:id/checkin` | Claims a desk. Sets Redis `checkin` timer. |
| `POST` | `/desks/:id/away` | Marks user as "Away". Sets Redis `away` timer. |
| `POST` | `/desks/:id/checkout` | Releases a desk and clears all timers. |
| `POST` | `/desks/:id/stillhere`| Confirms presence after a "Still Here?" prompt. |

Desk actions only succeed from valid states (for example you cannot check in to an occupied desk); invalid transitions return `409` with a readable message.

### Contact
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/contact` | Stores an early-access enquiry (`name`, `email`, `institution`, `floors`, `message`). Rate-limited to 5 per 10 minutes per IP. |

### Librarian Dashboard
All librarian endpoints require the `X-Api-Key` header (query-string keys are rejected). If `LIBRARIAN_API_KEY` is unset or weak, they return `503`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/librarian/stats` | Returns aggregate counts of desks by status. |
| `GET` | `/librarian/log` | Returns the last 100 entries from the activity log. |
| `POST` | `/librarian/reset/:id`| Manually releases a specific desk. |
| `POST` | `/librarian/reset-all` | Reclaims all desks currently in `abandoned` state. |
| `GET` | `/librarian/qr-sheet` | Returns a print-ready HTML page of QR codes for all desks (codes link to `PUBLIC_SITE_URL`). |
| `GET` | `/librarian/contact-requests` | Lists website enquiries (newest 200). |
| `DELETE` | `/librarian/contact-requests/:id` | Deletes an enquiry (use for data-deletion requests). |

Reading enquiries:
```bash
curl -H "X-Api-Key: $LIBRARIAN_API_KEY" https://deskguard-api-2lgn.onrender.com/api/librarian/contact-requests
```

---

## ⚡ Real-time Synchronization (SSE)

DeskGuard uses **Server-Sent Events (SSE)** instead of WebSockets for unidirectional, real-time updates. This allows the server to push state changes to all connected clients efficiently.

**Endpoint:** `GET /api/events`

**Event Types:**
-   `desk_update`: Pushed whenever a single desk's status changes.
    ```json
    {
      "type": "desk_update",
      "desk": { "id": "A-01", "status": "occupied", "state_at": "..." }
    }
    ```
-   `heartbeat`: Sent every 25 seconds to keep the connection alive.

---

## 🔄 The "Sweep" Lifecycle

1.  **Check-in:** User scans QR → PostgreSQL sets status to `occupied` → Redis sets `checkin` key (2h).
2.  **Session Expiry:** Redis `checkin` key expires → **Sweep Job** detects missing key → Sets PostgreSQL status to `still_here_pending` → SSE pushes modal to client → Redis sets `grace` key (30s).
3.  **Failure to Respond:** Redis `grace` key expires → **Sweep Job** reclaims desk → Sets status to `free` → SSE updates all maps.

---

## 🚀 Deployment configuration

### Vercel (website + app) — `vercel.json`
Build: `cd client && npm run build`. The build assembles `client/dist` (marketing pages, the React app as `app.html`, self-hosted GSAP, and a generated `config.js`). `vercel.json` also sets clean URLs, the SPA rewrites, and security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `VITE_API_URL` | yes | `https://deskguard-api-2lgn.onrender.com/api` | API base URL (public) |
| `VITE_SITE_URL` | no | `https://deskguard-jade.vercel.app` | Canonical/OG URLs in the app |
| `DESKGUARD_CONTACT_EMAIL` | recommended | `hello@your-domain` | Shown on contact/privacy pages; leave unset until a monitored mailbox exists |
| `VITE_VENUE_NAME` / `VITE_VENUE_SUBTITLE` | recommended | `Main Library` / `Floor 2` | Names shown on the map |
| `VITE_AWAY_MINUTES` / `VITE_SESSION_HOURS` | no | `20` / `2` | Must match the server's TTLs |

If the API moves to a different host, update `connect-src` in the CSP inside `vercel.json`, and the canonical URLs in `client/marketing/*.html`, `client/public/sitemap.xml` and `client/public/robots.txt` if the site domain changes.

### Render (API)
| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL`, `REDIS_URL` | yes | Managed Postgres / Redis |
| `LIBRARIAN_API_KEY` | yes | 16+ random characters |
| `ALLOWED_ORIGINS` | yes | `https://deskguard-jade.vercel.app` |
| `PUBLIC_SITE_URL` | yes | `https://deskguard-jade.vercel.app` — printed QR codes link here |
| `NODE_ENV` | yes | `production` |
| `ALLOWED_ORIGIN_PATTERN`, `ACTIVITY_LOG_RETENTION_DAYS`, `TRUST_PROXY`, `AWAY_TTL_SECONDS`, `CHECKIN_TTL_SECONDS` | no | see `server/.env.example` |

Health check path: `/api/health` (returns `503` if Postgres or Redis is down).

---

Built with ❤️ for better libraries.
