// Turner & Pears Family Tree — 3D family tree (three.js). Generations stack top (oldest) to bottom,
// partners sit side by side, and brothers and sisters recede into the screen in birth order (eldest at the front).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {createStore,deriveRoomKey,CHUNK} from './store.js';
import {SEED,SEED_VERSION} from './seed.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yearOf=s=>{const m=String(s||'').match(/(\d{4})/);return m?+m[1]:null};
const uid=p=>(p||'p')+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fullName=p=>p?[p.given,p.surname].filter(Boolean).join(' ').trim()||'Unnamed':'';
const shortName=p=>p?([p.given.replace(/^(Vice-Admiral Sir|Lt-Col|Sir|Rev\.?|Dr\.?)\s+/,'').replace(/\s*".*?"\s*/g,' ').trim().split(/\s+/)[0],p.surname].filter(Boolean).join(' ')):'';
const nick=p=>{const m=(p.given||'').match(/"(.+?)"/);return m?m[1]+' '+p.surname:null};
const years=p=>{const b=yearOf(p.birth),d=yearOf(p.death);if(!b&&!d)return p.deceased?'†':'';return (b?(String(p.birth).match(/^c/i)?'c.':'')+b:'?')+(d||p.deceased?' – '+(d||'?'):'')};
const SMALL=matchMedia('(max-width:860px), (max-height:540px)').matches||matchMedia('(pointer:coarse)').matches;
const toast=(t,ms=2600)=>{const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),ms)};
const params=new URLSearchParams(location.search), DEMO=params.has('demo');
let store, sel='mark', focusMode=false, yearFilter=null;
const P=()=>store.data.persons, M=()=>store.data.media;

/* ======================= boot / lock ======================= */
async function boot(){
  await Promise.race([Promise.all([document.fonts.load('600 30px Cinzel'),document.fonts.load('500 26px Cormorant'),document.fonts.load('italic 500 20px Cormorant')]),new Promise(r=>setTimeout(r,2500))]).catch(()=>{});
  if(DEMO){await start('demo'.padEnd(64,'0'),true);return}
  const room=localStorage.getItem('tpt:room');
  if(room&&/^[a-f0-9]{64}$/.test(room)){await start(room,false);return}
  showLock();
}
function showLock(){
  const L=$('#lock');L.style.display='flex';
  $('#lockBox').innerHTML=`<h2>Turner &amp; Pears Family Tree</h2><p>Enter your family passcode.</p>
   <input id="pc1" type="password" autocomplete="current-password" placeholder="Family passcode" style="margin-top:10px;text-align:center">
   <div id="pcStep2" style="display:none"><p id="pcMsg" style="margin-top:12px"></p><input id="pc2" type="password" autocomplete="new-password" placeholder="Type it again" style="text-align:center"></div>
   <div class="acts" style="justify-content:center"><button class="b" id="pcGo">Open the tree</button></div>
   <p style="font-size:14px;margin-top:14px">First time? Choose a passcode of at least 8 characters. You type it once on each computer or phone. It is never stored or sent anywhere.</p>`;
  let room=null, st=null;
  const go=async()=>{
    const c1=$('#pc1').value;
    if(room){ if($('#pc2').value!==c1)return toast('Those two don\'t match. Try again.'); await openRoom(room,st,true); return }
    if(c1.trim().length<8)return toast('Please use at least 8 characters.');
    $('#pcGo').disabled=true;$('#pcGo').textContent='Unlocking… (a few seconds)';
    try{
      const r=await deriveRoomKey(c1); const s=await createStore(r,{onChange,onStatus});
      const ex=await s.exists();
      if(ex===true){await openRoom(r,s,false);return}
      room=r;st=s; $('#pcStep2').style.display='block'; $('#pc1').disabled=true;
      $('#pcMsg').textContent=ex===false?'This is a new family tree. Type the passcode again to confirm and start it.':
        'I can\'t check online for an existing tree yet, so this will start on this device and sync once cloud sync is switched on. Type the passcode again to confirm.';
      $('#pc2').focus();
    }catch(e){console.error(e);toast('Something went wrong unlocking. Please try again.')}
    $('#pcGo').disabled=false;$('#pcGo').textContent='Open the tree';
  };
  $('#pcGo').onclick=go; $('#lockBox').onkeydown=e=>{if(e.key==='Enter')go()}; $('#pc1').focus();
}
async function openRoom(room,s,isNew){
  localStorage.setItem('tpt:room',room); $('#lock').style.display='none';
  store=s; if(isNew)await seedIfNeeded(); afterStart();
}
async function start(room,demo){
  store=await createStore(room,{demo,onChange,onStatus});
  if(demo)await seedIfNeeded();
  afterStart();
}
async function seedIfNeeded(){
  if(store.data.config.main)return;
  for(const p of SEED)await store.put('persons',p.id,structuredClone(p),{keepTime:true});
  await store.put('config','main',{seeded:SEED_VERSION,created:Date.now(),updatedAt:1},{keepTime:true});
}
function afterStart(){
  if(!P()[sel])sel=Object.keys(P())[0]||null;
  initScene(); rebuild(); renderList(); renderDetails(); onStatus(store.status);
  setTimeout(()=>flyHome(true),0);
}

/* ======================= data change hooks ======================= */
let rbT=null;
function onChange(c){ if(!scene)return; clearTimeout(rbT); rbT=setTimeout(()=>{if(sel&&!P()[sel])sel=P().mark?'mark':Object.keys(P())[0]||null;rebuild();renderList();renderDetails()},80) }
function onStatus(s){const el=$('#status');if(!el)return;el.className=s;
  el.textContent={local:DEMO?'Demo – nothing is saved to the cloud':'Saved on this device',offline:'Offline – saved on this device',syncing:'Syncing…',synced:'Synced',
    blocked:'Saved on this device – cloud sync not switched on yet'}[s]||s;
  el.title=s==='blocked'?'The Firebase rules for the family tree have not been published yet. Everything is kept safely on this device and uploads automatically once they are.':''}

/* ======================= relationships ======================= */
const parentsOf=id=>(P()[id]?.parents||[]).filter(x=>P()[x]);
const spousesOf=id=>(P()[id]?.spouses||[]).filter(x=>P()[x]);
const relOf=(x,y)=>P()[x]?.rel?.[y]||P()[y]?.rel?.[x]||{};
const ended=(x,y)=>['separated','divorced'].includes(relOf(x,y).status);
const relText=(x,y)=>{const r=relOf(x,y);return r.status?r.status+(r.end?' '+r.end:''):''};
const childrenOf=id=>Object.values(P()).filter(p=>(p.parents||[]).includes(id)).map(p=>p.id);
const sortKey=p=>[p.order!=null&&p.order!==''?+p.order:1e4+(yearOf(p.birth)||5000),fullName(p)];
const bySib=(a,b)=>{const A=sortKey(P()[a]),B=sortKey(P()[b]);return A[0]-B[0]||A[1].localeCompare(B[1])};
const siblingsOf=id=>{const ps=parentsOf(id);if(!ps.length)return[];return Object.values(P()).filter(p=>p.id!==id&&(p.parents||[]).some(x=>ps.includes(x))).map(p=>p.id).sort(bySib)};
function lineOf(id){const s=new Set([id]);const up=x=>parentsOf(x).forEach(p=>{if(!s.has(p)){s.add(p);up(p)}});const dn=x=>childrenOf(x).forEach(c=>{if(!s.has(c)){s.add(c);dn(c)}});
  up(id);dn(id);spousesOf(id).forEach(x=>s.add(x));return s}
function aliveIn(p,Y){const b=yearOf(p.birth),d=yearOf(p.death);if(d&&Y>d)return false;if(b&&Y<b)return false;
  if(!d&&b&&Y-b>(p.deceased?90:110))return false;if(!b&&d&&Y<d-90)return false;return true}

