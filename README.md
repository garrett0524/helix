# TesseraFlow

AI-powered lead aggregation and warm outreach system for DePIN/Wi-Fi offload hardware placement on Long Island, NY.

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+ (optional, for scraper)

### Backend
```bash
cd backend
npm install
npm start
```
Server runs on http://localhost:3001

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs on http://localhost:5173

### Scraper (Optional)
```bash
cd scraper
pip install -r requirements.txt
python google_maps_scraper.py --category restaurants --geography "Long Island, NY"
```

## Architecture

- **Frontend**: React (Vite), dark mode dashboard
- **Backend**: Node.js, Express, SQLite (sql.js)
- **Scraper**: Python script for Google Maps data
- **Integrations**: Retell AI (voice calls), Instantly.ai (email) - configured via Settings page

## Pages

1. **Pipeline** (Home) - Kanban board + filterable lead table + stats
2. **Outreach Queue** - Batch approval for calls and emails
3. **Call Center** - Retell AI call log with transcripts
4. **Email Hub** - Instantly.ai email sequences and domain health
5. **Scraper Control** - Run scrapes and import CSV
6. **Settings** - API keys, scraper config, scoring rules

## API

All endpoints at `http://localhost:3001/api/`:

- `GET/POST /leads` - Lead CRUD
- `GET/PUT/DELETE /leads/:id` - Single lead operations
- `POST /leads/import` - CSV import
- `GET /leads/export/csv` - CSV export
- `POST /leads/rescore` - Bulk re-score all leads
- `GET/POST /outreach/queue` - Outreach queue management
- `PUT /outreach/queue/:id/approve` - Approve single
- `POST /outreach/queue/approve-batch` - Bulk approve
- `GET /calls` - Call history
- `POST /calls/trigger` - Trigger a call (stub)
- `GET /emails` - Email log
- `GET /stats/overview` - Dashboard statistics
- `GET /stats/daily` - Daily activity metrics
- `GET/PUT /settings` - App settings
- `POST /scraper/run` - Run scraper
- `GET /scraper/status` - Scraper status
- `GET /scraper/history` - Scrape history
