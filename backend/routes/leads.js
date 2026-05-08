const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../database/pg');
const { scoreLead, scoreAllLeads } = require('../services/scoring');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for CSV upload
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'data', 'uploads'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// GET /api/leads - List all leads with filters
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (req.query.category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(req.query.category);
    }
    if (req.query.stage) {
      sql += ` AND pipeline_stage = $${paramIdx++}`;
      params.push(req.query.stage);
    }
    if (req.query.score_min) {
      sql += ` AND lead_score >= $${paramIdx++}`;
      params.push(Number(req.query.score_min));
    }
    if (req.query.score_max) {
      sql += ` AND lead_score <= $${paramIdx++}`;
      params.push(Number(req.query.score_max));
    }
    if (req.query.date_from) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(req.query.date_to);
    }
    if (req.query.search) {
      sql += ` AND (business_name ILIKE $${paramIdx} OR address ILIKE $${paramIdx} OR owner_name ILIKE $${paramIdx})`;
      params.push(`%${req.query.search}%`);
      paramIdx++;
    }
    if (req.query.email_status) {
      if (req.query.email_status === 'none') {
        sql += ` AND (email_status IS NULL OR email_status = '')`;
      } else {
        sql += ` AND email_status = $${paramIdx++}`;
        params.push(req.query.email_status);
      }
    }
    if (req.query.apollo_sequence_id) {
      sql += ` AND apollo_sequence_id = $${paramIdx++}`;
      params.push(req.query.apollo_sequence_id);
    }

    sql += ' ORDER BY created_at DESC';

    if (req.query.limit) {
      sql += ` LIMIT $${paramIdx++}`;
      params.push(Number(req.query.limit));
    }
    if (req.query.offset) {
      sql += ` OFFSET $${paramIdx++}`;
      params.push(Number(req.query.offset));
    }

    const { rows: leads } = await query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    let countIdx = 1;
    if (req.query.category) {
      countSql += ` AND category = $${countIdx++}`;
      countParams.push(req.query.category);
    }
    if (req.query.stage) {
      countSql += ` AND pipeline_stage = $${countIdx++}`;
      countParams.push(req.query.stage);
    }
    if (req.query.email_status) {
      if (req.query.email_status === 'none') {
        countSql += ` AND (email_status IS NULL OR email_status = '')`;
      } else {
        countSql += ` AND email_status = $${countIdx++}`;
        countParams.push(req.query.email_status);
      }
    }
    if (req.query.apollo_sequence_id) {
      countSql += ` AND apollo_sequence_id = $${countIdx++}`;
      countParams.push(req.query.apollo_sequence_id);
    }
    const { rows: [countResult] } = await query(countSql, countParams);

    res.json({
      data: leads,
      total: countResult ? parseInt(countResult.total) : leads.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads', message: err.message });
  }
});

