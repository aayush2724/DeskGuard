# DeskGuard — Library Seat Booking & Anti-Hoarding App

DeskGuard is a full-stack web application designed to eliminate "ghost seats" and hoarding in busy libraries. It combines a live, interactive desk map with QR-based check-ins and an automated background sweep system to ensure that seats are only occupied by active users.

![DeskGuard Live Map Preview](https://via.placeholder.com/800x450?text=DeskGuard+Live+Map+Preview)

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
-   **Marketing Site (`/client/marketing`):** A high-performance, SEO-friendly site built with **Vanilla JS/CSS** and **Three.js** for the hero animation. It serves as the public face of the project.
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
- **React (Vite)** + **CSS Modules**
- **Three.js** (Hero Scene)
- **HTML5-QRCode** (Scanner)

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
    git clone <repo-url>
    npm run install:all
    ```
2.  **Environment:**
    ```bash
    cp server/.env.example server/.env
    ```
3.  **Launch Infrastructure:**
    ```bash
    npm run db:up
    ```
4.  **Start Development:**
    ```bash
    npm run dev
    ```

---

---

## 📡 API Reference

DeskGuard provides a clean REST API for desk management and a real-time SSE stream for state synchronization.

### Base URL
- Development: `http://localhost:3001/api`

### Desk Operations
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/desks` | Returns the status of all desks. |
| `POST` | `/desks/:id/checkin` | Claims a desk. Sets Redis `checkin` timer. |
| `POST` | `/desks/:id/away` | Marks user as "Away". Sets Redis `away` timer. |
| `POST` | `/desks/:id/checkout` | Releases a desk and clears all timers. |
| `POST` | `/desks/:id/stillhere`| Confirms presence after a "Still Here?" prompt. |

### Librarian Dashboard
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/librarian/stats` | Returns aggregate counts of desks by status. |
| `GET` | `/librarian/log` | Returns the last 100 entries from the activity log. |
| `POST` | `/librarian/reset/:id`| Manually releases a specific desk. |
| `POST` | `/librarian/reset-all` | Reclaims all desks currently in `abandoned` state. |
| `GET` | `/librarian/qr-sheet` | Returns a print-ready HTML page of QR codes for all desks. |

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

Built with ❤️ for better libraries.
