/**
 * Retell AI Integration Service
 *
 * TODO: Replace stub functions with real Retell AI API calls
 * API Docs: https://docs.retellai.com/
 */

const { query } = require('../database/pg');

async function getApiKey() {
  const { rows: [setting] } = await query("SELECT value FROM settings WHERE key = 'retell_api_key'");
  return setting?.value || null;
}

async function makeCall({ phone, businessName, ownerName }) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    return {
      retell_call_id: `mock_${Date.now()}`,
      status: 'completed',
      duration_seconds: Math.floor(Math.random() * 180) + 30,
      outcome: ['interested', 'not_interested', 'voicemail', 'no_answer', 'callback'][Math.floor(Math.random() * 5)],
      transcript: generateMockTranscript(businessName, ownerName),
      recording_url: null,
      cost: parseFloat((Math.random() * 0.50 + 0.10).toFixed(2))
    };
  }

  // TODO: Real Retell AI API call
  return { retell_call_id: `mock_${Date.now()}`, status: 'mock' };
}

async function getCallStatus(callId) {
  return { call_id: callId, status: 'completed' };
}

function generateMockTranscript(businessName, ownerName) {
  const owner = ownerName || 'the owner';
  return `AI: Hi, good afternoon! Is this ${businessName}?
Business: Yes it is, how can I help you?
AI: Great! I'm calling because we're working with businesses on Long Island to help them earn passive monthly income from their existing Wi-Fi network. Is ${owner} available?
Business: Speaking. What's this about?
AI: Perfect! So we install a small device that connects to your Wi-Fi, it offloads mobile carrier data through a network called Helium, and we pay you a monthly rental fee. No cost to you, takes about 20 minutes to install.
Business: Hmm, that sounds interesting. What's the catch?
AI: No catch at all! The device is about the size of a small router, just needs a power outlet and ethernet connection. We handle everything - the install, the maintenance, and you get paid monthly.
Business: How much are we talking?
AI: It varies by location and traffic, but businesses typically see between $50 to $200 per month. My partner Garrett handles all the details and installs personally. Can I have him give you a quick 5-minute call this week?
Business: Sure, that sounds fine. How about Thursday afternoon?
AI: Thursday afternoon works great! I'll have Garrett reach out to you then. Thanks for your time!`;
}

module.exports = {
  makeCall,
  getCallStatus
};
