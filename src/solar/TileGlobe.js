import * as THREE from 'three';
import { TileCache, textureBytes } from './TileCache.js';

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
const TREK_PNG = (body, layer) => (z, r, c) => `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm/${z}/${r}/${c}.png`;
// Elevation: AWS Terrarium (SRTM/GMTED/ETOPO, Web Mercator XYZ, RGB-encoded metres) for Earth; Trek 8-bit DEMs on the
// colour grid for the Moon (LOLA) and Mars (MOLA). Reprojected / decoded to a 256² half-float height texture per tile.
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const DEM_SIZE = 256;

export const TILE_SOURCES = {
  // GIBS EPSG:4326 matrix: level z tiles span 288/2^z degrees (exact grid from level 3 = 36° on); 512 px tiles
  earth: { deg: z => 288 / Math.pow(2, z), root: 3, max: 7, size: 512, minHi: 5, minLo: 3, url: GIBS('BlueMarble_NextGeneration', '500m'), night: { url: GIBS('VIIRS_CityLights_2012', '500m'), max: 7 }, dem: { kind: 'terrarium', url: TERRARIUM, max: 11, clampSea: true, minElev: 0 }, credit: 'NASA GIBS: Blue Marble Next Generation · VIIRS city lights · AWS Terrarium elevation' },
  // Trek: level z tiles span 180/2^z degrees; 256 px tiles
  moon: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Moon', 'LRO_WAC_Mosaic_Global_303ppd_v02'), dem: { kind: 'gray8', url: TREK_PNG('Moon', 'LRO_LOLA_DEM_Global_128ppd_v04'), range: [-9130, 10780], max: 5, minElev: -9130 }, credit: 'NASA LRO WAC mosaic · LOLA elevation (Moon Trek)' },
  mars: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Mars', 'Mars_Viking_MDIM21_ClrMosaic_global_232m'), dem: { kind: 'gray8', url: TREK_PNG('Mars', 'Mars_MGS_MOLA_DEM_mosaic_global_463m_8'), range: [-8200, 21230], max: 5, minElev: -8200 }, credit: 'NASA Viking MDIM 2.1 · MOLA elevation (Mars Trek)' },
  mercury: { deg: z => 180 / Math.pow(2, z), root: 1, max: 7, size: 256, minHi: 5, minLo: 4, url: TREK('Mercury', 'Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m'), credit: 'NASA MESSENGER MDIS mosaic (Mercury Trek)' },
};

/** Local 8K textures (Solar System Scope, CC BY 4.0) used between the 2K base and the streamed tiles. */
export const HIRES = {
  earth: { map: '8k_earth_daymap', night: '8k_earth_nightmap', cloud: '8k_earth_clouds' },
  moon: { map: '8k_moon' }, mars: { map: '8k_mars' }, mercury: { map: '8k_mercury' }, venus: { map: '8k_venus_surface' },
  jupiter: { map: '8k_jupiter' }, saturn: { map: '8k_saturn' },
};

const DEG = Math.PI / 180;
const CONCURRENCY = 6;
const resources = new WeakMap();
const IDENTITY_UV = new THREE.Vector4(0, 0, 1, 1);

