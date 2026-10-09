// fx.js — particles + procedural audio (all original, no assets)
import * as THREE from 'three';

export class ParticlePool {
  constructor(scene, max = 600) {
    this.scene = scene;
    this.max = max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.head = 0;
    for (let i = 0; i < max; i++) { this.pos[i*3+1] = -100; this.life[i]=0; }
  }
  burst(p, n, color, speed=8, up=4, life=0.8) {
    const c = new THREE.Color(color);
    for (let k=0;k<n;k++) {
      const i = this.head; this.head = (this.head+1)%this.max;
      this.pos[i*3]=p.x; this.pos[i*3+1]=p.y; this.pos[i*3+2]=p.z;
      const a = Math.random()*Math.PI*2, r = Math.random()*speed;
      this.vel[i*3]=Math.cos(a)*r; this.vel[i*3+1]=Math.random()*up+1; this.vel[i*3+2]=Math.sin(a)*r;
      const v = 0.7+Math.random()*0.5;
      this.col[i*3]=Math.min(1,c.r*v); this.col[i*3+1]=Math.min(1,c.g*v); this.col[i*3+2]=Math.min(1,c.b*v);
      this.life[i]=life*(0.5+Math.random()*0.8); this.maxLife[i]=this.life[i];
    }
  }
  update(dt) {
    for (let i=0;i<this.max;i++) {
      if (this.life[i]<=0) continue;
      this.life[i]-=dt;
      if (this.life[i]<=0) { this.pos[i*3+1]=-100; continue; }
      this.vel[i*3+1]-=9*dt;
      this.pos[i*3]+=this.vel[i*3]*dt; this.pos[i*3+1]+=this.vel[i*3+1]*dt; this.pos[i*3+2]+=this.vel[i*3+2]*dt;
      if (this.pos[i*3+1]<0.05) { this.pos[i*3+1]=0.05; this.vel[i*3+1]*=-0.3; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null; this.master = null; this.engineOsc=null; this.engineGain=null; this.enabled=false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state==='suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      // engine loop
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type='sawtooth'; this.engineOsc.frequency.value=40;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value=0;
      const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=400;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      this.enabled = true;
    } catch(e){ this.enabled=false; }
  }
  engine(speed01, inCar) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(inCar ? 0.08+speed01*0.12 : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(40+speed01*160+(inCar?0:0), t, 0.1);
  }
  blip(freq=600, dur=0.08, type='square', vol=0.15) {
    if (!this.enabled) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.value=vol;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime+dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime+dur);
  }
  punch() { this.blip(120+Math.random()*80,0.12,'square',0.3); this.noise(0.1,0.25); }
  counter(){ this.blip(880,0.15,'sine',0.25); this.blip(1320,0.2,'sine',0.2); }
  explosion(){ this.noise(0.6,0.5); this.blip(55,0.5,'sawtooth',0.4); }
  grapple(){ this.blip(300,0.25,'sawtooth',0.15); }
  noise(dur=0.2, vol=0.2) {
    if (!this.enabled) return;
    const n = Math.floor(this.ctx.sampleRate*dur);
    const buf = this.ctx.createBuffer(1,n,this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const g=this.ctx.createGain(); g.gain.value=vol;
    s.connect(g); g.connect(this.master); s.start();
  }
}
