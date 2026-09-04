import * as THREE from 'three';

// Streamed high-resolution surfaces ("zoom in like a map"): a quadtree of
// equirectangular tiles fetched from NASA WMTS services (GIBS Blue Marble /
// VIIRS night lights for Earth, Trek mosaics for the Moon, Mars and Mercury).
// Each visible tile is a patch of the unit sphere drawn just above the base
// globe with the planet's own surface shader, so lighting, night side, cloud
// and ring shadows stay identical; the base 2K / 8K texture shows through
// wherever a tile has not arrived yet. Level of detail follows the projected
// size of each tile; textures are cached with an LRU cap.
const GIBS = (layer, set) => (z, r, c) => `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${set}/${z}/${r}/${c}.jpeg`;
const TREK = (body, layer) => (z, r, c) => `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${r}/${c}.jpg`;

export const TILE_SOURCES = {
  // GIBS EPSG:4326 matrix: level z tiles span 288/2^z degrees (exact grid from level 3 = 36° on); 512 px tiles
  earth: { deg: z => 288 / Math.pow(2, z), root: 3, max: 7, size: 512, minHi: 5, minLo: 3, url: GIBS('BlueMarble_NextGeneration', '500m'), night: { url: GIBS('VIIRS_CityLights_2012', '500m'), max: 7 }, credit: 'NASA GIBS: Blue Marble Next Generation · VIIRS city lights' },
  // Trek: level z tiles span 180/2^z degrees; 256 px tiles
  moon: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Moon', 'LRO_WAC_Mosaic_Global_303ppd_v02'), credit: 'NASA LRO WAC mosaic (Moon Trek)' },
  mars: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m'), credit: 'NASA Viking MDIM 2.1 (Mars Trek)' },
  mercury: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Mercury', 'Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m'), credit: 'NASA MESSENGER MDIS mosaic (Mercury Trek)' },
};

/** Local 8K textures (Solar System Scope, CC BY 4.0) used between the 2K base and the streamed tiles. */
export const HIRES = {
  earth: { map: '8k_earth_daymap', night: '8k_earth_nightmap', cloud: '8k_earth_clouds' },
  moon: { map: '8k_moon' }, mars: { map: '8k_mars' }, mercury: { map: '8k_mercury' }, venus: { map: '8k_venus_surface' },
  jupiter: { map: '8k_jupiter' }, saturn: { map: '8k_saturn' },
};

const DEG = Math.PI / 180;
const MAX_TEX = 260;
const CONCURRENCY = 6;