/* ======================= layout ======================= */
const SX=2.5,SY=4.4,SZ=2.9,STAG=-0.6,TIER=0.4;  // TIER lifts each sibling further back so faces show over the ones in front
function layout(){
  const ps=P(), ids=Object.keys(ps), gen={};
  const roots=[ps.mark?'mark':null,...ids].filter(Boolean);
  for(const r of roots){ if(gen[r]!=null)continue; gen[r]=0; const q=[r];
    while(q.length){const x=q.shift(),g=gen[x];
      const nb=[...parentsOf(x).map(y=>[y,g-1]),...childrenOf(x).map(y=>[y,g+1]),...spousesOf(x).map(y=>[y,g])];
      for(const [y,gy] of nb)if(gen[y]==null){gen[y]=gy;q.push(y)}}}
  const pos={}, gens=[...new Set(Object.values(gen))].sort((a,b)=>a-b);
  for(const g of gens){
    const inG=ids.filter(i=>gen[i]===g); const hasPar=i=>parentsOf(i).some(p=>gen[p]===g-1);
    const unitOf={}, groups={};
    // heads: people with parents in the tree; married-in partners join their partner's unit
    inG.filter(hasPar).forEach(i=>{const k=parentsOf(i).filter(p=>gen[p]===g-1).sort().join('+');(groups[k]=groups[k]||{key:k,units:[]}).units.push(unitOf[i]={head:i,sp:[]})});
    const rest=inG.filter(i=>!hasPar(i)).sort((a,b)=>(ps[a].sex==='M'?0:1)-(ps[b].sex==='M'?0:1)||a.localeCompare(b));
    for(const i of rest){ if(unitOf[i])continue;
      const host=spousesOf(i).find(s=>gen[s]===g&&unitOf[s]&&unitOf[s].head===s);
      if(host){unitOf[host].sp.push(i);unitOf[i]=unitOf[host];continue}
      const u=unitOf[i]={head:i,sp:[]};groups['solo:'+i]={key:'solo:'+i,units:[u]};
      spousesOf(i).forEach(s=>{if(gen[s]===g&&!unitOf[s]&&!hasPar(s)){u.sp.push(s);unitOf[s]=u}})}
    const G=Object.values(groups);
    for(const gr of G){
      gr.units.sort((a,b)=>bySib(a.head,b.head));
      const par=gr.key.startsWith('solo:')?[]:gr.key.split('+');
      const kids=gr.key.startsWith('solo:')?gr.units.flatMap(u=>[u.head,...u.sp]).flatMap(childrenOf).filter(c=>pos[c]):[];
      gr.desired=par.length?par.reduce((s,p)=>s+(pos[p]?.x||0),0)/par.length:null;
      // children sit in the same depth plane as their parents, so the drop line comes straight down from them
      const pp=par.filter(p=>pos[p]);gr.baseZ=pp.length?pp.reduce((s,p)=>s+pos[p].z,0)/pp.length:0;gr.baseLift=pp.length?pp.reduce((s,p)=>s+pos[p].y+(g-1)*SY,0)/pp.length:0;
      // partners of brothers/sisters further back go on the side clear of the ones in front,
      // so their heart and the line down to their children aren't hidden behind a sibling
      let frontSide=null;
      gr.units.forEach((u,idx)=>{const male=ps[u.head].sex!=='F';u.sp.sort((x,y)=>ended(u.head,x)-ended(u.head,y));
        u.off={};u.off[u.head]=0;u.sp.forEach((s,j)=>{let side=(j%2===0)===male?1:-1;
          if(idx>0){const away=frontSide===-1?1:-1;side=j%2===0?away:-away}
          u.off[s]=side*(Math.floor(j/2)+1)});
        // someone further back with partners on both sides: slide the whole couple clear of the sibling in front
        if(idx>0&&u.sp.length>1){const away=frontSide===-1?1:-1;for(const k in u.off)u.off[k]+=away*2}
        if(idx===0&&u.sp.length)frontSide=Math.sign(u.off[u.sp[0]]);
        u.idx=idx;u.min=Math.min(...Object.values(u.off))*SX+idx*STAG;u.max=Math.max(...Object.values(u.off))*SX+idx*STAG});
      gr.left=Math.min(...gr.units.map(u=>u.min))-SX/2; gr.right=Math.max(...gr.units.map(u=>u.max))+SX/2;
    }
    G.sort((a,b)=>(a.desired??1e9)-(b.desired??1e9));
    let cursor=-1e9; const placed=[];
    for(const gr of G){let x=gr.desired??(placed.length?cursor-gr.left+0.6:0); if(x+gr.left<cursor+0.6)x=cursor+0.6-gr.left; gr.x=x; cursor=x+gr.right; placed.push(gr)}
    const withD=G.filter(gr=>gr.desired!=null); const shift=withD.length?withD.reduce((s,gr)=>s+(gr.x-gr.desired),0)/withD.length:(G.length?-(G[0].x+G[0].left+cursor)/2:0);
    for(const gr of G){gr.x-=shift; for(const u of gr.units)for(const [id,o] of Object.entries(u.off))pos[id]=new THREE.Vector3(gr.x+o*SX+u.idx*STAG,-g*SY+gr.baseLift+u.idx*TIER,gr.baseZ-u.idx*SZ)}
    // a couple from two different families (e.g. Mark with his parents, Emma with hers): if one of them is an only child here,
    // slide them across to stand right beside their partner, at the partner's depth, so the heart joins the right two people
    for(const gr of G){if(gr.units.length!==1||gr.key.startsWith('solo:'))continue;const u=gr.units[0];
      const s=spousesOf(u.head).find(x=>!ended(u.head,x)&&pos[x]&&unitOf[x]&&unitOf[x]!==u&&unitOf[x].head===x);if(!s)continue;
      const og=G.find(h=>h.units.includes(unitOf[s]));if(og.units.length===1&&u.head>s)continue;
      const ou=unitOf[s],side=((gr.desired??gr.x)>=pos[s].x)?1:-1,reach=Math.max(0,...Object.values(ou.off).map(o=>o*side));
      const mine=Math.max(0,...Object.values(u.off).map(o=>-o*side));
      let tx=pos[s].x+side*(reach+1+mine)*SX;const edge=og.x+(side>0?og.right:og.left)+side*(0.7+mine)*SX;if(ou.idx>0)tx=side>0?Math.max(tx,edge):Math.min(tx,edge);const d=new THREE.Vector3(tx-pos[u.head].x,pos[s].y-pos[u.head].y,pos[s].z-pos[u.head].z);
      for(const id in u.off)pos[id].add(d)}
  }
  return {pos,gen};
}

/* ======================= three.js scene ======================= */
let renderer,scene,camera,controls,world,nodes={},links=[],clock=new THREE.Clock(),fly=null,L={pos:{},gen:{}};
const FW=1.6,FH=2.2, TEXW=SMALL?320:512, TEXH=Math.round(TEXW*FH/FW);
const texCache=new Map(), imgCache=new Map();
function initScene(){
  if(renderer)return;
  const cv=$('#scene');
  renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,SMALL?1.5:2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x060a18); scene.fog=new THREE.FogExp2(0x060a18,0.012);
  camera=new THREE.PerspectiveCamera(45,1,0.1,500);
  controls=new OrbitControls(camera,cv); controls.enableDamping=true; controls.dampingFactor=0.08; controls.minDistance=2.5; controls.maxDistance=80; controls.screenSpacePanning=true;
  controls.addEventListener('start',()=>fly=null);
  // stars
  const N=2200,g=new THREE.BufferGeometry(),a=new Float32Array(N*3);
  for(let i=0;i<N;i++){const r=120+Math.random()*160,t=Math.random()*Math.PI*2,u=Math.acos(2*Math.random()-1);a.set([r*Math.sin(u)*Math.cos(t),r*Math.cos(u),r*Math.sin(u)*Math.sin(t)],i*3)}
  g.setAttribute('position',new THREE.BufferAttribute(a,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xfff2d0,size:0.9,sizeAttenuation:true,fog:false,transparent:true,opacity:.85})));
  world=new THREE.Group();scene.add(world);
  addEventListener('resize',resize);resize();
  // picking: click (not drag) on a frame selects it
  let down=null; cv.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
  cv.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;down=null;
    const r=cv.getBoundingClientRect(),m=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    const rc=new THREE.Raycaster();rc.setFromCamera(m,camera);
    const hit=rc.intersectObjects(Object.values(nodes).map(n=>n.frame),false)[0];
    if(hit)select(hit.object.userData.id,true)});
  renderer.setAnimationLoop(tick);
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}

const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,4,64,64,64);
  g.addColorStop(0,'rgba(255,214,140,.9)');g.addColorStop(.35,'rgba(255,190,90,.35)');g.addColorStop(1,'rgba(255,170,60,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
const mkHeart=broken=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.translate(64,70);
  const h=()=>{x.beginPath();x.moveTo(0,30);x.bezierCurveTo(-60,-8,-28,-52,0,-22);x.bezierCurveTo(28,-52,60,-8,0,30);x.closePath()};
  x.shadowColor='rgba(255,190,80,1)';x.shadowBlur=18;x.lineWidth=7;x.strokeStyle='#ffcf6e';h();x.stroke();x.shadowBlur=0;x.lineWidth=2.5;x.strokeStyle='#fff1c4';h();x.stroke();
  if(broken){x.globalCompositeOperation='destination-out';x.lineWidth=9;x.beginPath();x.moveTo(-2,-30);x.lineTo(6,-14);x.lineTo(-6,0);x.lineTo(5,14);x.lineTo(-1,34);x.stroke()}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t};
const heartTex=mkHeart(false),brokenHeartTex=mkHeart(true);
const lineMat=new THREE.MeshBasicMaterial({color:0xffc861,transparent:true,opacity:.95,fog:true});
const lineGlowMat=new THREE.MeshBasicMaterial({color:0xffa630,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false});
const cyl=new THREE.CylinderGeometry(1,1,1,8,1,true);
function seg(a,b,group,ids,dim=1){const d=new THREE.Vector3().subVectors(b,a),len=d.length();if(len<1e-3)return;
  for(const [m,r] of [[lineMat.clone(),0.022],[lineGlowMat.clone(),0.06]]){m.opacity*=dim;const mesh=new THREE.Mesh(cyl,m);mesh.scale.set(r,len,r);
    mesh.position.copy(a).addScaledVector(d,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());group.add(mesh);links.push({mesh,ids,base:m.opacity})}}

