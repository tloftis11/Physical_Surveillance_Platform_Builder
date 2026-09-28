require('dotenv').config();

const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PACKS, getPack } = require('./packs');

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set. /api/interview-turn will fail until it is.');
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const app = express();
app.set('trust proxy', true); // Render sits behind a proxy — needed for real req.ip
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Minimal in-memory rate limiter (per IP) ─────────────────────────────
// Not bulletproof (resets on redeploy, one process only) but keeps a public
// URL from running up API costs unattended. Replace with a real store
// (Redis, Render Postgres) before this sees serious traffic.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 40;
const hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (hits.get(ip) || []).filter(t => t > windowStart);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT_MAX;
}

// Spec generation now does a web search round-trip before the structured
// call, which costs more (tokens + Anthropic's per-search fee) than a plain
// interview turn — hold it to a tighter budget.
const SPEC_RATE_LIMIT_MAX = 15;
const specHits = new Map();

function specRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const arr = (specHits.get(ip) || []).filter(t => t > windowStart);
  arr.push(now);
  specHits.set(ip, arr);
  return arr.length > SPEC_RATE_LIMIT_MAX;
}

// ── Structured output contract (forced tool call) ───────────────────────
const INTERVIEW_TOOL = {
  name: 'record_interview_turn',
  description: 'Record this turn of the deployment setup interview.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'What to say to the user this turn — 2-4 sentences, one question at a time.' },
      stage: { type: 'string', enum: ['framing', 'inventory', 'gaps', 'autonomy', 'summary'] },
      assetsFound: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            mappedType: { type: 'string' },
            category: { type: 'string', enum: ['existingFeeds', 'deployedSensingKit', 'custom'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            manufacturer: { type: 'string', description: 'Physical/hardware assets only — the maker/vendor name, if known.' },
            model: { type: 'string', description: 'Physical/hardware assets only — the specific model or product name, if known.' },
            details: { type: 'string', description: 'Physical/hardware assets only — deployment location, sampling frequency, known output format, or other relevant notes.' }
          },
          required: ['description', 'category', 'confidence']
        }
      },
      gapsFound: { type: 'array', items: { type: 'string' } },
      autonomySet: {
        type: 'object',
        description: 'Map of exact autonomy-tier action label -> confirmed tier number (0-3).',
        additionalProperties: { type: 'number' }
      },
      manifestReady: { type: 'boolean' },
      manifestSummary: {
        type: ['object', 'null'],
        description: 'Only when manifestReady is true: { pack, scope, assets, gaps, autonomy, outputs }.'
      }
    },
    required: ['reply', 'stage', 'assetsFound', 'gapsFound', 'autonomySet', 'manifestReady']
  }
};

function buildSystemPrompt(pack, state) {
  const packSummary = {
    name: pack.name,
    deploymentMode: pack.deploymentMode,
    description: pack.description,
    missionOutcomes: pack.missionOutcomes,
    assetTypes: pack.assetTypes,
    scenarioLibrary: pack.scenarioLibrary,
    autonomyTiers: pack.autonomyTiers,
    gapChecklist: pack.gapChecklist
  };

  return `You are the Builder Agent for a platform that assembles custom health-event-surveillance deployments from reusable "mission packs." You are guiding someone through setting up a deployment of the "${pack.name}" mission pack. Speak directly to them, warmly and concisely (2-4 sentences per turn), and ask exactly one question at a time. Never show them raw JSON or mention "stages" by name. Always respond by calling the record_interview_turn tool — never reply in plain text.

MISSION PACK (for your reference only — never dump this at the user):
${JSON.stringify(packSummary)}

INTERVIEW STAGES, IN ORDER — move forward only, never re-ask something already answered:
1. framing — confirm what they're monitoring, the jurisdiction/venue, and the timeframe, referencing the pack's mission outcomes in your own words.
2. inventory — ask what assets/data sources they already have. For each one they describe, try to match it to one of the pack's existingFeeds or deployedSensingKit entries (mappedType = that entry's exact text, category = "existingFeeds" or "deployedSensingKit"). If nothing matches, record category "custom". For any PHYSICAL/hardware asset (deployedSensingKit or custom hardware — not existingFeeds, which are named data systems, not devices), before finalizing it ask for the manufacturer and model, plus any other relevant detail (deployment location, sampling frequency, known output format). Record what they know in manufacturer/model/details — if they don't know the manufacturer or model, that's fine, record what's given and move on; never block progress waiting on it. Aim to record at least 2-3 assets before moving on.
3. gaps — compare everything recorded so far against the pack's gapChecklist and scenarioLibrary. Raise ONE relevant thing not yet mentioned and ask if they want to include it now or defer it. Record their answer (even "defer this") as one string in gapsFound.
4. autonomy — walk through the pack's autonomyTiers, a couple at a time. State the pack's default tier number and a one-line reason, ask if they want to keep or change it (0=fully autonomous,1=autonomous+notify,2=recommend+require approval,3=advisory only). Record confirmed choices in autonomySet using the EXACT action label as the key.
5. summary — once framing is confirmed, at least 2 assets are recorded, at least one gap has been addressed, and ALL of the pack's autonomyTiers keys have a confirmed value in the running state below, write a short closing message thanking them and set manifestReady=true with a complete manifestSummary object shaped {pack, scope, assets, gaps, autonomy, outputs}.

RUNNING STATE — carry forward, do not contradict or duplicate what's already recorded:
- current stage: ${state.stage}
- assets recorded: ${JSON.stringify(state.assets)}
- gaps recorded: ${JSON.stringify(state.gaps)}
- autonomy confirmed: ${JSON.stringify(state.autonomy)}

Leave assetsFound/gapsFound as [] and autonomySet as {} on turns with nothing new to add.`;
}

