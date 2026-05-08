/**
 * Instantly.ai Email Status Sync Service (v2 API)
 *
 * Syncs email statuses from Instantly campaigns back to TesseraFlow leads.
 * Handles both manual sync and webhook-based real-time updates.
 * API key passed via Authorization header (Bearer token).
 */

const { query } = require('../database/pg');

const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2';

async function getApiKey() {
  const { rows: [setting] } = await query("SELECT value FROM settings WHERE key = 'instantly_api_key'");
  return setting?.value || null;
}

/**
 * Sync email statuses from Instantly for all leads that have been pushed to a campaign.
 * v2: GET /leads?campaign_id=X&email=Y
 */
async function syncEmailStatuses() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Instantly.ai API key not configured.');
  }

  // Get all leads that have been pushed to a campaign
  const { rows: leads } = await query(
    "SELECT id, email, instantly_campaign_id, email_status, pipeline_stage FROM leads WHERE instantly_campaign_id IS NOT NULL AND email IS NOT NULL AND email != ''"
  );

  const stats = { synced: 0, updated: 0, errors: 0 };

  for (const lead of leads) {
    try {
      const url = `${INSTANTLY_BASE}/leads?campaign_id=${encodeURIComponent(lead.instantly_campaign_id)}&email=${encodeURIComponent(lead.email)}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      if (!response.ok) {
        stats.errors++;
        continue;
      }

      const data = await response.json();
      // v2 may return { items: [...] } or a single lead object
      const leadData = data.items?.[0] || data;
      stats.synced++;

      // Determine new status from Instantly data
      let newStatus = lead.email_status;
      if (leadData.replied || leadData.has_replied) {
        newStatus = 'replied';
      } else if (leadData.bounced || leadData.has_bounced) {
        newStatus = 'bounced';
      } else if (leadData.opened || leadData.has_opened) {
        newStatus = 'opened';
      } else if (leadData.sent || leadData.email_sent) {
        newStatus = 'sent';
      }

      if (newStatus !== lead.email_status) {
        const updates = [`email_status = $1`, `updated_at = NOW()`];
        const params = [newStatus];
        let paramIdx = 2;

        // Auto-update pipeline stage when replied
        if (newStatus === 'replied' && (lead.pipeline_stage === 'new' || lead.pipeline_stage === 'contacted')) {
          updates.push(`pipeline_stage = $${paramIdx++}`);
          params.push('interested');
        }

        params.push(lead.id);
        await query(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
        stats.updated++;
      }
    } catch (err) {
      console.error(`Instantly sync error for lead ${lead.id}:`, err.message);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Handle incoming Instantly webhook events.
 */
async function handleWebhook(payload) {
  if (!payload || !payload.email) {
    return { processed: false, reason: 'No email in payload' };
  }

  const eventType = payload.event_type || payload.event || '';
  const email = payload.email;

  // Find lead by email
  const { rows: [lead] } = await query(
    'SELECT id, email_status, pipeline_stage FROM leads WHERE email = $1',
    [email]
  );

  if (!lead) {
    return { processed: false, reason: 'Lead not found for email' };
  }

  let newStatus = lead.email_status;

  if (eventType.includes('replied') || eventType.includes('reply')) {
    newStatus = 'replied';
  } else if (eventType.includes('bounced') || eventType.includes('bounce')) {
    newStatus = 'bounced';
  } else if (eventType.includes('opened') || eventType.includes('open')) {
    newStatus = 'opened';
  } else if (eventType.includes('sent')) {
    newStatus = 'sent';
  }

  if (newStatus !== lead.email_status) {
    const updates = [`email_status = $1`, `updated_at = NOW()`];
    const params = [newStatus];
    let paramIdx = 2;

    // Auto-update pipeline stage when replied (align with manual sync logic)
    if (newStatus === 'replied' && (lead.pipeline_stage === 'new' || lead.pipeline_stage === 'contacted')) {
      updates.push(`pipeline_stage = $${paramIdx++}`);
      params.push('interested');
    }

    params.push(lead.id);
    await query(`UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
  }

  return { processed: true, lead_id: lead.id, new_status: newStatus };
}

module.exports = {
  syncEmailStatuses,
  handleWebhook,
};
