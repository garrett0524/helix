/**
 * Apollo.io Integration Service
 *
 * Enriches leads with contact information (name, email, title, phone)
 * using Apollo's People Search API. Supports single and bulk enrichment.
 *
 * Nginx note: if proxying to this backend, add these timeouts to your
 * location block to avoid gateway timeouts during bulk enrichment:
 *
 *   proxy_read_timeout    120s;
 *   proxy_connect_timeout 120s;
 *   proxy_send_timeout    120s;
 */

const { query } = require('../database/pg');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const FETCH_TIMEOUT_MS = 30_000; // 30 seconds per API call
const BATCH_SIZE = 5;            // leads per batch (reduced for rate limits)
const BATCH_DELAY_MS = 3_000;    // 3 seconds between batches
const RATE_LIMIT_WAIT_MS = 60_000; // 60 seconds on 429
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getApiKey() {
  const { rows: [setting] } = await query(
    "SELECT value FROM settings WHERE key = 'apollo_api_key'"
  );
  const key = setting?.value;
  if (!key) {
    throw new Error(
      'Apollo API key not configured. Add it in Settings > Integrations.'
    );
  }
  return key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper around fetch with a 30-second AbortController timeout.
 * Throws a clean error message on timeout instead of hanging.
 */
async function apolloFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Apollo API request timed out after 30 seconds. Try again later.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * apolloFetch with automatic 429 retry. Waits 60s then retries up to MAX_RETRIES times.
 */
async function apolloFetchWithRetry(url, options = {}) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await apolloFetch(url, options);

    if (response.status === 429) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Apollo] Rate limited (429). Waiting ${RATE_LIMIT_WAIT_MS / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await sleep(RATE_LIMIT_WAIT_MS);
        continue;
      }
      console.error('[Apollo] Rate limited (429) after all retries.');
    }

    return response;
  }
}

/**
 * Extract a bare domain from a website URL.
 * "https://www.joesbar.com/menu" → "joesbar.com"
 */
function extractDomain(website) {
  if (!website) return null;
  try {
    let url = website.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extract the best person from an Apollo people array.
 */
function pickBestPerson(people) {
  if (!people || people.length === 0) return null;
  return people[0];
}

// ---------------------------------------------------------------------------
// Search strategies (each returns an array of people or [])
// ---------------------------------------------------------------------------

async function searchByName(apiKey, lead) {
  const response = await apolloFetchWithRetry(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_name: lead.business_name,
      person_locations: [`${lead.city || 'New York'}, New York`],
      person_titles: ['owner', 'general manager', 'manager', 'proprietor', 'partner'],
      page: 1,
      per_page: 5,
    }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.people || [];
}

async function searchByDomain(apiKey, lead) {
  const domain = extractDomain(lead.website);
  if (!domain) return [];

  const response = await apolloFetchWithRetry(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      person_locations: [`${lead.city || 'New York'}, New York`],
      page: 1,
      per_page: 5,
    }),
  });

  if (!response.ok) return [];
  const data = await response.json();
  return data.people || [];
}

async function searchByOrgEnrichment(apiKey, lead) {
  const domain = extractDomain(lead.website);
  const orgBody = domain
    ? { domain }
    : { name: lead.business_name };

  const orgResponse = await apolloFetchWithRetry(`${APOLLO_BASE}/organizations/enrich`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(orgBody),
  });

  if (!orgResponse.ok) return [];
  const orgData = await orgResponse.json();
  const org = orgData.organization;
  if (!org || !org.id) return [];

  const peopleResponse = await apolloFetchWithRetry(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({
      organization_ids: [org.id],
      page: 1,
      per_page: 5,
    }),
  });

  if (!peopleResponse.ok) return [];
  const peopleData = await peopleResponse.json();
  return peopleData.people || [];
}

// ---------------------------------------------------------------------------
// revealPerson – spend 1 credit to reveal email/phone for a known person
// ---------------------------------------------------------------------------

/**
 * Tries people/match first (with api_key in body AND header).
 * If that fails (400), falls back to people/enrich.
 * Costs 1 Apollo credit per successful call.
 */