// ── Phase 3: connector spec generation for one physical asset ───────────
// Two calls: (1) an open web-search research pass grounded in real vendor
// documentation, (2) a forced-tool call that turns that research into the
// structured spec. Keeping these separate avoids forcing tool_choice onto
// the structured tool while search is still meant to run freely.
const SPEC_TOOL = {
  name: 'generate_asset_spec',
  description: 'Produce a draft connector specification for one physical sensing asset, grounded in the web research provided.',
  input_schema: {
    type: 'object',
    properties: {
      recognized: { type: 'boolean', description: 'True only if the research actually identified this exact manufacturer/model, not just the general device category.' },
      likelyProtocol: { type: 'string', description: 'The connectivity/comm protocol this device (or this category of device) typically uses — e.g. SDI-12, Modbus RTU, MQTT/JSON telemetry, RS-485, cellular/LTE-M.' },
      likelyDataFormat: { type: 'string', description: 'A plain-English description of the typical output data shape.' },
      sampleFields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            fieldType: { type: 'string' },
            mappedObservationField: { type: 'string', description: 'Which canonical Observation field this maps to: timestamp, location, signal_type, payload, or confidence.' },
            notes: { type: 'string' }
          },
          required: ['name', 'mappedObservationField']
        }
      },
      mappingConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      verificationNeeded: { type: 'string', description: 'What to confirm against real device/vendor documentation before this goes live, even after the research pass.' },
      sources: { type: 'array', items: { type: 'string' }, description: 'URLs the research pass actually found and used, if any.' },
      notes: { type: 'string' }
    },
    required: ['recognized', 'likelyProtocol', 'likelyDataFormat', 'sampleFields', 'mappingConfidence', 'verificationNeeded']
  }
};

async function researchAsset({ assetDescription, manufacturer, model, details }) {
  const query = [manufacturer, model, assetDescription].filter(Boolean).join(' ');
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: 'You are researching a physical sensor/instrument for a data-integration spec. Use web search to find real, current vendor documentation for the exact manufacturer and model given, if any is specified. Look specifically for: the device\'s connectivity/communication protocol (e.g. SDI-12, Modbus, MQTT, RS-485, cellular telemetry), its typical output data format, and the names of key parameters/fields it reports. If you cannot find the exact model, search for the general category of instrument instead and say so explicitly. Report what you actually found vs. what you are inferring generally, and list the URLs of anything you used.',
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
    messages: [{
      role: 'user',
      content: `Research this asset for a connector spec:\n- Description: ${assetDescription}\n- Manufacturer: ${manufacturer || 'not given'}\n- Model: ${model || 'not given'}\n- Other details: ${details || 'none given'}\n\nSummarize: connectivity protocol, output data format, key reported fields/parameters, and cite sources you actually used.`
    }]
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const sources = [];
  response.content.forEach(b => {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      b.content.forEach(r => { if (r.url) sources.push(r.url); });
    }
  });
  return { text: text || 'Web search returned no usable summary.', sources: [...new Set(sources)] };
}

