# Helix

A CRM for managing MSP/ISP outreach for Helium brownfield Wi-Fi conversions. Built for the Fractals team.

One MSP deal can equal 50+ brownfield conversions, so Helix focuses the Fractals pipeline on the partners who already manage Wi-Fi hardware (Ubiquiti, Cisco, Aruba) at dozens or hundreds of client locations.

## Stack

- **Frontend**: React 19 + Vite, dark UI with Fractals purple/cyan theme
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Lead discovery + outreach**: Apollo.io (enrichment, sequences, email sync)
- **AI meeting analysis**: Anthropic Claude (with the Whisper-based transcription pipeline)
- **Scheduling**: Google Calendar OAuth

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Apollo.io API key
- Anthropic API key (for meeting analysis)
- Google OAuth client (optional, for calendar sync)

### Environment

Create `backend/.env`:
```
DATABASE_URL=postgres://user:password@localhost:5432/helix
PORT=3001
SESSION_SECRET=replace-me
APOLLO_API_KEY=your_apollo_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
WHISPER_MODEL_SIZE=base
```

### Database setup
```bash
cd backend
npm install
node database/seed.js     # creates schema + default admin
node database/migrate.js  # idempotent column / settings migrations
```

### Backend
```bash
cd backend
npm start
```
API runs on http://localhost:3001

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs on http://localhost:5173

### Default admin
- Username: `garrett`
- Password: `changeme123`

Change this on first login.

## Pages

1. **Pipeline** (`/`) — Kanban + lead table with stats bar (Total MSPs, Contacted This Week, Discovery Calls, Conversion Rate). MSP-aware columns (Locations Managed, Hardware), bulk Apollo sequence push, CSV import.
2. **Meeting Notes** (`/analytics`) — Upload Google Meet / Zoom recordings, get Whisper transcription and Claude analysis tuned for MSP brownfield sales context.
3. **Calendar** (`/calendar`) — Stage-driven event creation with Google Calendar sync.
4. **Email Hub** (`/emails`) — Apollo sequence stats (sent / opened / replied / bounced) plus per-lead email activity feed.
5. **Settings** (`/settings`) — Apollo, Anthropic, Whisper, Google Calendar, user management, and the two-phase lead scoring rules reference.

## Lead Scoring

Two phases, capped at 100:

**Auto score (0-50)**, recalculated on lead create / update:
- Verified email (10), Has website (5), Company size 51+ (10), MSP or ISP category (10), Has responded (15)

**Discovery score (0-50)**, set in the lead detail modal after a discovery call:
- 50+ managed locations (15), Compatible hardware (10), Manages Wi-Fi (10), Decision maker engaged (10), Near-term timeline (5)

## API

All endpoints under `http://localhost:3001/api/`:

- `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`
- `POST /leads/import` — MSP CSV format with merge-by-name+city
- `GET /leads/export/csv`
- `POST /leads/score-all`
- `POST /apollo/enrich/:leadId`, `POST /apollo/enrich-bulk`, `GET /apollo/status`
- `GET /apollo/sequences`, `POST /apollo/push-sequence`, `POST /apollo/sync-emails`
- `GET /stats/overview`, `GET /stats/daily`
- `POST /recordings/upload`, `POST /recordings/:id/transcribe`, `POST /recordings/:id/analyze`
- `GET /calendar/events`, `POST /calendar/events`, OAuth helpers under `/calendar/auth/*`
- `GET/PUT /settings`, `GET/POST /users`

## Pipeline Stages

`new → outreach_sent → responded → discovery_call → technical_review → contract_sent → onboarding → live → dead`
