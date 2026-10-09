// city.js — procedural night city, roads, buildings, lamps, rain, signal, traffic
import * as THREE from 'three';

export const CITY = {
  blocks: 7,          // 7x7 blocks
  blockSize: 64,
  roadW: 16,
  half: 0,
};
CITY.half = (CITY.blocks * (CITY.blockSize + CITY.roadW)) / 2;

function windowTexture() {
  const c = document.createElement('canvas'); c.width=128; c.height=256;
  const g = c.getContext('2d');
  g.fillStyle='#0b1020'; g.fillRect(0,0,128,256);
  for (let y=8;y<248;y+=16) for (let x=8;x<120;x+=14) {
    const lit = Math.random()<0.42;
    g.fillStyle = lit ? (Math.random()<0.8?'#ffd97a':'#9ae2ff') : '#131a30';
    g.globalAlpha = lit ? (0.5+Math.random()*0.5) : 1;
    g.fillRect(x,y,9,10);
  }
  g.globalAlpha=1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ,h}
  const rooftops = [];
  const winTex = windowTexture();

  // ground
  const groundSize = CITY.half*2+200;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x0a0d16, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
  scene.add(ground);

  // roads: dark strips with center lines
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x11141f, roughness: 0.7 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x3a3f5a });
  const step = CITY.blockSize + CITY.roadW;
  for (let i=0;i<=CITY.blocks;i++) {
    const c = -CITY.half + i*step - CITY.roadW/2;
    // vertical road
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadW, CITY.half*2), roadMat);
    rv.rotation.x=-Math.PI/2; rv.position.set(c,0.02,0); scene.add(rv);
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half*2, CITY.roadW), roadMat);
    rh.rotation.x=-Math.PI/2; rh.position.set(0,0.02,c); scene.add(rh);
    // dashes
    for (let d=-CITY.half; d<CITY.half; d+=10) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4,3), lineMat);
      dash.rotation.x=-Math.PI/2; dash.position.set(c,0.04,d); scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(3,0.4), lineMat);
      dash2.rotation.x=-Math.PI/2; dash2.position.set(d,0.04,c); scene.add(dash2);
    }
  }

  // buildings
  const bGeoCache = [];
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x2a3c6e });
  for (let bx=0; bx<CITY.blocks; bx++) for (let bz=0; bz<CITY.blocks; bz++) {
    // skip central plaza (for finale)
    if (bx===3 && bz===3) continue;
    const cx = -CITY.half + CITY.roadW + bx*step + CITY.blockSize/2;
    const cz = -CITY.half + CITY.roadW + bz*step + CITY.blockSize/2;
    // 1-4 towers per block
    const n = 1 + Math.floor(Math.random()*2);
    for (let k=0;k<n;k++) {
      const w = 18+Math.random()*22, d = 18+Math.random()*22;
      const h = 22+Math.random()*70 + (Math.abs(bx-3)+Math.abs(bz-3)<2 ? 30 : 0);
      const ox = (Math.random()-0.5)*(CITY.blockSize-w-6);
      const oz = (Math.random()-0.5)*(CITY.blockSize-d-6);
      const x = cx+ox, z = cz+oz;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.6+Math.random()*0.08, 0.25, 0.08+Math.random()*0.05),
        roughness: 0.85, metalness: 0.2,
        emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55,
        map: null,
      });
      // clone texture repeat per building
      mat.emissiveMap = winTex.clone(); mat.emissiveMap.needsUpdate=true;
      mat.emissiveMap.repeat.set(Math.max(1,Math.round(w/14)), Math.max(1,Math.round(h/28)));
      mat.emissiveMap.wrapS = mat.emissiveMap.wrapT = THREE.RepeatWrapping;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
      m.position.set(x,h/2,z);
      scene.add(m);
      // roof edge glow
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w+0.6,0.5,d+0.6), new THREE.MeshBasicMaterial({color:0x1c2a55}));
      edge.position.set(x,h+0.2,z); scene.add(edge);
      // rooftop beacon for grapple
      colliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, h, x, z, w, d });
      rooftops.push({ x, z, h, w, d });
      // gargoyle prop on some roofs
      if (Math.random()<0.3) {
        const g = new THREE.Mesh(new THREE.ConeGeometry(1.2,3,5), new THREE.MeshStandardMaterial({color:0x1a2136}));
        g.position.set(x+w/2-2, h+1.5, z+d/2-2); scene.add(g);
      }
    }
    // street lamps at block corners
    if ((bx+bz)%2===0) {
      const lx = cx-CITY.blockSize/2-2, lz = cz-CITY.blockSize/2-2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.35,9,6), new THREE.MeshStandardMaterial({color:0x222a44}));
      pole.position.set(lx,4.5,lz); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6,8,8), new THREE.MeshBasicMaterial({color:0xffd98a}));
      bulb.position.set(lx,9.2,lz); scene.add(bulb);
      const pl = new THREE.PointLight(0xffbe5a, 18, 42, 1.8); pl.position.set(lx,9,lz); scene.add(pl);
    }
  }

  // central plaza (finale arena)
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(38,40), new THREE.MeshStandardMaterial({color:0x141a2e, roughness:0.6}));
  plaza.rotation.x=-Math.PI/2; plaza.position.set(0,0.05,0); scene.add(plaza);
  const monument = new THREE.Mesh(new THREE.CylinderGeometry(4,6,26,8), new THREE.MeshStandardMaterial({color:0x232c4e, roughness:0.5, metalness:0.4}));
  monument.position.set(0,13,0); scene.add(monument);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(3,16,16), new THREE.MeshBasicMaterial({color:0x4af2ff}));
  orb.position.set(0,28,0); scene.add(orb);
  const orbLight = new THREE.PointLight(0x4af2ff, 60, 120, 1.7); orbLight.position.set(0,28,0); scene.add(orbLight);

  // bat-signal style searchlight in sky (original: sentinel signal)
  const sigCanvas = document.createElement('canvas'); sigCanvas.width=sigCanvas.height=128;
  const sg = sigCanvas.getContext('2d');
  sg.fillStyle='rgba(0,0,0,0)'; sg.clearRect(0,0,128,128);
  sg.fillStyle='rgba(255,230,140,0.95)';
  sg.beginPath(); sg.ellipse(64,64,34,22,0,0,Math.PI*2); sg.fill();
  sg.fillStyle='rgba(5,7,13,1)';
  sg.beginPath(); sg.ellipse(64,60,16,10,0,0,Math.PI*2); sg.fill(); // bird silhouette abstract
  sg.fillRect(20,58,88,5);
  const sigTex = new THREE.CanvasTexture(sigCanvas);
  const sig = new THREE.Mesh(new THREE.PlaneGeometry(90,90), new THREE.MeshBasicMaterial({map:sigTex, transparent:true, opacity:0.85, depthWrite:false, blending:THREE.AdditiveBlending}));
  sig.position.set(-120,190,-220); sig.lookAt(0,0,0); scene.add(sig);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3,14,220,12,1,true), new THREE.MeshBasicMaterial({color:0xfff0b0, transparent:true, opacity:0.07, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
  beam.position.set(-60,100,-110); beam.rotation.z=0.4; beam.rotation.x=0.3; scene.add(beam);

  // rain
  const rainCount=900;
  const rGeo=new THREE.BufferGeometry();
  const rPos=new Float32Array(rainCount*3);
  for (let i=0;i<rainCount;i++){ rPos[i*3]=(Math.random()-0.5)*500; rPos[i*3+1]=Math.random()*120; rPos[i*3+2]=(Math.random()-0.5)*500; }
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos,3));
  const rain=new THREE.Points(rGeo, new THREE.PointsMaterial({color:0x8fb4ff,size:0.35,transparent:true,opacity:0.5}));
  rain.frustumCulled=false; scene.add(rain);

  // fog + lights
  scene.fog = new THREE.FogExp2(0x0a1022, 0.0038);
  scene.background = new THREE.Color(0x05070d);
  const moon = new THREE.DirectionalLight(0x8fb0ff, 1.4); moon.position.set(-80,140,-60); scene.add(moon);
  const amb = new THREE.AmbientLight(0x4a587e, 1.6); scene.add(amb);
  const hemi = new THREE.HemisphereLight(0x3a4a7a, 0x0a0c14, 0.9); scene.add(hemi);

  return { colliders, rooftops, rain, rainPos: rPos, signal: sig };
}