function buildSpecPrompt({ assetDescription, category, manufacturer, model, details, sampleData, research }) {
  return `You are generating a DRAFT connector specification for one physical sensing asset in a health-event-surveillance deployment, to be reviewed by an engineer before anything is built.

ASSET
- Description: ${assetDescription}
- Category: ${category || 'unspecified'}
- Manufacturer: ${manufacturer || 'not specified'}
- Model: ${model || 'not specified'}
- Other details: ${details || 'none given'}
${sampleData
  ? `- A real sample of this asset's output data was provided:\n${String(sampleData).slice(0, 4000)}\n\nBase your field mapping on this actual sample wherever possible, above general knowledge or research.`
  : ''}

WEB RESEARCH FINDINGS (treat as your primary source of truth over general/trained knowledge):
${research && research.text ? research.text : 'No research findings available — infer from general knowledge of this manufacturer/model, or, if unrecognized, this category of instrument.'}
${research && research.sources && research.sources.length ? `\nSources found: ${research.sources.join(', ')}` : ''}

Canonical Observation schema this maps into: {timestamp, location, signal_type, payload, confidence}.

Be honest about uncertainty: set recognized=false and lower mappingConfidence if the research above did not actually identify this exact manufacturer/model — give your best general answer for this CATEGORY of device instead, and say so plainly in notes. Never fabricate confident specifics for a device the research didn't actually confirm. Populate sources with the URLs given above, if any.

Respond by calling the generate_asset_spec tool only.`;
}

// ── Routes ───────────────────────────────────────────────────────────────
app.get('/api/packs', (req, res) => {
  res.json(PACKS);
});

app.post('/api/generate-asset-spec', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (specRateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many spec requests — wait a few minutes and try again.' });
  }

  const { assetDescription, category, manufacturer, model, details, sampleData } = req.body || {};
  if (!assetDescription) {
    return res.status(400).json({ error: 'invalid_request', message: 'assetDescription is required.' });
  }

  try {
    const research = await researchAsset({ assetDescription, manufacturer, model, details });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSpecPrompt({ assetDescription, category, manufacturer, model, details, sampleData, research }),
      tools: [SPEC_TOOL],
      tool_choice: { type: 'tool', name: 'generate_asset_spec' },
      messages: [{ role: 'user', content: 'Generate the spec from the research above.' }]
    });

    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse) {
      return res.status(502).json({ error: 'upstream_error', message: 'No structured reply came back.' });
    }
    res.json(toolUse.input);
  } catch (err) {
    console.error('generate-asset-spec error:', err);
    const status = err && err.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'rate_limited' : 'upstream_error',
      message: err && err.message ? err.message : 'Something went wrong reaching Claude.'
    });
  }
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.post('/api/interview-turn', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many requests — wait a few minutes and try again.' });
  }

  const { packId, isSessionStart, state, history, userMessage } = req.body || {};
  const pack = getPack(packId);
  if (!pack) {
    return res.status(400).json({ error: 'invalid_request', message: 'Unknown packId.' });
  }
  const safeState = state || { stage: 'framing', assets: [], gaps: [], autonomy: {} };
  const safeHistory = Array.isArray(history) ? history : [];

  const messages = isSessionStart
    ? [{ role: 'user', content: 'Begin the interview.' }]
    : [...safeHistory, { role: 'user', content: String(userMessage || '') }];

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: buildSystemPrompt(pack, safeState),
      tools: [INTERVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'record_interview_turn' },
      messages
    });

    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse) {
      return res.status(502).json({ error: 'upstream_error', message: 'No structured reply came back.' });
    }
    res.json(toolUse.input);
  } catch (err) {
    console.error('interview-turn error:', err);
    const status = err && err.status === 429 ? 429 : 500;
    res.status(status).json({
      error: status === 429 ? 'rate_limited' : 'upstream_error',
      message: err && err.message ? err.message : 'Something went wrong reaching Claude.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`mission-builder listening on port ${PORT}`);
});
