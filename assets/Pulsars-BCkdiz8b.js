import{$i as e,L as t,U as n,Ur as r,_a as i,ct as a,eo as o,er as s,ir as c,jt as l,qt as u,va as d}from"./three.core-CpYT6u8q.js";import{t as f}from"./EventBus-DzLmJ1Bg.js";import{d as p,u as m}from"./Units-B32s_xJl.js";import{f as h,g,h as _,m as v,p as y}from"./index-D_158ioN.js";var b=`
  varying vec3 vPos; varying vec2 vUv;
  ${_}
  void main() {
    vPos = position; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${g}
  }
`,x=`
  precision highp float;
  varying vec3 vPos; varying vec2 vUv;
  uniform float uTime, uIntensity; uniform vec3 uColor;
  ${h}
  ${v}
  void main() {
    ${y}
    // cone: y along the axis in [0,1]; fade with distance and toward the edge
    float along = vUv.y;
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x * 2.0 - 1.0));
    float flicker = 0.85 + 0.15 * hash12(vec2(floor(uTime * 60.0), along * 10.0));
    float a = (1.0 - along) * (1.0 - along) * edge * uIntensity * flicker;
    gl_FragColor = vec4(uColor * a, a);
  }
`,S=[[`SGR 1806−20`,272.164,-20.411,42e3,`The most magnetic object known: 10¹⁵ gauss. Its 2004 flare briefly outshone the full Moon in gamma rays from 42,000 light-years away.`],[`1E 1048.1−5937`,162.53,-59.89,9e3,`An anomalous X-ray pulsar: a magnetar spinning once every 6.4 s, powered by the decay of its magnetic field.`]],C=class{constructor(e){this.ctx=e,this.engine=e.engine,this.registry=e.registry,this.group=new u,this.engine.scene.add(this.group),this.items=[],this._v=new o,this._q=new r;let{radecToVector:t}=e.units||{};for(let[e,t,n,r,i]of S){let a=this._radec(t,n).multiplyScalar(r*p);this.registry.add({id:`magnetar-`+e.toLowerCase().replace(/[^a-z0-9]+/g,`-`),name:e,kind:`star`,kindLabel:`Magnetar`,color:`#ffb0d0`,radius:12*m,priority:2,labelRange:[2,1e9],maxLabelDistance:2e3*p,pulsar:!0,magnetar:!0,spinHz:e.startsWith(`SGR`)?.13:.155,getPosition(e){return e.copy(a)},data:{type:`Magnetar (neutron star)`,distance:`${r.toLocaleString(`en-US`)} ly`,magneticField:`≈ 10¹⁴–10¹⁵ G (a trillion times Earth's)`,radius:`≈ 12 km`,mass:`≈ 1.4 M☉`,rotationPeriod:e.startsWith(`SGR`)?`7.5 s`:`6.4 s`},description:i+` A magnetar's field is so intense that it would erase a credit card from the Moon's distance and distort atoms into cylinders.`,provenance:`observed`,massKg:28e29})}for(let e of this.registry.objects)e.pulsar&&(e.spinHz??=/Crab/.test(e.name)?30:/Vela/.test(e.name)?11:/J0437/.test(e.name)?174:/Geminga/.test(e.name)?4.2:1.34,e.massKg??=28e29,e.data=e.data||{},e.data.spin=e.data.spin||`${e.spinHz} Hz (${(1e3/e.spinHz).toFixed(1)} ms)`,this.items.push(this._make(e)))}_radec(e,t){let n=Math.PI/180,r=e*n,i=t*n,a=23.4392911*n,s=Math.cos(i)*Math.cos(r),c=Math.cos(i)*Math.sin(r),l=Math.sin(i),u=c*Math.cos(a)+l*Math.sin(a),d=-c*Math.sin(a)+l*Math.cos(a);return new o(s,d,-u)}_make(r){let s=new u,l=r.getPosition(new o);s.position.copy(l);let f=document.createElement(`canvas`);f.width=f.height=64;let p=f.getContext(`2d`),m=p.createRadialGradient(32,32,0,32,32,32);m.addColorStop(0,`rgba(255,255,255,1)`),m.addColorStop(.2,`rgba(200,220,255,0.8)`),m.addColorStop(1,`rgba(0,0,0,0)`),p.fillStyle=m,p.fillRect(0,0,64,64);let h=new i(new d({map:new t(f),transparent:!0,blending:2,depthWrite:!1}));h.renderOrder=36,s.add(h);let g=new e({uniforms:{uTime:{value:0},uIntensity:{value:1},uColor:{value:new n(r.magnetar?16756944:10473727)}},vertexShader:b,fragmentShader:x,transparent:!0,depthWrite:!1,blending:2,side:2}),_=new a(.02,.35,1,24,1,!0);_.translate(0,.5,0);let v=new c(_,g),y=new c(_,g);y.rotation.z=Math.PI;let S=new u;S.add(v,y),S.rotation.x=.55;let C=new u;return C.add(S),s.add(C),v.renderOrder=y.renderOrder=37,s.visible=!1,this.group.add(s),{o:r,g:s,glow:h,spin:C,mat:g,pos:l,phase:Math.random()*Math.PI*2,flash:0}}update(e,t,n){let i=this.engine.camera;window.innerHeight/(2*Math.tan(s.degToRad(i.fov)/2));let a=this.ctx.time.effectiveSpeed;for(let i of this.items){let s=i.pos.distanceTo(n),c=s<.6*p;i.g.visible=c;let u=Math.max(s*.004,40*m);if(i.glow.scale.setScalar(u*1.4),!c)continue;let d=a>0&&a<=.01?i.o.spinHz*a:Math.min(.6,i.o.spinHz);i.phase+=2*Math.PI*d*e,i.spin.rotation.z=i.phase;let h=Math.max(s*.9,100*m);i.spin.scale.set(h*.35,h,h*.35),i.mat.uniforms.uTime.value=t;let g=this._v.set(0,1,0).applyQuaternion(i.spin.getWorldQuaternion(this._q).multiply(new r().setFromEuler(new l(.55,0,0)))),_=new o().copy(n).sub(i.pos).normalize();Math.max(Math.abs(g.dot(_)),0)>.985&&i.flash<=0&&(i.flash=1,f.emit(`pulsar:pulse`,i.o)),i.flash=Math.max(0,i.flash-e*4),i.mat.uniforms.uIntensity.value=.35+.65*i.flash,i.glow.material.opacity=.6+.4*i.flash}}};export{C as Pulsars};