async function revealPerson(apiKey, person) {
  if (!person || !person.id) return person;

  // Attempt 1: POST /people/match (api_key in both header and body)
  try {
    const response = await apolloFetchWithRetry(`${APOLLO_BASE}/people/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        api_key: apiKey,
        id: person.id,
        reveal_personal_emails: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const revealed = data.person || data;
      console.log(`[Apollo] Reveal via people/match succeeded for person ${person.id}: email=${revealed.email || 'none'}`);
      return {
        ...person,
        email: revealed.email || person.email || null,
        direct_phone: revealed.direct_phone || person.direct_phone || null,
        mobile_phone: revealed.mobile_phone || person.mobile_phone || null,
        personal_emails: revealed.personal_emails || person.personal_emails || [],
      };
    }

    // Log detailed error for debugging
    const errBody = await response.text();
    console.error(`[Apollo] people/match failed for person ${person.id} (${response.status}): ${errBody}`);
  } catch (err) {
    console.error(`[Apollo] people/match error for person ${person.id}:`, err.message);
  }

  // Attempt 2: Fallback to POST /people/enrich
  try {
    console.log(`[Apollo] Trying fallback people/enrich for person ${person.id}...`);
    const response = await apolloFetchWithRetry(`${APOLLO_BASE}/people/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        api_key: apiKey,
        id: person.id,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const revealed = data.person || data;
      console.log(`[Apollo] Reveal via people/enrich succeeded for person ${person.id}: email=${revealed.email || 'none'}`);
      return {
        ...person,
        email: revealed.email || person.email || null,
        direct_phone: revealed.direct_phone || person.direct_phone || null,
        mobile_phone: revealed.mobile_phone || person.mobile_phone || null,
        personal_emails: revealed.personal_emails || person.personal_emails || [],
      };
    }

    const errBody = await response.text();
    console.error(`[Apollo] people/enrich also failed for person ${person.id} (${response.status}): ${errBody}`);
  } catch (err) {
    console.error(`[Apollo] people/enrich error for person ${person.id}:`, err.message);
  }

  // Both failed — return original person unchanged
  return person;
}

// ---------------------------------------------------------------------------
// enrichLead – single lead enrichment with fallback strategies + reveal
// ---------------------------------------------------------------------------

/**
 * @param {number} leadId
 * @param {object} [options]
 * @param {boolean} [options.skipReveal=false] - If true, skip the paid reveal step
 */
async function enrichLead(leadId, { skipReveal = false } = {}) {
  const apiKey = await getApiKey();

  const { rows: [lead] } = await query(
    'SELECT id, business_name, city, address, website FROM leads WHERE id = $1',
    [leadId]
  );

  if (!lead) {
    throw new Error(`Lead with id ${leadId} not found.`);
  }

  console.log(`[Apollo] Enriching lead ${leadId}: "${lead.business_name}" (${lead.city || 'no city'})`);

  // Try strategies in order: name search → domain search → org enrichment
  let people = await searchByName(apiKey, lead);

  if (people.length === 0) {
    people = await searchByDomain(apiKey, lead);
  }

  if (people.length === 0) {
    people = await searchByOrgEnrichment(apiKey, lead);
  }

  let person = pickBestPerson(people);

  if (!person) {
    console.log(`[Apollo] No person found for lead ${leadId}`);
    return { found: false, leadId, credits_used: 0 };
  }

  console.log(`[Apollo] Found person for lead ${leadId}: ${person.first_name} ${person.last_name}, email=${person.email || 'NONE'}, title=${person.title || 'none'}`);

  // If search found a person but no email, reveal it (costs 1 credit)
  let creditsUsed = 0;
  const hasEmail = person.email && person.email.trim() !== '';

  if (!hasEmail && !skipReveal) {
    person = await revealPerson(apiKey, person);
    creditsUsed = 1;
  }

  const contactName = [person.first_name, person.last_name]
    .filter(Boolean)
    .join(' ') || null;
  const contactEmail = person.email
    || (person.personal_emails && person.personal_emails[0])
    || null;
  const contactTitle = person.title || null;
  const contactPhone = person.direct_phone || person.mobile_phone || null;
  const apolloId = person.id || null;

  // Log exactly what we're about to write to the DB
  console.log(`[Apollo] Saving to DB for lead ${leadId}: email=${contactEmail}, contact_name=${contactName}, contact_title=${contactTitle}, direct_phone=${contactPhone}, apollo_id=${apolloId}`);

  const updateResult = await query(
    `UPDATE leads
        SET email         = COALESCE($1, email),
            contact_name  = COALESCE($2, contact_name),
            contact_title = COALESCE($3, contact_title),
            direct_phone  = COALESCE($4, direct_phone),
            apollo_id     = $5,
            enriched_at   = NOW(),
            updated_at    = NOW()
      WHERE id = $6
      RETURNING *`,
    [contactEmail, contactName, contactTitle, contactPhone, apolloId, leadId]
  );

  const updated = updateResult.rows[0];

  if (!updated) {
    console.error(`[Apollo] UPDATE returned no rows for lead ${leadId}! The lead may have been deleted.`);
    return { found: true, leadId, credits_used: creditsUsed, db_saved: false };
  }

  console.log(`[Apollo] DB updated for lead ${leadId}: email=${updated.email}, contact_name=${updated.contact_name}, contact_title=${updated.contact_title}, rowCount=${updateResult.rowCount}`);

  return {
    found: true,
    leadId,
    contact_name: contactName,
    email: contactEmail,
    contact_title: contactTitle,
    direct_phone: contactPhone,
    apollo_id: apolloId,
    credits_used: creditsUsed,
    db_saved: true,
    lead: updated,
  };
}