export function tileGeometry(lon0, lon1, lat0, lat1, seg) {
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
  // Cover the chord gap between a coarse neighbour and a finer spherical edge.
  const edge = [];
  for (let i = 0; i < seg; i++) edge.push(i);
  for (let j = 0; j < seg; j++) edge.push(j * (seg + 1) + seg);
  for (let i = seg; i > 0; i--) edge.push(seg * (seg + 1) + i);
  for (let j = seg; j > 0; j--) edge.push(j * (seg + 1));
  const first = pos.length / 3;
  const inset = Math.max(1e-6, 1 - Math.cos(Math.max(lon1 - lon0, lat1 - lat0) * DEG / seg) + 2e-5);
  for (const k of edge) {
    pos.push(pos[k * 3] * (1 - inset), pos[k * 3 + 1] * (1 - inset), pos[k * 3 + 2] * (1 - inset));
    nrm.push(nrm[k * 3], nrm[k * 3 + 1], nrm[k * 3 + 2]); uv.push(uv[k * 2], uv[k * 2 + 1]);
  }
  for (let i = 0; i < edge.length; i++) { const j = (i + 1) % edge.length; idx.push(edge[i], first + i, edge[j], first + i, first + j, edge[j]); }
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
    this.parent = null; this.split = false; this.fade = 0; this.nightFade = 0; this.fallback = undefined;
    this.dem = null; this.demState = 'idle';
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
    this.group = new THREE.Group(); this.group.renderOrder = 59;   // tiles sit exactly on the sphere: a per-level depth bias in the shader puts them above the base (and children above parents)
    planet.group.add(this.group);
    this.roots = [];
    const d = src.deg(src.root), cols = Math.ceil(360 / d), rows = Math.ceil(180 / d);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.roots.push(new Tile(src.root, r, c, src));
    this.cache = new Map(); this.loading = 0; this.queue = [];
    if (!resources.has(renderer)) resources.set(renderer, { cache: new TileCache(), loading: 0, pending: [], frame: -1, uploads: 0 });
    this.resources = resources.get(renderer);
    this._usedTextures = new Set(); this._lastUpdate = 0;
    this.active = false; this.visibleCount = 0; this.time = 0;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._frustum = new THREE.Frustum(); this._m4 = new THREE.Matrix4(); this._sphere = new THREE.Sphere();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.credit = src.credit;
    this.radiusM = (planet.body.def.radiusKm || planet.body.def.r || 6371) * 1000;
    this.demLoading = 0;
    this.dummyDem = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType); this.dummyDem.needsUpdate = true;
    this._pixelCache = new Map();   // url -> Promise<ImageData>, bounded
  }

  /** camera: THREE camera; camLocal: camera in the planet's unit-sphere frame; rpx: planet radius in px; focalPx: h / (2 tan(fov/2)). */
  update(camera, camLocal, rpx, focalPx, dt, frame = 0) {
    this.time += dt;
    this.dt = dt; this._lastUpdate = performance.now();
    this._flushUploads(frame);
    this._usedTextures.clear();
    const wasActive = this.active;
    this.active = rpx > (wasActive ? 380 : 440);
    if (!this.active) { if (wasActive) this._hideAll(this.roots); return; }
    this.visibleCount = 0; this.queue.length = 0;
    const camDist = camLocal.length();
    const horizon = 1 / Math.max(camDist, 1.0001);          // cos of the angle from the sub-camera point to the horizon
    const camDir = this._v.copy(camLocal).normalize();
    this._frustum.setFromProjectionMatrix(this._m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    this._world = this.planet.group.matrixWorld; this._radiusWorld = this.planet.body.radius;
    for (const t of this.roots) this._visit(t, camera, camLocal, camDir, horizon, focalPx);
    // load by priority (largest on screen first)
    this.queue.sort((a, b) => Number(a.night) - Number(b.night) || b.pri - a.pri);
    for (const q of this.queue) {
      if (q.dem) { if (this.demLoading < 3) this._loadDem(q.tile); continue; }
      if (this.resources.loading >= CONCURRENCY || this.resources.pending.length >= 8) break;
      this._load(q.tile, q.night);
    }
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
    // always reach the first displayable level (coarser ones are never drawn, and the base sphere has no relief)
    const wantSplit = t.z < this.maxZ && (t.z < this.minShow || px > this.src.size * (t.split ? 1.1 : 1.5));
    t.split = wantSplit;
    if (wantSplit) {
      if (!t.children) this._split(t);
      let covered = true;
      for (const c of t.children) if (!this._visit(c, camera, camLocal, camDir, horizon, focalPx)) covered = false;
      if (covered) { this._hide(t, false); return true; }      // the visible children draw everything: no need for this tile
    } else if (t.children) this._hideAll(t.children);
    t.lastUsed = performance.now();
    if (t.z < this.minShow) { this._hide(t, false); return false; }
    if (t.state === 'ready') {
      this._show(t); this.visibleCount++;
      if (this.src.night && t.z <= this.src.night.max && t.nightState === 'idle') this.queue.push({ tile: t, pri: px * 0.5, night: true });
      if (this.src.dem && t.demState === 'idle') this.queue.push({ tile: t, pri: px * 0.8, dem: true });
      return t.fade >= 1;
    }
    if (t.state === 'idle') this.queue.push({ tile: t, pri: px / Math.max(1, t.z - this.minShow + 1), night: false });
    this._hide(t, false); return false;
  }
  _childHidden(c, camDir, horizon) { return c.center.dot(camDir) < horizon - Math.sin(c.halfAngle) - 0.02; }

  _split(t) {
    t.children = [];
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
      const c = new Tile(t.z + 1, t.r * 2 + dr, t.c * 2 + dc, this.src);
      if (c.lat1 <= -90 || c.lon0 >= 180) continue;
      c.parent = t; t.children.push(c);
    }
  }

  _show(t) {
    const base = this.planet.surfMat;
    if (t.fallback === undefined) {
      let p = t.parent;
      while (p && (!p.tex || p.fade < 1)) p = p.parent;
      t.fallback = p;
    }
    const fallback = t.fallback?.tex || base.uniforms.uMap.value;
    let nightParent = t.parent;
    while (nightParent && (!nightParent.nightTex || nightParent.nightFade < 1)) nightParent = nightParent.parent;
    const fallbackNight = nightParent?.nightTex || base.uniforms.uNightMap.value;
    this._usedTextures.add(t.tex); this._usedTextures.add(fallback);
    this._usedTextures.add(fallbackNight);
    if (t.nightTex) this._usedTextures.add(t.nightTex);
    t.fade = Math.min(1, t.fade + this.dt / 0.3);
    if (t.nightTex) t.nightFade = Math.min(1, t.nightFade + this.dt / 0.4);
    if (!t.mesh) {
      const u = Object.assign({}, base.uniforms, { uMap: { value: t.tex }, uTileUV: { value: t.uvRect }, uNightMap: { value: t.nightTex || base.uniforms.uNightMap.value }, uNightTileUV: { value: t.nightTex ? t.uvRect : IDENTITY_UV }, uParentMap: { value: fallback }, uParentUV: { value: t.fallback?.uvRect || IDENTITY_UV }, uBaseMap: base.uniforms.uMap, uBaseNight: base.uniforms.uNightMap, uTileFade: { value: 0 }, uNightFade: { value: 0 }, uTileSize: { value: this.src.size }, uDem: { value: this.dummyDem }, uDemOn: { value: 0 }, uDemScale: { value: 1 / this.radiusM }, uDemTexel: { value: this._demTexel(t) }, uDemStep: { value: this.src.dem ? (this.src.dem.kind === 'gray8' ? (this.src.dem.range[1] - this.src.dem.range[0]) / 255 * 0.35 : 2) : 0 } });
      const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader, defines: { TILE_BIAS: ((t.z + 1) * 1.5e-7).toExponential(2), TILE_SURFACE: 1 } });
      u.uParentNight = { value: fallbackNight }; u.uParentNightUV = { value: nightParent?.uvRect || IDENTITY_UV };
      t.mesh = new THREE.Mesh(tileGeometry(t.lon0, t.lon1, t.lat0, t.lat1, this.src.dem ? 40 : 16), mat);
      t.mesh.renderOrder = 59; t.mesh.frustumCulled = false;
      this.group.add(t.mesh);
    }
    const u = t.mesh.material.uniforms;
    u.uParentMap.value = fallback; u.uParentUV.value = t.fallback?.tex ? t.fallback.uvRect : IDENTITY_UV;
    u.uNightMap.value = t.nightTex || base.uniforms.uNightMap.value;
    u.uParentNight.value = fallbackNight; u.uParentNightUV.value = nightParent?.uvRect || IDENTITY_UV;
    u.uNightTileUV.value = t.nightTex ? t.uvRect : IDENTITY_UV;
    u.uTileFade.value = t.fade; u.uNightFade.value = t.nightFade;
    u.uDem.value = t.dem || this.dummyDem; u.uDemOn.value = t.dem ? 1 : 0;
    t.mesh.visible = true;
  }
  /** metres per height texel along east and north at the tile's centre latitude */
  _demTexel(t) {
    const latMid = (t.lat0 + t.lat1) / 2 * DEG;
    return new THREE.Vector2(this.radiusM * Math.max(Math.cos(latMid), 0.05) * (t.lon1 - t.lon0) * DEG / DEM_SIZE, this.radiusM * (t.lat1 - t.lat0) * DEG / DEM_SIZE);
  }

  /** Fetch + decode the elevation of a tile into a 256² half-float texture (row 0 = south). */
  async _loadDem(t) {
    const dem = this.src.dem;
    t.demState = 'loading'; this.demLoading++;
    try {
      let heights;
      if (dem.kind === 'gray8') heights = await this._demGray8(t, dem);
      else heights = await this._demTerrarium(t, dem);
      if (!heights) throw new Error('no data');
      const half = new Uint16Array(heights.length);
      for (let i = 0; i < heights.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
      const tex = new THREE.DataTexture(half, DEM_SIZE, DEM_SIZE, THREE.RedFormat, THREE.HalfFloatType);
      tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
      t.dem = tex; t.demState = 'ready';
    } catch (e) {
      t.demState = 'failed';
      setTimeout(() => { t.demState = 'idle'; }, 30000);
    } finally { this.demLoading--; }
  }
  _fetchPixels(url) {
    let p = this._pixelCache.get(url);
    if (!p) {
      p = this._fetchPixelsRaw(url).catch(e => { this._pixelCache.delete(url); throw e; });
      this._pixelCache.set(url, p);
      if (this._pixelCache.size > 96) this._pixelCache.delete(this._pixelCache.keys().next().value);
    }
    return p;
  }
  async _fetchPixelsRaw(url) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0); const img = ctx.getImageData(0, 0, bmp.width, bmp.height); bmp.close();
    return img;
  }
  /** Trek 8-bit DEM on the colour grid: same z/r/c (or the coarser parent when the colour goes deeper), grey scaled over `range`,
   *  alpha 0 = no data. Smoothed in source resolution to hide the 8-bit terraces, then resampled bilinearly. */
  async _demGray8(t, dem) {
    const z = Math.min(t.z, dem.max);
    const f = Math.pow(2, t.z - z);                      // colour tile finer than the DEM level: sample the parent DEM sub-rectangle
    const r = Math.floor(t.r / f), c = Math.floor(t.c / f);
    const img = await this._fetchPixels(dem.url(z, r, c));
    const W = img.width, H = img.height, d = img.data;
    const [lo, hi] = dem.range, span = hi - lo;
    // decode (row 0 = north) and blur: separable [1 4 6 4 1] / 16, twice as wide when the colour tile is much finer than the DEM
    let src = new Float32Array(W * H);
    for (let k = 0, q = 0; k < src.length; k++, q += 4) src[k] = d[q + 3] < 8 ? lo : lo + d[q] / 255 * span;
    const passes = f >= 4 ? 2 : 1;
    const tmp = new Float32Array(W * H);
    const kern = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
    for (let pass = 0; pass < passes; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -2; k <= 2; k++) a += kern[k + 2] * src[y * W + Math.min(W - 1, Math.max(0, x + k))]; tmp[y * W + x] = a; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let k = -2; k <= 2; k++) a += kern[k + 2] * tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x]; src[y * W + x] = a; }
    }
    const out = new Float32Array(DEM_SIZE * DEM_SIZE);
    const u0 = (t.c - c * f) / f, v0 = (t.r - r * f) / f;  // sub-rectangle of the DEM tile (from the top-left)
    for (let j = 0; j < DEM_SIZE; j++) {
      const fy = Math.min(H - 1.001, Math.max(0, (v0 + (1 - (j + 0.5) / DEM_SIZE) / f) * H - 0.5));   // out row 0 = south = bottom of the image
      const iy = Math.floor(fy), ay = fy - iy;
      for (let i = 0; i < DEM_SIZE; i++) {
        const fx = Math.min(W - 1.001, Math.max(0, (u0 + (i + 0.5) / DEM_SIZE / f) * W - 0.5));
        const ix = Math.floor(fx), ax = fx - ix;
        const a = src[iy * W + ix], b = src[iy * W + ix + 1], cc = src[(iy + 1) * W + ix], e = src[(iy + 1) * W + ix + 1];
        out[j * DEM_SIZE + i] = (a * (1 - ax) + b * ax) * (1 - ay) + (cc * (1 - ax) + e * ax) * ay;
      }
    }
    return out;
  }
  /** Terrarium (Web Mercator) tiles covering the equirectangular tile, decoded to metres and resampled bilinearly. */
  async _demTerrarium(t, dem) {
    const zm = Math.max(1, Math.min(dem.max, Math.floor(Math.log2(360 / t.deg))));
    const n = Math.pow(2, zm);
    const lat0 = Math.max(t.lat0, -85.05), lat1 = Math.min(t.lat1, 85.05);
    const merc = (lat) => (1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) / 2 * n;   // tile-space y (0 at the north)
    const x0 = Math.floor((t.lon0 + 180) / 360 * n), x1 = Math.min(n - 1, Math.floor((t.lon1 + 180) / 360 * n - 1e-9));
    const y0 = Math.max(0, Math.floor(merc(lat1))), y1 = Math.min(n - 1, Math.floor(merc(lat0) - 1e-9));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 12) throw new Error('too many dem tiles');
    const tiles = new Map();
    await Promise.all([].concat(...Array.from({ length: y1 - y0 + 1 }, (_, dy) => Array.from({ length: x1 - x0 + 1 }, (_, dx) => (async () => {
      const x = x0 + dx, y = y0 + dy;
      try {
        const img = await this._fetchPixels(dem.url(zm, x, y));
        const W = img.width, d = img.data, h = new Float32Array(W * W);
        for (let k = 0, q = 0; k < h.length; k++, q += 4) { const v = d[q] * 256 + d[q + 1] + d[q + 2] / 256 - 32768; h[k] = dem.clampSea ? Math.max(v, 0) : v; }
        tiles.set(y * n + x, { h, W });
      } catch (e) { /* hole: stays flat */ }
    })()))));
    if (!tiles.size) return null;
    const out = new Float32Array(DEM_SIZE * DEM_SIZE);
    for (let j = 0; j < DEM_SIZE; j++) {
      const lat = t.lat0 + (t.lat1 - t.lat0) * (j + 0.5) / DEM_SIZE;                 // row 0 = south
      if (lat < -85.05 || lat > 85.05) continue;
      const my = merc(lat), ty = Math.min(y1, Math.max(y0, Math.floor(my)));
      for (let i = 0; i < DEM_SIZE; i++) {
        const lon = t.lon0 + (t.lon1 - t.lon0) * (i + 0.5) / DEM_SIZE;
        const mx = (lon + 180) / 360 * n, tx = Math.min(x1, Math.max(x0, Math.floor(mx)));
        const src = tiles.get(ty * n + tx); if (!src) continue;
        const W = src.W;
        const fx = Math.min(W - 1.001, Math.max(0, (mx - tx) * W - 0.5)), fy = Math.min(W - 1.001, Math.max(0, (my - ty) * W - 0.5));
        const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
        const h = src.h, a = h[iy * W + ix], b = h[iy * W + ix + 1], c = h[(iy + 1) * W + ix], e = h[(iy + 1) * W + ix + 1];
        out[j * DEM_SIZE + i] = (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + e * ax) * ay;
      }
    }
    return out;
  }
  _hide(t, deep = true) { if (t.mesh) t.mesh.visible = false; if (deep && t.children) this._hideAll(t.children); }
  _hideAll(list) { for (const t of list) this._hide(t, true); }

  async _load(t, night) {
    const src = night ? this.src.night : this.src;
    if (night) t.nightState = 'loading'; else t.state = 'loading';
    this.loading++; this.resources.loading++;
    try {
      const res = await fetch(src.url(t.z, t.r, t.c), { mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      // WebGL ignores UNPACK_FLIP_Y for ImageBitmap sources: bake the flip into the bitmap so v = 1 is the northern edge
      const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (night) t.nightState = 'decoded'; else t.state = 'decoded';
      this.resources.pending.push({ owner: this, tile: t, night, bmp });
    } catch (e) {
      if (night) t.nightState = 'failed'; else t.state = 'failed';
      setTimeout(() => { if (night) t.nightState = 'idle'; else t.state = 'idle'; }, 20000);
    } finally { this.loading--; this.resources.loading--; }
  }

  _flushUploads(frame) {
    const shared = this.resources;
    if (shared.frame !== frame) { shared.frame = frame; shared.uploads = 0; }
    // One upload per rendered frame across ALL planets, including mip generation.
    while (shared.pending.length && shared.uploads < 1) {
      const day = shared.pending.findIndex(job => !job.night);
      const job = shared.pending.splice(day < 0 ? 0 : day, 1)[0];
      const { owner, tile: t, night, bmp } = job;
      if (!owner.active || performance.now() - t.lastUsed > 2000) {
        bmp.close(); if (night) t.nightState = 'idle'; else t.state = 'idle'; continue;
      }
      const tex = new THREE.Texture(bmp), key = t.key + (night ? ':n' : '');
      tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = owner.aniso; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
      const admitted = shared.cache.admit(tex.uuid, {
        bytes: textureBytes(bmp.width, bmp.height),
        used: () => t.lastUsed,
        pinned: () => owner._usedTextures.has(tex) && performance.now() - owner._lastUpdate < 1000,
        dispose: () => {
          tex.dispose(); bmp.close(); owner.cache.delete(key);
          if (night) { t.nightTex = null; t.nightState = 'idle'; t.nightFade = 0; }
          else {
            if (t.mesh) { owner.group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); t.mesh = null; }
            if (t.dem) { t.dem.dispose(); t.dem = null; t.demState = 'idle'; }
            t.tex = null; t.state = 'idle'; t.fade = 0; t.fallback = undefined;
          }
        },
      });
      if (!admitted) {
        // Keep decoded work bounded; never re-download a tile every frame when
        // the budget is full of visible ancestors. Retry after they release it.
        tex.dispose(); shared.pending.unshift(job); break;
      }
      owner.renderer.initTexture(tex); shared.uploads++;
      if (night) { t.nightTex = tex; t.nightState = 'ready'; } else { t.tex = tex; t.state = 'ready'; }
      owner.cache.set(key, t);
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
