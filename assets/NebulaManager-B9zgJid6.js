import{$i as e,A as t,Ga as n,Hi as r,Ln as i,Mi as a,Pr as o,Qr as s,Qt as c,Ri as l,V as u,eo as d,er as f,ir as p,j as m,nr as h,qt as g,to as _,ua as v,ut as y}from"./three.core-CpYT6u8q.js";import{D as b,a as x,b as S,d as C,p as w}from"./Units-CdeOmBEt.js";import{t as T}from"./Random-BQY5ImTV.js";import{c as E,f as D,g as O,h as k,m as A,n as j,p as M,t as N,v as P}from"./index-BUhyD4SX.js";import{n as F,t as I}from"./starShader-q4KtYt1g.js";var L=`
  varying vec3 vViewDir;
  ${k}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${O}
  }
`,R=`
  precision highp float;
  precision highp sampler3D;
  varying vec3 vViewDir;
  uniform mat3 uCamToWorld, uWorldToVol;
  uniform vec3 uCamVol;                     // camera in the volume frame (ly)
  uniform sampler3D tEmis, tDust, tDetail;
  uniform vec3 uWarpC, uWarpH, uWarpA, uWarpS;   // warp centre, half size, a, sinh(a)
  uniform vec3 uEllC, uEllR;                // content ellipsoid (ly)
  uniform vec4 uChan;                       // per-channel scale (relative to H-alpha), already ^gamma
  uniform float uDec, uGamma, uGain, uDustScale, uFade, uFrame, uBand, uDetail, uDetailFreq;
  uniform int uSteps;
  ${A}

  // line colours (sRGB-ish linear): H-alpha + H-beta pink-red, [OIII] teal, [NII]/[SII] deep red, blue reflection
  const vec3 C_HA = vec3(1.0, 0.13, 0.24);
  const vec3 C_O3 = vec3(0.05, 1.0, 0.78);
  const vec3 C_LOW = vec3(1.0, 0.06, 0.03);
  const vec3 C_SC = vec3(0.50, 0.66, 1.0);
  const vec3 EXT_RGB = vec3(0.74, 1.0, 1.30);   // reddening: blue is absorbed more

  vec3 volUV(vec3 p) { return (asinh((p - uWarpC) / uWarpH * uWarpS) / uWarpA) * 0.5 + 0.5; }

  void main() {
    ${M}
    vec3 rd = normalize(uWorldToVol * (uCamToWorld * normalize(vViewDir)));
    vec3 ro = uCamVol;
    // ray / ellipsoid
    vec3 o = (ro - uEllC) / uEllR, d = rd / uEllR;
    float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.0;
    float h = b * b - a * c;
    if (h <= 0.0) discard;
    h = sqrt(h);
    float t0 = max((-b - h) / a, 0.0), t1 = (-b + h) / a;
    if (t1 <= t0) discard;
    float len = t1 - t0;
    float dt = len / float(uSteps);
    // interleaved gradient noise, rotated every frame (the TAA pass integrates it)
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = t0 + dt * fract(ign + uFrame * 0.61803399);
    vec3 acc = vec3(0.0), T = vec3(1.0);
    float k10 = uDec * uGamma * 3.32192809;   // log2(10)
    bool ir = uBand > 0.5 && uBand < 1.5, radio = uBand > 3.5;
    for (int i = 0; i < 256; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      vec3 uvw = volUV(p);
      vec4 E = texture(tEmis, uvw);
      float D = texture(tDust, uvw).r;
      if (max(max(E.r, E.g), max(E.b, E.a)) + D > 0.004) {
        // sub-voxel turbulence: two octaves of the tiling detail texture, the second domain-warped by the first
        vec2 n = texture(tDetail, p * uDetailFreq).rg;
        vec2 n2 = texture(tDetail, p * uDetailFreq * 3.7 + vec3(n.x - 0.5, n.y - 0.5, n.x - n.y) * 0.45).rg;
        float m = mix(1.0, (0.3 + 1.4 * n.r) * (0.35 + 1.3 * n2.g) * (0.55 + 0.9 * n2.r), uDetail);
        // dust: ridged filaments (dark wisps and threads across the bright core)
        float md = mix(1.0, (0.15 + 1.7 * n2.g) * (0.4 + 1.2 * n.r), uDetail);
        vec4 e = uChan * exp2((E - 1.0) * k10) * step(0.003, E);
        // scattering phase (Henyey-Greenstein, g = 0.45) around the Trapezium
        float ct = dot(rd, p) / max(length(p), 1e-3);
        float ph = 0.7975 / pow(1.2025 - 0.9 * ct, 1.5);
        vec3 em;
        if (uBand < 0.5) em = e.r * C_HA + e.g * C_O3 + e.b * C_LOW + e.a * ph * C_SC;
        else if (ir) em = vec3(1.0, 0.5, 0.22) * (e.a * 2.5 + 0.02 * D * D) + vec3(0.9, 0.35, 0.3) * e.b * 0.3;   // warm dust
        else if (uBand < 2.5) em = vec3(0.45, 0.6, 1.0) * (e.g * 1.6 + e.r * 0.5);                                // UV: ionised gas
        else if (uBand < 3.5) em = vec3(0.7, 0.55, 1.0) * e.g * 0.12;                                               // X-ray: hot cavity gas
        else em = vec3(0.45, 1.0, 0.6) * (e.r + e.b * 0.5);                                                        // radio free-free
        em *= m * uGain;
        float sig = uDustScale * D * D * md * (ir || radio ? 0.03 : uBand > 2.5 ? 0.3 : 1.0);
        vec3 tau = sig * EXT_RGB * dt;
        vec3 tr = exp(-tau);
        acc += T * em * dt * mix(vec3(1.0), (1.0 - tr) / max(tau, vec3(1e-5)), step(1e-4, tau));
        T *= tr;
        if (max(T.r, max(T.g, T.b)) < 0.01) break;
      }
      t += dt;
    }
    vec3 col = acc * uFade;
    float alpha = (1.0 - dot(T, vec3(0.3333))) * uFade;
    if (alpha < 0.002 && max(col.r, max(col.g, col.b)) < 0.0005) discard;
    gl_FragColor = vec4(col, alpha);
  }
`,z=[{name:`θ¹ Ori C`,p:[0,0,0],lum:9e4,col:[.62,.74,1]},{name:`θ¹ Ori A`,p:[-.061,.055,.02],lum:18e3,col:[.66,.77,1]},{name:`θ¹ Ori B`,p:[-.032,.104,-.03],lum:4e3,col:[.7,.8,1]},{name:`θ¹ Ori D`,p:[.078,.04,.01],lum:14e3,col:[.66,.77,1]},{name:`θ² Ori A`,p:[.63,-.62,-1.3],lum:4e4,col:[.64,.76,1]},{name:`NU Ori`,p:[1.45,2.87,-.1],lum:2e4,col:[.66,.78,1]},{name:`42 Ori`,p:[-.4,12.6,-1.6],lum:9e3,col:[.68,.79,1]},{name:`ι Ori`,p:[.6,-14,-2.6],lum:6e4,col:[.63,.75,1]}];function B(e,t){let n=b(e,t),r=n.clone().normalize(),i=b(e+.01,t).sub(n).normalize(),a=new d().crossVectors(r,i).normalize();return i.crossVectors(a,r).normalize(),{E:i,N:a,L:r}}async function V(e){let t=new Uint8Array(e);if(t[0]!==31||t[1]!==139)return t;if(typeof DecompressionStream<`u`){let e=new Response(new Blob([t]).stream().pipeThrough(new DecompressionStream(`gzip`)));return new Uint8Array(await e.arrayBuffer())}let{gunzipSync:n}=await N(async()=>{let{gunzipSync:e}=await import(`./fflate.module-DVTTPdyi.js`);return{gunzipSync:e}},[],import.meta.url);return n(t)}function H(e,t,r,a,o,s=u){let c=new y(e,t,r,a);return c.format=o,c.type=n,c.minFilter=c.magFilter=i,c.wrapS=c.wrapT=c.wrapR=s,c.unpackAlignment=1,c.generateMipmaps=!1,c.needsUpdate=!0,c}async function U(t){let n=`./volumes/${t}`,i=await(await fetch(`${n}.json`)).json(),o=await fetch(`${n}.vol`);if(!o.ok)throw Error(`HTTP ${o.status}`);let c=await V(await o.arrayBuffer()),[u,f,p]=i.dims,m=u*f*p*4,g=u*f*p,[v,y,b]=i.layout[2].dims;if(c.byteLength<m+g+v*y*b*2)throw Error(`truncated volume`);let x=H(c.subarray(0,m),u,f,p,s),S=H(c.subarray(m,m+g),u,f,p,l),C=H(c.subarray(m+g,m+g+v*y*b*2),v,y,b,a,r),w=i.warp,T=i.scales,E=i.envelope||.97,D=i.render||{},O=D.gamma??.6,k=D.chanGain||[1,1,1,1],A=new _(1,T.o3/T.ha,T.low/T.ha,T.scat/T.ha);return[`x`,`y`,`z`,`w`].forEach((e,t)=>{A[e]=A[e]**+O*k[t]}),{meta:i,mat:new e({uniforms:{uCamToWorld:{value:new h},uWorldToVol:{value:new h},uCamVol:{value:new d},tEmis:{value:x},tDust:{value:S},tDetail:{value:C},uWarpC:{value:new d(w.x[0],w.y[0],w.z[0])},uWarpH:{value:new d(w.x[1],w.y[1],w.z[1])},uWarpA:{value:new d(w.x[2],w.y[2],w.z[2])},uWarpS:{value:new d(Math.sinh(w.x[2]),Math.sinh(w.y[2]),Math.sinh(w.z[2]))},uEllC:{value:new d(w.x[0],w.y[0],w.z[0])},uEllR:{value:new d(w.x[1]*E,w.y[1]*E,w.z[1]*E)},uChan:{value:A},uDec:{value:i.dec},uGamma:{value:O},uGain:{value:D.gain??.1},uDustScale:{value:T.dust},uFade:{value:1},uFrame:{value:0},uBand:{value:0},uDetail:{value:D.detail??.9},uDetailFreq:{value:1/(D.detailTile??1.4)},uSteps:{value:64}},vertexShader:L,fragmentShader:R,transparent:!0,depthWrite:!1,depthTest:!1,side:1,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205}),textures:[x,S,C],bytes:c.byteLength}}function W(e,t,n,r,i,a){let o=e.mat.uniforms;o.uCamToWorld.value.copy(n),o.uWorldToVol.value.copy(e.worldToVol),o.uCamVol.value.copy(t).sub(e.pos).multiplyScalar(1/C).applyMatrix3(e.worldToVol),o.uSteps.value=r,o.uFade.value=i,o.uFrame.value=a%4096}var G=[{name:`Orion Nebula`,aliases:[`M42`,`NGC 1976`],ra:83.82,dec:-5.39,dist:1344,size:24,type:0,seed:1,bright:1.2,stars:6,volume:`orion_m42`,volStars:z,desc:`The closest region of massive star formation, a glowing cloud 24 light-years across lit by the four hot stars of the Trapezium. Visible to the naked eye as the middle "star" of Orion's sword, it is a stellar nursery of some 700 young stars and protoplanetary discs.`},{name:`Carina Nebula`,aliases:[`NGC 3372`,`Eta Carinae Nebula`],ra:161.29,dec:-59.87,dist:8500,size:300,type:0,seed:2,bright:1.1,stars:10,desc:`One of the largest and brightest nebulae in the sky, four times the size of the Orion Nebula, home to the unstable hypergiant Eta Carinae and the Mystic Mountain pillars.`},{name:`Eagle Nebula`,aliases:[`M16`,`NGC 6611`,`Pillars of Creation`],ra:274.7,dec:-13.8,dist:7e3,size:70,type:0,seed:3,bright:1,stars:5,pillars:1,desc:`A young open cluster embedded in an emission nebula, famous for the Pillars of Creation — towers of gas and dust several light-years tall, sculpted by the ultraviolet light of newborn stars.`},{name:`Lagoon Nebula`,aliases:[`M8`,`NGC 6523`],ra:270.92,dec:-24.38,dist:4100,size:110,type:0,seed:4,bright:1,stars:5,desc:`A giant interstellar cloud in Sagittarius, one of only two star-forming nebulae faintly visible to the naked eye from mid-northern latitudes.`},{name:`Trifid Nebula`,aliases:[`M20`,`NGC 6514`],ra:270.62,dec:-23.03,dist:4100,size:40,type:0,seed:5,bright:1,stars:3,reflection:.6,desc:`A rare combination of emission (red), reflection (blue) and dark nebulae, split into three lobes by dust lanes.`},{name:`Omega Nebula`,aliases:[`M17`,`Swan Nebula`],ra:275.2,dec:-16.18,dist:5500,size:15,type:0,seed:6,bright:1.1,stars:4,desc:`One of the brightest and most massive star-forming regions in the Milky Way, shaped like a swan or the Greek letter omega.`},{name:`Rosette Nebula`,aliases:[`NGC 2237`,`Caldwell 49`],ra:97.98,dec:4.95,dist:5200,size:130,type:0,seed:7,bright:.9,stars:6,ring:1,desc:`A vast rose-shaped cloud whose central cavity has been blown clear by the winds of the young cluster NGC 2244 at its heart.`},{name:`North America Nebula`,aliases:[`NGC 7000`],ra:314.7,dec:44.5,dist:2590,size:100,type:0,seed:8,bright:.8,stars:2,desc:`A large emission nebula near Deneb whose shape resembles the North American continent, ionised by a hidden hot star.`},{name:`Horsehead Nebula`,aliases:[`Barnard 33`,`IC 434`],ra:85.24,dec:-2.46,dist:1400,size:10,type:0,seed:9,bright:.9,stars:1,dust:1.5,desc:`A dark cloud of dust silhouetted against the glowing hydrogen of IC 434, just south of Alnitak in Orion's belt — one of the most photographed objects in the sky.`},{name:`California Nebula`,aliases:[`NGC 1499`],ra:60.03,dec:36.62,dist:1e3,size:100,type:0,seed:10,bright:.7,stars:1,desc:`A long, faint emission nebula in Perseus, shaped like the state of California, energised by the runaway O star Menkib.`},{name:`Heart Nebula`,aliases:[`IC 1805`],ra:38.5,dec:61.5,dist:7500,size:200,type:0,seed:11,bright:.8,stars:5,desc:`A heart-shaped cloud of glowing hydrogen in Cassiopeia, carved out by the winds of the young cluster Melotte 15.`},{name:`Bubble Nebula`,aliases:[`NGC 7635`],ra:350.2,dec:61.2,dist:7100,size:10,type:0,seed:12,bright:.9,stars:1,bubble:1,desc:`A 10-light-year bubble blown into a molecular cloud by the fierce stellar wind of a single massive star, 45 times the mass of the Sun.`},{name:`Crab Nebula`,aliases:[`M1`,`NGC 1952`,`Taurus A`],ra:83.63,dec:22.01,dist:6500,size:11,type:2,seed:13,bright:1.2,stars:1,pulsar:1,desc:`The remnant of a supernova seen by Chinese astronomers in 1054 AD, still expanding at 1,500 km/s. At its centre a pulsar spins 30 times a second, powering the eerie blue synchrotron glow.`},{name:`Veil Nebula`,aliases:[`Cygnus Loop`,`NGC 6960`,`Witch's Broom`],ra:313,dec:30.7,dist:2400,size:110,type:2,seed:14,bright:.8,stars:0,veil:1,desc:`The delicate filamentary shell of a star that exploded 10,000–20,000 years ago, now 110 light-years across — one of the most beautiful supernova remnants.`},{name:`Ring Nebula`,aliases:[`M57`,`NGC 6720`],ra:283.4,dec:33.03,dist:2300,size:1.5,type:1,seed:15,bright:1.3,stars:1,desc:`A planetary nebula in Lyra: the glowing shell of gas shed by a dying Sun-like star, now a white dwarf at its centre — a preview of the Sun's own fate.`},{name:`Helix Nebula`,aliases:[`NGC 7293`,`Eye of God`],ra:337.41,dec:-20.84,dist:655,size:2.9,type:1,seed:16,bright:1.2,stars:1,desc:`The nearest bright planetary nebula, a vast eye-like shell of gas that will fade into space within tens of thousands of years.`},{name:`Dumbbell Nebula`,aliases:[`M27`,`NGC 6853`],ra:299.9,dec:22.72,dist:1360,size:3,type:1,seed:17,bright:1.2,stars:1,desc:`The first planetary nebula ever discovered (Messier, 1764), a bipolar shell in Vulpecula.`},{name:`Cat's Eye Nebula`,aliases:[`NGC 6543`],ra:269.64,dec:66.63,dist:3300,size:.5,type:1,seed:18,bright:1.4,stars:1,desc:`One of the most structurally complex planetary nebulae known, with concentric shells, jets and knots around a dying star.`},{name:`Pleiades`,aliases:[`M45`,`Seven Sisters`,`Subaru`],ra:56.75,dec:24.12,dist:444,size:16,type:3,seed:19,bright:.9,stars:9,desc:`A young open cluster of hot blue stars passing through a cloud of interstellar dust that scatters their light into a blue reflection nebula.`},{name:`Tarantula Nebula`,aliases:[`30 Doradus`,`NGC 2070`],ra:84.68,dec:-69.1,dist:16e4,size:600,type:0,seed:20,bright:1.3,stars:12,desc:`The most active starburst region in the Local Group, in the Large Magellanic Cloud. If it were as close as the Orion Nebula it would cast shadows on Earth.`}],K=`
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${k}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    vLocal = position;
    gl_Position = projectionMatrix * mv;
    ${O}
  }
`,q=`
  precision highp float;
  varying vec3 vViewDir; varying vec3 vLocal;
  uniform mat3 uCamToWorld;
  uniform vec3 uCamLocal;            // camera position in local (unit-sphere) coords
  uniform float uTime, uSeed, uType, uBright, uDust, uReflection, uRing, uBubble, uPillars, uVeil, uFade, uBand;
  uniform int uSteps;
  uniform vec3 uStar[4];
  uniform int uStarCount;
  ${D}
  ${P}
  ${A}

  float sphereExit(vec3 ro, vec3 rd) {
    float b = dot(ro, rd); float c = dot(ro, ro) - 1.0; float h = b * b - c; if (h < 0.0) return -1.0; return -b + sqrt(h);
  }
  float sphereEnter(vec3 ro, vec3 rd) {
    float b = dot(ro, rd); float c = dot(ro, ro) - 1.0; float h = b * b - c; if (h < 0.0) return -1.0; return -b - sqrt(h);
  }

  // density & colour model per type. returns emission rgb, alpha (extinction)
  void sampleNebula(vec3 p, out vec3 emis, out float dens) {
    float r = length(p);
    vec3 q = p * 2.2 + vec3(uSeed * 13.1, uSeed * 7.7, uSeed * 3.3);
    emis = vec3(0.0); dens = 0.0;
    if (uType < 0.5) {
      // emission nebula: warped fbm blobs, ionisation colour gradient, dust
      vec3 w = vec3(vfbm(q * 0.7 + 3.1, 3), vfbm(q * 0.7 + 9.2, 3), vfbm(q * 0.7 + 5.4, 3)) - 0.5;
      float n = vfbm(q + w * 1.6, 5);
      float envelope = 1.0 - smoothstep(0.45, 1.0, r);
      float d = smoothstep(0.47, 0.78, n) * envelope;
      d *= 0.55 + 0.9 * vfbm(q * 3.5 + 17.0, 3);   // fine filamentary detail
      if (uRing > 0.5) d *= smoothstep(0.15, 0.4, r);
      if (uBubble > 0.5) d *= 0.35 + 0.65 * smoothstep(0.02, 0.0, abs(r - 0.55)) * 3.0 + smoothstep(0.55, 0.9, r) * 0.6;
      if (uPillars > 0.5) { float pil = vfbm(vec3(q.x * 3.0, q.y * 0.6, q.z * 3.0) + 7.0, 3); d += smoothstep(0.55, 0.75, pil) * envelope * (0.5 + 0.5 * step(0.0, -p.y)) * 0.9; }
      // ionisation: near stars → cyan/OIII, far → red H-alpha
      float ion = 0.0;
      for (int i = 0; i < 4; i++) { if (i >= uStarCount) break; float ds = length(p - uStar[i]); ion += exp(-ds * ds * 6.0); }
      ion = clamp(ion, 0.0, 1.0);
      vec3 halpha = vec3(1.0, 0.28, 0.32);
      vec3 oiii = vec3(0.35, 0.85, 0.95);
      vec3 col = mix(halpha, oiii, ion * 0.85);
      if (uReflection > 0.0) col = mix(col, vec3(0.35, 0.55, 1.0), uReflection * smoothstep(0.3, 0.7, vfbm(q * 1.3 + 21.0, 3)));
      // dust: dark cold fingers (absorb, no emission)
      float dn = vfbm(q * 1.8 + 40.0, 4);
      float dust = smoothstep(0.62, 0.8, dn) * envelope * uDust;
      emis = col * d * (0.5 + 1.2 * ion + 0.3 * n) * uBright;
      dens = d * 1.6 + dust * 6.0;
      emis *= 1.0 - clamp(dust * 2.0, 0.0, 1.0);
    } else if (uType < 1.5) {
      // planetary nebula: bright thin shell with noise, faint blue-green interior, red rim
      float n = vfbm(q * 2.0, 4);
      float sh0 = (r - 0.64) / 0.07; float shell = exp(-sh0 * sh0) * (0.35 + 1.0 * n);
      float inner = smoothstep(0.62, 0.1, r) * 0.06 * (0.6 + 0.6 * vfbm(q * 3.0 + 9.0, 3));
      float rm0 = (r - 0.78) / 0.05; float rim = exp(-rm0 * rm0) * (0.4 + 0.6 * n) * 0.5;
      // bipolar lobes
      float lb0 = (length(p.xz) - 0.15) / 0.2; float lobes = exp(-lb0 * lb0) * smoothstep(0.3, 0.9, abs(p.y)) * 0.7 * (0.5 + n);
      vec3 col = vec3(0.4, 0.95, 0.75) * (shell + inner) + vec3(1.0, 0.35, 0.3) * rim + vec3(0.6, 0.75, 1.0) * lobes;
      emis = col * uBright * 1.1;
      dens = (shell + rim + lobes * 0.5) * 0.32 + inner * 0.1;
    } else if (uType < 2.5) {
      // supernova remnant: ridged filaments in an expanding shell
      float rid = max(1.0 - abs(vfbm(q * 3.0, 4) * 2.0 - 1.0), 0.0);
      rid = pow(rid, 6.0);
      float rid2 = pow(max(1.0 - abs(vfbm(q * 7.0 + 11.0, 3) * 2.0 - 1.0), 0.0), 8.0);
      float shell = uVeil > 0.5 ? smoothstep(0.55, 0.75, r) * (1.0 - smoothstep(0.85, 1.0, r)) : smoothstep(0.45, 0.7, r) * (1.0 - smoothstep(0.78, 0.92, r));
      float fil = (rid * 1.4 + rid2 * 1.0) * shell;
      // colours: red (H) and blue-green (O) filaments
      float mixc = vfbm(q * 1.5 + 30.0, 3);
      vec3 col = mix(vec3(1.0, 0.3, 0.25), vec3(0.35, 0.8, 0.95), smoothstep(0.35, 0.65, mixc));
      // Crab: synchrotron core glow
      float core = uVeil > 0.5 ? 0.0 : exp(-r * r * 6.0) * 0.5;
      emis = col * fil * 1.3 * uBright + vec3(0.55, 0.65, 1.0) * core * uBright;
      dens = fil * 0.45 + core * 0.15;
      if (uVeil > 0.5) { float arc = smoothstep(-0.2, 0.4, p.x); emis *= arc; dens *= arc; }
    } else {
      // reflection nebula: soft blue wisps around stars
      float n = vfbm(q * 1.2, 5);
      float envelope = 1.0 - smoothstep(0.4, 1.0, r);
      float d = smoothstep(0.45, 0.75, n) * envelope;
      float lit = 0.0;
      for (int i = 0; i < 4; i++) { if (i >= uStarCount) break; float ds = length(p - uStar[i]); lit += 1.0 / (1.0 + ds * ds * 20.0); }
      emis = vec3(0.4, 0.6, 1.0) * d * (0.15 + 0.9 * clamp(lit, 0.0, 1.5)) * uBright;
      dens = d * 1.2;
    }
  }

  void main() {
    ${M}
    vec3 rd = normalize(uCamToWorld * normalize(vViewDir));
    vec3 ro = uCamLocal;
    float tEnter = sphereEnter(ro, rd), tExit = sphereExit(ro, rd);
    if (tExit < 0.0) discard;
    float t0 = max(tEnter, 0.0);
    float len = tExit - t0;
    int steps = uSteps;
    float dt = len / float(steps);
    // jitter start to hide banding
    float jit = hash12(gl_FragCoord.xy + fract(uTime) * 100.0);
    float t = t0 + dt * jit;
    vec3 acc = vec3(0.0); float T = 1.0;
    for (int i = 0; i < 128; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * t;
      vec3 e; float d;
      sampleNebula(p, e, d);
      float a = 1.0 - exp(-d * dt * 1.3);
      acc += T * e * a;
      T *= 1.0 - a;
      t += dt;
      if (T < 0.015) break;
    }
    vec3 col = acc * uFade;
    float alpha = (1.0 - T) * uFade;
    if (uBand > 0.5) {
      float l = dot(col, vec3(0.3, 0.5, 0.2));
      if (uBand < 1.5) col = mix(col, vec3(1.0, 0.5, 0.2) * l * 1.4, 0.85);                       // infrared: warm dust glow
      else if (uBand < 2.5) col = mix(col, vec3(0.45, 0.6, 1.0) * l * (uType < 0.5 ? 1.6 : 0.6), 0.85); // uv: ionised gas
      else if (uBand < 3.5) { float x = uType > 1.5 && uType < 2.5 ? 2.0 : 0.05; col = vec3(0.7, 0.55, 1.0) * l * x; alpha *= uType > 1.5 && uType < 2.5 ? 1.0 : 0.2; } // x-ray: remnants only
      else col = mix(col, vec3(0.45, 1.0, 0.6) * l * 1.2, 0.85);                                     // radio
    }
    if (alpha < 0.003 && max(col.r, max(col.g, col.b)) < 0.003) discard;
    // premultiplied output: color already weighted; blend as (1, 1-alpha)
    gl_FragColor = vec4(col, alpha);
  }
`,J=class{constructor(t){this.ctx=t,this.engine=t.engine,this.registry=t.registry,this.group=new g,this.engine.nebulaScene.add(this.group),this.starGroup=new g,this.engine.scene.add(this.starGroup),this.items=[],this.visibleCount=0,this._v=new d,this._m3=new h,this.sphereGeo=new c(1,3),this._buildCatalog(),this._buildProcedural(),this.starMaterial=new e({uniforms:{uExposure:{value:1},uPixelRatio:{value:1},uMaxSize:{value:40},uFade:{value:1},uTime:{value:0},uMinLum:{value:0},uBand:{value:0}},vertexShader:F,fragmentShader:I,transparent:!0,depthWrite:!1,blending:2}),this._buildStars()}_makeNebula(t,n,r){let i=t.size/2*C,a=[],o=t.stars||0;for(let e=0;e<Math.min(o,4);e++){let e=r.unitVector(),n=t.type===1||t.type===2?0:.35*r.float()**.7;a.push(new d(e[0]*n,e[1]*n,e[2]*n))}for((t.type===1||t.type===2||t.type===0&&o===1)&&(a[0]=new d(0,0,0));a.length<4;)a.push(new d(9,9,9));let s=new e({uniforms:{uCamToWorld:{value:new h},uCamLocal:{value:new d},uTime:{value:0},uSeed:{value:t.seed},uType:{value:t.type},uBright:{value:t.bright||1},uDust:{value:t.dust??.7},uReflection:{value:t.reflection||0},uRing:{value:t.ring||0},uBubble:{value:t.bubble||0},uPillars:{value:t.pillars||0},uVeil:{value:t.veil||0},uFade:{value:1},uSteps:{value:32},uStar:{value:a},uStarCount:{value:Math.min(o,4)},uBand:{value:0}},vertexShader:K,fragmentShader:q,transparent:!0,depthWrite:!1,depthTest:!1,side:1,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205}),c=new p(this.sphereGeo,s);c.position.copy(n),c.scale.setScalar(i),c.renderOrder=40,c.frustumCulled=!0,c.visible=!1,this.group.add(c);let l={def:t,mesh:c,mat:s,pos:n,R:i,stars:a.slice(0,Math.min(o,4)),starCount:o};if(t.volume){let{E:e,N:n,L:r}=B(t.ra,t.dec);l.frame={E:e,N:n,L:r},l.worldToVol=new h().set(e.x,e.y,e.z,n.x,n.y,n.z,r.x,r.y,r.z),l.volume=null,l.volumeState=`idle`}return this.items.push(l),l}_buildCatalog(){let e=new T(555);for(let t of G){let n=b(t.ra,t.dec).multiplyScalar(t.dist*C),r=this._makeNebula(t,n,e),i=[`Emission nebula`,`Planetary nebula`,`Supernova remnant`,`Reflection nebula`][t.type];this.registry.add({id:`neb-`+t.name.toLowerCase().replace(/[^a-z0-9]+/g,`-`),name:t.name,kind:`nebula`,kindLabel:i,aliases:t.aliases,color:t.type===3?`#8fb4ff`:t.type===1?`#8fffd0`:`#ff9fb4`,radius:r.R,priority:4,labelRange:[1.1,900],maxLabelDistance:12e3*C,getPosition(e){return e.copy(n)},data:{type:i,distance:`${S(t.dist,3)} ly`,size:`≈ ${S(t.size,3)} ly across`},description:t.desc})}}_buildProcedural(){let e=new T(777),t=Math.round(60*(this.engine.q.chunkStars||1)),{pos:n}=E(t,778,{spread:.5,hScale:120,rMinAll:9e3});for(let r=0;r<t;r++){let t=new d(n[r*3],n[r*3+1],n[r*3+2]).clone().sub(w).applyMatrix4(x).multiplyScalar(C);if(t.length()<14191095708871.201)continue;let i=e.float()<.7?0:e.float()<.5?2:1,a=i===1?1+3*e.float():i===2?20+60*e.float():40+220*e.float(),o=[`Scutum–Centaurus`,`Sagittarius`,`Perseus`,`Outer`,`Orion`],s=[`Escudo–Centauro`,`Sagitario`,`Perseo`,`Exterior`,`Orión`],c=e.int(5),l=[`nEmission`,`nPlanetary`,`nSNR`][i],u={name:`${[`Sh2`,`RCW`,`Gum`,`LBN`][e.int(4)]}-${100+e.int(899)}`,dist:Math.round(t.length()/C),size:a,type:i,seed:100+r,bright:.8+.5*e.float(),stars:i===0?2+e.int(4):1,dust:.5+e.float()*.8,desc:j.tpl(`nebProc`,{kind:j.tpl(l,{}).en,arm:o[c],size:S(a,2)}).en,descEs:j.tpl(`nebProc`,{kind:j.tpl(l,{}).es,arm:s[c],size:S(a,2)}).es},f=this._makeNebula(u,t,e),p=[`Emission nebula`,`Planetary nebula`,`Supernova remnant`][i];this.registry.add({id:`pneb-`+r,name:u.name,kind:`nebula`,kindLabel:p,color:`#ff9fb4`,radius:f.R,priority:1,labelRange:[1.1,400],maxLabelDistance:3e3*C,getPosition(e){return e.copy(t)},data:{type:p+` (procedural)`,distance:`${S(u.dist,3)} ly`,size:`≈ ${S(a,2)} ly`},description:u.desc,i18n:{es:{description:u.descEs}}})}}_buildStars(){let e=new T(999),n=[],r=[],i=[],a=[];for(let t of this.items){let o=t.def.type===0?Math.max(t.starCount,3)*6:t.def.type===3?12:1;if(t.frame){let{E:o,N:s,L:c}=t.frame,l=(l,u,f,p,m)=>{let h=new d().addScaledVector(o,l).addScaledVector(s,u).addScaledVector(c,f).multiplyScalar(C).add(t.pos).multiplyScalar(1/C);n.push(h.x,h.y,h.z),r.push(p[0],p[1],p[2]),i.push(m),a.push(e.float())};for(let e of t.def.volStars)l(e.p[0],e.p[1],e.p[2],e.col,e.lum);for(let t=0;t<70;t++){let t=e.unitVector(),n=.15+2.6*e.float()**1.8,r=e.float()<.25;l(t[0]*n,t[1]*n,t[2]*n*.6-.2,r?[.7,.8,1]:[1,.72+.1*e.float(),.55],r?300+2500*e.float():8+60*e.float())}continue}for(let s=0;s<o;s++){let o;if(t.def.type===1||t.def.type===2)o=new d(0,0,0);else if(s<t.stars.length)o=t.stars[s].clone();else{let t=e.unitVector(),n=.45*e.float()**.6;o=new d(t[0]*n,t[1]*n,t[2]*n)}o.multiplyScalar(t.R).add(t.pos).multiplyScalar(1/C),n.push(o.x,o.y,o.z);let c=t.def.type===1?[.75,.85,1]:[.6+.2*e.float(),.75,1];r.push(c[0],c[1],c[2]),i.push(t.def.type===1?60:t.def.type===2?800:s<t.stars.length?2e4+6e4*e.float():200+4e3*e.float()),a.push(e.float())}}let s=new m;s.setAttribute(`position`,new t(new Float32Array(n),3)),s.setAttribute(`color`,new t(new Float32Array(r),3)),s.setAttribute(`lum`,new t(new Float32Array(i),1)),s.setAttribute(`seed`,new t(new Float32Array(a),1)),s.boundingSphere=new v(new d,2e5),this.stars=new o(s,this.starMaterial),this.stars.scale.setScalar(C),this.stars.frustumCulled=!1,this.stars.renderOrder=12,this.starGroup.add(this.stars)}_loadVolume(e){e.volumeState=`loading`,U(e.def.volume).then(({mat:t,meta:n})=>{t.uniforms.uBand.value=e.mat.uniforms.uBand?e.mat.uniforms.uBand.value:0,e.proceduralMat=e.mat,e.mat=t,e.mesh.material=t,e.volume=n,e.volumeState=`ready`,this.ctx.observatory&&this.ctx.observatory.register(t)}).catch(t=>{console.warn(`[nebula volume]`,e.def.volume,t&&t.message),e.volumeState=`failed`})}update(e,t,n){let r=this.engine.camera;this._m3.setFromMatrix4(r.matrixWorld);let i=window.innerHeight,a=i/(2*Math.tan(f.degToRad(r.fov)/2)),o=0,s=Math.max(12,Math.round(this.engine.q.nebulaSteps*this.engine.volumeStepScale));for(let e of this.items){let r=e.pos.distanceTo(n),c=e.R/Math.max(r-e.R,1e-6)*a,l=r<e.R;if(!l&&c<1.2){e.mesh.visible=!1;continue}e.mesh.visible=!0,o++;let u=Math.min(c/(i*.5),1),d=f.clamp((c-1.2)/3,0,1);if(e.frame&&(e.volumeState===`idle`&&(l||c>8)&&this._loadVolume(e),e.volume)){let t=f.clamp(Math.round(this.engine.q.nebulaSteps*1.5*this.engine.volumeStepScale),32,128);W(e,n,this._m3,l?t:Math.round(f.lerp(24,t,Math.sqrt(u))),d,this.engine.frame);continue}let p=e.mat.uniforms;p.uCamToWorld.value.copy(this._m3),p.uCamLocal.value.copy(n).sub(e.pos).multiplyScalar(1/e.R),p.uTime.value=t,p.uSteps.value=Math.round(f.lerp(12,s,Math.sqrt(u))),p.uFade.value=d}this.visibleCount=o,this.engine.nebulaActive=o>0&&this.group.visible;let c=this.starMaterial.uniforms;c.uTime.value=t,c.uPixelRatio.value=this.engine.renderer.getPixelRatio(),c.uExposure.value=this.ctx.universe.stars?this.ctx.universe.stars.exposure:1}};export{J as NebulaManager};