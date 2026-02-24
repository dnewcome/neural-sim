// All tweakable simulation parameters live here.
// The GUI binds directly to this object so changes take effect live.

export const CONFIG = {
  // --- Neuron placement ---
  neuronCount: 250,           // Total neurons to place on mesh surface
  neuronRadius: 0.012,        // Visual sphere radius (relative to normalized mesh)
  neuronJitter: 0.004,        // Random offset from surface for depth variation
  neuronOffsetOut: 0.008,     // Push outward along normal

  // --- Connections ---
  connectionRadius: 0.22,     // Max distance for potential connections
  maxConnectionsPerNeuron: 6, // Hard cap on active connections per neuron
  connectionSegments: 48,     // Points sampled along bezier curve
  connectionCurveOffset: 0.35,// Organic curve randomness (fraction of length)

  // --- Connection lifecycle timing (seconds) ---
  formTime: 4.0,              // Time to fully form a new connection
  retractTime: 3.0,           // Time to fully retract a broken connection
  connectionLifetimeMin: 20,  // Min seconds a connection stays active
  connectionLifetimeMax: 90,  // Max seconds before it may break
  formChancePerSecond: 0.04,  // Probability/sec a neuron starts a new connection
  breakChancePerSecond: 0.006,// Probability/sec an active connection starts breaking

  // --- Firing ---
  firingDuration: 0.18,       // Seconds neuron stays in bright-fire state
  refractoryDuration: 0.45,   // Seconds post-fire before returning to idle
  propagationDelay: 0.05,     // Seconds per hop in cascade
  cascadeDepthLimit: 40,      // Max hops before cascade dies (prevents infinite loops)

  // --- Ambient stimulus ---
  stimulusInterval: 2200,     // ms between spontaneous firing events
  stimulusJitter: 1500,       // ms random jitter on top of interval

  // --- Visuals ---
  bloomStrength: 1.6,
  bloomRadius: 0.5,
  bloomThreshold: 0.08,

  // Colors (hex strings, parsed in main)
  bgColor: '#000508',
  neuronIdleColor: '#0d3a52',
  neuronActiveColor: '#30b8e0',
  neuronFiringColor: '#ffffff',
  neuronRefractColor: '#082535',
  connectionIdleColor: '#082030',
  connectionActiveColor: '#0e5070',
  pulseColor: '#60d0ff',

  // Glow intensities
  neuronIdleIntensity: 0.6,
  neuronFiringIntensity: 4.0,
  connectionFlowSpeed: 0.08,  // How fast the subtle flow pattern moves

  // --- Camera ---
  autoRotateSpeed: 0.3,
};
