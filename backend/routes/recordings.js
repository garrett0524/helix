const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../database/pg');
const { transcribeAudio } = require('../services/transcription');
const { analyzeTranscript, generateCoachingReport } = require('../services/analysis');

const router = express.Router();

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Configure multer for audio upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, RECORDINGS_DIR);
  },
  filename: (req, file, cb) => {
    const leadId = req.body.lead_id || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `call_${leadId}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|wav|mp3|ogg|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// ============================================================
// IMPORTANT: Specific routes MUST be defined before /:id routes
// ============================================================

// GET /api/recordings - All recordings with lead details (for call log)
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT r.*, l.business_name, l.category, l.phone, l.owner_name
      FROM recordings r
      LEFT JOIN leads l ON r.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (req.query.outcome) {
      sql += ` AND r.ai_outcome = $${paramIdx++}`;
      params.push(req.query.outcome);
    }
    if (req.query.status) {
      sql += ` AND r.status = $${paramIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.date_from) {
      sql += ` AND r.created_at >= $${paramIdx++}`;
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      sql += ` AND r.created_at <= $${paramIdx++}`;
      params.push(req.query.date_to);
    }
    if (req.query.score_min) {
      sql += ` AND r.ai_score >= $${paramIdx++}`;
      params.push(Number(req.query.score_min));
    }
    if (req.query.score_max) {
      sql += ` AND r.ai_score <= $${paramIdx++}`;
      params.push(Number(req.query.score_max));
    }

    sql += ' ORDER BY r.created_at DESC';

    const { rows: recordings } = await query(sql, params);

    for (const r of recordings) {
      r.ai_objections = safeParseJSON(r.ai_objections, []);
      r.ai_sentiment = safeParseJSON(r.ai_sentiment, {});
      r.ai_pitch_feedback = safeParseJSON(r.ai_pitch_feedback, {});
      r.ai_key_info = safeParseJSON(r.ai_key_info, {});
      r.ai_auto_update = safeParseJSON(r.ai_auto_update, {});
    }

    res.json({ data: recordings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recordings', message: err.message });
  }
});

// GET /api/recordings/stats/overview - Aggregate call statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const { rows: [total] } = await query("SELECT COUNT(*) as count FROM recordings WHERE status = 'complete'");
    const { rows: [avgDuration] } = await query("SELECT AVG(duration_seconds) as avg FROM recordings WHERE status = 'complete'");
    const { rows: [avgScore] } = await query("SELECT AVG(ai_score) as avg FROM recordings WHERE ai_score IS NOT NULL");

    const today = new Date().toISOString().split('T')[0];
    const { rows: [todayCalls] } = await query("SELECT COUNT(*) as count FROM recordings WHERE status = 'complete' AND created_at >= $1", [today]);

    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    const weekStart = monday.toISOString().split('T')[0];
    const { rows: [weekCalls] } = await query("SELECT COUNT(*) as count FROM recordings WHERE status = 'complete' AND created_at >= $1", [weekStart]);

    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { rows: [monthCalls] } = await query("SELECT COUNT(*) as count FROM recordings WHERE status = 'complete' AND created_at >= $1", [monthStart]);

    const { rows: outcomes } = await query(
      "SELECT ai_outcome as outcome, COUNT(*) as count FROM recordings WHERE ai_outcome IS NOT NULL GROUP BY ai_outcome ORDER BY count DESC"
    );

    const { rows: [totalWithOutcome] } = await query("SELECT COUNT(*) as count FROM recordings WHERE ai_outcome IS NOT NULL");
    const { rows: [converted] } = await query(
      "SELECT COUNT(*) as count FROM recordings WHERE ai_outcome IN ('interested', 'callback', 'send_info')"
    );
    const conversionRate = totalWithOutcome && parseInt(totalWithOutcome.count) > 0
      ? Math.round((parseInt(converted.count) / parseInt(totalWithOutcome.count)) * 100)
      : 0;

    res.json({
      data: {
        total_calls: total ? parseInt(total.count) : 0,
        avg_duration: avgDuration ? Math.round(parseFloat(avgDuration.avg) || 0) : 0,
        avg_score: avgScore ? Math.round(parseFloat(avgScore.avg) || 0) : 0,
        calls_today: todayCalls ? parseInt(todayCalls.count) : 0,
        calls_this_week: weekCalls ? parseInt(weekCalls.count) : 0,
        calls_this_month: monthCalls ? parseInt(monthCalls.count) : 0,
        conversion_rate: conversionRate,
        outcome_breakdown: outcomes
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
  }
});

