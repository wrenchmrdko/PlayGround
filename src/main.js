// main.js — Night Sentinel: Arkham Protocol (original fan-inspired prototype)
import * as THREE from 'three';
import { buildCity, collideCity } from './city.js';
import { createHero } from './hero.js';
import { createCar } from './car.js';
import { createEnemies } from './enemies.js';
import { createMissions } from './missions.js';
import { ParticlePool, GameAudio } from './fx.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'game';
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 1200);

const city = buildCity(scene);
const fx = new ParticlePool(scene);
const audio = new GameAudio();
const hero = createHero(scene);
hero.pos.set(32, 0, 40); hero.yaw = 0.7; hero.pitch = 0.22; hero.mesh.rotation.y = hero.yaw;
const car = createCar(scene);
car.pos.set(30, 0, 36.5); car.yaw = 0.7; car.mesh.rotation.y = car.yaw;
const enemies = createEnemies(scene, city);
const missions = createMissions(scene, city);

// detective-vision overlay materials stash
const detStash = [];
function setDetective(on) {
  document.getElementById('detectiveTag').style.display = on ? 'block' : 'none';
  if (on) {
    scene.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive !== undefined && !o.userData._det) {
        o.userData._det = { e: o.material.emissive ? o.material.emissive.getHex() : 0, i: o.material.emissiveIntensity ?? 1 };
        // enemies/bombs pop
      }
    });
    scene.fog.density = 0.0022;
  } else scene.fog.density = 0.0052;
}

// ---------- input ----------
const input = {
  keys: {}, mouseDX: 0, mouseDY: 0, inCar: false, detective: false,
  consumeJump: false, consumeFire: false, consumeCounter: false,
  locked: false,
};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  input.keys[k] = true;
  if (k === ' ') { input.consumeJump = true; e.preventDefault(); }
  if (k === 'q') { input.detective = !input.detective; setDetective(input.detective); audio.blip(input.detective?900:400,0.15,'sine',0.2); }
  if (k === 'e') tryEnterExit();
  if (k === 'x' && input.inCar) { car.battle = !car.battle; toast(car.battle?'BATTLE MODE — CANNON LIVE (CLICK FIRE · R MISSILES)':'PURSUIT MODE — RAMMING SPEED'); audio.blip(car.battle?200:600,0.2,'sawtooth',0.2); updateModeTag(); }
  if (k === 'f') { /* handled per-frame (hold for defuse, tap for strike) */ strikePressed = true; }
  if (k === 'r') { input.consumeCounter = true; counterPressed = true; }
  if (['w','a','s','d',' '].includes(k)) e.preventDefault();
});
addEventListener('keyup', e => { input.keys[e.key.toLowerCase()] = false; });
let strikePressed = false, counterPressed = false;
addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    input.mouseDX += e.movementX; input.mouseDY += e.movementY;
  }
});
renderer.domElement.addEventListener('mousedown', e => {
  if (input.inCar) { if (e.button===0) input.consumeFire = true; if (e.button===2) input.consumeCounter = true; }
});
addEventListener('contextmenu', e => { if (input.inCar) e.preventDefault(); });

// ---------- HUD ----------
const hpFill=document.getElementById('hpFill'), hpTxt=document.getElementById('hpTxt');
const xpFill=document.getElementById('xpFill'), xpTxt=document.getElementById('xpTxt');
const carFill=document.getElementById('carFill'), carTxt=document.getElementById('carTxt');
const comboNum=document.getElementById('comboNum'), modeTag=document.getElementById('modeTag');
const objTitle=document.getElementById('objTitle'), objText=document.getElementById('objText');
const toastEl=document.getElementById('toast'), dmgV=document.getElementById('dmgVignette');
const stars=[...document.querySelectorAll('.star')];
const cross=document.getElementById('crosshair');
const fpsEl=document.getElementById('fps');
let toastT=null;
function toast(s, ms=2600){ toastEl.textContent=s; toastEl.style.opacity=1; clearTimeout(toastT); toastT=setTimeout(()=>toastEl.style.opacity=0,ms); }
function setObjective(t,x){ objTitle.textContent=t; objText.textContent=x; }
function updateModeTag(){ modeTag.textContent = input.inCar ? (car.battle?'INTERCEPTOR — BATTLE MODE':'INTERCEPTOR — PURSUIT MODE') : (hero.gliding?'GLIDE':'ON FOOT'); cross.style.display=(input.inCar&&car.battle)?'block':'none'; }

