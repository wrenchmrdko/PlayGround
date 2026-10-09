// car.js — Interceptor: Arkham-style pursuit + battle mode tank-car
import * as THREE from 'three';
import { collideCity } from './city.js';

export function createCar(scene) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 0.35, metalness: 0.85 });
  const accent = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6,0.9,5.2), hullMat);
  body.position.y=0.95; body.castShadow=true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.6,1.6), hullMat);
  nose.position.set(0,0.75,-3.1); nose.rotation.x=0.15; g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.7,1.9), new THREE.MeshStandardMaterial({color:0x05070d, roughness:0.15, metalness:0.9}));
  cockpit.position.set(0,1.6,0.4); g.add(cockpit);
  const fin1 = new THREE.Mesh(new THREE.BoxGeometry(0.18,1.1,1.6), hullMat); fin1.position.set(-1.1,1.7,2.2); fin1.rotation.z=0.25; g.add(fin1);
  const fin2 = fin1.clone(); fin2.position.x=1.1; fin2.rotation.z=-0.25; g.add(fin2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.22,0.3), accent); tail.position.set(0,1.05,2.65); g.add(tail);
  // wheels
  const wheelG = new THREE.CylinderGeometry(0.62,0.62,0.55,14);
  wheelG.rotateZ(Math.PI/2);
  const wheelM = new THREE.MeshStandardMaterial({color:0x11131c, roughness:0.8});
  const wheels=[];
  for (const [x,z] of [[-1.35,-1.8],[1.35,-1.8],[-1.35,1.8],[1.35,1.8]]) {
    const w=new THREE.Mesh(wheelG,wheelM); w.position.set(x,0.62,z); g.add(w); wheels.push(w);
  }
  // turret (battle mode)
  const turret = new THREE.Group();
  const tbase = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.9,0.5,10), hullMat); turret.add(tbase);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,2.6,8), new THREE.MeshStandardMaterial({color:0x222838, metalness:0.8, roughness:0.3}));
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.35,-1.4); turret.add(barrel);
  turret.position.set(0,1.75,-0.4); turret.visible=false; g.add(turret);
  // headlights
  const hl1=new THREE.SpotLight(0xcfe6ff, 35, 70, 0.5, 0.5, 1.2); hl1.position.set(-0.8,1.2,-2.8);
  const tgt1=new THREE.Object3D(); tgt1.position.set(-0.8,0,-20); g.add(tgt1); hl1.target=tgt1; g.add(hl1);
  const hl2=hl1.clone(); hl2.position.x=0.8; const tgt2=tgt1.clone(); tgt2.position.x=0.8; g.add(tgt2); hl2.target=tgt2; g.add(hl2);
  const under = new THREE.PointLight(0x3a6bff, 4, 14, 1.8); under.position.set(0,0.3,0); g.add(under);
  // boost flames
  const flameM = new THREE.MeshBasicMaterial({color:0x4aa8ff, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending});
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35,1.8,8), flameM);
  flame.rotation.x=Math.PI/2; flame.position.set(0,0.9,3.4); flame.visible=false; g.add(flame);

  g.position.set(14,0,26);
  scene.add(g);

  // projectiles owned by car
  const shells=[];
  const shellGeo=new THREE.SphereGeometry(0.28,8,8);
  const shellMat=new THREE.MeshBasicMaterial({color:0xffd23f});

  return {
    mesh:g, wheels, turret, barrel, flame,
    yaw: Math.PI*0.5, speed: 0, battle:false, hull:100,
    turretYaw:0, cooldown:0, missileCd:0,
    pos:g.position,
    update(dt, input, city, fx, audio, enemies, onFire) {
      const inCar = input.inCar;
      this.flame.visible=false;
      if (!inCar) return;
      this.cooldown-=dt; this.missileCd-=dt;
      const maxF = this.battle?26:44, maxR=14;
      const accel = this.battle?22:32;
      let thr=0;
      if (input.keys['w']) thr+=1;
      if (input.keys['s']) thr-=1;
      if (thr>0) this.speed=Math.min(maxF,this.speed+accel*dt);
      else if (thr<0) this.speed=Math.max(-maxR,this.speed-accel*dt*1.2);
      else { // drag
        this.speed-=this.speed*Math.min(1,dt*1.6);
        if (Math.abs(this.speed)<0.2) this.speed=0;
      }
      if (input.keys['shift']) { // overdrive boost
        this.speed=Math.min(62,this.speed+40*dt);
        this.flame.visible=true; this.flame.scale.set(1,1+Math.random(),1);
        if (Math.random()<0.5) fx.burst(this.pos,2,0x4aa8ff,3,2,0.4);
      }
      let steer=0;
      if (input.keys['a']) steer+=1;
      if (input.keys['d']) steer-=1;
      const spdN=Math.min(1,Math.abs(this.speed)/30);
      if (this.battle) {
        // strafe: A/D lateral, yaw slower, turret aims with mouse
        this.yaw += steer*dt*0.9*(this.speed>=0?1:-1);
        const rx=Math.cos(this.yaw), rz=-Math.sin(this.yaw);
        this.pos.x += rx*steer*dt*10; this.pos.z += rz*steer*dt*10;
        this.turret.visible=true;
        this.turretYaw += (input.mouseDX*0.004);
        this.turretYaw=THREE.MathUtils.clamp(this.turretYaw,-1.2,1.2);
        this.turret.rotation.y=this.turretYaw;
        if (input.keys['space']) this.speed*= (1-Math.min(1,dt*4)); // brake strafe
      } else {
        this.turret.visible=false;
        let grip = input.keys['space']?2.6:1.4;
        this.yaw += steer*dt*grip*(this.speed>=0?1:-1)*Math.min(1,0.35+spdN);
        if (input.keys['space'] && Math.abs(this.speed)>10 && steer!==0) {
          if (Math.random()<0.6) fx.burst(this.pos,2,0x8a93b8,4,1,0.5);
        }
      }
      const fxw=-Math.sin(this.yaw), fzw=-Math.cos(this.yaw);
      this.pos.x+=fxw*this.speed*dt; this.pos.z+=fzw*this.speed*dt;
      // handbrake decel
      if (input.keys['space']&&!this.battle) this.speed-=this.speed*Math.min(1,dt*2.2);
      collideCity(this.pos, 1.9, city.colliders);
      this.pos.y=0;
      this.mesh.rotation.y=this.yaw;
      this.mesh.rotation.z=THREE.MathUtils.clamp(-steer*spdN*0.08,-0.1,0.1);
      this.mesh.position.y = Math.abs(this.speed)>1?Math.sin(performance.now()*0.03)*0.03:0;
      for (const w of this.wheels) w.rotation.x+=this.speed*dt*1.6;
      audio.engine(Math.abs(this.speed)/55,true);
      // ramming damage to enemies
      if (Math.abs(this.speed)>8) {
        for (const e of enemies.list) {
          if (e.dead) continue;
          const d=Math.hypot(e.pos.x-this.pos.x,e.pos.z-this.pos.z);
          if (d<3.2) {
            e.hp-= (Math.abs(this.speed)*0.12+1.2);
            e.flash=0.15; fx.burst(e.pos,10,0xffb02e,7,5,0.6);
            if (e.hp<=0) enemies.kill(e,fx,audio,'rammed');
          }
        }
      }
      // fire cannon (click) in battle mode, or ram-cannon in pursuit (small)
      if (input.consumeFire) {
        input.consumeFire=false;
        if (this.battle && this.cooldown<=0) {
          this.cooldown=0.28;
          this.fireShell(scene,shells,fx,audio);
          onFire&&onFire('cannon');
        } else if (!this.battle && this.cooldown<=0) {
          this.cooldown=0.7;
          this.fireShell(scene,shells,fx,audio,true);
          onFire&&onFire('pulse');
        }
      }
      // missiles with right-click / R? use R in car
      if (input.consumeCounter && this.battle && this.missileCd<=0) {
        input.consumeCounter=false;
        this.missileCd=1.6;
        for (let i=-1;i<=1;i++) this.fireShell(scene,shells,fx,audio,false,i*0.25);
        audio.explosion();
        onFire&&onFire('missiles');
      }
      // update shells
      for (let i=shells.length-1;i>=0;i--) {
        const s=shells[i];
        s.life-=dt;
        s.mesh.position.addScaledVector(s.dir, s.speed*dt);
        // hit buildings?
        const ghY = 0;
        let hit=false;
        for (const e of enemies.list) {
          if (e.dead) continue;
          const dd=Math.hypot(e.pos.x-s.mesh.position.x,e.pos.z-s.mesh.position.z);
          const dy=Math.abs((e.pos.y+1)-s.mesh.position.y);
          if (dd<2.2&&dy<3) { e.hp-=s.dmg; e.flash=0.15; fx.burst(s.mesh.position,12,0xffd23f,8,5,0.6); audio.blip(200,0.15,'sawtooth',0.2); if(e.hp<=0) enemies.kill(e,fx,audio,'blasted'); hit=true; break; }
        }
        if (!hit) {
          // building hit spark
          for (const c of city.colliders) {
            if (s.mesh.position.x>c.minX&&s.mesh.position.x<c.maxX&&s.mesh.position.z>c.minZ&&s.mesh.position.z<c.maxZ&&s.mesh.position.y<c.h) { fx.burst(s.mesh.position,10,0xff8830,6,4,0.5); hit=true; break; }
          }
        }
        if (hit||s.life<=0||Math.abs(s.mesh.position.x)>400||Math.abs(s.mesh.position.z)>400) {
          scene.remove(s.mesh); shells.splice(i,1);
        }
      }
    },
    fireShell(scene,shells,fx,audio,weak=false,spread=0) {
      const dir=new THREE.Vector3(-Math.sin(this.yaw+this.turretYaw+spread),0.02,-Math.cos(this.yaw+this.turretYaw+spread)).normalize();
      if (!this.battle) dir.set(-Math.sin(this.yaw),0.05,-Math.cos(this.yaw));
      const m=new THREE.Mesh(shellGeo,shellMat);
      m.position.copy(this.pos).add(new THREE.Vector3(0,1.6,0)).addScaledVector(dir,3);
      scene.add(m);
      shells.push({mesh:m,dir,speed:weak?55:85,life:1.6,dmg:weak?1.2:3});
      fx.burst(m.position,6,0xfff0a0,5,2,0.3);
      audio.blip(weak?500:180,0.2,'sawtooth',0.25);
      // recoil
      this.speed-=weak?0:1.2;
    },
    damage(a,fx) { this.hull=Math.max(0,this.hull-a); if(fx) fx.burst(this.pos,8,0xff5030,6,4,0.5); }
  };
}
