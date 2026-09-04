import{$a as e,$i as t,A as n,an as r,eo as i,er as a,in as o,ir as s,nr as c,qt as l,rr as u,ua as d}from"./three.core-CpYT6u8q.js";import{t as f}from"./EventBus-DzLmJ1Bg.js";import{D as p,a as m,b as h,d as g,p as _}from"./Units-BUZL48Ps.js";import{t as v}from"./Random-BQY5ImTV.js";import{_ as y,f as b,g as x,h as S,m as C,p as w}from"./index-CKGQ5RVM.js";var T=[{name:`Andromeda Galaxy`,aliases:[`M31`,`NGC 224`,`Andromeda`],ra:10.685,dec:41.269,dist:2537e3,size:22e4,type:0,incl:77,pa:35,arms:2,tint:[1,.92,.8],bright:.7,desc:`The nearest large galaxy, a barred spiral of a trillion stars 2.5 million light-years away — the most distant object visible to the naked eye. It is approaching us at 110 km/s and will merge with the Milky Way in about 4.5 billion years.`},{name:`Triangulum Galaxy`,aliases:[`M33`,`NGC 598`,`Triangulum`],ra:23.462,dec:30.66,dist:273e4,size:6e4,type:0,incl:54,pa:23,arms:2,tint:[.85,.9,1],bright:.8,desc:`The third-largest member of the Local Group, a loosely wound spiral rich in star-forming regions, including NGC 604, one of the largest known nebulae.`},{name:`Large Magellanic Cloud`,aliases:[`LMC`],ra:80.894,dec:-69.756,dist:163e3,size:14e3,type:2,incl:35,pa:170,arms:1,tint:[.9,.9,1],bright:.9,desc:`A satellite galaxy of the Milky Way, visible as a detached patch of the Milky Way from the southern hemisphere. Home of the Tarantula Nebula and Supernova 1987A.`},{name:`Small Magellanic Cloud`,aliases:[`SMC`],ra:13.158,dec:-72.8,dist:2e5,size:7e3,type:2,incl:60,pa:45,arms:1,tint:[.9,.92,1],bright:.75,desc:`A dwarf irregular galaxy orbiting the Milky Way together with the LMC, connected to it by a bridge of gas.`},{name:`Sagittarius Dwarf`,aliases:[`Sgr dSph`],ra:283.76,dec:-30.48,dist:7e4,size:1e4,type:1,incl:0,pa:0,arms:0,tint:[1,.9,.8],bright:.15,desc:`A dwarf spheroidal galaxy being torn apart by the Milky Way on the far side of the galactic centre, leaving long tidal streams of stars around our galaxy.`},{name:`Centaurus A`,aliases:[`NGC 5128`],ra:201.365,dec:-43.019,dist:12e6,size:6e4,type:1,incl:80,pa:35,arms:0,tint:[1,.9,.8],bright:1,dust:1,desc:`A giant elliptical galaxy crossed by a spectacular dust lane, the nearest active radio galaxy: a supermassive black hole in its core launches jets a million light-years long.`},{name:`Bode's Galaxy`,aliases:[`M81`,`NGC 3031`],ra:148.888,dec:69.065,dist:118e5,size:9e4,type:0,incl:60,pa:157,arms:2,tint:[1,.92,.82],bright:1,desc:`A grand-design spiral in Ursa Major with a bright nucleus, one of the brightest galaxies in the sky.`},{name:`Cigar Galaxy`,aliases:[`M82`,`NGC 3034`],ra:148.97,dec:69.68,dist:114e5,size:37e3,type:2,incl:82,pa:65,arms:0,tint:[1,.8,.6],bright:.9,desc:`A starburst galaxy forming stars ten times faster than the Milky Way, blowing out a superwind of hot gas, triggered by a close pass with M81.`},{name:`Whirlpool Galaxy`,aliases:[`M51`,`NGC 5194`],ra:202.47,dec:47.195,dist:23e6,size:76e3,type:0,incl:20,pa:170,arms:2,tint:[.9,.93,1],bright:1,desc:`A face-on grand-design spiral interacting with a small companion, NGC 5195 — the first galaxy in which spiral structure was recognised, in 1845.`},{name:`Pinwheel Galaxy`,aliases:[`M101`,`NGC 5457`],ra:210.802,dec:54.349,dist:21e6,size:17e4,type:0,incl:18,pa:40,arms:3,tint:[.9,.95,1],bright:.85,desc:`A vast face-on spiral nearly twice the diameter of the Milky Way, studded with giant star-forming regions.`},{name:`Sombrero Galaxy`,aliases:[`M104`,`NGC 4594`],ra:189.998,dec:-11.623,dist:29e6,size:5e4,type:0,incl:84,pa:90,arms:2,tint:[1,.92,.85],bright:1,dust:1,desc:`An almost edge-on galaxy with a brilliant bulge and a thick dark dust lane, harbouring a billion-solar-mass black hole.`},{name:`Messier 87`,aliases:[`M87`,`Virgo A`],ra:187.706,dec:12.391,dist:535e5,size:12e4,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:1,desc:`A supergiant elliptical galaxy at the heart of the Virgo Cluster whose 6.5-billion-solar-mass black hole was the first ever imaged, by the Event Horizon Telescope in 2019.`},{name:`Black Eye Galaxy`,aliases:[`M64`,`NGC 4826`],ra:194.182,dec:21.683,dist:17e6,size:54e3,type:0,incl:60,pa:115,arms:2,tint:[1,.9,.8],bright:.85,dust:1,desc:`A spiral with a dramatic dark band of dust in front of its nucleus; its outer gas rotates opposite to the inner disc.`},{name:`Sculptor Galaxy`,aliases:[`NGC 253`],ra:11.888,dec:-25.288,dist:114e5,size:9e4,type:0,incl:78,pa:52,arms:2,tint:[1,.9,.78],bright:.9,dust:1,desc:`A dusty starburst spiral, one of the brightest galaxies beyond the Local Group.`},{name:`Barnard's Galaxy`,aliases:[`NGC 6822`],ra:296.234,dec:-14.803,dist:16e5,size:7e3,type:2,incl:40,pa:10,arms:0,tint:[.9,.9,1],bright:.5,desc:`A dwarf irregular galaxy of the Local Group, similar to the Small Magellanic Cloud.`},{name:`Fornax Dwarf`,aliases:[`Fornax dSph`],ra:39.997,dec:-34.449,dist:46e4,size:4e3,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.12,desc:`A dwarf spheroidal satellite of the Milky Way with six globular clusters of its own.`},{name:`Sculptor Dwarf`,aliases:[`Sculptor dSph`],ra:15.039,dec:-33.709,dist:29e4,size:3e3,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.1,desc:`The first dwarf spheroidal galaxy discovered (1937), an ancient satellite of the Milky Way.`},{name:`Draco Dwarf`,aliases:[`Draco dSph`],ra:260.052,dec:57.915,dist:26e4,size:2500,type:1,incl:0,pa:0,arms:0,tint:[1,.9,.85],bright:.08,desc:`One of the most dark-matter-dominated galaxies known: its stars are a thin sprinkle in a massive dark halo.`},{name:`Ursa Minor Dwarf`,aliases:[`UMi dSph`],ra:227.286,dec:67.222,dist:225e3,size:2400,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.08,desc:`A faint, ancient satellite whose stars all formed more than 10 billion years ago.`},{name:`Carina Dwarf`,aliases:[`Carina dSph`],ra:100.403,dec:-50.966,dist:33e4,size:2800,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.08,desc:`A Milky Way satellite that formed its stars in several distinct bursts.`},{name:`Leo I`,aliases:[`Leo I dSph`],ra:152.117,dec:12.306,dist:82e4,size:3500,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.1,desc:`One of the most distant satellites of the Milky Way, near the edge of its gravitational grip.`},{name:`Messier 32`,aliases:[`M32`,`NGC 221`],ra:10.674,dec:40.865,dist:249e4,size:8e3,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.5,desc:`A compact elliptical satellite of Andromeda, possibly the stripped core of a former spiral.`},{name:`Messier 110`,aliases:[`M110`,`NGC 205`],ra:10.092,dec:41.685,dist:269e4,size:17e3,type:1,incl:0,pa:0,arms:0,tint:[1,.92,.85],bright:.4,desc:`The brightest dwarf elliptical companion of Andromeda, with an unusual dusty core.`},{name:`IC 10`,aliases:[`IC 10`],ra:5.072,dec:59.303,dist:22e5,size:5e3,type:2,incl:30,pa:135,arms:0,tint:[.85,.9,1],bright:.4,desc:`The only starburst galaxy in the Local Group, hidden behind the dust of the Milky Way's plane.`},{name:`Wolf–Lundmark–Melotte`,aliases:[`WLM`],ra:.492,dec:-15.461,dist:3e6,size:8e3,type:2,incl:70,pa:0,arms:0,tint:[.9,.92,1],bright:.35,desc:`An isolated dwarf irregular on the far edge of the Local Group, evolving almost untouched by neighbours.`}],E=`
  attribute vec3 iPos;      // ly, galaxy-centre frame
  attribute float iSize;    // ly (radius)
  attribute vec3 iAxis;     // disc normal (unit, model frame)
  attribute vec3 iParam;    // type, seed, bright
  attribute vec3 iTint;
  attribute vec3 iAux;      // arms, dust, incl unused
  uniform vec3 uCamPosModel;
  uniform float uMinAng;   // radians subtended by the minimum on-screen size (≈ 2.5 px)
  varying vec2 vUv; varying vec3 vTint; varying vec3 vParam; varying vec3 vAux;
  varying vec3 vRight, vUp, vView, vAxis; varying float vSize, vDist;
  ${S}
  void main() {
    vec3 toCam = uCamPosModel - iPos;
    float dist = length(toCam);
    vec3 view = toCam / max(dist, 1e-6);
    // billboard basis
    vec3 upRef = abs(view.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(upRef, view));
    vec3 up = cross(view, right);
    float quad = iSize * 1.6;
    // far away a galaxy would vanish below a pixel: inflate it to a minimum angular size, dimming to conserve light
    float minQuad = dist * uMinAng;
    float inflate = max(minQuad / quad, 1.0);
    quad *= inflate;
    vec3 p = iPos + (right * position.x + up * position.y) * quad * 2.0;
    vUv = position.xy * 2.0; vTint = iTint; vParam = vec3(iParam.x, iParam.y, iParam.z / sqrt(inflate)); vAux = iAux;
    vRight = right; vUp = up; vView = view; vAxis = iAxis; vSize = quad; vDist = dist;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${x}
  }
`,D=`
  precision highp float;
  varying vec2 vUv; varying vec3 vTint; varying vec3 vParam; varying vec3 vAux;
  varying vec3 vRight, vUp, vView, vAxis; varying float vSize, vDist;
  uniform float uFade, uTime, uRedshift;
  ${b}
  ${y}
  ${C}
  void main() {
    ${w}
    float type = vParam.x, seed = vParam.y, bright = vParam.z;
    float arms = vAux.x, dust = vAux.y;
    // quad point in model space (relative to galaxy centre), unit = galaxy radius R = vSize/1.6
    float R = vSize / 1.6;
    vec3 P = (vRight * vUv.x + vUp * vUv.y) * vSize;
    vec3 n = vAxis;
    float vn = dot(vView, n);
    // intersection of the (parallel) view ray with the disc plane
    float tpl = -dot(P, n) / (abs(vn) < 0.02 ? (vn < 0.0 ? -0.02 : 0.02) : vn);
    vec3 Q = P + vView * tpl;
    // in-plane basis
    vec3 e1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(n, e1);
    float x = dot(Q, e1) / R, y = dot(Q, e2) / R;
    float r = length(vec2(x, y));
    float th = atan(y, x);
    // path length through a thin disc (edge-on brightening), clamped by extent
    float h = 0.06;
    float pathL = min(h * 1.77 / max(abs(vn), 0.02), 2.0);
    // spherical bulge/halo from the quad distance (independent of tilt)
    float rq = length(vUv) * 1.6;
    float bulge = exp(-rq * rq * 45.0) * 1.1 + exp(-rq * 7.0) * 0.25;
    vec3 col = vec3(0.0);
    float disc = 0.0;
    if (type < 0.5) {
      // spiral: log-spiral arm modulation
      float pitch = 0.28 + 0.1 * hash11(seed * 3.1);
      float phase = log(max(r, 0.02)) / pitch;
      float armPat = 0.5 + 0.5 * cos(arms * (th - phase) + seed * 20.0);
      float armW = pow(armPat, 2.2);
      float n1 = clamp(snoise(vec3(x * 5.0, y * 5.0, seed * 7.0)) * 0.5 + 0.5, 0.0, 1.0);
      float n2 = clamp(snoise(vec3(x * 14.0, y * 14.0, seed * 9.0)) * 0.5 + 0.5, 0.0, 1.0);
      float prof = exp(-r * 2.4) * (1.0 - smoothstep(0.85, 1.05, r)) * smoothstep(0.0, 0.08, r);
      disc = prof * (0.12 + 1.5 * armW * (0.55 + 0.7 * n1)) * (0.7 + 0.6 * n2);
      // HII sparkle along arms
      float hii = pow(n2, 8.0) * armW * prof * 3.0;
      vec3 armCol = mix(vTint, vec3(0.65, 0.78, 1.0), 0.55 * armW);
      col += armCol * disc * pathL * 1.3 + vec3(1.0, 0.5, 0.6) * hii * pathL;
      // dust lane (multiplicative darkening near the plane, on the near side)
      if (dust > 0.5) {
        float lane = exp(-pow((dot(P, n) / R) / 0.045, 2.0)) * smoothstep(1.0, 0.2, rq) * step(0.0, -dot(vView, n) * dot(P, n) + 1e-4);
        float dn = snoise(vec3(x * 9.0, y * 9.0, seed)) * 0.5 + 0.5;
        col *= 1.0 - 0.75 * lane * (0.6 + 0.4 * dn);
        bulge *= 1.0 - 0.7 * lane;
      }
    } else if (type < 1.5) {
      // elliptical: smooth de Vaucouleurs-like profile, slightly flattened along the axis
      float flatn = 0.55 + 0.4 * hash11(seed);
      vec3 Pn = P / R; float z = dot(Pn, n);
      float rr = length(Pn - n * z) + abs(z) / flatn;
      float prof = min(exp(-7.67 * (pow(max(rr, 0.02) * 1.4, 0.25) - 1.0)), 2.5);
      col += vTint * prof * 0.6;
      if (dust > 0.5) { float lane = exp(-pow(z / 0.05, 2.0)) * smoothstep(1.0, 0.1, rr); col *= 1.0 - 0.8 * lane; }
    } else {
      // irregular: clumpy noise
      float n1 = clamp(snoise(vec3(x * 4.0, y * 4.0, seed)) * 0.5 + 0.5, 0.0, 1.0);
      float n2 = clamp(snoise(vec3(x * 11.0, y * 11.0, seed * 3.0)) * 0.5 + 0.5, 0.0, 1.0);
      float prof = exp(-r * r * 2.2) * (1.0 - smoothstep(0.8, 1.1, r));
      disc = prof * (0.3 + 1.2 * n1 * n1) * (0.6 + 0.8 * n2);
      col += mix(vTint, vec3(0.7, 0.8, 1.0), 0.5) * disc * pathL * 1.2 + vec3(1.0, 0.55, 0.6) * pow(n2, 10.0) * prof * 2.0;
    }
    col += vTint * bulge * (type < 1.5 ? 0.8 : 0.25);
    // soften quad edge
    float edge = 1.0 - smoothstep(1.35, 1.6, rq);
    col *= edge * bright * uFade;
    if (uRedshift > 0.5) {
      // Hubble flow: farther galaxies recede faster -> redder; the closest members of the Local Group approach -> bluer
      float mly = vDist / 1.0e6;
      float shift = clamp((mly - 3.0) / 300.0, -1.0, 1.0);
      vec3 red = vec3(1.0, 0.35, 0.2), blue = vec3(0.4, 0.6, 1.0);
      float l = dot(col, vec3(0.3, 0.5, 0.2));
      col = mix(col, (shift > 0.0 ? red : blue) * l * 1.6, abs(shift) * 0.9 + 0.1);
    }
    float a = clamp(max(max(col.r, col.g), col.b) * 2.0, 0.0, 1.0);
    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`,O=class{constructor(e){this.ctx=e,this.engine=e.engine,this.registry=e.registry,this.group=new l,this.group.matrixAutoUpdate=!1;let t=new i(-_.x,-_.y,-_.z).applyMatrix4(m).multiplyScalar(g);this.group.matrix.copy(m).scale(new i(g,g,g)).setPosition(t),this.group.matrixWorld.copy(this.group.matrix),this.centerScene=t,this._camModel=new i,this._invRot=new c().setFromMatrix4(m).transpose(),this._build(),this._registerRegions(),this.engine.scene.add(this.group),f.on(`toggle`,(e,t)=>{e===`redshift`&&(this.material.uniforms.uRedshift.value=+!!t)})}_build(){let e=new v(2024),a=[],c=new i;for(let t of T){p(t.ra,t.dec,c).multiplyScalar(t.dist);let n=c.clone().applyMatrix3(this._invRot).add(_),r=this._axisFor(t.incl,t.pa,c.clone().normalize());a.push({pos:n,size:t.size/2,axis:r,type:t.type,seed:e.float(),bright:t.bright,tint:t.tint,arms:t.arms,dust:t.dust||0,named:t})}let l=this.engine.q.chunkStars||1,u=[],f=55e6;for(let t=-5;t<=5;t++)for(let n=-5;n<=5;n++)for(let r=-5;r<=5;r++){if(Math.hypot(t,n,r)>5.5||e.float()<.68)continue;let a=new i((t+(e.float()-.5)*.7)*f,(n+(e.float()-.5)*.7)*f,(r+(e.float()-.5)*.7)*f);a.length()<2e7||u.push({p:a,rich:e.float()})}let m=(t,n,r=1)=>{let o=e.float()<.55?0:e.float()<.65?1:2,s=(o===1?3e4+9e4*e.float():o===0?25e3+7e4*e.float():6e3+15e3*e.float())/2*r,c=e.unitVector(),l=o===1?[1,.9,.78]:o===0?[.95+.05*e.float(),.9,.82+.15*e.float()]:[.85,.9,1];a.push({pos:t,size:s,axis:new i(c[0],c[1],c[2]),type:o,seed:e.float(),bright:n,tint:l,arms:2+e.int(3),dust:+(e.float()<.25)})};for(let t of u){let n=Math.round((10+45*t.rich*t.rich)*l);for(let r=0;r<n;r++){let n=Math.abs(e.gauss())*22e5*(.5+t.rich),a=e.unitVector();m(t.p.clone().add(new i(a[0],a[1],a[2]).multiplyScalar(n)),.55+.5*e.float(),r===0?2:1)}}for(let t of u){let n=u.filter(e=>e!==t).sort((e,n)=>e.p.distanceToSquared(t.p)-n.p.distanceToSquared(t.p)).slice(0,3);for(let r of n){if(t.p.x>r.p.x)continue;let n=t.p.distanceTo(r.p),i=Math.round(n/26e5*l*3.2);for(let n=0;n<i;n++){let n=e.float(),i=t.p.clone().lerp(r.p,n),a=1e6*(.5+.9*Math.sin(n*Math.PI));i.x+=e.gauss()*a,i.y+=e.gauss()*a,i.z+=e.gauss()*a,m(i,.3+.4*e.float())}}}for(let t=0;t<Math.round(300*l);t++){let t=e.unitVector(),n=25e6+e.float()**.7*25e7;m(new i(t[0]*n,t[1]*n,t[2]*n),.08+.12*e.float())}for(let t=0;t<1400;t++){let t=e.unitVector(),n=33e7+e.float()*25e7,r=new i(t[0]*n,t[1]*n,t[2]*n),o=e.float()<.5?0:e.float()<.6?1:2,s=e.unitVector();a.push({pos:r,size:(2e4+6e4*e.float())/2,axis:new i(s[0],s[1],s[2]),type:o,seed:e.float(),bright:.06+.12*e.float(),tint:[.95,.9,.85],arms:2,dust:0})}this._webNodes=u;let h=a.length,g=new r;g.setAttribute(`position`,new n(new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),3)),g.setIndex([0,1,2,0,2,3]),g.instanceCount=h;let y=new Float32Array(h*3),b=new Float32Array(h),x=new Float32Array(h*3),S=new Float32Array(h*3),C=new Float32Array(h*3),w=new Float32Array(h*3);a.forEach((e,t)=>{y[t*3]=e.pos.x,y[t*3+1]=e.pos.y,y[t*3+2]=e.pos.z,b[t]=e.size,x[t*3]=e.axis.x,x[t*3+1]=e.axis.y,x[t*3+2]=e.axis.z,S[t*3]=e.type,S[t*3+1]=e.seed,S[t*3+2]=e.bright,C[t*3]=e.tint[0],C[t*3+1]=e.tint[1],C[t*3+2]=e.tint[2],w[t*3]=e.arms,w[t*3+1]=e.dust,w[t*3+2]=0,e.named&&this._register(e)}),g.setAttribute(`iPos`,new o(y,3)),g.setAttribute(`iSize`,new o(b,1)),g.setAttribute(`iAxis`,new o(x,3)),g.setAttribute(`iParam`,new o(S,3)),g.setAttribute(`iTint`,new o(C,3)),g.setAttribute(`iAux`,new o(w,3)),g.boundingSphere=new d(new i,5e8),this.material=new t({uniforms:{uCamPosModel:{value:new i},uFade:{value:1},uTime:{value:0},uRedshift:{value:0},uMinAng:{value:.001}},vertexShader:E,fragmentShader:D,transparent:!0,depthWrite:!1,depthTest:!0,blending:2,side:2}),this.mesh=new s(g,this.material),this.mesh.frustumCulled=!1,this.mesh.renderOrder=3,this.group.add(this.mesh),this.count=h}_registerRegions(){let e=e=>e.clone().sub(_).applyMatrix4(m).multiplyScalar(g),t=(t,n,r,i,a,o,s,c={})=>{let l=e(i);this.registry.add({id:t,name:n,kind:`region`,kindLabel:c.kindLabel||`Large-scale structure`,aliases:r,color:`#b8a8ff`,radius:a*g,priority:4,labelRange:[1.5,60],searchable:!0,provenance:`simulated`,getPosition(e){return e.copy(l)},data:o,description:s,...c})};t(`local-group`,`Local Group`,[`Grupo Local`],new i(0,0,0).add(new i(8e5,3e5,2e5)),5e6,{type:`Galaxy group`,diameter:`≈ 10 million ly`,members:`≈ 80 galaxies (3 large spirals)`,mass:`≈ 2 × 10¹² M☉`,note:`Part of the Virgo Supercluster / Laniakea`},`The gravitationally bound group containing the Milky Way, Andromeda, Triangulum and some 80 dwarf galaxies, roughly 10 million light-years across. Andromeda and the Milky Way are falling toward each other and will merge in about 4.5 billion years.`,{kindLabel:`Galaxy group`,labelRange:[.8,40]});let n=(()=>{let e=new i;return p(187.7,12.7,e).multiplyScalar(54e6),e.applyMatrix3(this._invRot).add(_)})();t(`virgo-cluster`,`Virgo Cluster`,[`Cúmulo de Virgo`],n,75e5,{type:`Galaxy cluster`,distance:`≈ 54 million ly`,members:`1,300–2,000 galaxies`,mass:`≈ 1.2 × 10¹⁵ M☉`,note:`Centre of the Virgo Supercluster; the Local Group falls toward it at ~300 km/s`},`The nearest large galaxy cluster, dominated by the giant ellipticals M87, M86 and M49. Its gravity is pulling the Local Group toward it. Drawn here as a dense node of the simulated cosmic web at its real distance and direction.`,{kindLabel:`Galaxy cluster`,labelRange:[.8,40]}),t(`laniakea`,`Laniakea Supercluster`,[`Virgo Supercluster`,`Supercúmulo de Virgo`],n.clone().multiplyScalar(2.2),26e7,{type:`Supercluster`,diameter:`≈ 520 million ly`,members:`≈ 100,000 galaxies`,mass:`≈ 10¹⁷ M☉`,discovered:`Defined in 2014 from galaxy flows (Tully et al.)`},`"Immeasurable heaven": the basin of attraction in which the Milky Way, the Virgo Cluster and the Great Attractor all flow. Its boundaries are defined by where galaxy velocity fields diverge, not by a visible edge.`,{kindLabel:`Supercluster`,labelRange:[.5,20]}),t(`cosmic-web`,`Cosmic Web`,[`Red cósmica`,`Large-scale structure`,`Filaments`],new i(3e7,2e7,15e6),28e7,{type:`Large-scale structure (simulated)`,scale:`Filaments 50–300 million ly long; voids 100+ million ly across`,note:`Galaxies trace the dark-matter skeleton of the universe`},`On the largest scales matter is not spread evenly: galaxies cluster along filaments and sheets that surround vast, nearly empty voids, forming a web. This region is a procedural, scientifically inspired reconstruction — the real web is mapped by surveys such as SDSS and DESI.`,{kindLabel:`Cosmic web`,labelRange:[.5,30],approachElevation:.4})}_axisFor(e,t,n){let r=n.clone(),a=new i(0,1,0),o=new i().crossVectors(a,r).normalize(),s=new i().crossVectors(r,o).normalize(),c=t*Math.PI/180,l=e*Math.PI/180,u=s.clone().multiplyScalar(Math.cos(c)).addScaledVector(o,Math.sin(c)).normalize();return r.clone().applyAxisAngle(u,l).normalize().applyMatrix3(this._invRot).normalize()}_register(e){let t=e.named,n=e.pos.clone().sub(_).applyMatrix4(m).multiplyScalar(g),r=e.axis.clone().applyMatrix4(new u().extractRotation(m)).normalize();this.registry.add({id:`gal-`+t.name.toLowerCase().replace(/[^a-z0-9]+/g,`-`),name:t.name,kind:`galaxy`,aliases:t.aliases,color:`#c8c0ff`,radius:t.size/2*g,priority:4,labelRange:[2,70],axis:r,approachElevation:.55,getPosition(e){return e.copy(n)},data:{type:t.type===0?`Spiral galaxy`:t.type===1?`Elliptical galaxy`:`Irregular galaxy`,distance:`${h(t.dist/1e6,3)} million ly`,diameter:`≈ ${h(t.size,3)} ly`},description:t.desc})}update(t,n,r){this._camModel.copy(r).multiplyScalar(1/g).applyMatrix3(this._invRot).add(_),this.material.uniforms.uCamPosModel.value.copy(this._camModel),this.material.uniforms.uTime.value=n;let i=this.engine.camera;this.material.uniforms.uMinAng.value=a.degToRad(i.fov)/this.engine.renderer.getDrawingBufferSize(this._sz||=new e).y*1.4}};export{O as DistantGalaxies};