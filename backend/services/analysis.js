/**
 * AI Analysis Service
 *
 * Uses the Anthropic API (Claude) to analyze call transcripts.
 * Extracts summary, objections, sentiment, pitch feedback, and scoring.
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

  const prompt = `Analyze this cold call transcript. Garrett sells internet/telecom services to local businesses. The transcript has Speaker 1 and Speaker 2 labels — determine which is Garrett (the salesperson/pitcher) and which is the prospect (business owner/employee) based on context. Return ONLY valid JSON, no markdown, no code fences.

{
  "summary": "2-3 sentence summary of the call",
  "outcome": "interested | not_interested | callback | send_info | wrong_number | no_answer | voicemail",
  "objections": [
    {
      "objection": "The exact objection raised",
      "response_given": "How Garrett responded",
      "effectiveness": "effective | partially_effective | ineffective",
      "suggested_improvement": "A better way to handle this objection"
    }
  ],
  "sentiment": {
    "overall": "positive | neutral | negative",
    "prospect_interest_level": 1-10,
    "garrett_confidence_level": 1-10
  },
  "pitch_feedback": {
    "strengths": ["What Garrett did well"],
    "weaknesses": ["What could be improved"],
    "specific_suggestions": ["Concrete changes to make"]
  },
  "call_quality_score": 0-100,
  "key_info_captured": {
    "owner_name": "Name if mentioned, otherwise null",
    "best_callback_time": "If mentioned, otherwise null",
    "email": "If given, otherwise null",
    "internet_speed": "If discussed, otherwise null",
    "concerns": ["Any specific concerns mentioned"]
  },
  "auto_update": {
    "suggested_stage": "new | contacted | interested | meeting_booked | closed | dead",
    "suggested_notes": "Notes to add to the lead record"
  }
}

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
    return `Call ${i + 1} (${r.created_at}): Score=${r.ai_score || 'N/A'}, Outcome=${r.ai_outcome || 'N/A'}\nTranscript excerpt: ${(r.transcript || '').substring(0, 500)}`;
  }).join('\n\n---\n\n');

  const prompt = `You are an expert sales coach analyzing all of Garrett's cold calls. He sells internet/telecom services to local businesses. Based on the following call data, generate a comprehensive coaching report. Return ONLY valid JSON, no markdown, no code fences.

{
  "top_strengths": ["Top 3 things Garrett does well consistently"],
  "top_improvements": ["Top 3 areas for improvement"],
  "script_suggestions": ["Suggested script modifications based on what's working"],
  "objection_gaps": ["Objections that need better responses"],
  "optimal_call_times": "Analysis of optimal call times based on engagement data",
  "overall_trend": "improving | stable | declining",
  "confidence_assessment": "Assessment of Garrett's confidence trajectory",
  "next_steps": ["Specific actionable next steps for improvement"]
}

CALL DATA (${recordings.length} total calls):
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
