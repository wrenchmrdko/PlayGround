// hero.js — Night Sentinel on-foot controller: run/sprint/jump/glide/grapnel/detective vision
import * as THREE from 'three';
import { collideCity, groundHeightAt } from './city.js';

export function createHero(scene) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x141821, roughness: 0.55, metalness: 0.5 });
  const capeMat = new THREE.MeshStandardMaterial({ color: 0x0a0d18, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 6, 12), suit);
  body.position.y = 1.25; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), suit);
  head.position.y = 2.35; g.add(head);
  const earG = new THREE.ConeGeometry(0.09, 0.35, 4);
  const e1 = new THREE.Mesh(earG, suit); e1.position.set(-0.18, 2.72, 0); g.add(e1);
  const e2 = new THREE.Mesh(earG, suit); e2.position.set(0.18, 2.72, 0); g.add(e2);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.44,0.09,0.05), new THREE.MeshBasicMaterial({color:0xbfefff}));
  eyes.position.set(0,2.38,0.33); g.add(eyes);
  // cape: plane that opens when gliding
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.9,2.2,6,4), capeMat);
  cape.position.set(0,1.55,-0.55); cape.rotation.x=0.25; g.add(cape);
  const capeOrig = cape.geometry.attributes.position.array.slice();
  // glow light
  const light = new THREE.PointLight(0x6fb7ff, 8, 22, 1.8); light.position.set(0,3,0); g.add(light);
  scene.add(g);

  return {
    mesh: g, cape, capeOrig, eyes,
    pos: g.position, vel: new THREE.Vector3(),
    yaw: Math.PI, pitch: -0.15,
    grounded: true, gliding: false, grappling: false, grappleFrom: new THREE.Vector3(), grappleTo: new THREE.Vector3(), grappleT: 0,
    groundH: 0, coyote: 0,
    update(dt, input, cam, city, fx, audio) {
      const speedWalk = 8, speedSprint = 13;
      const sprint = input.keys['shift'];
      const maxSp = sprint ? speedSprint : speedWalk;
      // camera-relative move
      let fx2 = 0, fz2 = 0;
      if (input.keys['w']) fz2 -= 1;
      if (input.keys['s']) fz2 += 1;
      if (input.keys['a']) fx2 -= 1;
      if (input.keys['d']) fx2 += 1;
      const len = Math.hypot(fx2,fz2)||1;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is -Z in yaw space
      let wx = 0, wz = 0;
      if (fx2||fz2) {
        const nx = fx2/len, nz = fz2/len;
        wx = nx*cos - nz*sin;
        wz = -nx*sin - nz*cos;
        // hero faces move dir smoothly
        const targetYaw = Math.atan2(wx, wz);
        let d = targetYaw - this.mesh.rotation.y;
        while (d>Math.PI) d-=Math.PI*2; while (d<-Math.PI) d+=Math.PI*2;
        this.mesh.rotation.y += d*Math.min(1,dt*10);
      }
      const gh = groundHeightAt(this.pos.x, this.pos.z, city.colliders);
      this.groundH = gh;
      // gravity
      const wantGlide = input.keys['space'] && !this.grounded && this.vel.y < 1.5;
      this.gliding = !!wantGlide && this.vel.y < 0.5;
      if (this.grappling) {
        this.grappleT += dt*1.4;
        const t = Math.min(1,this.grappleT);
        const e = t*t*(3-2*t);
        this.pos.lerpVectors(this.grappleFrom, this.grappleTo, e);
        this.pos.y += Math.sin(t*Math.PI)*6;
        this.vel.set(0,0,0);
        if (t>=1) { this.grappling=false; this.grounded=false; this.vel.y=2; audio.counter(); fx.burst(this.pos,20,0x9adcff,6,5,0.6); }
      } else if (this.gliding) {
        // Arkham glide: hold height, dive with W to gain speed, pull up with S
        let dive = 0;
        if (input.keys['w']) dive = 1; if (input.keys['s']) dive = -1;
        const glideSp = 16 + dive*8;
        this.vel.y = THREE.MathUtils.clamp(this.vel.y - dt*(dive>0?14:3.2), dive>0?-22:-3.2, 4);
        // steer with A/D + mouse yaw already; forward along hero facing + cam yaw blend
        const dirX = -Math.sin(this.yaw), dirZ = -Math.cos(this.yaw);
        this.vel.x = dirX*glideSp; this.vel.z = dirZ*glideSp;
        this.pos.x += this.vel.x*dt; this.pos.y += this.vel.y*dt; this.pos.z += this.vel.z*dt;
        collideCity(this.pos, 0.8, city.colliders);
        // cape flap
        const p = this.cape.geometry.attributes.position;
        const t = performance.now()*0.012;
        for (let i=0;i<p.count;i++){
          const ox = capeOrig[i*3], oy = capeOrig[i*3+1];
          p.setZ(i, Math.sin(t+ox*3+oy*2)*0.18 - (oy<0?0.9:0));
          p.setX(i, ox*1.9);
        }
        p.needsUpdate=true;
        this.cape.rotation.x = -0.9;
        if (Math.random()<0.3) fx.burst(this.pos,1,0x3a5a8a,1,0.5,0.5);
      } else {
        // ground/air control
        const accel = this.grounded?60:18;
        this.vel.x += (wx*maxSp - this.vel.x)*Math.min(1,dt*(this.grounded?10:2.5));
        this.vel.z += (wz*maxSp - this.vel.z)*Math.min(1,dt*(this.grounded?10:2.5));
        this.vel.y -= 30*dt;
        // jump
        if (input.consumeJump && this.grounded) {
          this.vel.y = 11; this.grounded=false; audio.blip(440,0.12,'square',0.12);
          fx.burst(this.pos,8,0x5577ff,4,4,0.4);
        }
        this.pos.x += this.vel.x*dt; this.pos.y += this.vel.y*dt; this.pos.z += this.vel.z*dt;
        collideCity(this.pos, 0.8, city.colliders);
        const gh2 = groundHeightAt(this.pos.x, this.pos.z, city.colliders);
        if (this.pos.y <= gh2) {
          if (!this.grounded && this.vel.y<-12) { fx.burst(this.pos,14,0x88aaff,6,3,0.5); audio.noise(0.12,0.2); }
          this.pos.y = gh2; this.vel.y=0; this.grounded=true;
        } else if (this.pos.y > gh2+0.1) {
          this.coyote-=dt; if (this.coyote< -0.15) this.grounded=false;
        }
        // idle cape
        this.cape.rotation.x += (0.25-this.cape.rotation.x)*Math.min(1,dt*5);
        const p=this.cape.geometry.attributes.position;
        for (let i=0;i<p.count;i++){ p.setX(i,capeOrig[i*3]); p.setZ(i,0); }
        p.needsUpdate=true;
      }
      input.consumeJump = false;
      // run bob
      const sp = Math.hypot(this.vel.x,this.vel.z);
      body.position.y = 1.25 + (this.grounded&&sp>1?Math.sin(performance.now()*0.02)*0.07:0);
      // eyes glow stronger in detective vision
      eyes.material.color.setHex(input.detective?0xff5030:0xbfefff);
    },
    tryGrapple(city, fx, audio) {
      if (this.grappling || this.gliding) return false;
      // find best rooftop in look direction within 95m
      const dx=-Math.sin(this.yaw), dz=-Math.cos(this.yaw);
      let best=null, bestScore=1e9;
      for (const r of city.rooftops) {
        const vx=r.x-this.pos.x, vz=r.z-this.pos.z;
        const dist=Math.hypot(vx,vz);
        if (dist<8||dist>95) continue;
        if (r.h < this.pos.y+4) continue; // need height
        const dot=(vx*dx+vz*dz)/(dist||1);
        if (dot<0.55) continue;
        const score=dist-(dot*30);
        if (score<bestScore){bestScore=score;best=r;}
      }
      if (!best) { audio.blip(160,0.15,'square',0.12); return false; }
      this.grappling=true; this.grappleT=0;
      this.grappleFrom.copy(this.pos);
      this.grappleTo.set(best.x, best.h, best.z);
      audio.grapple(); fx.burst(this.pos,10,0x9adcff,5,4,0.5);
      return true;
    }
  };
}