// GET /api/leads/:id - Single lead detail
router.get('/:id', async (req, res) => {
  try {
    const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [Number(req.params.id)]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // NOTE: call_log, email_log, and outreach_queue tables were removed in Phase 3.
    // Returning empty arrays for backwards-compat with the frontend until Phase 8
    // rewrites the lead detail modal around the MSP profile + Post-Discovery cards.
    const calls = [];
    const emails = [];
    const outreach = [];

    res.json({ data: { ...lead, calls, emails, outreach } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lead', message: err.message });
  }
});

// POST /api/leads - Create a new lead
router.post('/', async (req, res) => {
  try {
    const {
      business_name, category, address, city, state, zip,
      phone, website, google_rating, review_count, place_id,
      owner_name, pipeline_stage, lead_score, notes
    } = req.body;

    if (!business_name) {
      return res.status(400).json({ error: 'business_name is required' });
    }

    const { rows: [newRow] } = await query(
      `INSERT INTO leads (business_name, category, address, city, state, zip,
        phone, website, google_rating, review_count, place_id, owner_name,
        pipeline_stage, lead_score, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        business_name, category || null, address || null, city || null,
        state || 'NY', zip || null, phone || null, website || null,
        google_rating || null, review_count || 0, place_id || null,
        owner_name || null, pipeline_stage || 'new', lead_score || 0,
        notes || null
      ]
    );

    // Auto-calculate lead score
    await scoreLead(newRow.id);

    const { rows: [newLead] } = await query('SELECT * FROM leads WHERE id = $1', [newRow.id]);
    res.status(201).json({ data: newLead });
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      return res.status(409).json({ error: 'Lead with this place_id already exists' });
    }
    res.status(500).json({ error: 'Failed to create lead', message: err.message });
  }
});

// PUT /api/leads/:id - Update a lead
router.put('/:id', async (req, res) => {
  try {
    const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [Number(req.params.id)]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const fields = [
      'business_name', 'category', 'address', 'city', 'state', 'zip',
      'phone', 'website', 'google_rating', 'review_count', 'place_id',
      'owner_name', 'pipeline_stage', 'lead_score', 'contact_attempts',
      'last_contact_date', 'last_contact_method', 'notes',
      'email', 'contact_name', 'contact_title', 'direct_phone', 'apollo_id',
      'enriched_at', 'email_status', 'instantly_campaign_id', 'last_email_at',
      // Phase 6: MSP profile + Post-Discovery fields
      'estimated_locations', 'hardware_vendors', 'manages_wifi',
      'geographic_reach', 'company_size', 'discovery_score',
      'compatible_hardware', 'deployment_timeline', 'apollo_sequence_id',
      'auto_score', 'decision_maker_engaged'
    ];

    // Fields that, when changed, require re-scoring the lead.
    const SCORING_FIELDS = new Set([
      'email', 'website', 'company_size', 'category', 'email_status',
      'pipeline_stage', 'discovery_score'
    ]);

    const updates = [];
    const params = [];
    let paramIdx = 1;
    let scoringFieldChanged = false;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
        if (SCORING_FIELDS.has(field)) scoringFieldChanged = true;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(Number(req.params.id));

    await query(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

    // Auto-create calendar events when pipeline stage changes
    const newStage = req.body.pipeline_stage;
    const oldStage = lead.pipeline_stage;
    if (newStage && newStage !== oldStage) {
      try {
        await autoCreateCalendarFromStageChange(Number(req.params.id), lead, newStage, req.body.notes || lead.notes);
      } catch (calErr) {
        console.error('Calendar auto-creation from stage change failed:', calErr.message);
      }
    }

    // Re-score the lead if any scoring-relevant field changed.
    // The client may explicitly send lead_score (e.g. on a manual override),
    // so only auto-rescore if lead_score was NOT in the request body.
    if (scoringFieldChanged && req.body.lead_score === undefined) {
      try {
        await scoreLead(Number(req.params.id));
      } catch (scoreErr) {
        console.error('scoreLead after PUT failed:', scoreErr.message);
      }
    }

    const { rows: [updatedLead] } = await query('SELECT * FROM leads WHERE id = $1', [Number(req.params.id)]);
    res.json({ data: updatedLead });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead', message: err.message });
  }
});

// DELETE /api/leads/:id - Delete a lead (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [Number(req.params.id)]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await query('DELETE FROM leads WHERE id = $1', [Number(req.params.id)]);
    res.json({ message: 'Lead deleted', data: lead });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead', message: err.message });
  }
});

/**
 * Resolve MSP CSV columns from a normalized header row (lowercase, alphanumeric+underscore only).
 * Matches the spec aliases case-insensitively. Returns a lead object with
 * null for missing fields. Returns null if business_name cannot be resolved.
 */
function resolveMspRow(row) {
  // Helper that picks the first non-empty value across alias keys.
  const pick = (...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
    return null;
  };

  const business_name = pick('company_name', 'business_name', 'name', 'businessname', 'company');
  if (!business_name) return null;

  // Contact name: prefer contact_name, else concat first_name + last_name.
  let contact_name = pick('contact_name');
  if (!contact_name) {
    const first = pick('first_name', 'firstname');
    const last = pick('last_name', 'lastname');
    if (first || last) contact_name = `${first || ''} ${last || ''}`.trim();
  }

  // Category normalization to canonical MSP set.
  const category = normalizeCategory(pick('category', 'type'));

  // estimated_locations / company_size are typed columns.
  const estLocRaw = pick('estimated_locations');
  const estimated_locations = estLocRaw !== null
    ? (Number.isFinite(parseInt(estLocRaw, 10)) ? parseInt(estLocRaw, 10) : null)
    : null;

  return {
    business_name,
    category,
    website: pick('website', 'url', 'company_website'),
    city: pick('city', 'town'),
    state: pick('state', 'state_code'),
    phone: pick('phone', 'phone_number', 'corporate_phone'),
    email: pick('email', 'email_address'),
    contact_name,
    contact_title: pick('contact_title', 'title'),
    company_size: pick('company_size', 'employees'),
    estimated_locations,
  };
}

/**
 * Normalize a free-form category string into one of the canonical MSP buckets:
 * ISP | MSP | IT Services | WISP | Enterprise IT. Returns the original string
 * (trimmed) if no match — preserves data we don't recognize rather than dropping it.
 */
function normalizeCategory(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (lower === 'wisp' || lower.includes('wireless isp') || lower.includes('wireless internet')) return 'WISP';
  if (lower === 'isp' || lower.includes('internet service provider') || lower.includes('internet provider')) return 'ISP';
  if (lower === 'msp' || lower.includes('managed service') || lower.includes('managed services provider')) return 'MSP';
  if (lower.includes('enterprise it') || lower.includes('enterprise i.t')) return 'Enterprise IT';
  if (lower.includes('it service') || lower.includes('it support') || lower.includes('it consult') || lower === 'it') return 'IT Services';
  return s;
}

// POST /api/leads/import - Bulk CSV import (admin only)
// MSP CSV format with header alias resolution + merge-by-(business_name, city).
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  let tempPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }
    tempPath = req.file.path;

    const csvContent = fs.readFileSync(tempPath, 'utf-8');
    const records = parseCSV(csvContent);

    if (records.length === 0) {
      fs.unlinkSync(tempPath);
      tempPath = null;
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const affectedIds = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const lead = resolveMspRow(records[i]);
        if (!lead || !lead.business_name) {
          skipped++;
          continue;
        }

        // Merge lookup: business_name + city, case-insensitive.
        let existingId = null;
        if (lead.city) {
          const { rows: [existing] } = await query(
            'SELECT id FROM leads WHERE LOWER(business_name) = LOWER($1) AND LOWER(city) = LOWER($2) LIMIT 1',
            [lead.business_name, lead.city]
          );
          if (existing) existingId = existing.id;
        } else {
          // No city in row: only merge if there's exactly one existing lead by name (and no city set on it).
          const { rows: [existing] } = await query(
            "SELECT id FROM leads WHERE LOWER(business_name) = LOWER($1) AND (city IS NULL OR city = '') LIMIT 1",
            [lead.business_name]
          );
          if (existing) existingId = existing.id;
        }

        if (existingId) {
          // UPDATE: only set fields that are non-null in the CSV row (preserve existing values).
          const updateFields = [];
          const updateParams = [];
          let pIdx = 1;
          const setIfPresent = (col, val) => {
            if (val === null || val === undefined || val === '') return;
            updateFields.push(`${col} = $${pIdx++}`);
            updateParams.push(val);
          };
          setIfPresent('category', lead.category);
          setIfPresent('website', lead.website);
          setIfPresent('city', lead.city);
          setIfPresent('state', lead.state);
          setIfPresent('phone', lead.phone);
          setIfPresent('email', lead.email);
          setIfPresent('contact_name', lead.contact_name);
          setIfPresent('contact_title', lead.contact_title);
          setIfPresent('company_size', lead.company_size);
          if (lead.estimated_locations !== null && lead.estimated_locations !== undefined) {
            updateFields.push(`estimated_locations = $${pIdx++}`);
            updateParams.push(lead.estimated_locations);
          }

          if (updateFields.length === 0) {
            skipped++;
            continue;
          }
          updateFields.push('updated_at = NOW()');
          updateParams.push(existingId);
          await query(
            `UPDATE leads SET ${updateFields.join(', ')} WHERE id = $${pIdx}`,
            updateParams
          );
          updated++;
          affectedIds.push(existingId);
        } else {
          // INSERT
          const { rows: [newRow] } = await query(
            `INSERT INTO leads (
               business_name, category, website, city, state, phone, email,
               contact_name, contact_title, company_size, estimated_locations
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
              lead.business_name,
              lead.category,
              lead.website,
              lead.city,
              lead.state,
              lead.phone,
              lead.email,
              lead.contact_name,
              lead.contact_title,
              lead.company_size,
              lead.estimated_locations,
            ]
          );
          inserted++;
          if (newRow) affectedIds.push(newRow.id);
        }
      } catch (rowErr) {
        if (rowErr.message && rowErr.message.includes('unique')) {
          skipped++;
        } else {
          errors.push({ line: i + 2, error: String(rowErr.message || rowErr) });
        }
      }
    }

    // Score every affected lead (best-effort; one failure shouldn't abort the response).
    for (const id of affectedIds) {
      try {
        await scoreLead(id);
      } catch (scoreErr) {
        console.error(`scoreLead(${id}) failed during CSV import:`, scoreErr.message);
      }
    }

    fs.unlinkSync(tempPath);
    tempPath = null;

    const total = records.length;
    res.json({
      inserted,
      updated,
      skipped,
      total,
      // Diagnostic extras (not part of the spec contract but useful for ops).
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
    });
  } catch (err) {
    if (tempPath) {
      try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
    }
    res.status(500).json({ error: 'Import failed', message: err.message });
  }
});

