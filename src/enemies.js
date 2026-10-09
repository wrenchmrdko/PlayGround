// enemies.js — thugs, drones, warden, civilians + traffic
import * as THREE from 'three';

function makeHumanoid(color, scale=1) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.5*scale, 1.0*scale, 4, 10), m);
  b.position.y=1.2*scale; b.castShadow=true; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.32*scale,10,10), new THREE.MeshStandardMaterial({color:0xc9a27a}));
  h.position.y=2.25*scale; g.add(h);
  const atk = new THREE.Mesh(new THREE.SphereGeometry(0.22*scale,8,8), new THREE.MeshBasicMaterial({color:0xff3030}));
  atk.position.set(0,2.6*scale,0); atk.visible=false; g.add(atk);
  return { g, atk, mat: m };
}

export function createEnemies(scene, city) {
  const list=[];
  const traffic=[]; // civ cars
  const peds=[];

  function spawnThug(x,z,brute=false) {
    const { g, atk, mat } = makeHumanoid(brute?0x7a1f2e:(Math.random()<0.5?0x8a4a1a:0x5a2a8a), brute?1.5:1);
    g.position.set(x,groundY(x,z),z);
    scene.add(g);
    const e={ kind: brute?'warden':'thug', mesh:g, atk, mat, pos:g.position, hp: brute?26:(3+Math.floor(Math.random()*3)), maxHp: brute?26:5,
      state:'patrol', t:Math.random()*4, atkCd:0, flash:0, brute:!!brute, dead:false, baseColor: mat.color.getHex(), xp: brute?120:(20+Math.random()*15) };
    list.push(e); return e;
  }
  function spawnDrone(x,z) {
    const g=new THREE.Group();
    const bm=new THREE.MeshStandardMaterial({color:0x1c2338, roughness:0.4, metalness:0.7});
    const b=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.1,3.2),bm); b.position.y=1.0; b.castShadow=true; g.add(b);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.32,10,10), new THREE.MeshBasicMaterial({color:0xff2030})); eye.position.set(0,1.3,-1.7); g.add(eye);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,2.2,8), new THREE.MeshStandardMaterial({color:0x333c5a})); gun.rotation.x=Math.PI/2; gun.position.set(0,1.1,-2.2); g.add(gun);
    g.position.set(x,0,z); scene.add(g);
    const e={ kind:'drone', mesh:g, eye, mat:bm, pos:g.position, hp:8, maxHp:8, state:'patrol', t:Math.random()*3, atkCd:1+Math.random()*2, flash:0, dead:false, baseColor:0x1c2338, xp:45 };
    list.push(e); return e;
  }
  function groundY(x,z){ let h=0; for(const c of city.colliders){ if(x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ){h=c.h;break;} } return h; }

  // initial population: thug packs around city
  for (let i=0;i<14;i++) {
    const a=Math.random()*Math.PI*2, r=60+Math.random()*160;
    spawnThug(Math.cos(a)*r, Math.sin(a)*r);
  }
  for (let i=0;i<5;i++){ const a=Math.random()*Math.PI*2, r=80+Math.random()*140; spawnDrone(Math.cos(a)*r, Math.sin(a)*r); }

  // traffic: 8 civ cars looping on roads
  const civCols=[0x2a4a8a,0x4a4a4a,0x6a2a2a,0x2a6a4a,0x777788];
  for (let i=0;i<8;i++) {
    const g=new THREE.Group();
    const bm=new THREE.MeshStandardMaterial({color:civCols[i%civCols.length], roughness:0.4, metalness:0.4});
    const b=new THREE.Mesh(new THREE.BoxGeometry(2,1,4.2),bm); b.position.y=0.8; g.add(b);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.7,2), new THREE.MeshStandardMaterial({color:0x0a0e1a})); cab.position.y=1.6; g.add(cab);
    scene.add(g);
    const step=80;
    traffic.push({mesh:g,pos:g.position,lane:Math.floor(Math.random()*8),t:Math.random()*100,speed:10+Math.random()*8,vert:Math.random()<0.5,mat:bm});
  }
  // peds: wandering capsules
  for (let i=0;i<10;i++){
    const { g }=makeHumanoid(0x3a5a7a,0.95);
    g.position.set((Math.random()-0.5)*300,0,(Math.random()-0.5)*300);
    scene.add(g);
    peds.push({mesh:g,pos:g.position,a:Math.random()*Math.PI*2,speed:1.5+Math.random()});
  }

  const enemyShots=[];
  const shotGeo=new THREE.SphereGeometry(0.22,8,8);
  const shotMat=new THREE.MeshBasicMaterial({color:0xff4040});

  return {
    list, traffic, peds, enemyShots,
    spawnThug, spawnDrone,
    kill(e,fx,audio,how) {
      if (e.dead) return 0;
      e.dead=true;
      fx.burst(new THREE.Vector3(e.pos.x,e.pos.y+1.2,e.pos.z),26,e.kind==='drone'?0xff6030:0x9adcff,9,6,0.9);
      if (e.kind==='drone') { audio.explosion(); fx.burst(e.pos,30,0xff8830,12,8,1.1); }
      else audio.punch();
      // fall over
      e.mesh.rotation.x=-Math.PI/2.2; e.mesh.position.y=Math.max(e.mesh.position.y,0.4);
      if (e.atk) e.atk.visible=false;
      setTimeout(()=>{ scene.remove(e.mesh); }, 6000);
      return e.xp;
    },
    update(dt, heroPos, carPos, inCar, hero, car, fx, audio, threat, onPlayerHit) {
      const target = inCar?carPos:heroPos;
      // thugs & drones AI
      for (const e of list) {
        if (e.dead) continue;
        if (e.flash>0){ e.flash-=dt; e.mat.emissive=new THREE.Color(0xffffff); e.mat.emissiveIntensity=e.flash*6; }
        else if (e.mat.emissiveIntensity) e.mat.emissiveIntensity*=0.85;
        const dHero=Math.hypot(e.pos.x-heroPos.x,e.pos.z-heroPos.z);
        const dCar=Math.hypot(e.pos.x-carPos.x,e.pos.z-carPos.z);
        const d = Math.min(dHero + (inCar?8:0), dCar + (inCar?0:6)); // prefer correct target
        const focusInCar = (dCar+ (e.kind==='drone'? -4:6)) < dHero;
        const tp = focusInCar?carPos:heroPos;
        const dist = Math.hypot(e.pos.x-tp.x,e.pos.z-tp.z);
        e.t-=dt; e.atkCd-=dt;
        if (e.kind==='thug'||e.kind==='warden') {
          const aggroR = e.kind==='warden'?120:(22+threat*8);
          if (dist<aggroR) e.state='chase'; else if (e.t<=0){ e.state='patrol'; e.t=3+Math.random()*3; e.wx=e.pos.x+(Math.random()-0.5)*30; e.wz=e.pos.z+(Math.random()-0.5)*30; }
          if (e.state==='chase') {
            const sp=e.brute?6.5:4.2+threat*0.3;
            if (dist> (e.brute?2.6:2.2)) {
              const dx=(tp.x-e.pos.x)/dist, dz=(tp.z-e.pos.z)/dist;
              e.pos.x+=dx*sp*dt; e.pos.z+=dz*sp*dt;
              e.mesh.rotation.y=Math.atan2(dx,dz);
              e.mesh.position.y += (groundY(e.pos.x,e.pos.z)-e.mesh.position.y)*Math.min(1,dt*5);
            } else {
              // attack
              e.mesh.rotation.y=Math.atan2(tp.x-e.pos.x,tp.z-e.pos.z);
              if (e.atkCd<=0) {
                e.atkCd=e.brute?1.1:1.6+Math.random();
                e.atk.visible=true; e.atkT=0.45;
                e.didHit=false;
                audio.blip(220,0.12,'square',0.12);
              }
            }
          } else {
            // patrol wander
            if (e.wx!==undefined) {
              const dx=e.wx-e.pos.x, dz=e.wz-e.pos.z, dd=Math.hypot(dx,dz);
              if (dd>1){ e.pos.x+=dx/dd*1.8*dt; e.pos.z+=dz/dd*1.8*dt; e.mesh.rotation.y=Math.atan2(dx,dz); }
            }
          }
          if (e.atk && e.atk.visible) {
            e.atkT-=dt;
            const dd=Math.hypot(e.pos.x-tp.x,e.pos.z-tp.z);
            if (!e.didHit && e.atkT<0.25 && dd<3.0) {
              e.didHit=true;
              if (focusInCar) { car.damage(e.brute?8:3,fx); audio.blip(90,0.2,'sawtooth',0.3); }
              else onPlayerHit(e.brute?14:7, e);
            }
            if (e.atkT<=0) e.atk.visible=false;
          }
        } else { // drone
          const aggroR=110+threat*12;
          if (dist<aggroR) e.state='chase'; else if (e.t<=0){e.state='patrol'; e.t=4; }
          if (e.state==='chase') {
            const want= inCar?14:20;
            const dx=(tp.x-e.pos.x)/(dist||1), dz=(tp.z-e.pos.z)/(dist||1);
            const sp=11+threat*0.8;
            if (dist>want){ e.pos.x+=dx*sp*dt; e.pos.z+=dz*sp*dt; }
            else if (dist<want-6){ e.pos.x-=dx*sp*0.5*dt; e.pos.z-=dz*sp*0.5*dt; }
            else { // orbit
              e.pos.x+=-dz*sp*0.4*dt; e.pos.z+=dx*sp*0.4*dt;
            }
            e.mesh.rotation.y=Math.atan2(tp.x-e.pos.x,tp.z-e.pos.z);
            if (e.atkCd<=0 && dist<70) {
              e.atkCd=2.2-Math.min(1,threat*0.15)+Math.random();
              const m=new THREE.Mesh(shotGeo,shotMat);
              m.position.set(e.pos.x,1.4,e.pos.z); scene.add(m);
              const dir=new THREE.Vector3(tp.x-e.pos.x,(focusInCar?1.2:1.5)-1.4,tp.z-e.pos.z).normalize();
              enemyShots.push({mesh:m,dir,speed:30,life:2.4});
              audio.blip(150,0.25,'sawtooth',0.18);
              fx.burst(m.position,4,0xff4040,3,2,0.3);
            }
          } else {
            e.mesh.rotation.y+=dt*0.4;
          }
        }
      }
      // enemy shots
      for (let i=enemyShots.length-1;i>=0;i--) {
        const s=enemyShots[i]; s.life-=dt;
        s.mesh.position.addScaledVector(s.dir,s.speed*dt);
        let hit=false;
        const checkPos = inCar?carPos:heroPos;
        const dd=Math.hypot(s.mesh.position.x-checkPos.x,s.mesh.position.z-checkPos.z);
        const dy=Math.abs(s.mesh.position.y-(checkPos.y+1.2));
        if (dd< (inCar?2.4:1.4) && dy<2.5) {
          if (inCar) car.damage(4,fx); else onPlayerHit(6,null);
          fx.burst(s.mesh.position,8,0xff3030,6,4,0.5);
          hit=true;
        }
        if (hit||s.life<=0){ scene.remove(s.mesh); enemyShots.splice(i,1); }
      }
      // traffic update: drive straight on grid lanes, wrap
      const step=CITY_STEP();
      for (const t of traffic) {
        t.t+=dt*t.speed;
        const laneOff = (t.lane-3.5)*10;
        if (t.vert) {
          t.pos.z = ((t.t*1)%600)-300;
          t.pos.x = laneOff; t.mesh.rotation.y = t.speed>0?Math.PI:0;
        } else {
          t.pos.x = ((t.t*1)%600)-300;
          t.pos.z = laneOff; t.mesh.rotation.y = Math.PI/2;
        }
        t.pos.y=0;
      }
      function CITY_STEP(){ return 80; }
      // peds wander
      for (const p of peds) {
        p.a+= (Math.random()-0.5)*dt*2;
        p.pos.x+=Math.cos(p.a)*p.speed*dt; p.pos.z+=Math.sin(p.a)*p.speed*dt;
        if (Math.abs(p.pos.x)>260||Math.abs(p.pos.z)>260) p.a+=Math.PI;
        p.mesh.rotation.y=Math.atan2(Math.cos(p.a),Math.sin(p.a));
      }
    }
  };
}
