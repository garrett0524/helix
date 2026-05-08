/**
 * AI Analysis Service
 *
 * Uses the Anthropic API (Claude) to analyze meeting transcripts.
 * Extracts MSP/ISP discovery context: locations, hardware, key people,
 * concerns, next steps, deal potential, and pipeline-stage suggestions.
 */

const { query } = require('../database/pg');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const SYSTEM_PROMPT = 'You are a JSON-only response bot. Respond with ONLY a valid JSON object. No preamble, no markdown backticks, no explanation before or after. Start your response with { and end with }.';

function extractJSON(raw) {
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error(`No JSON object found in response: ${raw.substring(0, 200)}`);
  }
  const jsonStr = raw.substring(first, last + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e.message} — raw response: ${raw.substring(0, 200)}`);
  }
}

const MODEL_MAP = {
  'haiku': 'claude-haiku-4-5-20251001',
  'sonnet': 'claude-sonnet-4-20250514',
};

async function getApiKey() {
  const { rows: [setting] } = await query('SELECT value FROM settings WHERE key = $1', ['anthropic_api_key']);
  return setting ? setting.value : null;
}

async function getModelId() {
  const { rows: [setting] } = await query('SELECT value FROM settings WHERE key = $1', ['anthropic_model']);
  const choice = setting ? setting.value : 'haiku';
  return MODEL_MAP[choice] || MODEL_MAP['haiku'];
}

async function analyzeTranscript(transcript) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Add it in Settings.');
  }

  const prompt = `Analyze this sales meeting transcript. The Fractals team is discussing Helium Wi-Fi brownfield conversions with an MSP/ISP prospect. Extract the following as JSON:

{
  "summary": "2-3 sentence summary of the meeting",
  "outcome": "interested | needs_more_info | scheduling_next | requesting_contract | not_a_fit | follow_up_needed",
  "msp_details": {
    "locations_discussed": number or null,
    "hardware_mentioned": ["Ubiquiti", "Cisco", etc] or [],
    "manages_wifi": true/false/null,
    "geographic_coverage": "string or null"
  },
  "key_people": [
    { "name": "string", "title": "string", "role_in_decision": "string" }
  ],
  "concerns_raised": ["string"],
  "next_steps": ["string"],
  "timeline_discussed": "string or null",
  "interest_level": 1-10,
  "deal_potential": {
    "estimated_locations": number or null,
    "estimated_value": "string description or null",
    "confidence": "high | medium | low"
  },
  "suggested_stage": "new | outreach_sent | responded | discovery_call | technical_review | contract_sent | onboarding | live | dead",
  "suggested_notes": "notes to add to lead record",
  "follow_up_suggestions": ["specific action items"]
}

Return ONLY valid JSON, no markdown, no code fences. Use null when information is not present in the transcript.

TRANSCRIPT:
${transcript}`;

  const modelId = await getModelId();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const textContent = data.content.find(c => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Anthropic API response');
  }

  return extractJSON(textContent.text);
}

async function generateCoachingReport(recordings) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Add it in Settings.');
  }

  const callSummaries = recordings.map((r, i) => {
    return `Meeting ${i + 1} (${r.created_at}): Outcome=${r.ai_outcome || 'N/A'}\nTranscript excerpt: ${(r.transcript || '').substring(0, 500)}`;
  }).join('\n\n---\n\n');

  const prompt = `You are an expert sales coach analyzing the Fractals team's MSP/ISP discovery meetings about Helium Wi-Fi brownfield conversions. Based on the following meeting data, generate a comprehensive coaching report. Return ONLY valid JSON, no markdown, no code fences.

{
  "top_strengths": ["Top 3 things the team does well consistently"],
  "top_improvements": ["Top 3 areas for improvement"],
  "script_suggestions": ["Suggested talking-track modifications based on what's working"],
  "objection_gaps": ["Recurring concerns that need better responses"],
  "optimal_call_times": "Analysis of meeting timing and engagement patterns",
  "overall_trend": "improving | stable | declining",
  "confidence_assessment": "Assessment of the team's discovery confidence trajectory",
  "next_steps": ["Specific actionable next steps for improvement"]
}

MEETING DATA (${recordings.length} total meetings):
${callSummaries}`;

  const modelId = await getModelId();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const textContent = data.content.find(c => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Anthropic API response');
  }

  return extractJSON(textContent.text);
}

module.exports = {
  analyzeTranscript,
  generateCoachingReport
};
