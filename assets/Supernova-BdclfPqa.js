import{$i as e,L as t,Qt as n,_a as r,eo as i,er as a,ir as o,qt as s,va as c}from"./three.core-CpYT6u8q.js";import{t as l}from"./EventBus-DzLmJ1Bg.js";import{d as u}from"./Units-BKhzcXK2.js";import{d,f,g as p,h as m,m as h,p as g,v as _}from"./index-B3A8vEkd.js";var v=`
  varying vec3 vN; varying vec3 vPos;
  ${m}
  void main() {
    vN = normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${p}
  }
`,y=`
  precision highp float;
  varying vec3 vN; varying vec3 vPos;
  uniform float uTime, uPhase, uAlpha, uTemp;
  ${f}
  ${_}
  ${d}
  ${h}
  void main() {
    ${g}
    vec3 p = normalize(vPos);
    float n = vfbm(p * 4.0 + uTime * 0.05, 4);
    float fil = pow(max(1.0 - abs(vfbm(p * 9.0 + 3.0, 3) * 2.0 - 1.0), 0.0), 3.0);
    // early: smooth hot shell; late: clumpy filaments
    float dens = mix(0.6 + 0.4 * n, fil * 1.6 + n * 0.3, uPhase);
    vec3 hot = blackbody(uTemp);
    vec3 cool = mix(vec3(1.0, 0.35, 0.3), vec3(0.4, 0.8, 1.0), fil);
    vec3 col = mix(hot, cool, uPhase) * dens;
    float a = clamp(dens * uAlpha, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
  }
`,b=class d{constructor(i){this.ctx=i,this.engine=i.engine,this.registry=i.registry,this.active=!1,this.t=0,this.star=null,this.group=new s,this.group.visible=!1,this.engine.scene.add(this.group);let a=new n(1,4);this.shellMat=new e({uniforms:{uTime:{value:0},uPhase:{value:0},uAlpha:{value:0},uTemp:{value:2e4}},vertexShader:v,fragmentShader:y,transparent:!0,depthWrite:!1,side:2,blending:5,blendSrc:201,blendDst:205}),this.shell=new o(a,this.shellMat),this.shell.renderOrder=41,this.group.add(this.shell),this.shockMat=this.shellMat.clone(),this.shock=new o(a,this.shockMat),this.shock.renderOrder=41,this.group.add(this.shock);let u=document.createElement(`canvas`);u.width=u.height=128;let d=u.getContext(`2d`),f=d.createRadialGradient(64,64,0,64,64,64);f.addColorStop(0,`rgba(255,255,255,1)`),f.addColorStop(.15,`rgba(220,235,255,0.9)`),f.addColorStop(.5,`rgba(160,190,255,0.25)`),f.addColorStop(1,`rgba(0,0,0,0)`),d.fillStyle=f,d.fillRect(0,0,128,128),this.flash=new r(new c({map:new t(u),transparent:!0,blending:2,depthWrite:!1,opacity:0})),this.flash.renderOrder=42,this.group.add(this.flash),this.duration=42,l.on(`supernova:start`,e=>this.start(e)),l.on(`supernova:stop`,()=>this.stop()),l.on(`escape`,()=>this.stop())}static eligible(e){return!e||e.kind!==`star`||e.pulsar?!1:e.special&&/supergiant|wolfrayet|lbv/.test(e.special.kind)?!0:(e.lum||0)>2e4}start(e){d.eligible(e)&&(this.stop(),this.star=e,this.active=!0,this.t=0,this.pos=e.getPosition(new i),this.R0=e.radius,this.group.position.copy(this.pos),this.group.visible=!0,this.ctx.time.setSpeed(1),l.emit(`supernova:begin`,e))}stop(){this.active&&(this.active=!1,this.group.visible=!1,this.flash.material.opacity=0,l.emit(`supernova:end`,this.star),this.star=null)}get progress(){return this.active?Math.min(this.t/this.duration,1):0}get phaseKey(){let e=this.t;return e<6?`snCollapse`:e<9?`snFlash`:e<20?`snShock`:e<34?`snEjecta`:`snRemnant`}update(e,t,n){if(!this.active)return;this.t+=e;let r=this.t,i=this.R0,o=e=>e*e*(3-2*e),s=Math.max(1.2*u,i*200),c=0,l=0,d=0,f=0,p=0,m=3e4;if(r<6)c=i*(1-.6*o(r/6)),p=.9,m=6e3-r/6*2500,f=0,this.shell.scale.setScalar(c),this.shock.visible=!1,this.shell.visible=!0;else if(r<9){let e=(r-6)/3;d=Math.sin(e*Math.PI)**.5,c=i*(.4+2*e),p=1,m=4e4,f=0,this.shell.scale.setScalar(c),this.shock.visible=!1}else{let e=Math.min((r-9)/(this.duration-9),1);l=i+(s-i)*e**.55,c=i+(s*.8-i)*e**.7,f=o(Math.min(e*1.4,1)),p=.9*(1-.6*e),m=4e4*(1-e)**1.5+4e3,d=Math.max(0,1-(r-9)/6)*.6,this.shell.scale.setScalar(c),this.shock.visible=!0,this.shock.scale.setScalar(l),this.shockMat.uniforms.uPhase.value=0,this.shockMat.uniforms.uAlpha.value=.35*(1-e),this.shockMat.uniforms.uTemp.value=6e4,this.shockMat.uniforms.uTime.value=t}let h=n.distanceTo(this.pos),g=c>0?a.clamp((c-h)/Math.max(c*.3,1e-9),0,1):0;p*=1-.8*g,this.shock.visible&&(this.shockMat.uniforms.uAlpha.value*=1-.85*a.clamp((l-h)/Math.max(l*.3,1e-9),0,1));let _=this.shellMat.uniforms;_.uTime.value=t,_.uPhase.value=f,_.uAlpha.value=p,_.uTemp.value=m,this.flash.material.opacity=d,this.flash.scale.setScalar(Math.max(h*.25*d,i*3)),r>=this.duration&&(this.t=this.duration)}};export{b as SupernovaSim};