const player = { hp:100, maxHp:100, xp:0, level:1, combo:0, comboT:0, iframes:0 };

// enter/exit car
function tryEnterExit(){
  if (input.inCar) {
    // exit: place hero beside car
    input.inCar=false;
    hero.pos.set(car.pos.x+3, hero.groundH||0, car.pos.z+1);
    hero.vel.set(0,0,0);
    audio.blip(300,0.15,'square',0.15);
    updateModeTag();
  } else {
    const d=Math.hypot(hero.pos.x-car.pos.x, hero.pos.z-car.pos.z);
    if (d<5) { input.inCar=true; audio.blip(500,0.2,'sawtooth',0.2); toast('INTERCEPTOR ONLINE — X FOR BATTLE MODE'); updateModeTag(); }
    else {
      // grapnel
      if (hero.tryGrapple(city, fx, audio)) toast('GRAPNEL BOOST!');
    }
  }
}

// combat
function doStrike(){
  // find nearest enemy in front within range
  let best=null,bd=1e9;
  const hx=hero.pos.x, hz=hero.pos.z;
  const lookX=-Math.sin(hero.yaw), lookZ=-Math.cos(hero.yaw);
  for(const e of enemies.list){
    if(e.dead) continue;
    const dx=e.pos.x-hx, dz=e.pos.z-hz;
    const d=Math.hypot(dx,dz);
    if(d>4.2) continue;
    const dot=(dx*lookX+dz*lookZ)/(d||1);
    if(dot<0.1 && d>1.6) continue;
    if(d<bd){bd=d;best=e;}
  }
  if(best){
    // lunge
    const dx=(best.pos.x-hx)/(bd||1), dz=(best.pos.z-hz)/(bd||1);
    hero.pos.x+=dx*Math.min(2.2,bd); hero.pos.z+=dz*Math.min(2.2,bd);
    hero.mesh.rotation.y=Math.atan2(dx,dz);
    const dmg = 1.4 + player.level*0.25;
    best.hp-=dmg; best.flash=0.2;
    fx.burst(new THREE.Vector3(best.pos.x,best.pos.y+1.4,best.pos.z),10,0xffe27a,7,5,0.5);
    audio.punch();
    player.combo++; player.comboT=3.2;
    addXP(6);
    // knockback small
    best.pos.x+=dx*0.7; best.pos.z+=dz*0.7;
    if(best.hp<=0){ const xp=enemies.kill(best,fx,audio,'strike'); addXP(xp); player.combo+=1; missions.addThreat(0.05); toast(best.kind==='warden'?'WARDEN DOWN!':`${player.combo} HIT COMBO!`); }
    // collateral crime if hitting near traffic? small threat occasionally
    if(Math.random()<0.06) missions.addThreat(0.2);
  } else {
    // whiff swoosh
    audio.blip(700,0.07,'sine',0.07);
  }
}
function doCounter(){
  // counter window: enemy with atk visible within 4m
  let ok=false;
  for(const e of enemies.list){
    if(e.dead||!e.atk||!e.atk.visible) continue;
    if(Math.hypot(e.pos.x-hero.pos.x,e.pos.z-hero.pos.z)<4.5){ ok=true;
      e.hp-=2.2; e.flash=0.25; e.atk.visible=false;
      fx.burst(new THREE.Vector3(e.pos.x,1.6,e.pos.z),14,0x4af2ff,8,6,0.6);
      if(e.hp<=0){ const xp=enemies.kill(e,fx,audio,'counter'); addXP(xp); }
      break;
    }
  }
  if(ok){ player.combo+=2; player.comboT=3.2; audio.counter(); toast('COUNTER!'); addXP(8); }
  else audio.blip(240,0.1,'square',0.08);
}
function addXP(n){
  player.xp+=n;
  const need=player.level*100;
  if(player.xp>=need){ player.xp-=need; player.level++; player.hp=Math.min(player.maxHp,player.hp+30); toast(`LEVEL UP — FEAR LEVEL ${player.level}`); audio.counter(); fx.burst(hero.pos,24,0x9a6bff,8,7,0.8); }
}
function onPlayerHit(dmg, from){
  if(player.iframes>0) return;
  player.iframes=0.5;
  player.hp-=dmg;
  player.combo=0;
  dmgV.style.opacity=0.9; setTimeout(()=>dmgV.style.opacity=0,220);
  fx.burst(new THREE.Vector3(hero.pos.x,hero.pos.y+1.4,hero.pos.z),10,0xff4040,7,5,0.5);
  audio.noise(0.18,0.3);
  if(player.hp<=0){
    player.hp=player.maxHp; player.combo=0;
    hero.pos.set(14,0,34); hero.vel.set(0,0,0);
    car.pos.set(18,0,30); car.hull=Math.max(40,car.hull);
    missions.addThreat(Math.max(0,missions.state.threat-1));
    toast('KNOCKED DOWN — THE NIGHT PUTS YOU BACK UP');
    setObjective(objTitle.textContent,objText.textContent);
  }
}