function loadImg(src){if(imgCache.has(src))return imgCache.get(src);const p=new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src});imgCache.set(src,p);return p}
function roundRect(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath()}
function fitText(x,t,maxW,size,font){let s=size;do{x.font=font.replace('#',s);if(x.measureText(t).width<=maxW)break;s-=1}while(s>10);return s}
function drawFrame(p,img){
  const c=document.createElement('canvas');c.width=TEXW;c.height=TEXH;const x=c.getContext('2d');const k=TEXW/512;x.scale(k,k);const W=512,H=704;
  const unknown=p.unknown;
  // gilded frame
  const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#6b4512');g.addColorStop(.25,'#f6d98a');g.addColorStop(.5,'#9a6a22');g.addColorStop(.75,'#f0cf7c');g.addColorStop(1,'#5e3c10');
  x.fillStyle=g;roundRect(x,0,0,W,H,18);x.fill();
  x.strokeStyle='rgba(60,35,5,.8)';x.lineWidth=4;roundRect(x,14,14,W-28,H-28,12);x.stroke();
  x.strokeStyle='rgba(255,236,170,.75)';x.lineWidth=2;roundRect(x,22,22,W-44,H-44,10);x.stroke();
  // corner ornaments
  for(const [cx,cy] of [[30,30],[W-30,30],[30,H-30],[W-30,H-30]]){const rg=x.createRadialGradient(cx-3,cy-3,1,cx,cy,13);rg.addColorStop(0,'#fff3c4');rg.addColorStop(1,'#8a5a18');x.fillStyle=rg;x.beginPath();x.arc(cx,cy,12,0,7);x.fill()}
  for(const [cx,cy] of [[W/2,16],[W/2,H-16]]){x.fillStyle='#fff0b8';x.beginPath();x.ellipse(cx,cy,26,6,0,0,7);x.fill()}
  // picture area
  const PX=44,PY=44,PW=424,PH=504;
  x.fillStyle='#120d08';x.fillRect(PX-6,PY-6,PW+12,PH+12);
  if(img){const s=Math.max(PW/img.width,PH/img.height),w=img.width*s,h=img.height*s;x.save();x.beginPath();x.rect(PX,PY,PW,PH);x.clip();
    x.drawImage(img,PX+(PW-w)/2,PY+(PH-h)/2.6,w,h);const v=x.createRadialGradient(W/2,PY+PH/2,PH*.35,W/2,PY+PH/2,PH*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(20,10,0,.45)');x.fillStyle=v;x.fillRect(PX,PY,PW,PH);x.restore()}
  else{ // engraved plaque, never an invented face
    const bg=x.createLinearGradient(0,PY,0,PY+PH);bg.addColorStop(0,'#2a2116');bg.addColorStop(1,'#15100a');x.fillStyle=bg;x.fillRect(PX,PY,PW,PH);
    x.strokeStyle='rgba(214,170,80,.55)';x.lineWidth=2;x.strokeRect(PX+18,PY+18,PW-36,PH-36);x.strokeRect(PX+26,PY+26,PW-52,PH-52);
    const ini=unknown?'?':((p.given||'').replace(/".*?"/g,'').replace(/^(Vice-Admiral Sir|Lt-Col|Sir)\s+/,'').trim()[0]||'')+((p.surname||'').replace(/[()]/g,'')[0]||'');
    x.textAlign='center';x.textBaseline='middle';x.font='600 150px Cinzel, Georgia, serif';
    x.fillStyle='rgba(0,0,0,.6)';x.fillText(ini,W/2+3,PY+PH*.43+3);const tg=x.createLinearGradient(0,PY+120,0,PY+300);tg.addColorStop(0,'#fbe3a4');tg.addColorStop(1,'#a8772c');x.fillStyle=tg;x.fillText(ini,W/2,PY+PH*.43);
    x.font='italic 500 28px Cormorant, Georgia, serif';x.fillStyle='rgba(230,200,140,.8)';x.fillText(unknown?'Not yet known':'No portrait yet',W/2,PY+PH*.78);
    x.strokeStyle='rgba(214,170,80,.6)';x.beginPath();x.moveTo(W/2-90,PY+PH*.68);x.lineTo(W/2+90,PY+PH*.68);x.stroke()}
  // name plaque
  const NY=566,NH=114;const pg=x.createLinearGradient(0,NY,0,NY+NH);pg.addColorStop(0,'#2b1d0b');pg.addColorStop(1,'#140d05');x.fillStyle=pg;roundRect(x,56,NY,W-112,NH,10);x.fill();
  x.strokeStyle='#e8c477';x.lineWidth=2.5;roundRect(x,56,NY,W-112,NH,10);x.stroke();
  x.textAlign='center';x.textBaseline='middle';const nm=unknown?'Unknown':(nick(p)||shortName(p)||fullName(p));
  const fs=fitText(x,nm,W-140,40,'600 #px Cinzel, Georgia, serif');x.fillStyle='#f6dc98';x.fillText(nm,W/2,NY+42);
  x.font='500 30px Cormorant, Georgia, serif';x.fillStyle='#d9c08a';x.fillText(years(p)||' ',W/2,NY+84);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
async function frameTexture(p){
  const m=p.portrait&&M()[p.portrait]; const key=[p.id,fullName(p),p.birth,p.death,p.deceased,p.unknown,m?.id,!!m?.thumb].join('|');
  if(texCache.has(key))return texCache.get(key);
  const pr=(async()=>drawFrame(p,m?.thumb?await loadImg(m.thumb):null))(); texCache.set(key,pr); return pr;
}
function rebuild(){
  L=layout(); world.clear(); links=[];
  for(const n of Object.values(nodes)){if(n.vid)n.vid.el.pause()}
  const old=nodes; nodes={};
  const ps=P();
  for(const p of Object.values(ps)){
    const pos=L.pos[p.id]; if(!pos)continue;
    const grp=new THREE.Group();grp.position.copy(pos);world.add(grp);
    const bb=new THREE.Group();grp.add(bb);
    const s=p.unknown?0.7:1;
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.28}));glow.scale.set(3.4*s,3.8*s,1);glow.position.z=-0.05;bb.add(glow);
    const mat=new THREE.MeshBasicMaterial({transparent:true,color:0xffffff});
    const frame=new THREE.Mesh(new THREE.PlaneGeometry(FW*s,FH*s),mat);frame.userData.id=p.id;bb.add(frame);
    frameTexture(p).then(t=>{mat.map=t;mat.needsUpdate=true});
    // pedestal
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(0.75*s,0.85*s,0.12,32),new THREE.MeshBasicMaterial({color:0x1d160c,transparent:true}));ped.position.y=-FH*s/2-0.18;grp.add(ped);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(0.8*s,0.018,6,48),new THREE.MeshBasicMaterial({color:0xe0b45a,transparent:true}));rim.rotation.x=Math.PI/2;rim.position.y=-FH*s/2-0.12;grp.add(rim);
    const n={id:p.id,grp,bb,frame,glow,mats:[mat,ped.material,rim.material],s,vid:null};
    if(old[p.id]?.vid&&old[p.id].vid.mid===p.video){n.vid=old[p.id].vid;bb.add(n.vid.mesh)}else if(old[p.id]?.vid)disposeVid(old[p.id].vid);
    nodes[p.id]=n;
  }
  for(const id in old)if(!nodes[id]&&old[id].vid)disposeVid(old[id].vid);
  // connectors
  const lg=new THREE.Group();world.add(lg); const done=new Set();
  for(const p of Object.values(ps)){
    for(const s of spousesOf(p.id)){const k=[p.id,s].sort().join('~');if(done.has(k)||!L.pos[s]||!L.pos[p.id])continue;done.add(k);
      const a=L.pos[p.id].clone(),b=L.pos[s].clone();a.y=b.y=a.y-0.25;const dir=new THREE.Vector3().subVectors(b,a).normalize();
      const a2=a.clone().addScaledVector(dir,FW/2*0.9),b2=b.clone().addScaledVector(dir,-FW/2*0.9);const ex=ended(p.id,s);seg(a2,b2,lg,[p.id,s],ex?.4:1);
      const h=new THREE.Sprite(new THREE.SpriteMaterial({map:ex?brokenHeartTex:heartTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));h.scale.set(.75,.75,1);h.position.copy(a2).lerp(b2,.5);lg.add(h);links.push({mesh:h,ids:[p.id,s],base:ex?.55:1})}
  }
  const fams={};for(const p of Object.values(ps)){const par=parentsOf(p.id).filter(x=>L.pos[x]);if(!par.length||!L.pos[p.id])continue;const k=par.sort().join('+');(fams[k]=fams[k]||[]).push(p.id)}
  for(const [k,kids] of Object.entries(fams)){
    const par=k.split('+'); let A;
    if(par.length===2&&spousesOf(par[0]).includes(par[1])){A=L.pos[par[0]].clone().lerp(L.pos[par[1]],.5);A.y-=0.25}
    else if(par.length===2){A=L.pos[par[0]].clone().lerp(L.pos[par[1]],.5);A.y-=FH/2+0.25}
    else{A=L.pos[par[0]].clone();A.y-=FH/2+0.3}
    const yBus=Math.min(...par.map(i=>L.pos[i].y))-FH/2-0.55, B=new THREE.Vector3(A.x,yBus,A.z);
    seg(A.y>yBus+0.05&&par.length===2&&spousesOf(par[0]).includes(par[1])?A.clone().setY(A.y-0.38):A,B,lg,[...par]);
    for(const c of kids){const C=L.pos[c],top=C.y+FH*(P()[c].unknown?0.7:1)/2+0.05;const B1=new THREE.Vector3(C.x,yBus,A.z),B2=new THREE.Vector3(C.x,yBus,C.z);
      seg(B,B1,lg,[...par,c]);seg(B1,B2,lg,[...par,c]);seg(B2,new THREE.Vector3(C.x,top,C.z),lg,[...par,c])}
  }
  applyVisibility();
}
function visible(id){const p=P()[id];if(!p)return 1;let v=1;
  if(focusMode&&sel&&!focusSet.has(id))v=.12; if(yearFilter&&!aliveIn(p,yearFilter))v=Math.min(v,.1); return v}