export function collideCity(pos, radius, colliders) {
  // push out XZ from building boxes (only if below top)
  for (const c of colliders) {
    if (pos.y >= c.h - 0.5) continue;
    if (pos.x > c.minX-radius && pos.x < c.maxX+radius && pos.z > c.minZ-radius && pos.z < c.maxZ+radius) {
      const dx1 = pos.x-(c.minX-radius), dx2=(c.maxX+radius)-pos.x;
      const dz1 = pos.z-(c.minZ-radius), dz2=(c.maxZ+radius)-pos.z;
      const m = Math.min(dx1,dx2,dz1,dz2);
      if (m===dx1) pos.x=c.minX-radius; else if (m===dx2) pos.x=c.maxX+radius;
      else if (m===dz1) pos.z=c.minZ-radius; else pos.z=c.maxZ+radius;
    }
  }
  const lim = CITY.half+60;
  pos.x = THREE.MathUtils.clamp(pos.x,-lim,lim);
  pos.z = THREE.MathUtils.clamp(pos.z,-lim,lim);
}

export function groundHeightAt(x, z, colliders) {
  // if on rooftop footprint, return roof h else 0
  for (const c of colliders) {
    if (x>c.minX && x<c.maxX && z>c.minZ && z<c.maxZ) return c.h;
  }
  return 0;
}