// ---------- camera ----------
let camDist=7.5, shake=0;
function updateCamera(dt){
  // mouse look
  hero.yaw -= input.mouseDX*0.0028;
  hero.pitch -= input.mouseDY*0.0022;
  hero.pitch=THREE.MathUtils.clamp(hero.pitch,-1.1,0.55);
  if(input.inCar && car.battle){
    // turret aims with mouse too
    car.turretYaw = THREE.MathUtils.clamp(car.turretYaw + 0, -1.2, 1.2);
  }
  input.mouseDX=0; input.mouseDY=0;
  const focus = input.inCar?car.pos:hero.pos;
  const yaw = input.inCar?car.yaw:hero.yaw;
  const dist = input.inCar?(car.battle?10.5:9):(hero.gliding?9.5:8.2);
  const h = input.inCar?4.2:(hero.gliding?3.4:3.1+hero.pitch*1.5);
  const cx=focus.x+Math.sin(yaw)*dist*Math.cos(hero.pitch);
  const cz=focus.z+Math.cos(yaw)*dist*Math.cos(hero.pitch);
  const cy=(focus.y||0)+h - hero.pitch*6;
  camera.position.lerp(new THREE.Vector3(cx,Math.max(1.2,cy),cz), Math.min(1,dt*7));
  const look=new THREE.Vector3(focus.x, (focus.y||0)+2.0, focus.z);
  if(shake>0){ look.x+=(Math.random()-0.5)*shake; look.y+=(Math.random()-0.5)*shake; shake-=dt*3; }
  camera.lookAt(look);
}

// ---------- minimap ----------
const mm=document.getElementById('minimap').getContext('2d');
function drawMinimap(){
  mm.fillStyle='#070b18'; mm.fillRect(0,0,190,190);
  mm.strokeStyle='rgba(90,120,200,.25)'; mm.lineWidth=5;
  // roads grid approx
  mm.strokeStyle='#232c4e'; mm.lineWidth=3;
  const s=190/560; // world ±280 -> map
  const px=x=>95+x*s, pz=z=>95+z*s;
  mm.strokeStyle='rgba(120,150,220,.35)'; mm.lineWidth=2;
  for(let i=0;i<=7;i++){ const c=-224+i*80; mm.beginPath(); mm.moveTo(px(c),0); mm.lineTo(px(c),190); mm.stroke(); mm.beginPath(); mm.moveTo(0,pz(c)); mm.lineTo(190,pz(c)); mm.stroke(); }
  // objectives gold
  mm.fillStyle='#ffd23f';
  if(missions.state.idx===0) for(const h of missions.state.hostages) if(!h.saved){ mm.beginPath(); mm.arc(px(h.x),pz(h.z),4,0,7); mm.fill(); }
  if(missions.state.idx===1) for(const b of missions.state.bombs) if(!b.done){ mm.fillStyle='#ff4040'; mm.beginPath(); mm.arc(px(b.x),pz(b.z),4,0,7); mm.fill(); mm.fillStyle='#ffd23f'; }
  if(missions.state.idx===2){ mm.fillStyle='#ffd23f'; mm.beginPath(); mm.arc(95,95,6,0,7); mm.fill(); }
  // enemies red
  mm.fillStyle='#ff4040';
  for(const e of enemies.list){ if(e.dead) continue; const d=Math.hypot(e.pos.x-hero.pos.x,e.pos.z-hero.pos.z); if(d>220) continue; if(input.detective||d<90){ mm.fillRect(px(e.pos.x)-2,pz(e.pos.z)-2,4,4);} }
  // packs cyan
  if(input.detective){ mm.fillStyle='#4af2ff'; for(const p of missions.state.packs) if(!p.got) mm.fillRect(px(p.x)-1.5,pz(p.z)-1.5,3,3); }
  // car
  mm.fillStyle='#4aa8ff'; mm.save(); mm.translate(px(car.pos.x),pz(car.pos.z)); mm.rotate(Math.atan2(-Math.sin(car.yaw),-Math.cos(car.yaw))+Math.PI); mm.fillRect(-3,-5,6,10); mm.restore();
  // hero arrow
  mm.fillStyle='#ffffff'; mm.save(); mm.translate(px(hero.pos.x),pz(hero.pos.z)); mm.rotate(Math.atan2(-Math.sin(hero.yaw),-Math.cos(hero.yaw))+Math.PI); mm.beginPath(); mm.moveTo(0,-6); mm.lineTo(4,4); mm.lineTo(-4,4); mm.closePath(); mm.fill(); mm.restore();
}

