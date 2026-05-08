/**
 * Helix Lead Scoring Engine
 *
 * Score range: 0-100
 * Scoring factors from spec:
 *   Category Match:    0-20 pts
 *   Google Rating:     0-15 pts
 *   Review Count:      0-15 pts
 *   Has Phone Number:  0-10 pts
 *   Has Website:       0-10 pts
 *   Owner Name Found:  0-10 pts
 *   Engagement:        0-20 pts
 */

const { query } = require('../database/pg');

function calculateScore(lead, engagement = {}) {
  let score = 0;

  if (lead.category) {
    const cat = lead.category.toLowerCase();
    if (cat.includes('bar') || cat.includes('restaurant') || cat.includes('pub') ||
        cat.includes('tavern') || cat.includes('grill') || cat.includes('sports bar')) {
      score += 20;
    } else if (cat.includes('gym') || cat.includes('fitness') || cat.includes('crossfit') ||
               cat.includes('yoga') || cat.includes('martial')) {
      score += 20;
    } else {
      score += 10;
    }
  }

  if (lead.google_rating) {
    if (lead.google_rating >= 4.5) score += 15;
    else if (lead.google_rating >= 4.0) score += 10;
    else if (lead.google_rating >= 3.5) score += 5;
  }

  if (lead.review_count) {
    if (lead.review_count >= 100) score += 15;
    else if (lead.review_count >= 50) score += 10;
    else if (lead.review_count >= 20) score += 5;
  }

  if (lead.phone && lead.phone.trim() !== '') {
    score += 10;
  }

  if (lead.website && lead.website.trim() !== '') {
    score += 10;
  }

  if (lead.owner_name && lead.owner_name.trim() !== '') {
    score += 10;
  }

  return Math.min(100, score);
}

function calculateEngagement(engagement) {
  let maxEngagement = 0;

  if (engagement.callback_requested) {
    maxEngagement = Math.max(maxEngagement, 20);
  }
  if (engagement.email_replied) {
    maxEngagement = Math.max(maxEngagement, 10);
  }
  if (engagement.call_answered) {
    maxEngagement = Math.max(maxEngagement, 10);
  }
  if (engagement.email_opened) {
    maxEngagement = Math.max(maxEngagement, 5);
  }

  return maxEngagement;
}

async function scoreLead(leadId) {
  const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (!lead) return 0;

  // NOTE: call_log and email_log tables were removed in Phase 3 (deprecated features).
  // Engagement queries are stubbed out here to keep this service runnable.
  // Phase 6 will fully rewrite scoring around the new two-phase model
  // (auto_score + discovery_score) using leads.email_status and recordings data.
  const engagement = {
    callback_requested: false,
    call_answered: false,
    email_replied: false,
    email_opened: false,
  };

  const score = calculateScore(lead, engagement);

  await query("UPDATE leads SET lead_score = $1, updated_at = NOW() WHERE id = $2", [score, leadId]);

  return score;
}

async function scoreAllLeads() {
  const { rows: leads } = await query('SELECT id FROM leads');
  let updated = 0;

  for (const lead of leads) {
    await scoreLead(lead.id);
    updated++;
  }

  return { updated, total: leads.length };
}

module.exports = {
  calculateScore,
  scoreLead,
  scoreAllLeads
};
