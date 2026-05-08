/**
 * Helix Two-Phase Lead Scoring Engine (Phase 6 / TASK-21)
 *
 * Total lead_score = auto_score (Phase 1, 0-50) + discovery_score (Phase 2, 0-50)
 * capped at 100. discovery_score is computed by the frontend (TASK-20) and stored
 * directly on the leads table. This service owns auto_score and the rollup.
 *
 * Phase 1 (auto_score, 0-50):
 *   - Has email                                                    +10
 *   - Has website                                                  +5
 *   - Company size 51+ ('51-200' or '200+')                        +10
 *   - Category is MSP or ISP                                       +10
 *   - Has responded (email_status='replied' OR pipeline_stage in
 *     responded/discovery_call/technical_review/contract_sent/
 *     onboarding/live)                                             +15
 *
 * Phase 2 (discovery_score) is owned by the Lead Detail Modal and persisted
 * in leads.discovery_score. This service simply reads the column and adds it
 * into the lead_score rollup.
 *
 * NOTE: The legacy call_log and email_log tables were removed in Phase 3.
 * Engagement signal now comes exclusively from leads.email_status and
 * leads.pipeline_stage. Do NOT query call_log or email_log here.
 */

const { query } = require('../database/pg');

const RESPONDED_STAGES = new Set([
  'responded',
  'discovery_call',
  'technical_review',
  'contract_sent',
  'onboarding',
  'live',
]);

const LARGE_COMPANY_SIZES = new Set(['51-200', '200+']);
const PRIORITY_CATEGORIES = new Set(['MSP', 'ISP']);

/**
 * Compute the Phase 1 auto score (0-50) from a lead row.
 * Pure function; safe to call without a DB round-trip.
 */
function calculateAutoScore(lead) {
  if (!lead) return 0;
  let score = 0;

  if (lead.email && String(lead.email).trim() !== '') {
    score += 10;
  }

  if (lead.website && String(lead.website).trim() !== '') {
    score += 5;
  }

  if (lead.company_size && LARGE_COMPANY_SIZES.has(lead.company_size)) {
    score += 10;
  }

  if (lead.category && PRIORITY_CATEGORIES.has(lead.category)) {
    score += 10;
  }

  const responded =
    lead.email_status === 'replied' ||
    (lead.pipeline_stage && RESPONDED_STAGES.has(lead.pipeline_stage));
  if (responded) {
    score += 15;
  }

  return Math.min(50, score);
}

/**
 * Backwards-compat shim. Old callers expected calculateScore(lead) to return a
 * 0-100 number. The two-phase model splits this into auto + discovery; this
 * helper returns the rollup so legacy import paths keep working.
 */
function calculateScore(lead) {
  if (!lead) return 0;
  const autoScore = calculateAutoScore(lead);
  const discoveryScore = Number(lead.discovery_score || 0);
  return Math.min(100, autoScore + discoveryScore);
}

/**
 * Score one lead: recompute auto_score, then write auto_score + lead_score
 * (auto + discovery, capped at 100). Returns the new total lead_score.
 */
async function scoreLead(leadId) {
  const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (!lead) return 0;

  const autoScore = calculateAutoScore(lead);
  const discoveryScore = Number(lead.discovery_score || 0);
  const totalScore = Math.min(100, autoScore + discoveryScore);

  await query(
    'UPDATE leads SET auto_score = $1, lead_score = $2, updated_at = NOW() WHERE id = $3',
    [autoScore, totalScore, leadId]
  );

  return totalScore;
}

/**
 * Re-score every lead in the table. Returns { updated, total }.
 */
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
  calculateAutoScore,
  calculateScore,
  scoreLead,
  scoreAllLeads,
};