let focusSet=new Set();
function applyVisibility(){
  focusSet=sel?lineOf(sel):new Set();
  for(const n of Object.values(nodes)){const v=visible(n.id);n.mats.forEach(m=>m.opacity=v);n.glow.material.opacity=(n.id===sel?.95:.28)*v;n.glow.scale.set((n.id===sel?4.2:3.4)*n.s,(n.id===sel?4.6:3.8)*n.s,1);if(n.vid)n.vid.mesh.material.opacity=v}
  for(const l of links){const v=Math.min(...l.ids.map(visible));l.mesh.material.opacity=l.base*v}
}
function tick(){
  const dt=clock.getDelta();
  if(fly){fly.t=Math.min(1,fly.t+dt/fly.d);const e=fly.t<.5?2*fly.t*fly.t:1-Math.pow(-2*fly.t+2,2)/2;
    controls.target.lerpVectors(fly.t0,fly.t1,e);camera.position.lerpVectors(fly.c0,fly.c1,e);if(fly.t>=1)fly=null}
  controls.update();
  for(const n of Object.values(nodes)){const p=n.grp.position;n.bb.rotation.y=Math.atan2(camera.position.x-p.x,camera.position.z-p.z)}
  videoTick(dt);
  renderer.render(scene,camera);
}
function flyTo(id,instant){const p=L.pos[id];if(!p)return;const t1=p.clone();t1.y-=0.1;
  const dir=new THREE.Vector3().subVectors(camera.position,controls.target);if(dir.length()<.1)dir.set(0,.25,1);dir.normalize();if(dir.z<0.2){dir.z=0.6;dir.normalize()}
  const c1=t1.clone().addScaledVector(dir,SMALL?8.5:7);
  if(instant){controls.target.copy(t1);camera.position.copy(c1);return}
  fly={t:0,d:.9,t0:controls.target.clone(),t1,c0:camera.position.clone(),c1}}
function flyHome(instant){const a=L.pos.mark,b=L.pos.emma;let t1;if(a&&b)t1=a.clone().lerp(b,.5);else if(sel&&L.pos[sel])t1=L.pos[sel].clone();else t1=new THREE.Vector3();
  if(!SMALL)t1.x+=1.4; t1.y+=SMALL?0.8:1.2; const D=17.5*Math.pow(Math.max(1,0.95/camera.aspect),0.6); const c1=t1.clone().add(new THREE.Vector3(-0.53*D,3.4,0.85*D));
  if(instant){controls.target.copy(t1);camera.position.copy(c1);controls.update();return}fly={t:0,d:1.1,t0:controls.target.clone(),t1,c0:camera.position.clone(),c1}}

/* ======================= moving portraits ======================= */
let vT=0;
function disposeVid(v){v.el.pause();v.el.removeAttribute('src');v.el.load();v.tex.dispose();v.mesh.removeFromParent()}
async function ensureVid(n){
  const p=P()[n.id];if(n.vid||n.vidLoading||!p.video||!M()[p.video])return;n.vidLoading=true;
  try{const url=await mediaURL(p.video);if(!url)return;const el=document.createElement('video');Object.assign(el,{src:url,loop:true,muted:true,playsInline:true});el.setAttribute('playsinline','');
    await new Promise(r=>{el.onloadeddata=r;el.onerror=r;setTimeout(r,5000)});
    const tex=new THREE.VideoTexture(el);tex.colorSpace=THREE.SRGBColorSpace;
    const pw=424/512*FW*n.s,ph=504/704*FH*n.s,ar=(el.videoWidth||1)/(el.videoHeight||1),pa=pw/ph;
    if(ar>pa){tex.repeat.set(pa/ar,1);tex.offset.set((1-pa/ar)/2,0)}else{tex.repeat.set(1,ar/pa);tex.offset.set(0,(1-ar/pa)/2)}
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:tex,transparent:true}));mesh.position.set(0,(352-296)/704*FH*n.s,0.01);mesh.visible=false;mesh.userData.id=n.id;
    n.vid={el,tex,mesh,mid:p.video};n.bb.add(mesh)}finally{n.vidLoading=false}
}
function videoTick(dt){vT+=dt;if(vT<.5)return;vT=0;
  const withV=Object.values(nodes).filter(n=>P()[n.id]?.video);if(!withV.length)return;
  const ranked=withV.map(n=>({n,d:n.grp.position.distanceTo(camera.position)-(n.id===sel?100:0)})).sort((a,b)=>a.d-b.d);
  ranked.forEach(({n,d},i)=>{const on=i<(SMALL?2:4)&&(d<14||n.id===sel)&&visible(n.id)>.5;
    if(on){ensureVid(n);if(n.vid){n.vid.mesh.visible=true;if(n.vid.el.paused)n.vid.el.play().catch(()=>{})}}
    else if(n.vid){n.vid.mesh.visible=false;n.vid.el.pause()}})}

/* ======================= media (photos, documents, videos) ======================= */
const urlCache=new Map();
async function mediaURL(mid){if(urlCache.has(mid))return urlCache.get(mid);const m=M()[mid];if(!m)return null;
  const parts=[];for(let i=0;i<m.n;i++){const c=await store.getChunk(mid+'_'+i);if(c==null){toast('That file hasn\'t finished downloading yet.');return null}parts.push(c)}
  const bin=atob(parts.join(''));const u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([u8],{type:m.mime}));urlCache.set(mid,url);return url}
const blobToB64=b=>new Promise((r,j)=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(',')[1]);f.onerror=j;f.readAsDataURL(b)});
async function compress(file,maxPx,target){
  let bmp;try{bmp=await createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){bmp=await loadImg(URL.createObjectURL(file))}
  if(!bmp)throw new Error('Could not read that image');
  const enc=async(px,q)=>{const s=Math.min(1,px/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);return {blob:await new Promise(r=>c.toBlob(r,'image/jpeg',q)),c}};
  let px=maxPx,q=.86,out=await enc(px,q);while(out.blob.size>target&&(q>.55||px>900)){if(q>.6)q-=.08;else{px=Math.round(px*.85);q=.8}out=await enc(px,q)}
  const th=await enc(SMALL?360:480,.72);const thumb=th.c.toDataURL('image/jpeg',.72);
  return {blob:out.blob,w:out.c.width,h:out.c.height,thumb};
}
async function addMedia(pid,file,kind){
  const p=P()[pid];if(!p)return;const isImg=/^image\//.test(file.type),isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isVid=/^video\/(mp4|webm|quicktime)/.test(file.type);
  let blob,w=0,h=0,thumb=null,mime=file.type;
  if(kind==='video'){if(!isVid)return toast('Please choose a short MP4 or WebM video.');if(file.size>6e6)return toast('That video is over 6 MB. Please use a short loop of a few seconds.');blob=file}
  else if(isImg){toast('Preparing image…',1500);({blob,w,h,thumb}=await compress(file,kind==='doc'?2200:1600,kind==='doc'?700e3:400e3));mime='image/jpeg'}
  else if(isPdf&&kind==='doc'){if(file.size>5*1024*1024)return toast('That PDF is over 5 MB. Please save it smaller (e.g. "reduced size") and try again.',4500);
    if(file.size>2*1024*1024&&!confirm('This PDF is '+(file.size/1048576).toFixed(1)+' MB. Large files use more of the free storage and take longer to open on the other devices. Add it anyway?'))return;blob=file;mime='application/pdf'}
  else return toast(kind==='doc'?'Please choose a photo/scan or a PDF.':'Please choose a photo.');
  const b64=await blobToB64(blob),mid=uid('m'),n=Math.ceil(b64.length/CHUNK)||1;
  for(let i=0;i<n;i++)await store.putChunk(mid+'_'+i,b64.slice(i*CHUNK,(i+1)*CHUNK));
  const title=file.name.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').slice(0,80);
  await store.put('media',mid,{id:mid,person:pid,kind,mime,name:file.name.slice(0,120),title,size:blob.size,n,w,h,thumb,created:Date.now()});
  const q=structuredClone(P()[pid]);
  if(kind==='photo'){q.photos=[...(q.photos||[]),mid];if(!q.portrait)q.portrait=mid}
  else if(kind==='doc')q.docs=[...(q.docs||[]),mid];
  else{if(q.video)await delMedia(q.video,false);q.video=mid}
  await store.put('persons',pid,q);toast('Added '+(kind==='doc'?'document':kind==='video'?'moving portrait':'photo')+'.');
}
async function delMedia(mid,save=true){const m=M()[mid];if(!m)return;for(let i=0;i<m.n;i++)await store.delChunk(mid+'_'+i);await store.del('media',mid);
  if(urlCache.has(mid)){URL.revokeObjectURL(urlCache.get(mid));urlCache.delete(mid)}
  const p=P()[m.person];if(save&&p){const q=structuredClone(p);q.photos=(q.photos||[]).filter(x=>x!==mid);q.docs=(q.docs||[]).filter(x=>x!==mid);if(q.video===mid)q.video=null;if(q.portrait===mid)q.portrait=q.photos[0]||null;await store.put('persons',p.id,q)}}
