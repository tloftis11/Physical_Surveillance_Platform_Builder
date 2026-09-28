// Mission Pack definitions — the reusable template layer.
// Server uses these in full to build prompts; the frontend fetches the same
// data from GET /api/packs to render the library browser, the setup
// interview's pack picker, and the live manifest panel.

const PACKS = [
  {
    id: 'health-event-surveillance',
    name: 'Health Event Surveillance',
    deploymentMode: 'event',
    description: 'A deployable, event-scoped operating layer for mass gatherings and major events — Olympics, championship games, conventions, National Special Security Events. Fuses fragmented public-health signals into a live predictive picture bounded to a specific venue and timeframe, and drives prioritized action rather than another static dashboard.',
    modeNote: 'Stands up before an event, runs for its duration, and is designed to be redeployed at the next one — a reusable capability, not permanent infrastructure.',
    missionOutcomes: [
      { id: 'early-threat-detection', name: 'Early Threat Detection', problem: 'Risk surfaces first as weak, scattered signals — syndromic shifts, pharmacy/OTC demand, wastewater findings, international alerts — before it shows through conventional clinical reporting.', capabilities: ['Multi-signal fusion', 'Lead-signal correlation', 'False-positive suppression', 'Human-in-the-loop validation'], outputs: ['Prioritized early-warning alerts', 'Confidence & evidence trail', 'Recommended escalation path', 'Venue/zone watchlist'] },
      { id: 'venue-crowd-intelligence', name: 'Venue & Crowd Intelligence', problem: 'Event risk isn’t evenly distributed — operators need localized intelligence tied to venues, transit, and time-bound schedules.', capabilities: ['Dynamic geofencing', 'Spatial anomaly detection', 'Crowd-risk overlays', 'Exposure & proximity modeling'], outputs: ['Venue risk heat maps', 'Zone-specific watch briefs', 'Targeted partner notifications'] },
      { id: 'incident-prediction-response', name: 'Incident Prediction & Response', problem: 'Once a signal escalates, the picture must show likely trajectory, impacted locations, and the right response pathway across partners.', capabilities: ['Surge forecasting', 'Scenario simulation', 'Resource optimization', 'Decision playbooks & triggers'], outputs: ['Incident trajectory forecast', 'Resource & staffing recommendations', 'Decision thresholds'] },
      { id: 'common-operating-picture', name: 'Common Operating Picture', problem: 'Federal, state, local, and healthcare partners each see part of the picture with no shared operating view.', capabilities: ['Cross-signal prioritization', 'Data trust & lineage', 'Partner coordination'], outputs: ['Leadership dashboard', 'Action & escalation tracker', 'Reusable modernization blueprint'], integrating: true }
    ],
    ontologyExtensions: ['Health Signal', 'Population & Mobility', 'Venue & Event', 'Threat & Epi Context', 'Healthcare Assets', 'Environmental Context', 'Authority & Action'],
    assetTypes: {
      existingFeeds: ['Syndromic surveillance (NSSP/ESSENCE)', 'Wastewater — community & airport (NWSS/TGS)', 'Pharmacy/OTC demand signals', 'Reportable labs (NEDSS/NBS)', 'International disease alerts (WHO IHR/GDD/EIOS)', 'Vaccination coverage registries', 'Hospital/EMS capacity feeds', 'MCM/SNS inventory', 'Weather & air quality (NWS/AirNow)', 'Aggregate mobility & attendance'],
      deployedSensingKit: ['Venue/sub-sewershed wastewater', 'Bioaerosol/air samplers', 'Environmental & water monitoring (incl. cooling towers)', 'Point-of-care testing', 'Venue environmental sensors (heat, CO2, AQI)']
    },
    scenarioLibrary: [
      { name: 'Respiratory surge / variant early warning', outcomes: ['early-threat-detection'], novelSensing: 'Venue wastewater; indoor CO2/ventilation', readiness: 'mature', readinessNote: 'Pilotable on today’s data — sensing is upside' },
      { name: 'Foodborne / GI cluster at a fan zone', outcomes: ['early-threat-detection', 'venue-crowd-intelligence', 'incident-prediction-response'], novelSensing: 'Venue-level wastewater (norovirus)', readiness: 'mature', readinessNote: 'Pilotable on today’s data — sensing is upside' },
      { name: 'Measles / VPD importation', outcomes: ['early-threat-detection', 'venue-crowd-intelligence', 'incident-prediction-response'], novelSensing: 'None required', readiness: 'mature', readinessNote: 'Pilotable on today’s data' },
      { name: 'Heat illness + crowd-risk overlay', outcomes: ['venue-crowd-intelligence'], novelSensing: 'Venue environmental sensors; crowd-density', readiness: 'emerging', readinessNote: 'Mature → emerging — pilotable, sensing is upside' },
      { name: 'Waterborne / Legionella cluster', outcomes: ['early-threat-detection', 'venue-crowd-intelligence', 'incident-prediction-response'], novelSensing: 'Water-system / cooling-tower monitoring', readiness: 'mature', readinessNote: 'Sensing strengthens it, not required' },
      { name: 'Aerosol / intentional release', outcomes: ['early-threat-detection', 'venue-crowd-intelligence', 'incident-prediction-response'], novelSensing: 'Real-time aerosol pathogen collectors', readiness: 'frontier', readinessNote: 'Sensing required — simulation-only until fielded' },
      { name: 'Common operating picture', outcomes: ['common-operating-picture'], novelSensing: 'None — integrates the others', readiness: 'mature', readinessNote: 'Integrating scenario, not new sensing' }
    ],
    autonomyTiers: {
      'Internal fusion recompute': 0,
      'Monitoring-frequency adjustment': 1,
      'Alert / watchlist issuance': 2,
      'Resource & staffing recommendation': 2,
      'MCM / prophylaxis activation': 3
    },
    autonomyRationale: 'No-fail, high-scrutiny context. Every scenario starts in shadow mode — measuring lead-time, not acting — before moving toward operational tiers.',
    adapterTemplates: ['NSSP/ESSENCE', 'NWSS', 'TGS', 'NEDSS/NBS', 'State immunization registry', 'Hospital capacity feed', 'NWS/AirNow'],
    gapChecklist: [
      'Is there an actual fusion layer, or do signals still sit in separate systems with no connective layer?',
      'Which scenarios are pilotable on existing data vs. genuinely require new sensing?',
      'Is a sensing-hardware partner identified for any gaps?',
      'Is a shadow-mode proving period scheduled before any tier above 1 goes live?',
      'Who is the data steward for each ontology object, and are data-sharing agreements in place?'
    ]
  },
  {
    id: 'water-system-contamination',
    name: 'Water System Contamination',
    deploymentMode: 'standing',
    description: 'A standing jurisdictional layer for municipal and regional water utilities — fuses treatment-plant compliance data, downstream wastewater signals, and, where deployed, inline distribution biosensors into continuous monitoring for biological contamination, deliberate or accidental.',
    modeNote: 'Runs indefinitely as part of a utility’s or health department’s standing infrastructure, accumulating trust and tuning over years rather than a single deployment window.',
    missionOutcomes: [
      { id: 'contamination-detection', name: 'Contamination Detection', problem: 'A biological agent introduced into a water supply today is caught only via periodic indicator-bacteria sampling, an alert plant operator, or downstream illness clusters — not the contamination event itself.', capabilities: ['Continuous biosensor monitoring', 'Hydraulic back-propagation modeling', 'Anomaly detection on distribution telemetry', 'Human-in-the-loop advisory review'], outputs: ['Contamination alert with probable-source ranking', 'At-risk downstream population estimate', 'Recommended advisory/flush action'] }
    ],
    ontologyExtensions: ['Water Asset', 'Distribution Network Node', 'Health Signal'],
    assetTypes: {
      existingFeeds: ['EPA compliance / indicator-bacteria sampling (SDWIS)', 'NWSS downstream wastewater surveillance', 'Utility operator incident reports'],
      deployedSensingKit: ['Inline biosensor arrays (treatment plant, junctions, reservoir inflows, pressure zones)', 'SCADA/hydraulic telemetry']
    },
    scenarioLibrary: [
      { name: 'Deliberate point-source contamination', outcomes: ['contamination-detection'], novelSensing: 'Inline biosensor arrays at distribution junctions', readiness: 'emerging', readinessNote: 'Voluntary pilots only, not yet mandated' },
      { name: 'Accidental cross-connection / backflow event', outcomes: ['contamination-detection'], novelSensing: 'None required beyond existing compliance sampling', readiness: 'mature', readinessNote: 'Pilotable on today’s data' },
      { name: 'Slow-developing distribution-system regrowth', outcomes: ['contamination-detection'], novelSensing: 'Continuous residual/biosensor monitoring', readiness: 'emerging', readinessNote: 'Requires sustained sensor deployment to catch early' }
    ],
    autonomyTiers: {
      'Sensor monitoring-frequency adjustment': 1,
      'Anomaly flag to operator': 1,
      'Public advisory issuance': 3,
      'Boil-water order recommendation': 3
    },
    autonomyRationale: 'Fully passive today by regulation. Any real deployment starts conservative given the direct public-safety and legal consequence of a false alarm — or a missed one.',
    adapterTemplates: ['EPA SDWIS compliance feed', 'NWSS downstream wastewater', 'SCADA/hydraulic telemetry', 'Inline biosensor array (vendor-generic)'],
    gapChecklist: [
      'Is there any continuous biological monitoring between treatment and tap, or only periodic indicator sampling?',
      'Is hydraulic/network modeling available to back-propagate a positive signal to a probable source?',
      'Is there a legal/regulatory pathway to issue a public advisory quickly once a signal is confirmed?',
      'Are utility operators equipped and trained to recognize anomalous conditions in the interim?'
    ]
  }
];

function getPack(id) {
  return PACKS.find(p => p.id === id);
}

module.exports = { PACKS, getPack };
