import{$i as e,Ar as t,U as n,Ur as r,da as i,er as a,ir as o,qt as s}from"./three.core-CpYT6u8q.js";import{_ as c,d as l,f as u,g as d,h as f,m as p,p as m}from"./index-CKGQ5RVM.js";var h=`
  varying vec3 vN; varying vec3 vPos; varying vec2 vUv; varying vec3 vView;
  ${f}
  void main() {
    vN = normal; vPos = position; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${d}
  }
`,g=`
  precision highp float;
  varying vec3 vN; varying vec3 vPos; varying vec2 vUv; varying vec3 vView;
  uniform float uTime, uTemp, uIntensity, uDetail;
  uniform sampler2D uMap; uniform float uHasMap;
  uniform vec3 uTint;
  ${u}
  ${c}
  ${l}
  ${p}
  void main() {
    ${m}
    vec3 n = normalize(vN);
    vec3 p = n * 3.0;
    float t = uTime * 0.05;
    // granulation: cellular-ish via ridged noise, multi-scale, animated
    float g1 = max(1.0 - abs(snoise(vec3(p * 14.0 + t * 1.5))), 0.0);
    float g2 = max(1.0 - abs(snoise(vec3(p * 32.0 - t * 2.5 + 7.0))), 0.0);
    float g3 = max(1.0 - abs(snoise(vec3(p * 70.0 + t * 4.0 + 13.0))), 0.0);
    float gran = pow(g1, 2.2) * 0.6 + pow(g2, 2.2) * 0.35 * uDetail + pow(g3, 2.0) * 0.2 * uDetail;
    // large-scale brightness variation (supergranulation / faculae)
    float big = fbm(p * 2.0 + t * 0.3, 3) * 0.5 + 0.5;
    // sunspots: thresholded low-frequency noise, umbra + penumbra, concentrated at mid latitudes
    float lat = abs(n.y);
    float band = smoothstep(0.05, 0.2, lat) * (1.0 - smoothstep(0.45, 0.65, lat));
    float sp = fbm(p * 1.6 + vec3(5.0, t * 0.1, 2.0), 2) * 0.5 + 0.5;
    float spv = sp * (0.6 + 0.5 * band);
    float spot = smoothstep(0.72, 0.80, spv);           // penumbra
    float umbra = smoothstep(0.79, 0.85, spv);          // dark core
    float spotDark = 1.0 - spot * 0.55 - umbra * 0.4;
    // limb darkening
    float mu = max(dot(n, normalize(vView)), 0.0);
    float limb = 0.3 + 0.7 * pow(mu, 0.55);
    vec3 base = blackbody(uTemp) * uTint;
    // colour: photosphere warm; spots cooler/redder
    vec3 col = base * (0.45 + 1.1 * gran + 0.25 * big) * spotDark;
    col = mix(col, base * vec3(0.9, 0.55, 0.35) * 0.35, spot * 0.6);
    if (uHasMap > 0.5) { vec3 m = texture2D(uMap, vUv).rgb; col *= 0.85 + 0.3 * m; }
    col *= limb * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`,_=`
  varying vec3 vN; varying vec3 vView; varying vec3 vPos;
  ${f}
  void main() {
    vN = normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${d}
  }
`,v=`
  precision highp float;
  varying vec3 vN; varying vec3 vView; varying vec3 vPos;
  uniform float uTime, uIntensity; uniform vec3 uColor;
  ${u}
  ${c}
  ${p}
  void main() {
    ${m}
    vec3 n = normalize(vN);
    float mu = abs(dot(n, normalize(vView)));
    float rim = pow(max(1.0 - mu, 0.0), 2.5);
    float t = uTime * 0.08;
    vec3 p = normalize(vPos) * 6.0;
    // licking flames: ridged noise stretched radially and animated
    float f1 = max(1.0 - abs(snoise(p * 3.0 + vec3(0.0, t * 2.0, 0.0))), 0.0);
    float f2 = max(1.0 - abs(snoise(p * 7.0 - vec3(t * 3.0, 0.0, t))), 0.0);
    float flames = pow(f1, 3.0) * 0.7 + pow(f2, 4.0) * 0.5;
    float a = rim * (0.35 + flames) * uIntensity;
    // prominences: sparse big arcs
    float prom = smoothstep(0.6, 0.9, fbm(p * 1.2 + vec3(t * 0.5), 3) * 0.5 + 0.5) * rim * 1.5;
    vec3 col = uColor * (a + prom * vec3(1.0, 0.45, 0.3).r);
    col += vec3(1.0, 0.35, 0.2) * prom * 0.8;
    gl_FragColor = vec4(col * 1.2, clamp(a + prom, 0.0, 1.0));
  }
`,y=`
  varying vec2 vUv;
  ${f}
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${d}
  }
`,b=`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uIntensity, uInner; uniform vec3 uColor;
  ${u}
  ${c}
  ${p}
  void main() {
    ${m}
    float r = length(vUv) * 2.0;          // 1.0 at quad edge
    float ri = uInner;                    // sun radius in quad units
    if (r < ri * 0.98) discard;
    float ang = atan(vUv.y, vUv.x);
    float t = uTime * 0.02;
    // streamers: angular noise with radial stretch
    float s1 = clamp(fbm(vec3(cos(ang) * 3.0, sin(ang) * 3.0, r * 0.8 + t), 4) * 0.5 + 0.5, 0.0, 1.0);
    float s2 = clamp(fbm(vec3(cos(ang) * 9.0 + 3.0, sin(ang) * 9.0, r * 1.5 - t * 1.5), 3) * 0.5 + 0.5, 0.0, 1.0);
    float streamers = pow(s1, 2.5) * 0.9 + pow(s2, 3.0) * 0.5;
    float x = max(r - ri, 0.0) / ri;      // distance from the limb in radii
    float fall = 1.0 / (1.0 + x * 9.0) * exp(-x * 1.1);
    float edge = 1.0 - smoothstep(0.8, 1.0, r);
    float a = fall * (0.12 + 0.55 * streamers) * edge * uIntensity;
    // bright inner ring (K corona)
    a += exp(-x * 30.0) * 0.35 * edge * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`,x=class{constructor(r){this.opts=r,this.group=new s;let a=r.temp||5772,c=new n(...r.tint||[1,1,1]);this.surfMat=new e({uniforms:{uTime:{value:0},uTemp:{value:a},uIntensity:{value:r.intensity??3.2},uDetail:{value:1},uMap:{value:r.map||null},uHasMap:{value:+!!r.map},uTint:{value:c}},vertexShader:h,fragmentShader:g}),this.surface=new o(new i(1,128,96),this.surfMat),this.surface.renderOrder=50,this.group.add(this.surface);let l=new n().setRGB(1,.55,.3).lerp(c,.3);this.chromoMat=new e({uniforms:{uTime:{value:0},uIntensity:{value:1},uColor:{value:l}},vertexShader:_,fragmentShader:v,transparent:!0,depthWrite:!1,blending:2,side:0}),this.chromo=new o(new i(1.035,96,64),this.chromoMat),this.chromo.renderOrder=51,this.group.add(this.chromo);let u=new n().setRGB(1,.85,.65).lerp(c,.4);this.coronaMat=new e({uniforms:{uTime:{value:0},uIntensity:{value:1},uInner:{value:1/4},uColor:{value:u}},vertexShader:y,fragmentShader:b,transparent:!0,depthWrite:!1,depthTest:!0,blending:2,side:2}),this.corona=new o(new t(8,8),this.coronaMat),this.corona.renderOrder=52,this.group.add(this.corona),this.geoLow=new i(1,32,24),this.geoHigh=this.surface.geometry}update(e,t,n){this.surfMat.uniforms.uTime.value=e,this.chromoMat.uniforms.uTime.value=e,this.coronaMat.uniforms.uTime.value=e,this.corona.quaternion.copy(t.quaternion),this.group.updateMatrixWorld(!0);let i=this.group.getWorldQuaternion(new r);this.corona.quaternion.copy(i.invert().multiply(t.quaternion));let o=a.clamp((n-40)/400,0,1);this.surfMat.uniforms.uDetail.value=o,this.surface.geometry=n>60?this.geoHigh:this.geoLow,this.chromo.visible=n>6,this.coronaMat.uniforms.uIntensity.value=a.clamp(n/30,.15,1)*.6}};export{x as t};