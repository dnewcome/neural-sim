import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import GUI from 'lil-gui';

import { CONFIG } from './config.js';
import { NeuralSim } from './NeuralSim.js';
import { normalizeGeometry } from './MeshSampler.js';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.bgColor);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0.2, 3.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = CONFIG.autoRotateSpeed;
controls.minDistance = 1;
controls.maxDistance = 8;

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloomStrength,
  CONFIG.bloomRadius,
  CONFIG.bloomThreshold,
);
composer.addPass(bloomPass);

// Resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// STL loading & simulation bootstrap
// ---------------------------------------------------------------------------

let sim = null;

const loader = new STLLoader();
loader.load('./decimated-78.stl', (geometry) => {
  // Normalize: center + scale to unit size
  normalizeGeometry(geometry, 2.0);

  // Optional: show a faint wireframe of the heart for context
  // (disabled by default — comment in to debug placement)
  // const wireMat = new THREE.MeshBasicMaterial({ color: '#040d14', wireframe: true, transparent: true, opacity: 0.06 });
  // scene.add(new THREE.Mesh(geometry, wireMat));

  // Build simulation
  sim = new NeuralSim(geometry, scene, CONFIG);

  document.getElementById('loading').style.display = 'none';

  setupGUI();
});

// ---------------------------------------------------------------------------
// GUI
// ---------------------------------------------------------------------------

function setupGUI() {
  const gui = new GUI({ title: 'Neural Heart' });
  gui.domElement.style.zIndex = '100';

  // --- Stimulus ---
  const stimFolder = gui.addFolder('Stimulus');
  stimFolder.add(CONFIG, 'stimulusInterval', 200, 8000, 100).name('interval (ms)');
  stimFolder.add(CONFIG, 'stimulusJitter',   0,   4000, 100).name('jitter (ms)');
  stimFolder.add({ fire: () => sim && sim.injectRandom() }, 'fire').name('Fire random now');

  // --- Firing cascade ---
  const fireFolder = gui.addFolder('Firing');
  fireFolder.add(CONFIG, 'propagationDelay', 0.01, 0.3, 0.005).name('prop delay (s)');
  fireFolder.add(CONFIG, 'firingDuration',   0.05, 0.8, 0.01).name('fire duration (s)');
  fireFolder.add(CONFIG, 'refractoryDuration', 0.1, 2.0, 0.05).name('refractory (s)');
  fireFolder.add(CONFIG, 'cascadeDepthLimit', 1, 100, 1).name('cascade depth');

  // --- Connections ---
  const connFolder = gui.addFolder('Connections');
  connFolder.add(CONFIG, 'formTime',   1, 15, 0.5).name('form time (s)');
  connFolder.add(CONFIG, 'retractTime', 1, 15, 0.5).name('retract time (s)');
  connFolder.add(CONFIG, 'connectionLifetimeMin', 5, 60, 1).name('lifetime min (s)');
  connFolder.add(CONFIG, 'connectionLifetimeMax', 20, 180, 1).name('lifetime max (s)');
  connFolder.add(CONFIG, 'formChancePerSecond',  0, 0.3, 0.005).name('form chance/s');
  connFolder.add(CONFIG, 'breakChancePerSecond', 0, 0.1, 0.001).name('break chance/s');
  connFolder.add(CONFIG, 'maxConnectionsPerNeuron', 1, 12, 1).name('max conn/neuron');
  connFolder.add(CONFIG, 'connectionCurveOffset', 0, 1.0, 0.05).name('curve organic');
  connFolder.add(CONFIG, 'connectionFlowSpeed', 0, 0.5, 0.005)
    .name('flow speed')
    .onChange(() => sim && sim.applyConfigUpdate());

  // --- Colors ---
  const colFolder = gui.addFolder('Colors');
  colFolder.addColor(CONFIG, 'bgColor').name('background')
    .onChange(v => scene.background.set(v));
  colFolder.addColor(CONFIG, 'neuronIdleColor').name('neuron idle');
  colFolder.addColor(CONFIG, 'neuronActiveColor').name('neuron active');
  colFolder.addColor(CONFIG, 'neuronFiringColor').name('neuron fire');
  colFolder.addColor(CONFIG, 'neuronRefractColor').name('neuron refractory');
  colFolder.addColor(CONFIG, 'connectionIdleColor').name('conn idle')
    .onChange(() => sim && sim.applyConfigUpdate());
  colFolder.addColor(CONFIG, 'pulseColor').name('pulse color')
    .onChange(() => sim && sim.applyConfigUpdate());
  colFolder.add(CONFIG, 'neuronIdleIntensity', 0, 2, 0.05).name('idle glow');

  // --- Bloom ---
  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder.add(CONFIG, 'bloomStrength', 0, 5, 0.05)
    .name('strength').onChange(v => bloomPass.strength = v);
  bloomFolder.add(CONFIG, 'bloomRadius', 0, 1.5, 0.05)
    .name('radius').onChange(v => bloomPass.radius = v);
  bloomFolder.add(CONFIG, 'bloomThreshold', 0, 1, 0.01)
    .name('threshold').onChange(v => bloomPass.threshold = v);

  // --- Camera ---
  const camFolder = gui.addFolder('Camera');
  camFolder.add(controls, 'autoRotate').name('auto rotate');
  camFolder.add(controls, 'autoRotateSpeed', -2, 2, 0.05).name('rotate speed');

  // Collapse non-essential folders by default
  colFolder.close();
  bloomFolder.close();
  camFolder.close();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05); // cap at 50ms to avoid spiral

  controls.update();

  if (sim) sim.update(dt);

  composer.render();
}

animate();

// ---------------------------------------------------------------------------
// External signal API — expose on window for future hookup
// ---------------------------------------------------------------------------
// Call window.neuralHeart.inject(index) or .injectRandom() from console or
// any external signal source to drive the simulation.
window.neuralHeart = {
  inject:       (i) => sim && sim.inject(i),
  injectRandom: ()  => sim && sim.injectRandom(),
  sim:          () => sim,
  config:       CONFIG,
};
