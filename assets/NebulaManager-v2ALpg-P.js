import{$i as e,A as t,Pr as n,Qt as r,eo as i,er as a,ir as o,j as s,nr as c,qt as l,ua as u}from"./three.core-CpYT6u8q.js";import{D as d,a as f,b as p,d as m,p as h}from"./Units-B32s_xJl.js";import{t as g}from"./Random-BQY5ImTV.js";import{c as _,f as v,g as y,h as b,m as x,n as S,p as C,v as w}from"./index-D_158ioN.js";import{n as T,t as E}from"./starShader-BCHWv7Mh.js";var D=[{name:`Orion Nebula`,aliases:[`M42`,`NGC 1976`],ra:83.82,dec:-5.39,dist:1344,size:24,type:0,seed:1,bright:1.2,stars:6,desc:`The closest region of massive star formation, a glowing cloud 24 light-years across lit by the four hot stars of the Trapezium. Visible to the naked eye as the middle "star" of Orion's sword, it is a stellar nursery of some 700 young stars and protoplanetary discs.`},{name:`Carina Nebula`,aliases:[`NGC 3372`,`Eta Carinae Nebula`],ra:161.29,dec:-59.87,dist:8500,size:300,type:0,seed:2,bright:1.1,stars:10,desc:`One of the largest and brightest nebulae in the sky, four times the size of the Orion Nebula, home to the unstable hypergiant Eta Carinae and the Mystic Mountain pillars.`},{name:`Eagle Nebula`,aliases:[`M16`,`NGC 6611`,`Pillars of Creation`],ra:274.7,dec:-13.8,dist:7e3,size:70,type:0,seed:3,bright:1,stars:5,pillars:1,desc:`A young open cluster embedded in an emission nebula, famous for the Pillars of Creation — towers of gas and dust several light-years tall, sculpted by the ultraviolet light of newborn stars.`},{name:`Lagoon Nebula`,aliases:[`M8`,`NGC 6523`],ra:270.92,dec:-24.38,dist:4100,size:110,type:0,seed:4,bright:1,stars:5,desc:`A giant interstellar cloud in Sagittarius, one of only two star-forming nebulae faintly visible to the naked eye from mid-northern latitudes.`},{name:`Trifid Nebula`,aliases:[`M20`,`NGC 6514`],ra:270.62,dec:-23.03,dist:4100,size:40,type:0,seed:5,bright:1,stars:3,reflection:.6,desc:`A rare combination of emission (red), reflection (blue) and dark nebulae, split into three lobes by dust lanes.`},{name:`Omega Nebula`,aliases:[`M17`,`Swan Nebula`],ra:275.2,dec:-16.18,dist:5500,size:15,type:0,seed:6,bright:1.1,stars:4,desc:`One of the brightest and most massive star-forming regions in the Milky Way, shaped like a swan or the Greek letter omega.`},{name:`Rosette Nebula`,aliases:[`NGC 2237`,`Caldwell 49`],ra:97.98,dec:4.95,dist:5200,size:130,type:0,seed:7,bright:.9,stars:6,ring:1,desc:`A vast rose-shaped cloud whose central cavity has been blown clear by the winds of the young cluster NGC 2244 at its heart.`},{name:`North America Nebula`,aliases:[`NGC 7000`],ra:314.7,dec:44.5,dist:2590,size:100,type:0,seed:8,bright:.8,stars:2,desc:`A large emission nebula near Deneb whose shape resembles the North American continent, ionised by a hidden hot star.`},{name:`Horsehead Nebula`,aliases:[`Barnard 33`,`IC 434`],ra:85.24,dec:-2.46,dist:1400,size:10,type:0,seed:9,bright:.9,stars:1,dust:1.5,desc:`A dark cloud of dust silhouetted against the glowing hydrogen of IC 434, just south of Alnitak in Orion's belt — one of the most photographed objects in the sky.`},{name:`California Nebula`,aliases:[`NGC 1499`],ra:60.03,dec:36.62,dist:1e3,size:100,type:0,seed:10,bright:.7,stars:1,desc:`A long, faint emission nebula in Perseus, shaped like the state of California, energised by the runaway O star Menkib.`},{name:`Heart Nebula`,aliases:[`IC 1805`],ra:38.5,dec:61.5,dist:7500,size:200,type:0,seed:11,bright:.8,stars:5,desc:`A heart-shaped cloud of glowing hydrogen in Cassiopeia, carved out by the winds of the young cluster Melotte 15.`},{name:`Bubble Nebula`,aliases:[`NGC 7635`],ra:350.2,dec:61.2,dist:7100,size:10,type:0,seed:12,bright:.9,stars:1,bubble:1,desc:`A 10-light-year bubble blown into a molecular cloud by the fierce stellar wind of a single massive star, 45 times the mass of the Sun.`},{name:`Crab Nebula`,aliases:[`M1`,`NGC 1952`,`Taurus A`],ra:83.63,dec:22.01,dist:6500,size:11,type:2,seed:13,bright:1.2,stars:1,pulsar:1,desc:`The remnant of a supernova seen by Chinese astronomers in 1054 AD, still expanding at 1,500 km/s. At its centre a pulsar spins 30 times a second, powering the eerie blue synchrotron glow.`},{name:`Veil Nebula`,aliases:[`Cygnus Loop`,`NGC 6960`,`Witch's Broom`],ra:313,dec:30.7,dist:2400,size:110,type:2,seed:14,bright:.8,stars:0,veil:1,desc:`The delicate filamentary shell of a star that exploded 10,000–20,000 years ago, now 110 light-years across — one of the most beautiful supernova remnants.`},{name:`Ring Nebula`,aliases:[`M57`,`NGC 6720`],ra:283.4,dec:33.03,dist:2300,size:1.5,type:1,seed:15,bright:1.3,stars:1,desc:`A planetary nebula in Lyra: the glowing shell of gas shed by a dying Sun-like star, now a white dwarf at its centre — a preview of the Sun's own fate.`},{name:`Helix Nebula`,aliases:[`NGC 7293`,`Eye of God`],ra:337.41,dec:-20.84,dist:655,size:2.9,type:1,seed:16,bright:1.2,stars:1,desc:`The nearest bright planetary nebula, a vast eye-like shell of gas that will fade into space within tens of thousands of years.`},{name:`Dumbbell Nebula`,aliases:[`M27`,`NGC 6853`],ra:299.9,dec:22.72,dist:1360,size:3,type:1,seed:17,bright:1.2,stars:1,desc:`The first planetary nebula ever discovered (Messier, 1764), a bipolar shell in Vulpecula.`},{name:`Cat's Eye Nebula`,aliases:[`NGC 6543`],ra:269.64,dec:66.63,dist:3300,size:.5,type:1,seed:18,bright:1.4,stars:1,desc:`One of the most structurally complex planetary nebulae known, with concentric shells, jets and knots around a dying star.`},{name:`Pleiades`,aliases:[`M45`,`Seven Sisters`,`Subaru`],ra:56.75,dec:24.12,dist:444,size:16,type:3,seed:19,bright:.9,stars:9,desc:`A young open cluster of hot blue stars passing through a cloud of interstellar dust that scatters their light into a blue reflection nebula.`},{name:`Tarantula Nebula`,aliases:[`30 Doradus`,`NGC 2070`],ra:84.68,dec:-69.1,dist:16e4,size:600,type:0,seed:20,bright:1.3,stars:12,desc:`The most active starburst region in the Local Group, in the Large Magellanic Cloud. If it were as close as the Orion Nebula it would cast shadows on Earth.`}],O=`
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${b}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    vLocal = position;
    gl_Position = projectionMatrix * mv;
    ${y}
  }
`,k=`
  precision highp float;
  varying vec3 vViewDir; varying vec3 vLocal;
  uniform mat3 uCamToWorld;
  uniform vec3 uCamLocal;            // camera position in local (unit-sphere) coords
  uniform float uTime, uSeed, uType, uBright, uDust, uReflection, uRing, uBubble, uPillars, uVeil, uFade, uBand;
  uniform int uSteps;
  uniform vec3 uStar[4];
  uniform int uStarCount;
  ${v}
  ${w}
  ${x}

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
    ${C}
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
`,A=class{constructor(t){this.ctx=t,this.engine=t.engine,this.registry=t.registry,this.group=new l,this.engine.nebulaScene.add(this.group),this.starGroup=new l,this.engine.scene.add(this.starGroup),this.items=[],this.visibleCount=0,this._v=new i,this._m3=new c,this.sphereGeo=new r(1,3),this._buildCatalog(),this._buildProcedural(),this.starMaterial=new e({uniforms:{uExposure:{value:1},uPixelRatio:{value:1},uMaxSize:{value:40},uFade:{value:1},uTime:{value:0},uMinLum:{value:0},uBand:{value:0}},vertexShader:T,fragmentShader:E,transparent:!0,depthWrite:!1,blending:2}),this._buildStars()}_makeNebula(t,n,r){let a=t.size/2*m,s=[],l=t.stars||0;for(let e=0;e<Math.min(l,4);e++){let e=r.unitVector(),n=t.type===1||t.type===2?0:.35*r.float()**.7;s.push(new i(e[0]*n,e[1]*n,e[2]*n))}for((t.type===1||t.type===2||t.type===0&&l===1)&&(s[0]=new i(0,0,0));s.length<4;)s.push(new i(9,9,9));let u=new e({uniforms:{uCamToWorld:{value:new c},uCamLocal:{value:new i},uTime:{value:0},uSeed:{value:t.seed},uType:{value:t.type},uBright:{value:t.bright||1},uDust:{value:t.dust??.7},uReflection:{value:t.reflection||0},uRing:{value:t.ring||0},uBubble:{value:t.bubble||0},uPillars:{value:t.pillars||0},uVeil:{value:t.veil||0},uFade:{value:1},uSteps:{value:32},uStar:{value:s},uStarCount:{value:Math.min(l,4)},uBand:{value:0}},vertexShader:O,fragmentShader:k,transparent:!0,depthWrite:!1,depthTest:!1,side:1,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205}),d=new o(this.sphereGeo,u);d.position.copy(n),d.scale.setScalar(a),d.renderOrder=40,d.frustumCulled=!0,d.visible=!1,this.group.add(d);let f={def:t,mesh:d,mat:u,pos:n,R:a,stars:s.slice(0,Math.min(l,4)),starCount:l};return this.items.push(f),f}_buildCatalog(){let e=new g(555);for(let t of D){let n=d(t.ra,t.dec).multiplyScalar(t.dist*m),r=this._makeNebula(t,n,e),i=[`Emission nebula`,`Planetary nebula`,`Supernova remnant`,`Reflection nebula`][t.type];this.registry.add({id:`neb-`+t.name.toLowerCase().replace(/[^a-z0-9]+/g,`-`),name:t.name,kind:`nebula`,kindLabel:i,aliases:t.aliases,color:t.type===3?`#8fb4ff`:t.type===1?`#8fffd0`:`#ff9fb4`,radius:r.R,priority:4,labelRange:[1.1,900],maxLabelDistance:12e3*m,getPosition(e){return e.copy(n)},data:{type:i,distance:`${p(t.dist,3)} ly`,size:`≈ ${p(t.size,3)} ly across`},description:t.desc})}}_buildProcedural(){let e=new g(777),t=Math.round(60*(this.engine.q.chunkStars||1)),{pos:n}=_(t,778,{spread:.5,hScale:120,rMinAll:9e3});for(let r=0;r<t;r++){let t=new i(n[r*3],n[r*3+1],n[r*3+2]).clone().sub(h).applyMatrix4(f).multiplyScalar(m);if(t.length()<14191095708871.201)continue;let a=e.float()<.7?0:e.float()<.5?2:1,o=a===1?1+3*e.float():a===2?20+60*e.float():40+220*e.float(),s=[`Scutum–Centaurus`,`Sagittarius`,`Perseus`,`Outer`,`Orion`],c=[`Escudo–Centauro`,`Sagitario`,`Perseo`,`Exterior`,`Orión`],l=e.int(5),u=[`nEmission`,`nPlanetary`,`nSNR`][a],d={name:`${[`Sh2`,`RCW`,`Gum`,`LBN`][e.int(4)]}-${100+e.int(899)}`,dist:Math.round(t.length()/m),size:o,type:a,seed:100+r,bright:.8+.5*e.float(),stars:a===0?2+e.int(4):1,dust:.5+e.float()*.8,desc:S.tpl(`nebProc`,{kind:S.tpl(u,{}).en,arm:s[l],size:p(o,2)}).en,descEs:S.tpl(`nebProc`,{kind:S.tpl(u,{}).es,arm:c[l],size:p(o,2)}).es},g=this._makeNebula(d,t,e),_=[`Emission nebula`,`Planetary nebula`,`Supernova remnant`][a];this.registry.add({id:`pneb-`+r,name:d.name,kind:`nebula`,kindLabel:_,color:`#ff9fb4`,radius:g.R,priority:1,labelRange:[1.1,400],maxLabelDistance:3e3*m,getPosition(e){return e.copy(t)},data:{type:_+` (procedural)`,distance:`${p(d.dist,3)} ly`,size:`≈ ${p(o,2)} ly`},description:d.desc,i18n:{es:{description:d.descEs}}})}}_buildStars(){let e=new g(999),r=[],a=[],o=[],c=[];for(let t of this.items){let n=t.def.type===0?Math.max(t.starCount,3)*6:t.def.type===3?12:1;for(let s=0;s<n;s++){let n;if(t.def.type===1||t.def.type===2)n=new i(0,0,0);else if(s<t.stars.length)n=t.stars[s].clone();else{let t=e.unitVector(),r=.45*e.float()**.6;n=new i(t[0]*r,t[1]*r,t[2]*r)}n.multiplyScalar(t.R).add(t.pos).multiplyScalar(1/m),r.push(n.x,n.y,n.z);let l=t.def.type===1?[.75,.85,1]:[.6+.2*e.float(),.75,1];a.push(l[0],l[1],l[2]),o.push(t.def.type===1?60:t.def.type===2?800:s<t.stars.length?2e4+6e4*e.float():200+4e3*e.float()),c.push(e.float())}}let l=new s;l.setAttribute(`position`,new t(new Float32Array(r),3)),l.setAttribute(`color`,new t(new Float32Array(a),3)),l.setAttribute(`lum`,new t(new Float32Array(o),1)),l.setAttribute(`seed`,new t(new Float32Array(c),1)),l.boundingSphere=new u(new i,2e5),this.stars=new n(l,this.starMaterial),this.stars.scale.setScalar(m),this.stars.frustumCulled=!1,this.stars.renderOrder=12,this.starGroup.add(this.stars)}update(e,t,n){let r=this.engine.camera;this._m3.setFromMatrix4(r.matrixWorld);let i=window.innerHeight,o=i/(2*Math.tan(a.degToRad(r.fov)/2)),s=0,c=this.engine.q.nebulaSteps;for(let e of this.items){let r=e.pos.distanceTo(n),l=e.R/Math.max(r-e.R,1e-6)*o;if(!(r<e.R)&&l<1.2){e.mesh.visible=!1;continue}e.mesh.visible=!0,s++;let u=e.mat.uniforms;u.uCamToWorld.value.copy(this._m3),u.uCamLocal.value.copy(n).sub(e.pos).multiplyScalar(1/e.R),u.uTime.value=t;let d=Math.min(l/(i*.5),1);u.uSteps.value=Math.round(a.lerp(12,c,Math.sqrt(d))),u.uFade.value=a.clamp((l-1.2)/3,0,1)}this.visibleCount=s,this.engine.nebulaActive=s>0&&this.group.visible;let l=this.starMaterial.uniforms;l.uTime.value=t,l.uPixelRatio.value=this.engine.renderer.getPixelRatio(),l.uExposure.value=this.ctx.universe.stars?this.ctx.universe.stars.exposure:1}};export{A as NebulaManager};