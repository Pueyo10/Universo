import * as THREE from 'three';
import { AU, clamp, smoothstep } from '../core/Units.js';
import { orbitPath } from './Orbits.js';
import { Body } from './Body.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG } from '../shaders/chunks.js';

// Orbit paths (fading near the camera and with distance) and screen-space
// markers that keep sub-pixel bodies visible and clickable at any scale.
export class OrbitLines {
  constructor(manager) {
    this.manager = manager;
    this.group = new THREE.Group();
    manager.engine.scene.add(this.group);
    this.lines = [];
    this.enabled = true;
    this._lastScaleT = -1;
  }

  add(body, opts = {}) {
    const color = new THREE.Color(body.color || '#8fb4ff');
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const geo = new THREE.BufferGeometry();
    const n = opts.segments || 256;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 42;
    this.group.add(line);
    const entry = { body, line, mat, geo, n, opts, base: opts.opacity ?? (body.kind === 'moon' ? 0.22 : 0.32) };
    this.lines.push(entry);
    this._rebuild(entry, this.manager.scaleT);
    return entry;
  }

  _rebuild(e, scaleT) {
    const b = e.body, pos = e.geo.attributes.position.array;
    if (b.elements) {
      const pts = orbitPath(b.elements, this.manager.time.centuries, e.n);
      for (let i = 0; i <= e.n; i++) {
        const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        const r = Math.hypot(x, y, z); const rv = Body.orbitVisual(r);
        const k = 1 + (rv / r - 1) * scaleT;
        pos[i * 3] = x * k; pos[i * 3 + 1] = y * k; pos[i * 3 + 2] = z * k;
      }
    } else if (b.orbitPoints) {
      const pts = b.orbitPoints;
      for (let i = 0; i <= e.n; i++) {
        const j = Math.min(i, pts.length / 3 - 1);
        const x = pts[j * 3], y = pts[j * 3 + 1], z = pts[j * 3 + 2];
        const r = Math.hypot(x, y, z); const rv = Body.orbitVisual(r);
        const k = 1 + (rv / r - 1) * scaleT;
        pos[i * 3] = x * k; pos[i * 3 + 1] = y * k; pos[i * 3 + 2] = z * k;
      }
    } else if (b.orbitRadius != null) {
      const basis = b.orbitBasis || (b._moonBasis && b._moonBasis());
      if (!basis) return;
      const rr = b.orbitRadius;
      for (let i = 0; i <= e.n; i++) {
        const a = (i / e.n) * Math.PI * 2;
        pos[i * 3] = basis.u.x * Math.cos(a) * rr + basis.v.x * Math.sin(a) * rr;
        pos[i * 3 + 1] = basis.u.y * Math.cos(a) * rr + basis.v.y * Math.sin(a) * rr;
        pos[i * 3 + 2] = basis.u.z * Math.cos(a) * rr + basis.v.z * Math.sin(a) * rr;
      }
    }
    e.geo.attributes.position.needsUpdate = true;
  }

  update(camPos, scaleT) {
    const rebuild = Math.abs(scaleT - this._lastScaleT) > 1e-4;
    this._lastScaleT = scaleT;
    for (const e of this.lines) {
      const b = e.body;
      const parentPos = b.parent ? b.parent.position : ORIGIN;
      e.line.position.copy(parentPos);
      // circular (moon / orbiter) paths only change with the scale blend, not every frame
      if (rebuild || (b.orbitRadius != null && e.lastRadius !== b.orbitRadius)) { this._rebuild(e, scaleT); e.lastRadius = b.orbitRadius; }
      if (!this.enabled) { e.line.visible = false; continue; }
      // fade: hide when the camera is within a fraction of the orbit radius of the body (line would cut the view)
      const orbitR = b.orbitRadius ?? b.position.distanceTo(parentPos);
      const dBody = camPos.distanceTo(b.position);
      const dParent = camPos.distanceTo(parentPos);
      let op = e.base;
      op *= smoothstep(0.02, 0.15, dBody / Math.max(orbitR, 1e-9));           // near the body
      op *= 1 - smoothstep(orbitR * 400, orbitR * 4000, dParent);              // far away: vanish
      op *= 0.3 + 0.7 * smoothstep(0.35, 1.2, dParent / Math.max(orbitR, 1e-9)); // camera well inside the orbit: subtle
      if (b.kind === 'moon') op *= smoothstep(orbitR * 0.5, orbitR * 2, dParent) * (1 - smoothstep(orbitR * 60, orbitR * 300, dParent));
      e.mat.opacity = op;
      e.line.visible = op > 0.01;
    }
  }
}
const ORIGIN = new THREE.Vector3();

const markerVert = /* glsl */`
  attribute vec3 color; attribute float size; attribute float alpha;
  varying vec3 vColor; varying float vAlpha;
  uniform float uPixelRatio;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = color; vAlpha = alpha;
    gl_PointSize = size * uPixelRatio;
    if (alpha < 0.01) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const markerFrag = /* glsl */`
  precision highp float; varying vec3 vColor; varying float vAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    float core = exp(-r2 * 8.0); float halo = exp(-r2 * 2.0) * 0.4;
    float a = (core + halo) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a * 1.5, a);
  }
`;

export class Markers {
  constructor(manager) {
    this.manager = manager;
    this.bodies = [];
    this.max = 128;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3); this.col = new Float32Array(this.max * 3); this.size = new Float32Array(this.max); this.alpha = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.material = new THREE.ShaderMaterial({ uniforms: { uPixelRatio: { value: 1 } }, vertexShader: markerVert, fragmentShader: markerFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; this.points.renderOrder = 70;
    manager.engine.scene.add(this.points);
    this._v = new THREE.Vector3();
    this.enabled = true;
  }
  add(body) { if (this.bodies.length < this.max) { this.bodies.push(body); const c = new THREE.Color(body.color || '#ffffff'); const i = this.bodies.length - 1; this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; } }
  update(camPos, camera) {
    const h = window.innerHeight;
    const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.points.position.copy(camPos);
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      this._v.copy(b.position).sub(camPos);
      const d = this._v.length();
      const rpx = b.radius / d * fovScale;
      let a = this.enabled ? clamp((2.5 - rpx) / 2.0, 0, 1) : 0;
      if (b.kind === 'moon' && b.parent) { const dp = camPos.distanceTo(b.parent.position); a *= 1 - smoothstep(b.parent.radius * 400, b.parent.radius * 2500, dp); }
      if (b.kind === 'spacecraft' && b.parent) { const dp = camPos.distanceTo(b.parent.position); a *= 1 - smoothstep(b.parent.radius * 60, b.parent.radius * 400, dp); }
      if (b.kind === 'asteroid' || b.kind === 'comet') a *= 1 - smoothstep(60 * AU, 400 * AU, d);
      if (b.kind === 'spacecraft' && !b.parent) a *= 1 - smoothstep(300 * AU, 2000 * AU, d);
      if (b.hidden) a = 0;
      this.pos[i * 3] = this._v.x; this.pos[i * 3 + 1] = this._v.y; this.pos[i * 3 + 2] = this._v.z;
      this.size[i] = b.kind === 'planet' ? 7 : b.kind === 'sun' ? 9 : b.kind === 'dwarf' ? 5 : 4;
      this.alpha[i] = a * 0.9;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.bodies.length);
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.color.needsUpdate = true;
    this.material.uniforms.uPixelRatio.value = this.manager.engine.renderer.getPixelRatio();
  }
}