// ---------------------------------------------------------------------------
// enrichBulk – batch enrichment with rate-limit pacing
// ---------------------------------------------------------------------------

/**
 * @param {object}   options
 * @param {number[]} [options.leadIds]    - Explicit list of lead IDs to enrich
 * @param {string}   [options.filter]     - "no_email" | "high_score"
 * @param {boolean}  [options.dryRun=false] - If true, return a preview only
 * @param {function} [options.onProgress] - Called after each lead with current stats
 */
async function enrichBulk({ leadIds, filter, dryRun = false, onProgress } = {}) {
  await getApiKey();

  let leads;

  if (leadIds && leadIds.length > 0) {
    const { rows } = await query(
      'SELECT id, email FROM leads WHERE id = ANY($1) ORDER BY id',
      [leadIds]
    );
    leads = rows;
  } else if (filter === 'no_email') {
    const { rows } = await query(
      "SELECT id, email FROM leads WHERE email IS NULL OR email = '' ORDER BY id"
    );
    leads = rows;
  } else if (filter === 'high_score') {
    const { rows } = await query(
      "SELECT id, email FROM leads WHERE lead_score >= 70 AND (email IS NULL OR email = '') ORDER BY id"
    );
    leads = rows;
  } else {
    throw new Error(
      'enrichBulk requires either a leadIds array or a filter ("no_email" | "high_score").'
    );
  }

  const needsEnrichment = leads.filter(l => !l.email || l.email.trim() === '');
  const alreadyHadEmail = leads.length - needsEnrichment.length;

  // Dry-run mode: return a preview without calling Apollo
  if (dryRun) {
    return {
      dry_run: true,
      total_leads: leads.length,
      needs_enrichment: needsEnrichment.length,
      already_had_email: alreadyHadEmail,
      max_credits: needsEnrichment.length,
      message: `Will attempt to enrich ${needsEnrichment.length} leads. Up to ${needsEnrichment.length} Apollo credits may be used for email reveals.`,
    };
  }

  console.log(`[Apollo] Bulk enrichment starting: ${needsEnrichment.length} leads to process (batch size ${BATCH_SIZE}, ${BATCH_DELAY_MS / 1000}s delay)`);

  const stats = { completed: 0, enriched: 0, not_found: 0, already_had_email: alreadyHadEmail, errors: 0, credits_used: 0 };

  for (let i = 0; i < needsEnrichment.length; i += BATCH_SIZE) {
    if (i > 0) {
      await sleep(BATCH_DELAY_MS);
    }

    const batch = needsEnrichment.slice(i, i + BATCH_SIZE);

    for (const lead of batch) {
      try {
        const result = await enrichLead(lead.id);
        if (result.found) {
          stats.enriched++;
          stats.credits_used += result.credits_used || 0;
        } else {
          stats.not_found++;
        }
      } catch (err) {
        console.error(`[Apollo] Bulk error for lead ${lead.id}:`, err.message);
        stats.errors++;
      }

      stats.completed++;
      if (onProgress) onProgress(stats);
    }

    console.log(`[Apollo] Bulk progress: ${stats.completed}/${needsEnrichment.length} processed, ${stats.credits_used} credits used so far`);
  }

  console.log(`[Apollo] Bulk enrichment complete: ${stats.enriched} enriched, ${stats.not_found} not found, ${stats.errors} errors, ${stats.credits_used} credits used`);

  return stats;
}

// ---------------------------------------------------------------------------
// checkStatus – validate Apollo API key
// ---------------------------------------------------------------------------

async function checkStatus() {
  let apiKey;
  try {
    apiKey = await getApiKey();
  } catch {
    return { valid: false, message: 'Apollo API key is not configured.' };
  }

  try {
    const response = await apolloFetch(`${APOLLO_BASE}/mixed_people/api_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        q_organization_name: 'Apollo.io',
        page: 1,
        per_page: 1,
      }),
    });

    if (response.ok) {
      return { valid: true, message: 'Apollo API key is valid and working.' };
    }

    const errorBody = await response.text();
    return {
      valid: false,
      message: `Apollo API returned ${response.status}: ${errorBody}`,
    };
  } catch (err) {
    return {
      valid: false,
      message: `Failed to reach Apollo API: ${err.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  enrichLead,
  enrichBulk,
  checkStatus,
};