function pickFile(accept,cb){const f=$('#fileIn');f.value='';f.accept=accept;f.multiple=accept.startsWith('image')||accept.includes('pdf');f.onchange=async()=>{for(const x of f.files){try{await cb(x)}catch(e){console.error(e);toast('Couldn\'t add '+x.name)}}};f.click()}
async function openViewer(mid){
  const m=M()[mid];if(!m)return;const V=$('#viewer');V.classList.add('open');$('#vtitle').textContent=m.title||m.name;$('#vbody').innerHTML='<p style="color:#aaa">Loading…</p>';
  const p=P()[m.person];
  $('#vacts').innerHTML=(m.kind==='photo'&&p&&p.portrait!==mid?'<button class="mini" id="vPort">Use as portrait</button> ':'')+(m.kind==='doc'?'<button class="mini" id="vRen">Rename</button> ':'')+
    '<a class="mini" id="vDl" style="text-decoration:none">Download</a> <button class="mini danger" id="vDel">Delete</button> <button class="mini" id="vX">Close ✕</button>';
  $('#vX').onclick=()=>{V.classList.remove('open');$('#vbody').innerHTML=''};
  if($('#vPort'))$('#vPort').onclick=async()=>{const q=structuredClone(P()[m.person]);q.portrait=mid;await store.put('persons',q.id,q);$('#vPort').remove();toast('Portrait updated.')};
  if($('#vRen'))$('#vRen').onclick=async()=>{const t=prompt('Document title',m.title||m.name);if(t){const q=structuredClone(m);q.title=t.slice(0,80);await store.put('media',mid,q);$('#vtitle').textContent=q.title}};
  $('#vDel').onclick=async()=>{if(!confirm('Delete "'+(m.title||m.name)+'"? This removes it from every device.'))return;$('#vX').click();await delMedia(mid)};
  const url=await mediaURL(mid);if(!url){$('#vbody').innerHTML='<p style="color:#aaa">Not available yet.</p>';return}
  $('#vDl').href=url;$('#vDl').download=m.name||'file';
  if(m.mime==='application/pdf')$('#vbody').innerHTML=`<iframe src="${url}#view=FitH" title="PDF"></iframe>`+(SMALL?`<p style="position:absolute;bottom:20px;color:#fff">If the PDF doesn't show, tap Download.</p>`:'');
  else if(m.kind==='video')$('#vbody').innerHTML=`<video src="${url}" autoplay loop muted playsinline controls></video>`;
  else $('#vbody').innerHTML=`<img src="${url}" alt="">`;
}
$('#viewer').addEventListener('click',e=>{if(e.target.id==='viewer')$('#vX')?.click()});

/* ======================= panels ======================= */
function avatarHTML(p){const m=p.portrait&&M()[p.portrait];const ini=(shortName(p)||'?').split(' ').map(w=>w[0]).join('').slice(0,2);
  return m?.thumb?`<span class="av" style="background-image:url('${m.thumb}')"></span>`:`<span class="av">${esc(p.unknown?'?':ini)}</span>`}
function renderList(){
  const q=$('#search').value.trim().toLowerCase();const ps=Object.values(P()).filter(p=>!q||fullName(p).toLowerCase().includes(q)||(p.notes||'').toLowerCase().includes(q));
  const byGen={};ps.forEach(p=>{const g=L.gen[p.id]??0;(byGen[g]=byGen[g]||[]).push(p)});
  const label=g=>({'-4':'Great-great-grandparents','-3':'Great-grandparents','-2':'Grandparents','-1':'Parents','0':'Mark & Emma\'s generation','1':'Children','2':'Grandchildren'}[g]||(g<0?`${-g} generations up`:`${g} generations down`));
  $('#list').innerHTML=Object.keys(byGen).map(Number).sort((a,b)=>a-b).map(g=>`<div class="gen">${label(g)}</div>`+byGen[g].sort((a,b)=>bySib(a.id,b.id)).map(p=>
    `<div class="li${p.id===sel?' sel':''}" data-id="${esc(p.id)}">${avatarHTML(p)}<div><b>${esc(nick(p)?nick(p):fullName(p))}</b><small>${esc(years(p))}</small></div></div>`).join('')).join('')||'<p style="color:var(--mut)">No matches.</p>';
}
$('#search').addEventListener('input',renderList);
$('#list').addEventListener('click',e=>{const li=e.target.closest('.li');if(li){select(li.dataset.id,true);if(SMALL)$('#left').classList.remove('show')}});
function relLinks(ids,extra,kind){return ids.map(i=>`<a data-go="${esc(i)}">${esc(nick(P()[i])||fullName(P()[i]))}</a>${extra?extra(i):''}${kind?` <button class="x" data-unlink="${kind}:${esc(i)}" title="Remove this link (nobody is deleted)">✕</button>`:''}`).join(', ')}
function renderDetails(){
  const p=P()[sel],D=$('#details');if(!p){D.innerHTML='<p style="color:var(--mut)">Select someone in the tree.</p>';return}
  const b=p.birth?`b. ${esc(p.birth)}`:'',d=p.death?`d. ${esc(p.death)}`:(p.deceased?'Deceased':'');
  const par=parentsOf(p.id),sp=spousesOf(p.id),kids=childrenOf(p.id).sort(bySib),sib=siblingsOf(p.id);
  const photos=(p.photos||[]).filter(x=>M()[x]),docs=(p.docs||[]).filter(x=>M()[x]);
  D.innerHTML=`<div class="name">${esc(p.unknown?'Unknown parent':fullName(p))}</div>
   <div class="dates">${esc(years(p))}</div>
   <div class="places">${[b&&b+(p.birthPlace?', '+esc(p.birthPlace):''),d&&d+(p.deathPlace?', '+esc(p.deathPlace):'')].filter(Boolean).join('<br>')}</div>
   <div class="sec rel" style="font-size:16px;line-height:1.5">
    ${par.length?`<div><span class="gold">Parents:</span> ${relLinks(par,null,'parent')}</div>`:''}
    ${sp.length?`<div><span class="gold">${sp.length>1?'Partners':'Partner'}:</span> ${relLinks(sp,i=>{const bits=[p.marr?.[i]?'m. '+p.marr[i]:'',relText(p.id,i)].filter(Boolean);return (bits.length?` <small>(${esc(bits.join(', '))})</small>`:'')+` <button class="x" data-relset="${esc(i)}" title="Marriage, separation or divorce">✎</button>`},'spouse')}</div>`:''}
    ${sib.length?`<div><span class="gold">Brothers &amp; sisters:</span> ${relLinks(sib)}</div>`:''}
    ${kids.length?`<div><span class="gold">Children:</span> ${relLinks(kids,null,'child')}</div>`:''}
    ${!par.length&&!sp.length&&!kids.length&&!sib.length?'<div style="color:var(--mut)">No relatives linked yet.</div>':''}
    <div style="margin-top:6px"><button class="mini" data-do="link">🔗 Link to someone already in the tree</button></div>
   </div>
   <div class="sec"><h3>Notes <button class="mini" data-do="edit">Edit</button></h3><div class="notes">${esc(p.notes)||'<span style="color:var(--mut)">No notes yet.</span>'}</div></div>
   <div class="sec"><h3>Gallery <button class="mini" data-do="addphoto">+ Add photos</button></h3>
    <div class="grid">${photos.map(x=>`<div class="th" data-view="${x}" style="background-image:url('${M()[x].thumb}')">${p.portrait===x?'<span class="star" title="Portrait">★</span>':''}</div>`).join('')||'<span style="color:var(--mut);grid-column:1/-1">No photos yet.</span>'}</div></div>
   <div class="sec"><h3>Documents <button class="mini" data-do="adddoc">+ Add</button></h3>
    <div style="font-size:13px;color:var(--mut);margin:-2px 0 6px">CV, certificates, licences… scans/photos or PDFs (up to 5 MB).</div>
    <div class="grid">${docs.map(x=>{const m=M()[x];return m.thumb?`<div class="th" data-view="${x}" title="${esc(m.title)}" style="background-image:url('${m.thumb}')"></div>`:`<div class="th doc" data-view="${x}" title="${esc(m.title)}"><i>PDF</i>${esc((m.title||'').slice(0,40))}</div>`}).join('')||'<span style="color:var(--mut);grid-column:1/-1">No documents yet.</span>'}</div></div>
   <div class="sec"><h3>Moving portrait <span>${p.video&&M()[p.video]?`<button class="mini" data-view="${p.video}">View</button> <button class="mini danger" data-do="delvid">Remove</button>`:`<button class="mini" data-do="addvid">+ Add</button>`}</span></h3>
    <div style="font-size:13px;color:var(--mut)">A short silent looping video (MP4/WebM, a few seconds, max 6 MB) that plays in the frame when you're close, like the moving portraits in Harry Potter.</div></div>
   <div class="sec" style="display:flex;justify-content:space-between;gap:8px"><button class="mini" data-do="edit">Edit details</button><button class="mini danger" data-do="delete">Delete person</button></div>`;
}
$('#details').addEventListener('click',e=>{const t=e.target.closest('[data-go],[data-view],[data-do],[data-unlink],[data-relset]');if(!t)return;
  if(t.dataset.relset)return relDialog(sel,t.dataset.relset);
  if(t.dataset.unlink){const [k,...r]=t.dataset.unlink.split(':');return unlink(sel,k,r.join(':'))}
  if(t.dataset.go)return select(t.dataset.go,true); if(t.dataset.view)return openViewer(t.dataset.view);
  const a=t.dataset.do;
  if(a==='edit')personDialog('edit');else if(a==='link')personDialog('link');else if(a==='delete')deletePerson();
  else if(a==='addphoto')pickFile('image/*',f=>addMedia(sel,f,'photo'));
  else if(a==='adddoc')pickFile('image/*,application/pdf,.pdf',f=>addMedia(sel,f,'doc'));
  else if(a==='addvid')pickFile('video/mp4,video/webm,video/quicktime',f=>addMedia(sel,f,'video'));
  else if(a==='delvid'&&confirm('Remove the moving portrait?'))delMedia(P()[sel].video)});