// ---------- start ----------
let started=false;
document.getElementById('playBtn').addEventListener('click', ()=>{
  document.getElementById('menu').style.display='none';
  renderer.domElement.requestPointerLock?.();
  audio.init();
  started=true;
  toast('PATROL THE FALLS — FIND THE INTERCEPTOR (BLUE MARK)');
  // car marker
  setObjective('PROLOGUE — NIGHT FALLS','Rescue 3 hostages (green beams). Punch with F, counter with R. Press E by the Interceptor to drive. Q = Detective Vision.');
});
renderer.domElement.addEventListener('click', ()=>{ if(started) renderer.domElement.requestPointerLock?.(); });
addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// threat spawn director (GTA-style)
let spawnT=4;
function director(dt){
  spawnT-=dt;
  if(spawnT>0) return;
  spawnT=5;
  const th=missions.state.threat;
  const aliveThugs=enemies.list.filter(e=>!e.dead&&e.kind==='thug').length;
  const aliveDrones=enemies.list.filter(e=>!e.dead&&e.kind==='drone').length;
  if(th>=1 && aliveDrones<2+th){
    const a=Math.random()*Math.PI*2;
    enemies.spawnDrone(hero.pos.x+Math.cos(a)*70, hero.pos.z+Math.sin(a)*70);
    if(th>=2) toast(`THREAT ${Math.round(th)} — DRONES INBOUND`);
  }
  if(th>=3 && aliveThugs<10){
    for(let i=0;i<2;i++) enemies.spawnThug(hero.pos.x+(Math.random()-0.5)*80, hero.pos.z+(Math.random()-0.5)*80);
  }
  // ambient respawn to keep streets alive
  if(aliveThugs<6 && missions.state.idx!==0){
    const a=Math.random()*Math.PI*2, r=90+Math.random()*120;
    enemies.spawnThug(Math.cos(a)*r, Math.sin(a)*r);
  }
}

