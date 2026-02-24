import * as THREE from 'three';

export const ConnState = {
  FORMING:    'forming',    // Growing from source to target
  ACTIVE:     'active',     // Fully formed
  RETRACTING: 'retracting', // Slowly disappearing
  DEAD:       'dead',       // Can be removed
};

// ---- Shaders ---------------------------------------------------------------

const VERT = /* glsl */`
  attribute float t;
  varying float vT;
  void main() {
    vT = t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  uniform float u_pulsePos;    // firing pulse position [0,1]
  uniform float u_pulseBright; // firing pulse brightness [0,1]
  uniform float u_time;
  uniform float u_flowSpeed;
  uniform vec3  u_baseColor;
  uniform vec3  u_pulseColor;

  varying float vT;

  void main() {
    // Subtle directional flow — tiny moving sparkles along the line
    float flow = fract(vT - u_time * u_flowSpeed);
    flow = pow(flow, 8.0) * 0.7;

    // Firing pulse: gaussian blob traveling along t
    float pd = vT - u_pulsePos;
    float pulse = u_pulseBright * exp(-pd * pd * 320.0);

    vec3 color  = u_baseColor * (0.5 + flow) + u_pulseColor * pulse * 2.0;
    float alpha = 0.55 + flow * 0.4 + pulse * 0.8;

    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

// ---------------------------------------------------------------------------

export class Connection {
  constructor(neuronA, neuronB, scene, config) {
    this.neuronA = neuronA;
    this.neuronB = neuronB;
    this.scene   = scene;
    this.config  = config;

    this.state     = ConnState.FORMING;
    this.progress  = 0; // 0 = not drawn, 1 = fully drawn
    this.age       = 0; // seconds alive in ACTIVE state
    this.lifetime  = config.connectionLifetimeMin +
                     Math.random() * (config.connectionLifetimeMax - config.connectionLifetimeMin);

    // Pulse animation state
    this.pulsePos    = 0;
    this.pulseBright = 0;
    this.pulseDirAtoB = true; // travel direction
    this.pulseActive = false;

    neuronA.connections.push(this);
    neuronB.connections.push(this);

    this._buildLine();
  }

  _buildLine() {
    const pA = this.neuronA.position;
    const pB = this.neuronB.position;

    // Build an organic cubic bezier with random perpendicular offsets
    const dir = pB.clone().sub(pA);
    const len = dir.length();

    // A perpendicular vector (Gram-Schmidt)
    const up = Math.abs(dir.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const perp1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();

    const jitter = () => (Math.random() - 0.5) * len * this.config.connectionCurveOffset;

    const cp1 = pA.clone()
      .add(dir.clone().multiplyScalar(0.25))
      .addScaledVector(perp1, jitter())
      .addScaledVector(perp2, jitter());

    const cp2 = pA.clone()
      .add(dir.clone().multiplyScalar(0.75))
      .addScaledVector(perp1, jitter())
      .addScaledVector(perp2, jitter());

    const curve = new THREE.CubicBezierCurve3(pA, cp1, cp2, pB);
    const N = this.config.connectionSegments;
    const pts = curve.getPoints(N);

    const positions = new Float32Array((N + 1) * 3);
    const tValues   = new Float32Array(N + 1);

    for (let i = 0; i <= N; i++) {
      positions[i * 3]     = pts[i].x;
      positions[i * 3 + 1] = pts[i].y;
      positions[i * 3 + 2] = pts[i].z;
      tValues[i] = i / N;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('t', new THREE.BufferAttribute(tValues, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      transparent:    true,
      depthWrite:     false,
      uniforms: {
        u_pulsePos:   { value: 0 },
        u_pulseBright:{ value: 0 },
        u_time:       { value: 0 },
        u_flowSpeed:  { value: this.config.connectionFlowSpeed },
        u_baseColor:  { value: new THREE.Color(this.config.connectionIdleColor) },
        u_pulseColor: { value: new THREE.Color(this.config.pulseColor) },
      },
    });

    // Start with nothing drawn
    geo.setDrawRange(0, 0);

    this.line = new THREE.Line(geo, this.material);
    this.line.userData.connection = this;
    this.scene.add(this.line);
  }

  // Trigger a firing pulse to travel from fromNeuron toward the other end
  triggerPulse(fromNeuron) {
    this.pulseDirAtoB = (fromNeuron === this.neuronA);
    this.pulsePos    = this.pulseDirAtoB ? 0 : 1;
    this.pulseBright = 1.0;
    this.pulseActive = true;
  }

  startRetracting() {
    if (this.state === ConnState.ACTIVE) {
      this.state = ConnState.RETRACTING;
    }
  }

  isActive() { return this.state === ConnState.ACTIVE; }
  isDead()   { return this.state === ConnState.DEAD; }

  getOtherEnd(neuron) {
    return neuron === this.neuronA ? this.neuronB : this.neuronA;
  }

  update(dt, time) {
    const uni = this.material.uniforms;
    uni.u_time.value = time;

    const N = this.config.connectionSegments;
    const totalPts = N + 1;

    switch (this.state) {
      case ConnState.FORMING:
        this.progress = Math.min(1, this.progress + dt / this.config.formTime);
        this.line.geometry.setDrawRange(0, Math.ceil(this.progress * totalPts));
        // Update colors as connection matures
        uni.u_baseColor.value.set(this.config.connectionIdleColor)
          .lerp(new THREE.Color(this.config.connectionActiveColor), this.progress * 0.5);
        if (this.progress >= 1) this.state = ConnState.ACTIVE;
        break;

      case ConnState.ACTIVE:
        this.age += dt;
        this.line.geometry.setDrawRange(0, totalPts);
        // Slight breathing on base color
        {
          const breath = 0.5 + 0.5 * Math.sin(time * 0.4 + this.neuronA.pulsePhase);
          const idleCol = new THREE.Color(this.config.connectionIdleColor);
          const actCol  = new THREE.Color(this.config.connectionActiveColor);
          uni.u_baseColor.value.copy(idleCol).lerp(actCol, breath * 0.25);
        }
        break;

      case ConnState.RETRACTING:
        this.progress = Math.max(0, this.progress - dt / this.config.retractTime);
        this.line.geometry.setDrawRange(0, Math.ceil(this.progress * totalPts));
        if (this.progress <= 0) {
          this.state = ConnState.DEAD;
          this._removeFromScene();
        }
        break;
    }

    // Animate firing pulse
    if (this.pulseActive) {
      const speed = 1.0 / 0.12; // traverse full length in 120ms
      const delta = speed * dt * (this.pulseDirAtoB ? 1 : -1);
      this.pulsePos += delta;

      uni.u_pulsePos.value    = this.pulsePos;
      uni.u_pulseBright.value = this.pulseBright;

      // Fade out pulse
      this.pulseBright = Math.max(0, this.pulseBright - dt * 3.0);

      const done = this.pulseDirAtoB ? this.pulsePos >= 1.1 : this.pulsePos <= -0.1;
      if (done || this.pulseBright <= 0) {
        this.pulseActive  = false;
        this.pulseBright  = 0;
        uni.u_pulseBright.value = 0;
      }
    }
  }

  _removeFromScene() {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.material.dispose();
  }

  dispose() {
    if (this.state !== ConnState.DEAD) {
      this._removeFromScene();
    }
    // Remove from neuron connection lists
    this._unlinkFromNeurons();
  }

  _unlinkFromNeurons() {
    const removeFrom = (neuron) => {
      const idx = neuron.connections.indexOf(this);
      if (idx !== -1) neuron.connections.splice(idx, 1);
    };
    removeFrom(this.neuronA);
    removeFrom(this.neuronB);
  }
}
