require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve recorded audio files statically
app.use('/recordings', express.static(path.join(__dirname, 'recordings')));

// Auth routes (no auth middleware — login/logout are public)
const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

// All routes below require authentication
app.use('/api', requireAuth);

// Route imports
const leadsRouter = require('./routes/leads');
const statsRouter = require('./routes/stats');
const settingsRouter = require('./routes/settings');
const recordingsRouter = require('./routes/recordings');
const calendarRouter = require('./routes/calendar');
const usersRouter = require('./routes/users');
const apolloRouter = require('./routes/apollo');

// Mount routes (all protected by requireAuth via the app.use above)
app.use('/api/leads', leadsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/settings', requireAdmin, settingsRouter);
app.use('/api/recordings', recordingsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/users', usersRouter);
app.use('/api/apollo', apolloRouter);

// Production: serve frontend static build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Start server (no more SQLite init needed — PostgreSQL connects on demand via pool)
app.listen(PORT, () => {
  console.log(`Helix API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