// car marker beam (always until first enter)
const carBeacon=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,46,10,1,true), new THREE.MeshBasicMaterial({color:0x4aa8ff,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
carBeacon.position.copy(car.pos).add(new THREE.Vector3(0,23,0)); scene.add(carBeacon);

// ---------- main loop ----------
const clock=new THREE.Clock();
let fpsA=0,fpsN=0,fpsT=0;
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(0.033,clock.getDelta());
  // fps
  fpsA+=dt; fpsN++; fpsT+=dt; if(fpsT>0.5){ fpsEl.textContent=`${Math.round(fpsN/fpsA)} FPS · ${renderer.info.render.triangles/1000|0}k tris`; fpsA=0;fpsN=0;fpsT=0; }

  if(!started){ renderer.render(scene,camera); camera.position.set(60,50,90); camera.lookAt(0,10,0); return; }

  // rain fall
  const rp=city.rainPos;
  for(let i=0;i<rp.length/3;i++){ rp[i*3+1]-=dt*60; if(rp[i*3+1]<0) rp[i*3+1]=120; }
  city.rain.geometry.attributes.position.needsUpdate=true;
  city.signal.lookAt(camera.position);

  // strikes
  if(strikePressed){ strikePressed=false; if(!input.inCar) doStrike(); }
  if(counterPressed){ counterPressed=false; if(!input.inCar) doCounter(); }

  if(input.inCar){
    hero.mesh.visible=false;
    carBeacon.visible=false;
    // keep hero glued inside car
    hero.pos.copy(car.pos);
    car.update(dt,input,city,fx,audio,enemies,(kind)=>{
      if(kind==='cannon'||kind==='missiles'){ shake=Math.min(1,shake+0.5); missions.addThreat(0.25); }
      else if(kind==='pulse'){ missions.addThreat(0.08); }
    });
  } else {
    hero.mesh.visible=true;
    hero.update(dt,input,camera,city,fx,audio);
    audio.engine(0,false);
    car.update(dt,{...input,inCar:false,keys:{},consumeFire:false,consumeCounter:false,mouseDX:0},city,fx,audio,enemies,null);
    car.pos.y=0;
    carBeacon.position.set(car.pos.x,23,car.pos.z);
    carBeacon.visible = missions.state.rescued<1 && !input.inCar;
  }

  // collision hero vs traffic (knock)
  if(!input.inCar){
    for(const t of enemies.traffic){
      if(Math.hypot(t.pos.x-hero.pos.x,t.pos.z-hero.pos.z)<2.2 && Math.abs(t.speed)>4){
        onPlayerHit(8,null); missions.addThreat(0.3);
        fx.burst(hero.pos,10,0xffd23f,6,4,0.5);
        break;
      }
    }
  } else {
    // car vs traffic: smash (GTA chaos raises threat)
    for(const t of enemies.traffic){
      if(Math.hypot(t.pos.x-car.pos.x,t.pos.z-car.pos.z)<3.6 && Math.abs(car.speed)>10){
        fx.burst(t.pos,18,0xff8830,9,6,0.8); audio.explosion(); shake=Math.min(1.2,shake+0.6);
        t.pos.x+=(Math.random()-0.5)*20; t.pos.z+=(Math.random()-0.5)*20;
        missions.addThreat(0.5);
        car.damage(2,fx);
      }
    }
  }

  player.iframes-=dt; player.comboT-=dt;
  if(player.comboT<=0) player.combo=0;

  enemies.update(dt,hero.pos,car.pos,input.inCar,hero,car,fx,audio,missions.state.threat,onPlayerHit);
  missions.update(dt,{heroPos:hero.pos,carPos:car.pos,inCar:input.inCar,enemies,fx,audio,setObjective,toast,addXP,input});
  director(dt);
  fx.update(dt);
  updateCamera(dt);
  updateModeTag();

  // detective vision FX: tint enemies
  for(const e of enemies.list){
    if(e.dead) continue;
    e.mesh.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive!==undefined){} });
    if(input.detective){ e.mesh.scale.setScalar(e.brute?1:1.06); }
    else e.mesh.scale.setScalar(1);
  }

  // HUD
  hpFill.style.width=`${player.hp}%`; hpTxt.textContent=`${Math.ceil(player.hp)}`;
  const need=player.level*100;
  xpFill.style.width=`${player.xp/need*100}%`; xpTxt.textContent=`Lv ${player.level}`;
  carFill.style.width=`${car.hull}%`; carTxt.textContent=`${Math.round(car.hull)}%`;
  comboNum.textContent=player.combo;
  comboNum.style.color=player.combo>=10?'#ff9a2e':'#ffd23f';
  const th=Math.round(missions.state.threat);
  stars.forEach((s,i)=>s.classList.toggle('on',i<th));
  if(car.hull<=0 && input.inCar){ car.hull=30; car.speed=0; toast('INTERCEPTOR CRITICAL — EJECT!'); input.inCar=false; hero.pos.set(car.pos.x+4,0,car.pos.z); updateModeTag(); audio.explosion(); fx.burst(car.pos,40,0xff5030,12,8,1.2); }
  if(car.hull<100) car.hull=Math.min(100,car.hull+dt*1.2); // slow self-repair

  drawMinimap();
  renderer.render(scene,camera);
}
loop();