// GET /api/recordings/analysis/trends
router.get('/analysis/trends', async (req, res) => {
  try {
    const { rows: scoreHistory } = await query(
      `SELECT DATE(created_at) as date, AVG(ai_score) as avg_score, AVG(duration_seconds) as avg_duration, COUNT(*) as call_count
       FROM recordings
       WHERE ai_score IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    const { rows: recordingsWithObjections } = await query(
      "SELECT ai_objections, ai_sentiment FROM recordings WHERE ai_objections IS NOT NULL AND ai_objections != '[]'"
    );

    const objectionMap = {};
    for (const rec of recordingsWithObjections) {
      const objections = safeParseJSON(rec.ai_objections, []);
      for (const obj of objections) {
        const key = (obj.objection || '').toLowerCase().trim();
        if (!key) continue;
        if (!objectionMap[key]) {
          objectionMap[key] = {
            objection: obj.objection,
            count: 0,
            effective: 0,
            partially_effective: 0,
            ineffective: 0,
            best_response: null,
            suggested_improvements: []
          };
        }
        objectionMap[key].count++;
        if (obj.effectiveness === 'effective') {
          objectionMap[key].effective++;
          objectionMap[key].best_response = obj.response_given;
        } else if (obj.effectiveness === 'partially_effective') {
          objectionMap[key].partially_effective++;
        } else {
          objectionMap[key].ineffective++;
        }
        if (obj.suggested_improvement) {
          objectionMap[key].suggested_improvements.push(obj.suggested_improvement);
        }
      }
    }

    const objectionTrends = Object.values(objectionMap).sort((a, b) => b.count - a.count);

    const { rows: sentimentHistory } = await query(
      "SELECT DATE(created_at) as date, ai_sentiment FROM recordings WHERE ai_sentiment IS NOT NULL"
    );
    const interestByDate = {};
    for (const rec of sentimentHistory) {
      const sentiment = safeParseJSON(rec.ai_sentiment, {});
      if (sentiment.prospect_interest_level) {
        const dateStr = rec.date instanceof Date ? rec.date.toISOString().split('T')[0] : String(rec.date);
        if (!interestByDate[dateStr]) {
          interestByDate[dateStr] = { total: 0, count: 0 };
        }
        interestByDate[dateStr].total += sentiment.prospect_interest_level;
        interestByDate[dateStr].count++;
      }
    }
    const interestHistory = Object.entries(interestByDate).map(([date, data]) => ({
      date,
      avg_interest: Math.round((data.total / data.count) * 10) / 10
    })).sort((a, b) => a.date.localeCompare(b.date));

    const { rows: outcomesByDay } = await query(
      `SELECT DATE(created_at) as date, ai_outcome as outcome, COUNT(*) as count
       FROM recordings
       WHERE ai_outcome IS NOT NULL
       GROUP BY DATE(created_at), ai_outcome
       ORDER BY date ASC`
    );

    res.json({
      data: {
        score_history: scoreHistory,
        objection_trends: objectionTrends,
        interest_history: interestHistory,
        outcomes_by_day: outcomesByDay
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trends', message: err.message });
  }
});

// GET /api/recordings/lead/:lead_id
router.get('/lead/:lead_id', async (req, res) => {
  try {
    const { rows: recordings } = await query(
      `SELECT r.*, l.business_name
       FROM recordings r
       LEFT JOIN leads l ON r.lead_id = l.id
       WHERE r.lead_id = $1
       ORDER BY r.created_at DESC`,
      [Number(req.params.lead_id)]
    );

    for (const r of recordings) {
      r.ai_objections = safeParseJSON(r.ai_objections, []);
      r.ai_sentiment = safeParseJSON(r.ai_sentiment, {});
      r.ai_pitch_feedback = safeParseJSON(r.ai_pitch_feedback, {});
      r.ai_key_info = safeParseJSON(r.ai_key_info, {});
      r.ai_auto_update = safeParseJSON(r.ai_auto_update, {});
    }

    res.json({ data: recordings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recordings', message: err.message });
  }
});

// POST /api/recordings/upload
router.post('/upload', upload.single('audio'), async (req, res) => {
  try {
    const { lead_id } = req.body;
    if (!lead_id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'lead_id is required' });
    }

    const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [Number(lead_id)]);
    if (!lead) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioPath = req.file.path;
    const relativePath = path.relative(path.join(__dirname, '..'), audioPath).replace(/\\/g, '/');

    const { rows: [newRec] } = await query(
      `INSERT INTO recordings (lead_id, user_id, audio_path, status) VALUES ($1, $2, $3, 'transcribing') RETURNING id`,
      [Number(lead_id), req.user ? req.user.id : null, relativePath]
    );
    const recordingId = newRec.id;

    await query(
      "UPDATE leads SET contact_attempts = contact_attempts + 1, last_contact_date = NOW()::text, last_contact_method = 'call', updated_at = NOW() WHERE id = $1",
      [Number(lead_id)]
    );

    const { rows: [recording] } = await query('SELECT * FROM recordings WHERE id = $1', [recordingId]);
    res.status(201).json({ data: recording });

    // Background pipeline
    processPipeline(recordingId, audioPath, Number(lead_id));
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', message: err.message });
  }
});

// POST /api/recordings/coaching
router.post('/coaching', async (req, res) => {
  try {
    const { rows: recordings } = await query(
      "SELECT transcript, ai_score, ai_outcome, created_at FROM recordings WHERE transcript IS NOT NULL AND status = 'complete' ORDER BY created_at DESC LIMIT 50"
    );

    if (recordings.length === 0) {
      return res.status(400).json({ error: 'No completed recordings available for coaching analysis' });
    }

    const report = await generateCoachingReport(recordings);
    res.json({ data: report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate coaching report', message: err.message });
  }
});

// POST /api/recordings/:id/reanalyze
router.post('/:id/reanalyze', async (req, res) => {
  try {
    const { rows: [recording] } = await query('SELECT * FROM recordings WHERE id = $1', [Number(req.params.id)]);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    if (!recording.transcript) {
      return res.status(400).json({ error: 'No transcript available to analyze' });
    }

    // Reset analysis fields and set status to analyzing
    await query(
      `UPDATE recordings SET
        status = 'analyzing',
        error_message = NULL,
        ai_summary = NULL, ai_objections = NULL, ai_sentiment = NULL,
        ai_outcome = NULL, ai_pitch_feedback = NULL, ai_score = NULL,
        ai_key_info = NULL, ai_auto_update = NULL
      WHERE id = $1`,
      [recording.id]
    );

    res.json({ message: 'Reanalysis started' });

    // Run analysis in the background
    try {
      const analysis = await analyzeTranscript(recording.transcript);
      await query(
        `UPDATE recordings SET
          ai_summary = $1, ai_objections = $2, ai_sentiment = $3,
          ai_outcome = $4, ai_pitch_feedback = $5, ai_score = $6,
          ai_key_info = $7, ai_auto_update = $8, status = 'complete', error_message = NULL
        WHERE id = $9`,
        [
          analysis.summary || null,
          JSON.stringify(analysis.objections || []),
          JSON.stringify(analysis.sentiment || {}),
          analysis.outcome || null,
          JSON.stringify(analysis.pitch_feedback || {}),
          analysis.call_quality_score || null,
          JSON.stringify(analysis.key_info_captured || {}),
          JSON.stringify(analysis.auto_update || {}),
          recording.id
        ]
      );
    } catch (err) {
      console.error('Reanalysis failed:', err.message);
      await query(
        "UPDATE recordings SET status = 'complete', error_message = $1 WHERE id = $2",
        [`AI reanalysis failed: ${err.message}`, recording.id]
      );
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to start reanalysis', message: err.message });
  }
});

// POST /api/recordings/:id/apply-suggestions
router.post('/:id/apply-suggestions', async (req, res) => {
  try {
    const { rows: [recording] } = await query('SELECT * FROM recordings WHERE id = $1', [Number(req.params.id)]);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    const autoUpdate = safeParseJSON(recording.ai_auto_update, {});
    if (!autoUpdate.suggested_stage && !autoUpdate.suggested_notes) {
      return res.status(400).json({ error: 'No AI suggestions available for this recording' });
    }

    if (autoUpdate.suggested_stage) {
      await query(
        "UPDATE leads SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2",
        [autoUpdate.suggested_stage, recording.lead_id]
      );
    }

    if (autoUpdate.suggested_notes) {
      const { rows: [lead] } = await query('SELECT notes FROM leads WHERE id = $1', [recording.lead_id]);
      const currentNotes = lead ? (lead.notes || '') : '';
      const newNotes = currentNotes
        ? `${currentNotes}\n\n--- AI Notes (${new Date().toISOString().split('T')[0]}) ---\n${autoUpdate.suggested_notes}`
        : `--- AI Notes (${new Date().toISOString().split('T')[0]}) ---\n${autoUpdate.suggested_notes}`;
      await query(
        "UPDATE leads SET notes = $1, updated_at = NOW() WHERE id = $2",
        [newNotes, recording.lead_id]
      );
    }

    const { rows: [updatedLead] } = await query('SELECT * FROM leads WHERE id = $1', [recording.lead_id]);
    res.json({ message: 'AI suggestions applied', data: updatedLead });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply suggestions', message: err.message });
  }
});

// GET /api/recordings/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: [recording] } = await query(
      `SELECT r.*, l.business_name, l.category, l.phone, l.owner_name
       FROM recordings r
       LEFT JOIN leads l ON r.lead_id = l.id
       WHERE r.id = $1`,
      [Number(req.params.id)]
    );

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    recording.ai_objections = safeParseJSON(recording.ai_objections, []);
    recording.ai_sentiment = safeParseJSON(recording.ai_sentiment, {});
    recording.ai_pitch_feedback = safeParseJSON(recording.ai_pitch_feedback, {});
    recording.ai_key_info = safeParseJSON(recording.ai_key_info, {});
    recording.ai_auto_update = safeParseJSON(recording.ai_auto_update, {});

    res.json({ data: recording });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recording', message: err.message });
  }
});

// ============================================================
// Helper functions
// ============================================================

async function processPipeline(recordingId, audioPath, leadId) {
  try {
    const whisperModel = await getSettingValue('whisper_model_size', 'base');
    let transcriptResult;
    try {
      transcriptResult = await transcribeAudio(audioPath, whisperModel);
    } catch (err) {
      console.error('Transcription failed:', err.message);
      await query(
        "UPDATE recordings SET status = 'error', error_message = $1 WHERE id = $2",
        [`Transcription failed: ${err.message}`, recordingId]
      );
      return;
    }

    await query(
      "UPDATE recordings SET transcript = $1, duration_seconds = $2, status = 'analyzing' WHERE id = $3",
      [transcriptResult.transcript, transcriptResult.duration, recordingId]
    );

    const apiKey = await getSettingValue('anthropic_api_key', '');
    if (!apiKey) {
      await query("UPDATE recordings SET status = 'complete' WHERE id = $1", [recordingId]);
      return;
    }

    try {
      const analysis = await analyzeTranscript(transcriptResult.transcript);

      await query(
        `UPDATE recordings SET
          ai_summary = $1,
          ai_objections = $2,
          ai_sentiment = $3,
          ai_outcome = $4,
          ai_pitch_feedback = $5,
          ai_score = $6,
          ai_key_info = $7,
          ai_auto_update = $8,
          status = 'complete'
        WHERE id = $9`,
        [
          analysis.summary || null,
          JSON.stringify(analysis.objections || []),
          JSON.stringify(analysis.sentiment || {}),
          analysis.outcome || null,
          JSON.stringify(analysis.pitch_feedback || {}),
          analysis.call_quality_score || null,
          JSON.stringify(analysis.key_info_captured || {}),
          JSON.stringify(analysis.auto_update || {}),
          recordingId
        ]
      );

      const autoApply = await getSettingValue('auto_apply_ai_suggestions', 'false');
      if (autoApply === 'true' && analysis.auto_update) {
        if (analysis.auto_update.suggested_stage) {
          await query(
            "UPDATE leads SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2",
            [analysis.auto_update.suggested_stage, leadId]
          );
        }
        if (analysis.auto_update.suggested_notes) {
          const { rows: [existingLead] } = await query('SELECT notes FROM leads WHERE id = $1', [leadId]);
          const currentNotes = existingLead ? (existingLead.notes || '') : '';
          const newNotes = currentNotes
            ? `${currentNotes}\n\n--- AI Notes (${new Date().toISOString().split('T')[0]}) ---\n${analysis.auto_update.suggested_notes}`
            : `--- AI Notes (${new Date().toISOString().split('T')[0]}) ---\n${analysis.auto_update.suggested_notes}`;
          await query(
            "UPDATE leads SET notes = $1, updated_at = NOW() WHERE id = $2",
            [newNotes, leadId]
          );
        }
      }

      try {
        await autoCreateCalendarEvent(analysis, recordingId, leadId);
      } catch (calErr) {
        console.error('Calendar auto-creation failed:', calErr.message);
      }

      if (analysis.key_info_captured && analysis.key_info_captured.email) {
        const { rows: [existingLead] } = await query('SELECT notes FROM leads WHERE id = $1', [leadId]);
        const currentNotes = existingLead ? (existingLead.notes || '') : '';
        if (!currentNotes.includes(analysis.key_info_captured.email)) {
          await query(
            "UPDATE leads SET notes = $1, updated_at = NOW() WHERE id = $2",
            [`${currentNotes}\nEmail captured: ${analysis.key_info_captured.email}`, leadId]
          );
        }
      }

    } catch (err) {
      console.error('AI analysis failed:', err.message);
      await query(
        "UPDATE recordings SET status = 'complete', error_message = $1 WHERE id = $2",
        [`AI analysis failed: ${err.message}`, recordingId]
      );
    }
  } catch (err) {
    console.error('Pipeline error:', err.message);
    await query(
      "UPDATE recordings SET status = 'error', error_message = $1 WHERE id = $2",
      [err.message, recordingId]
    );
  }
}

async function getSettingValue(key, defaultValue) {
  const { rows: [setting] } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return setting ? (setting.value || defaultValue) : defaultValue;
}

async function autoCreateCalendarEvent(analysis, recordingId, leadId) {
  const outcome = analysis.outcome;
  const keyInfo = analysis.key_info_captured || {};

  if (!outcome) return;

  const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  const businessName = lead ? lead.business_name : 'Unknown';
  const category = lead ? (lead.category || '').toLowerCase() : '';
  const isGym = category.includes('gym') || category.includes('fitness') || category.includes('crossfit') || category.includes('yoga');
  const now = new Date();

  if (outcome === 'callback') {
    let eventDate, eventTime;

    if (keyInfo.best_callback_time) {
      const parsed = parseCallbackTime(keyInfo.best_callback_time, now);
      eventDate = parsed.date;
      eventTime = parsed.time;
    } else {
      const nextBiz = getNextBusinessDay(now);
      eventDate = formatDate(nextBiz);
      eventTime = isGym ? '10:00' : '14:00';
    }

    await query(
      `INSERT INTO calendar_events (lead_id, recording_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, $2, 'callback', $3, $4, $5, $6, 15, true)`,
      [
        leadId, recordingId,
        `Callback: ${businessName}`,
        `Auto-created from call analysis. Outcome: callback requested.${keyInfo.best_callback_time ? ' Requested time: ' + keyInfo.best_callback_time : ''}`,
        eventDate, eventTime,
      ]
    );
    console.log(`Calendar: Created callback event for ${businessName} on ${eventDate} at ${eventTime}`);
  }

  if (outcome === 'send_info') {
    const eventDateObj = new Date(now.getTime() + 60 * 60 * 1000);
    const eventDate = formatDate(eventDateObj);
    const eventTime = `${String(eventDateObj.getHours()).padStart(2, '0')}:${String(eventDateObj.getMinutes()).padStart(2, '0')}`;

    await query(
      `INSERT INTO calendar_events (lead_id, recording_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, $2, 'follow_up_email', $3, $4, $5, $6, 15, true)`,
      [
        leadId, recordingId,
        `Send Info: ${businessName}`,
        `Auto-created from call analysis. Lead requested information be sent.${keyInfo.email ? ' Email: ' + keyInfo.email : ''}`,
        eventDate, eventTime,
      ]
    );
    console.log(`Calendar: Created follow-up email event for ${businessName} on ${eventDate} at ${eventTime}`);
  }

  if (outcome === 'interested') {
    const followUpDate = new Date(now);
    followUpDate.setDate(followUpDate.getDate() + 2);
    if (followUpDate.getDay() === 0) followUpDate.setDate(followUpDate.getDate() + 1);
    if (followUpDate.getDay() === 6) followUpDate.setDate(followUpDate.getDate() + 2);

    const eventDate = formatDate(followUpDate);
    const eventTime = isGym ? '10:00' : '14:00';

    await query(
      `INSERT INTO calendar_events (lead_id, recording_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, $2, 'follow_up_call', $3, $4, $5, $6, 15, true)`,
      [
        leadId, recordingId,
        `Follow-Up: ${businessName}`,
        'Auto-created from call analysis. Lead expressed interest, follow up to advance.',
        eventDate, eventTime,
      ]
    );
    console.log(`Calendar: Created follow-up call event for ${businessName} on ${eventDate} at ${eventTime}`);
  }
}

function parseCallbackTime(timeStr, now) {
  const isoMatch = timeStr.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (isoMatch) {
    return {
      date: isoMatch[1],
      time: `${String(isoMatch[2]).padStart(2, '0')}:${isoMatch[3]}`,
    };
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lower = timeStr.toLowerCase();
  let targetDate = new Date(now);

  if (lower.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    for (let i = 0; i < dayNames.length; i++) {
      if (lower.includes(dayNames[i])) {
        const currentDay = targetDate.getDay();
        let daysAhead = i - currentDay;
        if (daysAhead <= 0) daysAhead += 7;
        targetDate.setDate(targetDate.getDate() + daysAhead);
        break;
      }
    }
  }

  let hours = 14;
  let minutes = 0;

  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3] === 'am' && hours === 12) hours = 0;
    if (!timeMatch[3] && hours >= 1 && hours <= 7) hours += 12;
  }

  return {
    date: formatDate(targetDate),
    time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

function getNextBusinessDay(fromDate) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = router;
