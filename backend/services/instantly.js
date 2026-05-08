/**
 * Instantly.ai Integration Service
 *
 * Uses the Instantly.ai API v2 to manage email campaigns, accounts, and warmup.
 */

const { query } = require('../database/pg');

const INSTANTLY_BASE = 'https://api.instantly.ai';

async function getApiKey() {
  const { rows: [setting] } = await query("SELECT value FROM settings WHERE key = 'instantly_api_key'");
  return setting?.value || null;
}

async function instantlyFetch(path, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Instantly.ai API key not configured. Add it in Settings.');
  }

  const url = `${INSTANTLY_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Instantly API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

const CAMPAIGN_STATUS_MAP = {
  0: 'draft',
  1: 'active',
  2: 'paused',
  3: 'completed',
};

const WARMUP_STATUS_MAP = {
  0: 'paused',
  1: 'active',
  2: 'banned',
};

const ACCOUNT_STATUS_MAP = {
  1: 'active',
  2: 'paused',
  3: 'maintenance',
  '-1': 'connection_error',
  '-2': 'smtp_error',
};

async function sendEmail({ to, subject, body, account_id }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      message_id: `mock_email_${Date.now()}`,
      status: 'sent',
      sent_at: new Date().toISOString()
    };
  }

  const result = await instantlyFetch('/api/v2/emails/test', {
    method: 'POST',
    body: JSON.stringify({ account_id, to, subject, body }),
  });

  return {
    message_id: result.id || `instantly_${Date.now()}`,
    status: 'sent',
    sent_at: new Date().toISOString(),
    raw: result,
  };
}

async function getSequenceStatus() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { sequences: [], error: 'no_api_key' };
  }

  try {
    const campaigns = await instantlyFetch('/api/v2/campaigns');
    const campaignList = Array.isArray(campaigns) ? campaigns : (campaigns.data || campaigns.items || []);

    if (campaignList.length === 0) {
      return { sequences: [] };
    }

    let analyticsMap = {};
    try {
      const analytics = await instantlyFetch('/api/v2/campaigns/analytics');
      const analyticsList = Array.isArray(analytics) ? analytics : (analytics.data || []);
      for (const a of analyticsList) {
        if (a.campaign_id || a.id) {
          analyticsMap[a.campaign_id || a.id] = a;
        }
      }
    } catch (analyticsErr) {
      console.warn('Failed to fetch campaign analytics:', analyticsErr.message);
    }

    const sequences = campaignList.map(campaign => {
      const a = analyticsMap[campaign.id] || {};
      const stepCount = campaign.sequences?.[0]?.steps?.length || 0;
      const statusLabel = CAMPAIGN_STATUS_MAP[campaign.status] || 'unknown';

      return {
        id: campaign.id,
        name: campaign.name,
        status: statusLabel,
        total_leads: a.total_leads || a.leads_count || 0,
        steps: stepCount,
        emails_sent: a.emails_sent || a.sent || 0,
        emails_opened: a.emails_opened || a.opened || 0,
        emails_replied: a.emails_replied || a.replied || 0,
        emails_bounced: a.emails_bounced || a.bounced || 0,
      };
    });

    return { sequences };
  } catch (err) {
    console.error('Failed to fetch Instantly campaigns:', err.message);
    return { sequences: [], error: err.message };
  }
}

async function getDomainHealth() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { domains: [], error: 'no_api_key' };
  }

  try {
    const accounts = await instantlyFetch('/api/v2/accounts');
    const accountList = Array.isArray(accounts) ? accounts : (accounts.data || accounts.items || []);

    if (accountList.length === 0) {
      return { domains: [] };
    }

    const domains = accountList.map(account => {
      const email = account.email || '';
      const domain = email.includes('@') ? email.split('@')[1] : email;
      const warmupStatusCode = account.warmup_status;
      const warmupLabel = WARMUP_STATUS_MAP[warmupStatusCode] || 'unknown';
      const accountStatusCode = account.status;
      const accountLabel = ACCOUNT_STATUS_MAP[accountStatusCode] || 'unknown';
      const health = account.stat_warmup_score != null ? Math.round(account.stat_warmup_score) : 0;

      let daysWarming = 0;
      if (account.timestamp_warmup_start) {
        const startDate = new Date(account.timestamp_warmup_start);
        const now = new Date();
        daysWarming = Math.max(0, Math.floor((now - startDate) / (1000 * 60 * 60 * 24)));
      }

      const dailyLimit = account.warmup?.limit || account.daily_limit || 0;

      let displayStatus;
      if (warmupLabel === 'active') displayStatus = 'warming';
      else if (accountLabel === 'active' && warmupLabel !== 'active') displayStatus = 'active';
      else if (warmupLabel === 'banned') displayStatus = 'banned';
      else if (accountLabel === 'paused') displayStatus = 'paused';
      else if (accountLabel === 'connection_error' || accountLabel === 'smtp_error') displayStatus = 'error';
      else displayStatus = 'pending';

      return {
        email, domain, status: displayStatus, account_status: accountLabel,
        warmup_status: warmupLabel, health, days_warming: daysWarming, daily_limit: dailyLimit,
      };
    });

    return { domains };
  } catch (err) {
    console.error('Failed to fetch Instantly accounts:', err.message);
    return { domains: [], error: err.message };
  }
}

async function getAnalyticsOverview() {
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  try {
    const data = await instantlyFetch('/api/v2/campaigns/analytics/overview');
    return data;
  } catch (err) {
    console.error('Failed to fetch Instantly analytics overview:', err.message);
    return null;
  }
}

module.exports = {
  sendEmail,
  getSequenceStatus,
  getDomainHealth,
  getAnalyticsOverview,
};