function select(id,flyThere){if(!P()[id])return;sel=id;applyVisibility();renderList();renderDetails();if(flyThere)flyTo(id);
  const li=$(`.li[data-id="${CSS.escape(id)}"]`);if(li)li.scrollIntoView({block:'nearest'})}

/* ======================= add / edit / delete ======================= */
function dlg(html,onSave,{saveLabel='Save'}={}){$('#dlgBox').innerHTML=html+`<div class="acts"><button class="b" id="dCancel">Cancel</button><button class="b" id="dSave">${saveLabel}</button></div>`;
  $('#dlg').classList.add('open');$('#dCancel').onclick=()=>$('#dlg').classList.remove('open');
  $('#dSave').onclick=async()=>{const r=await onSave();if(r!==false)$('#dlg').classList.remove('open')};setTimeout(()=>$('#dlgBox input')?.focus(),50)}
const field=(id,label,val='',ph='')=>`<label for="${id}">${label}</label><input id="${id}" value="${esc(val)}" placeholder="${esc(ph)}">`;
function personForm(p,extra=''){p=p||{};return `${field('fGiven','First and middle names',p.unknown?'':p.given)}${field('fSur','Surname (birth name)',p.unknown?'':p.surname)}
  <div class="row2"><div><label for="fSex">Sex</label><select id="fSex"><option value="M"${p.sex==='M'?' selected':''}>Male</option><option value="F"${p.sex==='F'?' selected':''}>Female</option><option value="U"${!p.sex||p.sex==='U'?' selected':''}>Not stated</option></select></div>
  <div>${field('fOrder','Birth order among siblings (1 = eldest)',p.order??'','optional')}</div></div>
  <div class="row2"><div>${field('fBirth','Born (date)',p.birth,'e.g. 15 Nov 1956 or c.1920')}</div><div>${field('fBirthPl','Birthplace',p.birthPlace)}</div></div>
  <div class="row2"><div>${field('fDeath','Died (date)',p.death,'leave blank if living')}</div><div>${field('fDeathPl','Place of death',p.deathPlace)}</div></div>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fDec"${p.deceased?' checked':''} style="width:auto"> Deceased (even if the date isn't known)</label>
  ${extra}<label for="fNotes">Notes (life story, jobs, where they lived, anything uncertain)</label><textarea id="fNotes">${esc(p.notes)}</textarea>`}
function readForm(p){p.given=$('#fGiven').value.trim().slice(0,120);p.surname=$('#fSur').value.trim().slice(0,80);p.sex=$('#fSex').value;
  const o=$('#fOrder').value.trim();p.order=o===''?null:(+o||null);p.birth=$('#fBirth').value.trim().slice(0,60);p.birthPlace=$('#fBirthPl').value.trim().slice(0,120);
  p.death=$('#fDeath').value.trim().slice(0,60);p.deathPlace=$('#fDeathPl').value.trim().slice(0,120);p.deceased=$('#fDec').checked||!!p.death;p.notes=$('#fNotes').value.slice(0,20000);
  if(!p.given&&!p.surname){toast('Please give at least a first name or surname.');return false}delete p.unknown;return true}
const blank=o=>({id:uid('p'),given:'',surname:'',sex:'U',birth:'',birthPlace:'',death:'',deathPlace:'',deceased:false,notes:'',parents:[],spouses:[],marr:{},order:null,photos:[],docs:[],portrait:null,video:null,...o});
async function save(p){await store.put('persons',p.id,p)}
function personDialog(act){
  const s=P()[sel]; if(!s&&act!=='first')return toast('Select someone first.');
  const nm=s?(nick(s)||fullName(s)):'';
  if(act==='edit')return dlg(`<h2>Edit ${esc(s.unknown?'unknown parent':nm)}</h2>`+personForm(s),async()=>{const q=structuredClone(s);if(!readForm(q))return false;await save(q)});
  if(act==='child'){const sp=spousesOf(s.id);
    const extra=`<label for="fOther">Other parent</label><select id="fOther">${sp.map(i=>`<option value="${i}">${esc(fullName(P()[i]))}</option>`).join('')}<option value="">Not known / not in the tree</option></select>`;
    return dlg(`<h2>Add a child of ${esc(nm)}</h2>`+personForm({surname:s.sex==='F'&&sp[0]?P()[sp[0]].surname:s.surname},extra),async()=>{const c=blank();if(!readForm(c))return false;const o=$('#fOther').value;c.parents=[s.id,...(o?[o]:[])];await save(c);select(c.id,true)})}
  if(act==='sibling')return dlg(`<h2>Add a brother or sister of ${esc(nm)}</h2>`+personForm({surname:s.surname}),async()=>{const c=blank();if(!readForm(c))return false;
    let par=parentsOf(s.id);if(!par.length){const ph=blank({given:'Parent of '+(s.given||nm),surname:'',unknown:true,notes:'Placeholder so brothers and sisters can be linked. Use "Add parent" on one of the children (or Edit here) to fill in the real person.'});await save(ph);par=[ph.id];const q=structuredClone(s);q.parents=[ph.id];await save(q)}
    c.parents=[...par];await save(c);select(c.id,true)});
  if(act==='spouse')return dlg(`<h2>Add a partner of ${esc(nm)}</h2>`+personForm({},relFields()),async()=>{const c=blank();if(!readForm(c))return false;await save(c);await saveRel(s.id,c.id);await offerKids(s.id,c.id);select(c.id,true)});
  if(act==='link'){const others=Object.values(P()).filter(p=>p.id!==s.id).sort((x,y)=>fullName(x).localeCompare(fullName(y)));
    return dlg(`<h2>Link ${esc(nm)} to someone already in the tree</h2>
      <label for="lRel">${esc(nm)} is the…</label><select id="lRel"><option value="spouse">Partner / spouse of</option><option value="child">Parent of</option><option value="parent">Child of</option></select>
      <label for="lWho">…this person</label><select id="lWho">${others.map(p=>`<option value="${esc(p.id)}">${esc(fullName(p))}${p.birth?' ('+esc(p.birth)+')':''}</option>`).join('')}</select>
      <div id="lMarrBox">${relFields()}</div>
      <p style="font-size:13px;color:var(--mut)">This only joins two people who are already in the tree; nobody new is created. Use the ✕ next to a name to undo a link.</p>`,async()=>{
      const rel=$('#lRel').value,o=$('#lWho').value;if(!o||!P()[o])return false;
      if(rel==='spouse'){
        if(parentsOf(s.id).some(x=>parentsOf(o).includes(x))&&!confirm(fullName(P()[o])+' shares a parent with '+nm+'. Link them as partners anyway?'))return false;
        await saveRel(s.id,o);await offerKids(s.id,o);await offerKids(o,s.id)}
      else{const child=rel==='child'?o:s.id,parent=rel==='child'?s.id:o;const q=structuredClone(P()[child]);const cur=(q.parents||[]).filter(x=>P()[x]);
        if(cur.includes(parent))return toast('Already linked.'),false;
        const desc=new Set(),dn=x=>childrenOf(x).forEach(c=>{if(!desc.has(c)){desc.add(c);dn(c)}});dn(child);
        if(child===parent||desc.has(parent))return toast('That would make someone their own ancestor.'),false;
        const ph=cur.find(x=>P()[x].unknown);
        if(cur.length>=2&&!ph)return toast(fullName(q)+' already has two parents. Remove one with ✕ first.'),false;
        q.parents=[...cur.filter(x=>x!==ph),parent];await save(q);
        if(ph&&!childrenOf(ph).length)await store.del('persons',ph);
        // a child's two parents are usually partners: offer to join them
        const op=q.parents.find(x=>x!==parent);
        if(op&&!spousesOf(parent).includes(op)&&confirm('Also link '+fullName(P()[parent])+' and '+fullName(P()[op])+' as partners?'))
          for(const [x,y] of [[parent,op],[op,parent]]){const r=structuredClone(P()[x]);r.spouses=[...new Set([...(r.spouses||[]),y])];await save(r)}}
      toast('Linked.');select(s.id,true)},{saveLabel:'Link'}),
      $('#lRel').onchange=()=>{$('#lMarrBox').style.display=$('#lRel').value==='spouse'?'':'none'}}
  if(act==='parent'){const par=parentsOf(s.id),ph=par.find(i=>P()[i].unknown);
    if(ph){sel=ph;return dlg(`<h2>Add a parent of ${esc(nm)}</h2>`+personForm({sex:'U'}),async()=>{const q=structuredClone(P()[ph]);if(!readForm(q))return false;await save(q);select(q.id,true)})}
    if(par.length>=2)return toast(nm+' already has two parents in the tree. Select one of them to edit.');
    const sibs=siblingsOf(s.id).filter(i=>JSON.stringify(parentsOf(i).sort())===JSON.stringify([...par].sort()));
    const extra=(par.length?`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fPartner" checked style="width:auto"> Partner of ${esc(fullName(P()[par[0]]))}</label>`:'')+
      (sibs.length?`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fSibs" checked style="width:auto"> Also parent of ${esc(sibs.map(i=>shortName(P()[i])).join(', '))}</label>`:'');
    return dlg(`<h2>Add a parent of ${esc(nm)}</h2>`+personForm({},extra),async()=>{const c=blank();if(!readForm(c))return false;
      if(par.length&&$('#fPartner')?.checked){c.spouses=[par[0]];const o=structuredClone(P()[par[0]]);o.spouses=[...new Set([...(o.spouses||[]),c.id])];await save(c);await save(o)}else await save(c);
      for(const k of [s.id,...(sibs.length&&$('#fSibs')?.checked?sibs:[])]){const q=structuredClone(P()[k]);q.parents=[...new Set([...(q.parents||[]),c.id])].slice(0,2);await save(q)}
      select(c.id,true)})}
}
const relFields=(r={},m='')=>`${field('rMarr','Marriage (date and place, optional)',m,'e.g. 1985, Exeter')}
  <div class="row2"><div><label for="rStat">Relationship now</label><select id="rStat"><option value="">Together</option><option value="separated"${r.status==='separated'?' selected':''}>Separated</option><option value="divorced"${r.status==='divorced'?' selected':''}>Divorced</option></select></div>
  <div>${field('rEnd','Separated / divorced (year or date)',r.end||'','optional')}</div></div>`;