// GET /api/leads/export/csv - Export leads as CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { rows: leads } = await query('SELECT * FROM leads ORDER BY created_at DESC');

    const headers = [
      'id', 'business_name', 'category', 'address', 'city', 'state', 'zip',
      'phone', 'website', 'google_rating', 'review_count', 'place_id',
      'owner_name', 'pipeline_stage', 'lead_score', 'contact_attempts',
      'last_contact_date', 'last_contact_method', 'notes',
      'email', 'contact_name', 'contact_title', 'direct_phone', 'email_status',
      'created_at'
    ];

    let csv = headers.join(',') + '\n';
    for (const lead of leads) {
      const row = headers.map(h => {
        const val = lead[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      });
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=helix-leads.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed', message: err.message });
  }
});

// POST /api/leads/rescore - Bulk re-score all leads (admin only)
router.post('/rescore', requireAdmin, async (req, res) => {
  try {
    const result = await scoreAllLeads();
    res.json({ message: `Re-scored ${result.updated} leads`, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Re-scoring failed', message: err.message });
  }
});

// POST /api/leads/score-all - Trigger two-phase rescoring for every lead.
// Alias of /rescore aligned with the Phase 6 spec naming.
router.post('/score-all', requireAdmin, async (req, res) => {
  try {
    const result = await scoreAllLeads();
    res.json({ message: `Scored ${result.updated} leads`, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Scoring failed', message: err.message });
  }
});

/**
 * Auto-create calendar events when a lead's pipeline stage changes.
 */
async function autoCreateCalendarFromStageChange(leadId, lead, newStage, notes) {
  const businessName = lead.business_name || 'Unknown';
  const now = new Date();

  if (newStage === 'discovery_call') {
    const nextBiz = getNextBusinessDay(now);
    const eventDate = formatDate(nextBiz);

    await query(
      `INSERT INTO calendar_events (lead_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, 'site_visit', $2, $3, $4, '14:00', 30, true)`,
      [
        leadId,
        `Discovery Call: ${businessName}`,
        `Auto-created when lead moved to Discovery Call stage. Please confirm date/time with lead.`,
        eventDate,
      ]
    );
    console.log(`Calendar: Created discovery call event for ${businessName} on ${eventDate}`);
  }

  if (newStage === 'outreach_sent') {
    const notesLower = (notes || '').toLowerCase();
    if (notesLower.includes('call back') || notesLower.includes('callback')) {
      const nextBiz = getNextBusinessDay(now);
      const eventDate = formatDate(nextBiz);

      await query(
        `INSERT INTO calendar_events (lead_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
         VALUES ($1, 'callback', $2, $3, $4, '14:00', 15, true)`,
        [
          leadId,
          `Callback: ${businessName}`,
          'Auto-created when lead moved to Outreach Sent stage with callback mention in notes.',
          eventDate,
        ]
      );
      console.log(`Calendar: Created callback event for ${businessName} on ${eventDate}`);
    }
  }
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

/**
 * RFC 4180-compliant CSV parser
 */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let i = 0;
  const len = text.length;

  function parseField() {
    if (i >= len) return '';

    if (text[i] === '"') {
      i++;
      let field = '';
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += text[i];
          i++;
        }
      }
      return field;
    }

    let field = '';
    while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
      field += text[i];
      i++;
    }
    return field;
  }

  function parseRow() {
    const fields = [];
    while (i < len) {
      fields.push(parseField());

      if (i >= len) break;
      if (text[i] === ',') {
        i++;
      } else {
        if (text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        break;
      }
    }
    return fields;
  }

  const headers = parseRow().map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));

  while (i < len) {
    if (text[i] === '\n' || text[i] === '\r') {
      if (text[i] === '\r') i++;
      if (i < len && text[i] === '\n') i++;
      continue;
    }
    const values = parseRow();
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = (idx < values.length && values[idx] !== '') ? values[idx] : null;
    });
    rows.push(obj);
  }

  return rows;
}

module.exports = router;
