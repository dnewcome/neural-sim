# Neural Heart

An interactive WebGL visual art piece — neurons distributed across a heart-shaped 3D mesh, connected by organic bezier curves, firing in cascading waves.

![Neural Heart simulation](https://i.imgur.com/placeholder.png)

## Overview

Neurons are sampled across the surface of a heart mesh using area-weighted triangle sampling. They form and retract connections over time, and fire in cascades that propagate through the network with realistic propagation delays. UnrealBloom post-processing gives everything a deep-space glow.

## Running Locally

Requires a static file server (ES modules don't work over `file://`).

```bash
cd neural-sim
python3 -m http.server 8765
```

Then open `http://localhost:8765` in a browser.

No build step. No npm. All dependencies load from CDN via importmap.

## Controls

| Input | Action |
|---|---|
| Drag | Orbit camera |
| Scroll | Zoom |
| GUI panel | Tune all parameters live |

The `window.neuralHeart` object is exposed in the console:

```js
neuralHeart.inject(42)       // fire neuron by index
neuralHeart.injectRandom()   // fire a random neuron
```

## File Structure

```
index.html       — HTML shell, importmap (Three.js r160, lil-gui)
config.js        — All simulation parameters; GUI binds directly to this object
main.js          — Scene setup, OrbitControls, UnrealBloomPass, render loop
MeshSampler.js   — Area-weighted surface sampling + geometry normalization
Neuron.js        — Neuron state machine (idle → firing → refractory)
Connection.js    — Bezier connection lines with shader pulse animation
NeuralSim.js     — Orchestrates neurons + connections, cascade queue
decimated-78.stl — Heart mesh (binary STL, decimated in Blender, normalized to 2.0 units)
```

## Key Parameters (`config.js`)

| Parameter | Default | Effect |
|---|---|---|
| `neuronCount` | 250 | Number of neurons on the mesh |
| `connectionRadius` | 0.22 | Max distance for potential connections — most impactful for density |
| `formTime` / `retractTime` | 4s / 3s | Connection lifecycle animation speed |
| `propagationDelay` | 50ms/hop | Controls cascade speed |
| `stimulusInterval` | 2200ms | Time between spontaneous firing events |
| `bloomStrength` | 1.6 | Post-processing glow intensity |
| `cascadeDepthLimit` | 40 | Max hops before a cascade dies |

All parameters update live through the GUI panel.

## Architecture Notes

- Connections use `setDrawRange` (not shader discard) for formation/retraction animation
- Connection shader has a `t` attribute (0→1 along curve) plus `u_pulsePos`/`u_pulseBright` uniforms for the traveling pulse
- Cascade propagation uses a `_pending[]` queue with `fireAt` timestamps processed each `update()` tick
- Geometry is normalized to a 2.0-unit bounding box on load

## Dependencies

- [Three.js r160](https://threejs.org/) — 3D rendering
- [lil-gui 0.19.2](https://lil-gui.georgealways.com/) — parameter panel
