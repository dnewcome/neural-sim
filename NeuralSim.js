import * as THREE from 'three';
import { Neuron, NeuronState } from './Neuron.js';
import { Connection, ConnState } from './Connection.js';
import { sampleSurface } from './MeshSampler.js';

export class NeuralSim {
  constructor(geometry, scene, config) {
    this.scene   = scene;
    this.config  = config;
    this.neurons = [];
    this.connections = [];

    // Scheduled cascade firings: { neuron, fireAt, depth }
    this._pending = [];

    this._simTime   = 0;
    this._nextStimulus = 0;

    this._buildNeurons(geometry);
    this._buildPotentialLinks();
  }

  _buildNeurons(geometry) {
    const points = sampleSurface(geometry, this.config.neuronCount);

    for (let i = 0; i < points.length; i++) {
      const { position, normal } = points[i];

      // Push outward slightly from surface + random jitter
      position.addScaledVector(normal, this.config.neuronOffsetOut);
      position.addScaledVector(
        new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        this.config.neuronJitter
      );

      const n = new Neuron(i, position, normal, this.config);
      this.scene.add(n.mesh);
      this.neurons.push(n);
    }
  }

  // Pre-compute which neurons are "close enough" to potentially connect.
  // Stored per-neuron so we don't do O(n²) every frame.
  _buildPotentialLinks() {
    const R2 = this.config.connectionRadius * this.config.connectionRadius;
    this._potentialNeighbors = this.neurons.map(() => []);

    for (let i = 0; i < this.neurons.length; i++) {
      for (let j = i + 1; j < this.neurons.length; j++) {
        const d2 = this.neurons[i].position.distanceToSquared(this.neurons[j].position);
        if (d2 < R2) {
          this._potentialNeighbors[i].push(j);
          this._potentialNeighbors[j].push(i);
        }
      }
    }
  }

  // --- Connection management ---

  _connectionExists(a, b) {
    return a.connections.some(
      c => (c.neuronA === a && c.neuronB === b) || (c.neuronA === b && c.neuronB === a)
    );
  }

  _tryFormConnection(neuron, idx) {
    const neighbors = this._potentialNeighbors[idx];
    if (neighbors.length === 0) return;

    // Filter to candidates that aren't already connected
    const candidates = neighbors.filter(j => {
      const target = this.neurons[j];
      return !this._connectionExists(neuron, target)
          && target.activeConnectionCount() < this.config.maxConnectionsPerNeuron;
    });

    if (candidates.length === 0) return;

    const targetIdx = candidates[Math.floor(Math.random() * candidates.length)];
    const target    = this.neurons[targetIdx];

    const conn = new Connection(neuron, target, this.scene, this.config);
    this.connections.push(conn);
  }

  // --- Firing cascade ---

  _scheduleFire(neuron, delay, depth) {
    if (!neuron.canFire()) return;
    if (depth > this.config.cascadeDepthLimit) return;
    // Don't double-schedule
    if (this._pending.some(p => p.neuron === neuron)) return;

    this._pending.push({
      neuron,
      fireAt: this._simTime + delay,
      depth,
    });
  }

  fireNeuron(neuron, depth = 0) {
    if (!neuron.fire(depth)) return; // already firing/refractory

    // Propagate to connected neighbors
    const activeConns = neuron.connections.filter(c => c.isActive());
    for (const conn of activeConns) {
      conn.triggerPulse(neuron);
      const neighbor = conn.getOtherEnd(neuron);
      this._scheduleFire(neighbor, this.config.propagationDelay, depth + 1);
    }
  }

  // External hook: call this to inject a signal into a specific neuron index
  inject(neuronIndex) {
    if (neuronIndex >= 0 && neuronIndex < this.neurons.length) {
      this.fireNeuron(this.neurons[neuronIndex], 0);
    }
  }

  // External hook: inject into a random neuron
  injectRandom() {
    const idx = Math.floor(Math.random() * this.neurons.length);
    this.fireNeuron(this.neurons[idx], 0);
  }

  // --- Update loop ---

  update(dt) {
    this._simTime += dt;
    const time = this._simTime;

    // 1. Process scheduled cascade firings
    const stillPending = [];
    for (const item of this._pending) {
      if (time >= item.fireAt) {
        this.fireNeuron(item.neuron, item.depth);
      } else {
        stillPending.push(item);
      }
    }
    this._pending = stillPending;

    // 2. Update neurons
    for (const n of this.neurons) {
      n.update(dt, time);
    }

    // 3. Update & prune dead connections
    const live = [];
    for (const conn of this.connections) {
      conn.update(dt, time);
      if (conn.isDead()) {
        conn._unlinkFromNeurons();
      } else {
        live.push(conn);
      }
    }
    this.connections = live;

    // 4. Randomly break active connections
    const breakProb = this.config.breakChancePerSecond * dt;
    for (const conn of this.connections) {
      if (conn.isActive() && conn.age > this.config.connectionLifetimeMin) {
        if (Math.random() < breakProb) {
          conn.startRetracting();
        }
      }
    }

    // 5. Randomly form new connections
    const formProb = this.config.formChancePerSecond * dt;
    for (let i = 0; i < this.neurons.length; i++) {
      const n = this.neurons[i];
      if (n.activeConnectionCount() < this.config.maxConnectionsPerNeuron) {
        if (Math.random() < formProb) {
          this._tryFormConnection(n, i);
        }
      }
    }

    // 6. Ambient stimulus
    if (time * 1000 >= this._nextStimulus) {
      this.injectRandom();
      this._nextStimulus = time * 1000
        + this.config.stimulusInterval
        + Math.random() * this.config.stimulusJitter;
    }
  }

  // Live-update config references in materials after GUI change
  applyConfigUpdate() {
    // Neurons and connections read config live via reference, so most
    // changes take effect automatically. For shader uniforms we push them.
    for (const conn of this.connections) {
      conn.material.uniforms.u_baseColor.value.set(this.config.connectionIdleColor);
      conn.material.uniforms.u_pulseColor.value.set(this.config.pulseColor);
      conn.material.uniforms.u_flowSpeed.value = this.config.connectionFlowSpeed;
    }
  }

  dispose() {
    for (const n of this.neurons) {
      this.scene.remove(n.mesh);
      n.dispose();
    }
    for (const c of this.connections) {
      c.dispose();
    }
  }
}