async function saveRel(x,y){const m=$('#rMarr').value.trim().slice(0,120),st=$('#rStat').value,end=st?$('#rEnd').value.trim().slice(0,60):'';
  for(const [u,v] of [[x,y],[y,x]]){const q=structuredClone(P()[u]);q.spouses=[...new Set([...(q.spouses||[]),v])];
    q.marr={...(q.marr||{})};if(m)q.marr[v]=m;else delete q.marr[v];q.rel={...(q.rel||{})};if(st)q.rel[v]={status:st,end};else delete q.rel[v];await save(q)}}
// a new partner may also be the other parent of children who so far have only one parent recorded
async function offerKids(x,y){for(const c of childrenOf(x)){const q=P()[c],cur=(q.parents||[]).filter(i=>P()[i]),ph=cur.find(i=>P()[i].unknown);
  if(cur.includes(y)||(cur.length>=2&&!ph))continue;
  if(!confirm('Is '+fullName(P()[y])+' also the parent of '+fullName(q)+'?\n(Choose Cancel if not, e.g. a later partner.)'))continue;
  const r=structuredClone(q);r.parents=[...cur.filter(i=>i!==ph),y];await save(r);if(ph&&!childrenOf(ph).length)await store.del('persons',ph)}}
function relDialog(x,y){const A=P()[x],B=P()[y];if(!A||!B)return;
  dlg(`<h2>${esc(fullName(A))} &amp; ${esc(fullName(B))}</h2>`+relFields(relOf(x,y),A.marr?.[y]||B.marr?.[x]||'')+
    `<p style="font-size:13px;color:var(--mut)">Separated or divorced couples get a faded, broken heart, and the current partner sits closest. Children keep both their parents either way.</p>`,
    async()=>{await saveRel(x,y);toast('Saved.');select(x,false)})}
async function unlink(id,kind,o){const A=P()[id],B=P()[o];if(!A||!B)return;
  const words={spouse:'as partners',parent:`(${fullName(B)} as parent of ${fullName(A)})`,child:`(${fullName(B)} as child of ${fullName(A)})`}[kind];
  if(!confirm(`Remove the link between ${fullName(A)} and ${fullName(B)} ${words}? Nobody is deleted.`))return;
  if(kind==='spouse'){for(const [x,y] of [[id,o],[o,id]]){const q=structuredClone(P()[x]);q.spouses=(q.spouses||[]).filter(z=>z!==y);if(q.marr)delete q.marr[y];if(q.rel)delete q.rel[y];await save(q)}}
  else{const child=kind==='parent'?id:o,parent=kind==='parent'?o:id;const q=structuredClone(P()[child]);q.parents=(q.parents||[]).filter(z=>z!==parent);await save(q)}
  toast('Link removed.');select(id,false)}
async function deletePerson(){const s=P()[sel];if(!s)return;const nm=fullName(s);
  if(!confirm(`Delete ${nm} from the tree, including their photos and documents? This removes them from every device and can't be undone (unless you have a backup).`))return;
  for(const m of [...(s.photos||[]),...(s.docs||[]),s.video].filter(Boolean))await delMedia(m,false);
  for(const p of Object.values(P())){if(p.id===s.id)continue;if((p.parents||[]).includes(s.id)||(p.spouses||[]).includes(s.id)){const q=structuredClone(p);q.parents=(q.parents||[]).filter(x=>x!==s.id);q.spouses=(q.spouses||[]).filter(x=>x!==s.id);if(q.marr)delete q.marr[s.id];await save(q)}}
  const next=spousesOf(s.id)[0]||parentsOf(s.id)[0]||childrenOf(s.id)[0]||'mark';await store.del('persons',s.id);sel=P()[next]?next:Object.keys(P())[0];toast(nm+' deleted.')}
$('#btns').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='home')return flyHome(); if(a==='focus'){focusMode=!focusMode;b.classList.toggle('on',focusMode);applyVisibility();if(focusMode)toast('Showing '+(nick(P()[sel])||fullName(P()[sel]))+'\'s direct line. Tap again to show everyone.');return}
  personDialog(a)});
$('#year').addEventListener('input',e=>{const v=+e.target.value;yearFilter=v>2026?null:v;$('#yearLbl').textContent=yearFilter?'Alive in '+v:'All years';applyVisibility()});
$('#tabL').onclick=()=>{$('#right').classList.remove('show');$('#left').classList.toggle('show')};
$('#tabR').onclick=()=>{$('#left').classList.remove('show');$('#right').classList.toggle('show')};

/* ======================= GEDCOM + JSON backup ======================= */
const MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function gedDate(s){s=String(s||'').trim();if(!s)return'';let pre='';if(/^(c\.?|circa|abt\.?|about)\s*/i.test(s)){pre='ABT ';s=s.replace(/^(c\.?|circa|abt\.?|about)\s*/i,'')}
  s=s.replace(/\?/g,'').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/gi,m=>m.slice(0,3).toUpperCase());return pre+s.toUpperCase()}