function tileGeometry(lon0, lon1, lat0, lat1, seg) {
  // same convention as THREE.SphereGeometry: u = phi / 2π with x = -cos(phi) sin(theta), z = sin(phi) sin(theta), v = 1 - theta/π
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const lat = lat1 + (lat0 - lat1) * (j / seg);
    const theta = (90 - lat) * DEG, st = Math.sin(theta), ct = Math.cos(theta);
    for (let i = 0; i <= seg; i++) {
      const lon = lon0 + (lon1 - lon0) * (i / seg);
      const u = (lon + 180) / 360, phi = u * Math.PI * 2;
      const x = -Math.cos(phi) * st, y = ct, z = Math.sin(phi) * st;
      pos.push(x, y, z); nrm.push(x, y, z); uv.push(u, 1 - theta / Math.PI);
    }
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

class Tile {
  constructor(z, r, c, src) {
    this.z = z; this.r = r; this.c = c;
    const d = src.deg(z);
    this.lon0 = -180 + c * d; this.lon1 = Math.min(this.lon0 + d, 180);
    this.lat1 = 90 - r * d; this.lat0 = Math.max(this.lat1 - d, -90);
    this.deg = d;
    const lat = (this.lat0 + this.lat1) / 2, lon = (this.lon0 + this.lon1) / 2;
    const theta = (90 - lat) * DEG, phi = (lon + 180) / 360 * Math.PI * 2;
    this.center = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    this.halfAngle = d * DEG * 0.72;
    this.children = null; this.mesh = null; this.tex = null; this.nightTex = null; this.state = 'idle'; this.nightState = 'idle'; this.lastUsed = 0;
    this.uvRect = new THREE.Vector4((this.lon0 + 180) / 360, (this.lat0 + 90) / 180, 360 / (this.lon1 - this.lon0), 180 / (this.lat1 - this.lat0));
  }
  get key() { return `${this.z}/${this.r}/${this.c}`; }
}

export class TileGlobe {
  /** planet: PlanetRenderer (surface material + group); src: TILE_SOURCES entry; renderer for anisotropy. */
  constructor(planet, src, renderer, maxZoom = 8, minShow = 3) {
    this.planet = planet; this.src = src; this.renderer = renderer;
    this.maxZ = Math.min(src.max, maxZoom);
    this.minShow = minShow;                                   // coarser levels are never displayed (the base texture is at least as sharp)
    this.group = new THREE.Group(); this.group.renderOrder = 61;   // tiles sit exactly on the sphere: a per-level depth bias in the shader puts them above the base (and children above parents)
    planet.group.add(this.group);
    this.roots = [];
    const d = src.deg(src.root), cols = Math.ceil(360 / d), rows = Math.ceil(180 / d);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.roots.push(new Tile(src.root, r, c, src));
    this.cache = new Map(); this.loading = 0; this.queue = [];
    this.active = false; this.visibleCount = 0; this.time = 0;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._frustum = new THREE.Frustum(); this._m4 = new THREE.Matrix4(); this._sphere = new THREE.Sphere();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.credit = src.credit;
  }

  /** camera: THREE camera; camLocal: camera in the planet's unit-sphere frame; rpx: planet radius in px; focalPx: h / (2 tan(fov/2)). */
  update(camera, camLocal, rpx, focalPx, dt) {
    this.time += dt;
    const wasActive = this.active;
    this.active = rpx > 420;
    if (!this.active) { if (wasActive) this._hideAll(this.roots); return; }
    this.visibleCount = 0; this.queue.length = 0;
    const camDist = camLocal.length();
    const horizon = 1 / Math.max(camDist, 1.0001);          // cos of the angle from the sub-camera point to the horizon
    const camDir = this._v.copy(camLocal).normalize();
    this._frustum.setFromProjectionMatrix(this._m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this._world = this.planet.group.matrixWorld; this._radiusWorld = this.planet.body.radius;
    for (const t of this.roots) this._visit(t, camera, camLocal, camDir, horizon, focalPx);
    // load by priority (largest on screen first)
    this.queue.sort((a, b) => b.pri - a.pri);
    for (const q of this.queue) { if (this.loading >= CONCURRENCY) break; this._load(q.tile, q.night); }
    this._evict();
  }

  /** Returns true when everything visible inside this tile's footprint is drawn (by ready tiles, or nothing of it is on screen). */
  _visit(t, camera, camLocal, camDir, horizon, focalPx) {
    // facing / horizon test: the tile centre must be above the camera's horizon (with the tile's own extent as margin)
    const facing = t.center.dot(camDir);
    if (facing < horizon - Math.sin(t.halfAngle) - 0.02) { this._hide(t); return true; }
    // projected size (px) of the tile: chord / (distance to its nearest point) × focal
    const chord = 2 * Math.sin(t.deg * DEG / 2) * Math.max(Math.cos((t.lat0 + t.lat1) / 2 * DEG), 0.2);
    const distC = this._v2.copy(camLocal).sub(t.center).length();
    const dist = Math.max(distC - chord * 0.6, camLocal.length() - 1, 1e-4);
    const px = chord / dist * focalPx;
    // frustum culling with the tile's bounding sphere (world units)
    this._sphere.center.copy(t.center).applyMatrix4(this._world);
    this._sphere.radius = chord * 0.75 * this._radiusWorld;
    if (!this._frustum.intersectsSphere(this._sphere)) { this._hide(t); return true; }
    const wantSplit = t.z < this.maxZ && px > this.src.size * 1.35;
    if (wantSplit) {
      if (!t.children) this._split(t);
      let covered = true;
      for (const c of t.children) if (!this._visit(c, camera, camLocal, camDir, horizon, focalPx)) covered = false;
      if (covered) { this._hide(t, false); return true; }      // the visible children draw everything: no need for this tile
    } else if (t.children) this._hideAll(t.children);
    t.lastUsed = this.time;
    if (t.z < this.minShow) { this._hide(t, false); return false; }
    if (t.state === 'ready') {
      this._show(t); this.visibleCount++;
      if (this.src.night && t.z <= this.src.night.max && t.nightState === 'idle') this.queue.push({ tile: t, pri: px * 0.5, night: true });
      return true;
    }
    if (t.state === 'idle') this.queue.push({ tile: t, pri: px, night: false });
    this._hide(t, false); return false;
  }
  _childHidden(c, camDir, horizon) { return c.center.dot(camDir) < horizon - Math.sin(c.halfAngle) - 0.02; }

  _split(t) {
    t.children = [];
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
      const c = new Tile(t.z + 1, t.r * 2 + dr, t.c * 2 + dc, this.src);
      if (c.lat1 <= -90 || c.lon0 >= 180) continue;
      t.children.push(c);
    }
  }

  _show(t) {
    if (!t.mesh) {
      const base = this.planet.surfMat;
      const u = Object.assign({}, base.uniforms, { uMap: { value: t.tex }, uTileUV: { value: t.uvRect }, uNightMap: { value: t.nightTex || base.uniforms.uNightMap.value }, uNightTileUV: { value: t.nightTex ? t.uvRect : new THREE.Vector4(0, 0, 1, 1) } });
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader, defines: { TILE_BIAS: ((t.z + 1) * 1.5e-7).toExponential(2) } });
      t.mesh = new THREE.Mesh(tileGeometry(t.lon0, t.lon1, t.lat0, t.lat1, 12), mat);
      t.mesh.renderOrder = 61; t.mesh.frustumCulled = false;
      this.group.add(t.mesh);
    }
    if (t.nightTex && t.mesh.material.uniforms.uNightMap.value !== t.nightTex) { t.mesh.material.uniforms.uNightMap.value = t.nightTex; t.mesh.material.uniforms.uNightTileUV.value = t.uvRect; }
    t.mesh.visible = true;
  }
  _hide(t, deep = true) { if (t.mesh) t.mesh.visible = false; if (deep && t.children) this._hideAll(t.children); }
  _hideAll(list) { for (const t of list) this._hide(t, true); }

  async _load(t, night) {
    const src = night ? this.src.night : this.src;
    if (night) t.nightState = 'loading'; else t.state = 'loading';
    this.loading++;
    try {
      const res = await fetch(src.url(t.z, t.r, t.c), { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      // WebGL ignores UNPACK_FLIP_Y for ImageBitmap sources: bake the flip into the bitmap so v = 1 is the northern edge
      const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
      const tex = new THREE.Texture(bmp);
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = this.aniso; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
      if (night) { t.nightTex = tex; t.nightState = 'ready'; } else { t.tex = tex; t.state = 'ready'; }
      this.cache.set(t.key + (night ? ':n' : ''), t);
    } catch (e) {
      if (night) t.nightState = 'failed'; else t.state = 'failed';
      setTimeout(() => { if (night) t.nightState = 'idle'; else t.state = 'idle'; }, 20000);
    } finally { this.loading--; }
  }

  _evict() {
    if (this.cache.size <= MAX_TEX) return;
    const arr = [...this.cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (let i = 0; i < arr.length - MAX_TEX; i++) {
      const [key, t] = arr[i];
      if (this.time - t.lastUsed < 8) break;
      if (key.endsWith(':n')) { if (t.nightTex) { t.nightTex.dispose(); t.nightTex = null; } t.nightState = 'idle'; }
      else { if (t.mesh) { this.group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.mesh = null; } if (t.tex) { t.tex.dispose(); t.tex = null; } t.state = 'idle'; }
      this.cache.delete(key);
    }
  }
}

/** Loads a local 8K texture once (sRGB data, converted in the shader like the 2K maps). */
const _hires = new Map();
export function loadHiRes(name, renderer) {
  if (_hires.has(name)) return _hires.get(name);
  const p = new Promise((resolve) => {
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/8k/${name}.jpg`, tex => {
      tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(tex);
    }, undefined, () => resolve(null));
  });
  _hires.set(name, p);
  return p;
}
loadHiRes.release = (name) => { _hires.delete(name); };
