# DeskGuard — Library Seat Booking & Anti-Hoarding App

DeskGuard is a full-stack web application designed to solve the "ghost seat" problem in busy libraries. It combines a live, interactive desk map with QR-based check-ins and an automated background sweep system to ensure that seats are only occupied by active users.

![DeskGuard Live Map Preview](https://via.placeholder.com/800x450?text=DeskGuard+Live+Map+Preview)

## 🚀 Key Features

- **Interactive Isometric Map:** A 3D-like, CSS-powered isometric view of the library layout, showing real-time desk availability.
- **QR Code Check-in/out:** Users scan unique QR codes at each desk to claim their spot.
- **Anti-Hoarding "Sweep" Job:** 
  - **Away Timer:** If a user marks themselves as "away" (e.g., for a break) and doesn't return within 20 minutes, the seat is auto-abandoned.
  - **Check-in Expiry:** Every 2 hours, the system prompts the user with a "Still Here?" notification. Failure to respond within 30 seconds results in the seat being released.
- **Librarian Dashboard:** A dedicated interface for library staff to monitor occupancy, view activity logs, and manually manage desks.
- **Real-time Updates:** Uses **Server-Sent Events (SSE)** to push live desk status changes to all connected clients without page refreshes.
- **Full Marketing Suite:** Includes a blog, documentation, feature pages, and a professional landing page.

## 🛠 Tech Stack

### Frontend
- **Framework:** React (Vite)
- **Styling:** CSS Modules (for components), Vanilla CSS (for marketing)
- **3D/Graphics:** Three.js (Hero scene), CSS Transforms (Isometric map)
- **Routing:** React Router DOM
- **Utilities:** `html5-qrcode` (Scanner), `qrcode` (Generator)

### Backend
- **Runtime:** Node.js (Express)
- **Database:** PostgreSQL (Relational data & state)
- **Caching/Timers:** Redis (In-memory TTL-based timers)
- **Scheduling:** `node-cron` (Background sweep job)
- **Communication:** Server-Sent Events (SSE)

### Infrastructure
- **Containerization:** Docker Compose (Postgres & Redis)

## 📁 Project Structure

```text
DeskGuard/
├── docker-compose.yml     # DB Infrastructure (Postgres, Redis)
├── package.json           # Root scripts (Concurrently, Installs)
├── client/                # React Frontend & Marketing Site
│   ├── marketing/         # Static HTML/JS/CSS marketing pages
│   ├── src/               # React application source
│   │   ├── components/    # Reusable UI (Map, Panels, Modals)
│   │   ├── hooks/         # Custom hooks (useDesks)
│   │   └── pages/         # Application views (Live, Scan, Librarian)
│   └── vite.config.js     # Frontend build configuration
└── server/                # Express Backend API
    └── src/
        ├── db/            # Database config & SQL schemas
        ├── routes/        # API endpoints (desks, librarian)
        ├── services/      # Business logic (SweepJob, Timers)
        └── index.js       # Entry point & SSE setup
```

## 🚦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Docker & Docker Compose](https://www.docker.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd DeskGuard
   ```

2. **Install dependencies:**
   ```bash
   npm run install:all
   ```

3. **Set up Environment Variables:**
   - Create a `.env` file in the `server/` directory (see `.env.example`).
   ```bash
   cp server/.env.example server/.env
   ```

4. **Start the Infrastructure (Postgres & Redis):**
   ```bash
   npm run db:up
   ```

5. **Run the Application (Development Mode):**
   ```bash
   npm run dev
   ```
   - **Frontend:** http://localhost:6111
   - **Backend API:** http://localhost:3001
   - **Marketing Site:** http://localhost:3001/ (Served by the backend)

### Available Scripts (Root)
- `npm run dev`: Starts the DB containers, backend server, and frontend dev server concurrently.
- `npm run db:up` / `npm run db:down`: Manage Docker infrastructure.
- `npm run install:all`: Installs dependencies for both client and server.
- `npm start`: Builds the frontend and starts the production backend server.

## 🔄 How the "Sweep" Logic Works

DeskGuard's core innovation is its server-owned state machine. Unlike client-side timers that can be bypassed, the **Sweep Job** runs every 60 seconds on the server:

1. **'free' → 'occupied':** User scans QR code. `checkin_at` is set. Redis `checkin:{id}` key set for 2 hours.
2. **'occupied' → 'away':** User marks "Away". `away_at` is set. Redis `away:{id}` key set for 20 minutes.
3. **'away' → 'abandoned':** Redis `away` key expires. Sweep job detects missing key and releases desk.
4. **'occupied' → 'still_here_pending':** Redis `checkin` key expires. SSE pushes a "Still Here?" modal to the user. Redis `grace:{id}` key set for 30 seconds.
5. **'still_here_pending' → 'abandoned':** Redis `grace` key expires. Sweep job releases desk.

## 📝 Activity Log
Every significant event (check-in, check-out, auto-abandonment) is logged in the `activity_log` table, providing a full audit trail for library management.

---

Built with ❤️ for better libraries.
