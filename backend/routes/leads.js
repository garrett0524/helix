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

    const { rows: calls } = await query('SELECT * FROM call_log WHERE lead_id = $1 ORDER BY created_at DESC', [lead.id]);
    const { rows: emails } = await query('SELECT * FROM email_log WHERE lead_id = $1 ORDER BY sent_at DESC', [lead.id]);
    const { rows: outreach } = await query('SELECT * FROM outreach_queue WHERE lead_id = $1 ORDER BY created_at DESC', [lead.id]);

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
      'enriched_at', 'email_status', 'instantly_campaign_id', 'last_email_at'
    ];

    const updates = [];
    const params = [];
    let paramIdx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
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

// POST /api/leads/import - Bulk CSV import (admin only)
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file provided' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf-8');
    const records = parseCSV(csvContent);

    if (records.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const row = records[i];

        // Support both TesseraFlow and Apollo CSV column names
        const lead = {
          business_name: row.business_name || row.name || row.businessname || row.name_for_emails || row.company || row.company_name || null,
          category: row.category || row.type || row.subtypes || null,
          address: row.address || row.full_address || row.street || null,
          city: row.city || row.town || null,
          state: row.state || row.state_code || 'NY',
          zip: row.zip || row.zipcode || row.postal || row.postal_code || null,
          phone: row.phone || row.phone_number || row.corporate_phone || null,
          website: row.website || row.url || row.company_website || null,
          google_rating: parseFloat(row.google_rating || row.rating) || null,
          review_count: parseInt(row.review_count || row.reviews, 10) || 0,
          place_id: row.place_id || row.placeid || null,
          owner_name: row.owner_name || row.owner || row.contact || row.owner_title || null,
          // Apollo-specific fields
          email: row.email || row.email_address || null,
          contact_name: row.contact_name || (row.first_name && row.last_name ? `${row.first_name} ${row.last_name}`.trim() : null) || row.name || null,
          contact_title: row.contact_title || row.title || null,
          direct_phone: row.direct_phone || row.mobile_phone || row.personal_phone || null,
        };

        if (!lead.business_name) {
          skipped++;
          continue;
        }

        if (lead.state && lead.state.length > 2) {
          if (row.state_code && row.state_code.length === 2) {
            lead.state = row.state_code;
          }
        }

        // Check for existing lead by place_id OR by business_name + city (for Apollo merge)
        let existingId = null;
        if (lead.place_id) {
          const { rows: [existing] } = await query('SELECT id FROM leads WHERE place_id = $1', [lead.place_id]);
          if (existing) existingId = existing.id;
        }
        if (!existingId && lead.business_name && lead.city) {
          const { rows: [existing] } = await query(
            'SELECT id FROM leads WHERE LOWER(business_name) = LOWER($1) AND LOWER(city) = LOWER($2) LIMIT 1',
            [lead.business_name, lead.city]
          );
          if (existing) existingId = existing.id;
        }

        if (existingId) {
          // Update existing lead with new email/contact info (merge)
          const updateFields = [];
          const updateParams = [];
          let pIdx = 1;
          if (lead.email) { updateFields.push(`email = $${pIdx++}`); updateParams.push(lead.email); }
          if (lead.contact_name) { updateFields.push(`contact_name = $${pIdx++}`); updateParams.push(lead.contact_name); }
          if (lead.contact_title) { updateFields.push(`contact_title = $${pIdx++}`); updateParams.push(lead.contact_title); }
          if (lead.direct_phone) { updateFields.push(`direct_phone = $${pIdx++}`); updateParams.push(lead.direct_phone); }
          if (lead.phone && !lead.direct_phone) { updateFields.push(`phone = $${pIdx++}`); updateParams.push(lead.phone); }
          if (updateFields.length > 0) {
            updateFields.push('updated_at = NOW()');
            updateParams.push(existingId);
            await query(`UPDATE leads SET ${updateFields.join(', ')} WHERE id = $${pIdx}`, updateParams);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        const { rows: [inserted] } = await query(
          `INSERT INTO leads (business_name, category, address, city, state, zip,
            phone, website, google_rating, review_count, place_id, owner_name,
            email, contact_name, contact_title, direct_phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id`,
          [
            lead.business_name, lead.category, lead.address, lead.city,
            lead.state, lead.zip, lead.phone, lead.website,
            lead.google_rating, lead.review_count, lead.place_id, lead.owner_name,
            lead.email, lead.contact_name, lead.contact_title, lead.direct_phone
          ]
        );

        if (inserted) await scoreLead(inserted.id);
        imported++;
      } catch (rowErr) {
        if (rowErr.message && rowErr.message.includes('unique')) {
          skipped++;
        } else {
          errors.push({ line: i + 2, error: String(rowErr.message || rowErr) });
        }
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      message: 'Import complete',
      imported,
      updated,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10)
    });
  } catch (err) {
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
    res.setHeader('Content-Disposition', 'attachment; filename=tesseraflow-leads.csv');
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

/**
 * Auto-create calendar events when a lead's pipeline stage changes.
 */
async function autoCreateCalendarFromStageChange(leadId, lead, newStage, notes) {
  const businessName = lead.business_name || 'Unknown';
  const category = (lead.category || '').toLowerCase();
  const isGym = category.includes('gym') || category.includes('fitness') || category.includes('crossfit') || category.includes('yoga');
  const now = new Date();

  if (newStage === 'meeting_booked') {
    const nextBiz = getNextBusinessDay(now);
    const eventDate = formatDate(nextBiz);

    await query(
      `INSERT INTO calendar_events (lead_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, 'site_visit', $2, $3, $4, '10:00', 30, true)`,
      [
        leadId,
        `Site Visit: ${businessName}`,
        `Auto-created when lead moved to Meeting Booked stage. Please confirm date/time with lead.`,
        eventDate,
      ]
    );
    console.log(`Calendar: Created site visit event for ${businessName} on ${eventDate}`);
  }

  if (newStage === 'contacted') {
    const notesLower = (notes || '').toLowerCase();
    if (notesLower.includes('call back') || notesLower.includes('callback')) {
      const nextBiz = getNextBusinessDay(now);
      const eventDate = formatDate(nextBiz);
      const eventTime = isGym ? '10:00' : '14:00';

      await query(
        `INSERT INTO calendar_events (lead_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
         VALUES ($1, 'callback', $2, $3, $4, $5, 15, true)`,
        [
          leadId,
          `Callback: ${businessName}`,
          'Auto-created when lead moved to Contacted stage with callback mention in notes.',
          eventDate,
          eventTime,
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