function fromGedDate(s){s=String(s||'').trim();return s.replace(/^(ABT|ABOUT|EST|CAL)\s+/i,'c.').replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g,m=>m[0]+m.slice(1).toLowerCase())}
function exportGedcom(){
  const ps=Object.values(P()),I={};ps.forEach((p,i)=>I[p.id]='@I'+(i+1)+'@');
  const fams=new Map(),famKey=a=>[...a].sort().join('+');
  const fam=par=>{const k=famKey(par);if(!fams.has(k))fams.set(k,{par:[...par],kids:[]});return fams.get(k)};
  ps.forEach(p=>{const par=parentsOf(p.id);if(par.length)fam(par).kids.push(p.id);spousesOf(p.id).forEach(s=>fam([p.id,s]))});
  const F={};[...fams.keys()].forEach((k,i)=>F[k]='@F'+(i+1)+'@');
  const out=['0 HEAD','1 SOUR TURNER_PEARS_TREE','2 NAME Turner & Pears Family Tree','1 GEDC','2 VERS 5.5.1','2 FORM LINEAGE-LINKED','1 CHAR UTF-8','1 DATE '+gedDate(new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}))];
  const note=(lvl,t)=>{const lines=String(t).split('\n');lines.forEach((l,i)=>{const chunks=l.match(/.{1,200}/g)||[''];chunks.forEach((c,j)=>out.push(i===0&&j===0?`${lvl} NOTE ${c}`:`${lvl+1} ${j===0?'CONT':'CONC'} ${c}`))})};
  for(const p of ps){out.push(`0 ${I[p.id]} INDI`,`1 NAME ${p.unknown?'Unknown':p.given} /${p.unknown?'':p.surname}/`);if(p.sex&&p.sex!=='U')out.push('1 SEX '+p.sex);
    if(p.birth||p.birthPlace){out.push('1 BIRT');if(p.birth)out.push('2 DATE '+gedDate(p.birth));if(p.birthPlace)out.push('2 PLAC '+p.birthPlace)}
    if(p.death||p.deathPlace||p.deceased){if(!p.death&&!p.deathPlace)out.push('1 DEAT Y');else{out.push('1 DEAT');if(p.death)out.push('2 DATE '+gedDate(p.death));if(p.deathPlace)out.push('2 PLAC '+p.deathPlace)}}
    if(p.notes)note(1,p.notes);
    const par=parentsOf(p.id);if(par.length)out.push('1 FAMC '+F[famKey(par)]);
    spousesOf(p.id).forEach(s=>out.push('1 FAMS '+F[famKey([p.id,s])]));
    for(const [k,f] of fams)if(f.par.length===1&&f.par[0]===p.id)out.push('1 FAMS '+F[k])}
  for(const [k,f] of fams){out.push(`0 ${F[k]} FAM`);const [a,b]=f.par.map(i=>P()[i]);
    const ord=b&&(a.sex==='F'||b.sex==='M')?[b,a]:[a,b];if(ord[0])out.push('1 HUSB '+I[ord[0].id]);if(ord[1])out.push('1 WIFE '+I[ord[1].id]);
    const m=a&&b&&(a.marr?.[b.id]||b.marr?.[a.id]);if(m){out.push('1 MARR');const dm=String(m).match(/^(.*?\d{4})\s*,?\s*(.*)$/);out.push('2 DATE '+gedDate(dm?dm[1]:m));if(dm&&dm[2])out.push('2 PLAC '+dm[2])}
    const rs=a&&b?relOf(a.id,b.id):{};if(rs.status==='divorced'){out.push('1 DIV');if(rs.end)out.push('2 DATE '+gedDate(rs.end))}else if(rs.status==='separated'){out.push('1 _SEPR');if(rs.end)out.push('2 DATE '+gedDate(rs.end))}
    f.kids.sort(bySib).forEach(c=>out.push('1 CHIL '+I[c]))}
  out.push('0 TRLR');download(out.join('\r\n')+'\r\n','turner-pears-family-tree.ged','text/vnd.familysearch.gedcom');
}
function parseGedcom(txt){
  const recs={};let cur=null,stack=[];
  for(const raw of txt.replace(/^\uFEFF/,'').split(/\r?\n/)){const m=raw.match(/^\s*(\d+)\s+(@[^@]+@\s+)?(\w+)(?:\s(.*))?$/);if(!m)continue;
    const lvl=+m[1],xref=m[2]?.trim(),tag=m[3],val=m[4]??'';
    if(lvl===0){cur=xref?{id:xref,tag,val,kids:[]}:null;if(cur)recs[xref]=cur;stack=[cur];continue}
    if(!cur)continue;const node={tag,val,kids:[]};while(stack.length>lvl)stack.pop();const parent=stack[stack.length-1];if(!parent)continue;
    if(tag==='CONT'){parent.val+='\n'+val;continue}if(tag==='CONC'){parent.val+=val;continue}parent.kids.push(node);stack.push(node)}
  const sub=(n,t)=>n.kids.find(k=>k.tag===t),subs=(n,t)=>n.kids.filter(k=>k.tag===t);
  const people={},map={};
  for(const r of Object.values(recs).filter(r=>r.tag==='INDI')){const nm=sub(r,'NAME')?.val||'';const mm=nm.match(/^(.*?)\/(.*?)\/(.*)$/);
    const p=blank({given:(mm?mm[1]+mm[3]:nm).trim(),surname:mm?mm[2].trim():'',sex:sub(r,'SEX')?.val?.[0]||'U'});
    const B=sub(r,'BIRT')||sub(r,'CHR'),D=sub(r,'DEAT')||sub(r,'BURI');if(B){p.birth=fromGedDate(sub(B,'DATE')?.val);p.birthPlace=sub(B,'PLAC')?.val||''}
    if(D){p.death=fromGedDate(sub(D,'DATE')?.val);p.deathPlace=sub(D,'PLAC')?.val||'';p.deceased=true}
    p.notes=subs(r,'NOTE').map(n=>n.val.startsWith('@')?(recs[n.val]?.val||''):n.val).filter(Boolean).join('\n').slice(0,20000);
    const occ=sub(r,'OCCU')?.val;if(occ)p.notes=(occ+'\n'+p.notes).trim();
    if(p.given==='Unknown'&&!p.surname)p.unknown=true;
    people[p.id]=p;map[r.id]=p.id}
  for(const f of Object.values(recs).filter(r=>r.tag==='FAM')){const h=map[sub(f,'HUSB')?.val],w=map[sub(f,'WIFE')?.val];const par=[h,w].filter(Boolean);
    if(h&&w){people[h].spouses.push(w);people[w].spouses.push(h);const M=sub(f,'MARR');if(M){const t=[fromGedDate(sub(M,'DATE')?.val),sub(M,'PLAC')?.val].filter(Boolean).join(', ');if(t){people[h].marr[w]=t;people[w].marr[h]=t}}}
    subs(f,'CHIL').forEach(c=>{const id=map[c.val];if(id)people[id].parents=[...new Set([...people[id].parents,...par])].slice(0,2)})}
  return Object.values(people);
}
async function importGedcom(file){const people=parseGedcom(await file.text());if(!people.length)return toast('No people found in that GEDCOM file.');
  if(!confirm(`Add ${people.length} people from "${file.name}" to the tree? They are added alongside the existing people (nothing is replaced), so you may need to tidy up any duplicates.`))return;
  for(const p of people)await save(p);toast(`Added ${people.length} people.`)}
async function exportJSON(){toast('Gathering photos and documents…');const chunks={};for(const m of Object.values(M()))for(let i=0;i<m.n;i++){const c=await store.getChunk(m.id+'_'+i);if(c!=null)chunks[m.id+'_'+i]=c}
  download(JSON.stringify({app:'turner-pears-tree',v:1,saved:new Date().toISOString(),persons:P(),media:M(),chunks}),'turner-pears-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json')}
async function importJSON(file){let j;try{j=JSON.parse(await file.text())}catch(e){return toast('That isn\'t a valid backup file.')}
  if(j.app!=='turner-pears-tree')return toast('That isn\'t a Turner & Pears backup file.');
  if(!confirm(`Replace the whole tree with this backup from ${j.saved?.slice(0,10)||'an unknown date'} (${Object.keys(j.persons||{}).length} people)? The current tree is replaced on every device.`))return;
  for(const m of Object.values(M()))await delMedia(m.id,false);for(const id of Object.keys(P()))await store.del('persons',id);
  for(const [k,v] of Object.entries(j.chunks||{}))await store.putChunk(k,v);for(const m of Object.values(j.media||{}))await store.put('media',m.id,m,{keepTime:true});
  for(const p of Object.values(j.persons||{}))await store.put('persons',p.id,p);toast('Backup restored.')}
function download(data,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
$('#bMenu').onclick=()=>{
  const bytes=Object.values(M()).reduce((s,m)=>s+(m.size||0)*1.34+(m.thumb?.length||0),0);
  dlg(`<h2>More</h2><div class="pick">
   <button class="b" id="mGed">⬇ Export GEDCOM (for Ancestry, FamilySearch…)</button>
   <button class="b" id="mGedIn">⬆ Import a GEDCOM file</button>
   <button class="b" id="mJson">⬇ Download full backup (with photos &amp; documents)</button>
   <button class="b" id="mJsonIn">⬆ Restore a backup</button>
   <button class="b" id="mLock">🔒 Lock this device (asks for the passcode next time)</button></div>
   <p style="font-size:14px;color:var(--mut);margin-top:12px">${Object.keys(P()).length} people · ${Object.keys(M()).length} photos/documents · about ${(bytes/1048576).toFixed(1)} MB of the 1 GB free cloud space.<br>
   Status: ${esc($('#status').textContent)}${store.pendingCount()?` · ${store.pendingCount()} change(s) waiting to upload`:''}</p>`,()=>true,{saveLabel:'Done'});
  $('#mGed').onclick=exportGedcom;$('#mJson').onclick=exportJSON;
  $('#mGedIn').onclick=()=>pickFile('.ged,text/plain',importGedcom);$('#mJsonIn').onclick=()=>pickFile('.json,application/json',importJSON);
  $('#mLock').onclick=()=>{if(DEMO)return toast('Demo mode has no passcode.');if(confirm('Lock this device? You will need the family passcode to open the tree again. Nothing is deleted.')){localStorage.removeItem('tpt:room');location.reload()}};
};
addEventListener('keydown',e=>{if(e.key==='Escape'){$('#dlg').classList.remove('open');$('#vX')?.click()}});

window.__tree={get store(){return store},layout:()=>L,select,get camera(){return camera},get controls(){return controls},nodes:()=>nodes,exportGedcom,parseGedcom,addMedia};
boot();
