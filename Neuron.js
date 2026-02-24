import * as THREE from 'three';

export const NeuronState = {
  IDLE:       'idle',
  FIRING:     'firing',
  REFRACTORY: 'refractory',
};

// Shared geometry for all neuron spheres
let _sphereGeo = null;
function getSphereGeo() {
  if (!_sphereGeo) _sphereGeo = new THREE.SphereGeometry(1, 10, 10);
  return _sphereGeo;
}

export class Neuron {
  constructor(id, position, normal, config) {
    this.id = id;
    this.position = position.clone();
    this.normal = normal.clone();
    this.config = config;

    this.state = NeuronState.IDLE;
    this.stateTimer = 0;

    // Organic pulsing: each neuron has its own phase and frequency
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.pulseFreq = 0.6 + Math.random() * 0.8;

    // List of active Connection objects this neuron participates in
    this.connections = [];

    // Schedule state (used by NeuralSim to queue cascade firings)
    this.pendingFireAt = -1;
    this.cascadeDepth = 0;

    this._buildMesh();
  }

  _buildMesh() {
    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.config.neuronIdleColor),
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(getSphereGeo(), this.material);
    this.mesh.position.copy(this.position);
    this.mesh.scale.setScalar(this.config.neuronRadius);
    this.mesh.userData.neuron = this;
  }

  // Called by NeuralSim to initiate firing
  fire(cascadeDepth = 0) {
    if (this.state === NeuronState.FIRING || this.state === NeuronState.REFRACTORY) {
      return false;
    }
    this.state = NeuronState.FIRING;
    this.stateTimer = 0;
    this.cascadeDepth = cascadeDepth;
    return true;
  }

  update(dt, time) {
    this.stateTimer += dt;

    switch (this.state) {
      case NeuronState.IDLE: {
        // Gentle organic pulse
        const pulse = 0.5 + 0.5 * Math.sin(time * this.pulseFreq + this.pulsePhase);
        const intensity = this.config.neuronIdleIntensity;
        const idleCol = new THREE.Color(this.config.neuronIdleColor);
        const activeCol = new THREE.Color(this.config.neuronActiveColor);
        const col = idleCol.clone().lerp(activeCol, pulse * 0.12 * intensity);
        this.material.color.copy(col);
        this.mesh.scale.setScalar(this.config.neuronRadius * (0.9 + pulse * 0.2));
        break;
      }

      case NeuronState.FIRING: {
        const t = this.stateTimer / this.config.firingDuration;
        // Sharp peak at 0.15, then fade
        const peak = Math.exp(-Math.pow((t - 0.15) * 8, 2));
        const firingCol = new THREE.Color(this.config.neuronFiringColor);
        const activeCol = new THREE.Color(this.config.neuronActiveColor);
        this.material.color.copy(activeCol.clone().lerp(firingCol, peak));
        this.mesh.scale.setScalar(this.config.neuronRadius * (1.0 + peak * 1.4));

        if (this.stateTimer >= this.config.firingDuration) {
          this.state = NeuronState.REFRACTORY;
          this.stateTimer = 0;
        }
        break;
      }

      case NeuronState.REFRACTORY: {
        const t = this.stateTimer / this.config.refractoryDuration;
        const refractCol = new THREE.Color(this.config.neuronRefractColor);
        const idleCol = new THREE.Color(this.config.neuronIdleColor);
        // Fade back to idle
        this.material.color.copy(refractCol.clone().lerp(idleCol, Math.min(t, 1)));
        this.mesh.scale.setScalar(this.config.neuronRadius);

        if (this.stateTimer >= this.config.refractoryDuration) {
          this.state = NeuronState.IDLE;
          this.stateTimer = 0;
        }
        break;
      }
    }
  }

  isFiring() { return this.state === NeuronState.FIRING; }
  canFire()  { return this.state === NeuronState.IDLE; }

  // All connections still in the list are alive (NeuralSim prunes dead ones).
  // Count forming + active connections toward the cap.
  activeConnectionCount() {
    return this.connections.length;
  }

  dispose() {
    this.material.dispose();
  }
}
