// missions.js — story + side content, GTA-style threat
import * as THREE from 'three';

export function createMissions(scene, city) {
  const markers=[];
  function addMarker(x,y,z,color=0xffd23f,size=2.2){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(size,size*0.6,0.4,16), new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.85}));
    m.position.set(x,y+0.3,z); scene.add(m);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(size*0.35,size*0.35,60,10,1,true), new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
    beam.position.set(x,y+30,z); scene.add(beam);
    markers.push({base:m,beam,color});
    return {base:m,beam};
  }
  function clearMarkers(list){ for(const h of list){ scene.remove(h.base); scene.remove(h.beam);} list.length=0; }

  // pick spots
  const spots=[
    {x:90,z:-70},{x:-110,z:60},{x:40,z:130},
  ];
  const bombSpots=[{x:120,z:20},{x:-90,z:-110},{x:-40,z:140},{x:70,z:80}];
  const packSpots=[];
  for(let i=0;i<8;i++){ const a=i/8*Math.PI*2; packSpots.push({x:Math.cos(a)*(90+Math.random()*90), z:Math.sin(a)*(90+Math.random()*90), y: 6+Math.random()*40}); }
  const ringSpots=[];
  for(let i=0;i<6;i++){ ringSpots.push({x:-140+i*55, z: 150-((i%2)*40)}); }

  const state={
    idx:0, // 0:M1 1:M2 2:M3 done:3
    hostages:[], bombs:[], packs:[], rings:[],
    warden:null, wardenDrones:[],
    rescued:0, defused:0, packsGot:0, ringsGot:0, ringT:0,
    handles:[], packHandles:[], ringHandles:[],
    threat:0, heat:0, lastCrime:0,
  };

  // hostages: green capsules
  for(const s of spots){
    const m=new THREE.Mesh(new THREE.CapsuleGeometry(0.5,1.0,4,8), new THREE.MeshStandardMaterial({color:0x2aff7a}));
    m.position.set(s.x+4,1.2,s.z+4); scene.add(m);
    state.hostages.push({mesh:m, saved:false, x:s.x+4, z:s.z+4});
  }
  for(const s of bombSpots){
    const m=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2), new THREE.MeshStandardMaterial({color:0x222833, emissive:0xff2020, emissiveIntensity:1.2}));
    m.position.set(s.x,0.8,s.z); scene.add(m);
    state.bombs.push({mesh:m, done:false, x:s.x, z:s.z, progress:0});
  }
  for(const s of packSpots){
    const m=new THREE.Mesh(new THREE.OctahedronGeometry(1.0), new THREE.MeshBasicMaterial({color:0x4af2ff}));
    m.position.set(s.x,s.y,s.z); scene.add(m);
    state.packs.push({mesh:m, got:false, x:s.x, y:s.y, z:s.z});
  }
  for(const s of ringSpots){
    const m=new THREE.Mesh(new THREE.TorusGeometry(5,0.5,8,24), new THREE.MeshBasicMaterial({color:0xff9a2e}));
    m.position.set(s.x,3,s.z); m.rotation.y=Math.PI/2; scene.add(m);
    state.rings.push({mesh:m, got:false, x:s.x, z:s.z});
  }

  function refreshObjectiveHandles(){
    clearMarkers(state.handles);
    if(state.idx===0){
      for(const h of state.hostages) if(!h.saved) state.handles.push(addMarker(h.x,1,h.z,0x2aff7a,2.5));
    } else if(state.idx===1){
      for(const b of state.bombs) if(!b.done) state.handles.push(addMarker(b.x,1,b.z,0xff4040,2.5));
    } else if(state.idx===2){
      state.handles.push(addMarker(0,1,0,0xffd23f,6));
    }
  }
  refreshObjectiveHandles();

  return {
    state,
    refresh: refreshObjectiveHandles,
    addThreat(n){ state.threat=THREE.MathUtils.clamp(state.threat+n,0,5); state.lastCrime=performance.now()/1000; },
    update(dt, ctx){
      const { heroPos, carPos, inCar, enemies, fx, audio, setObjective, toast, addXP } = ctx;
      const tp = inCar?carPos:heroPos;
      const now=performance.now()/1000;
      // cool down threat if no crime 22s
      if(now-state.lastCrime>22 && state.threat>0){ state.heat+=dt; if(state.heat>4){state.heat=0; state.threat=Math.max(0,state.threat-1);} }
      // animate markers
      const t=performance.now()*0.003;
      for(const h of state.handles){ h.base.position.y=0.6+Math.sin(t)*0.25; h.base.rotation.y+=dt; }
      for(const p of state.packs){ if(!p.got){ p.mesh.rotation.y+=dt*2; p.mesh.position.y+=Math.sin(t+p.x)*dt*1.2; } }
      for(const r of state.rings){ if(!r.got) r.mesh.rotation.z+=dt; }
      // packs pickup
      for(const p of state.packs){
        if(p.got) continue;
        const d=Math.hypot(heroPos.x-p.x,heroPos.z-p.z)+Math.abs((heroPos.y+1)-p.y)*0.4;
        const dc=Math.hypot(carPos.x-p.x,carPos.z-p.z);
        if(Math.min(d,dc)<4){ p.got=true; scene.remove(p.mesh); state.packsGot++; addXP(25); toast(`DATA PACK ${state.packsGot}/8  +25 XP`); audio.counter(); fx.burst(p.mesh.position,16,0x4af2ff,7,5,0.7); }
      }
      // rings (car time trial side)
      if(inCar){
        for(const r of state.rings){
          if(r.got) continue;
          if(Math.hypot(carPos.x-r.x,carPos.z-r.z)<6){ r.got=true; scene.remove(r.mesh); state.ringsGot++; addXP(30); toast(`RACE RING ${state.ringsGot}/6  +30 XP — INTERCEPTOR TRIAL`); audio.counter(); }
        }
      }
      // M1 hostages
      if(state.idx===0){
        for(const h of state.hostages){
          if(h.saved) continue;
          h.mesh.rotation.y+=dt;
          if(Math.hypot(tp.x-h.x,tp.z-h.z)<4){
            // need area clear of thugs within 18m
            let clear=true;
            for(const e of enemies.list){ if(!e.dead&&(e.kind==='thug')&&Math.hypot(e.pos.x-h.x,e.pos.z-h.z)<20){clear=false;break;} }
            if(clear){ h.saved=true; scene.remove(h.mesh); state.rescued++; addXP(60); toast(`HOSTAGE RESCUED ${state.rescued}/3`); audio.counter(); this.addThreat(0.4); refreshObjectiveHandles();
              if(state.rescued>=3){ state.idx=1; refreshObjectiveHandles(); setObjective('OPERATION 2 — FIRE SALE','Use Q Detective Vision: bombs glow red. Get close and hold F to defuse all 4. Watch the drones!'); toast('OPERATION 2 UNLOCKED — FIND THE BOMBS'); }
            }
          }
        }
      } else if(state.idx===1){
        for(const b of state.bombs){
          if(b.done) continue;
          b.mesh.rotation.y+=dt*3;
          const near=Math.hypot(tp.x-b.x,tp.z-b.z)<4.5 && !inCar;
          if(near && ctx.input.keys['f']){
            b.progress+=dt/2.5;
            if(Math.random()<0.4) fx.burst(b.mesh.position,1,0x4af2ff,2,3,0.3);
            if(b.progress>=1){ b.done=true; scene.remove(b.mesh); state.defused++; addXP(70); toast(`BOMB DEFUSED ${state.defused}/4`); audio.counter(); refreshObjectiveHandles();
              if(state.defused>=4){ state.idx=2; this.spawnWarden(ctx); refreshObjectiveHandles(); setObjective('FINALE — THE WARDEN','The Warden waits in the plaza with drone guard. Ram or blast drones in the Interceptor, then finish him on foot!'); toast('THE WARDEN HAS ARRIVED'); }
            }
          } else b.progress=Math.max(0,b.progress-dt*0.5);
        }
      } else if(state.idx===2){
        // check warden dead
        if(state.warden && state.warden.dead && !state.done){
          state.done=true;
          setObjective('CITY SAVED — FREE ROAM','Warden down! Mop up drones, grab packs/rings, or push Threat to 5 stars for chaos.');
          toast('CITY SAVED — YOU ARE THE NIGHT SENTINEL'); addXP(200);
        }
      }
    },
    spawnWarden(ctx){
      const { enemies } = ctx;
      const w=enemies.spawnThug(8,10,true);
      state.warden=w;
      for(let i=0;i<3;i++) enemies.spawnDrone(-14+i*14, -18);
      this.addThreat(2);
    }
  };
}
