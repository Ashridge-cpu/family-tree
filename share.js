/* Turner & Pears Family Tree — view-only sharing.
   The owner's devices publish a read-only copy of the tree to views/{viewKey}/{persons|media|chunks|config}/{docId}.
   viewKey = PBKDF2-SHA256(viewer code, salt "turner-pears-tree/view/v1", 600,000 rounds). The viewer code itself is never stored or sent.
   Writes to views/ are only accepted by the Firestore rules when the same batch also writes views/{viewKey}/w/proof with
   { k: <write secret>, t: serverTimestamp() } and sha256(k) matches the hash fixed in views/{viewKey}/meta/m when sharing started.
   The write secret is derived from the family tree key (only editors know it); w/proof can never be read by anyone,
   so people with only the viewer code cannot change anything.
   What is published: people (with gallery and documents removed), config/main, and — if "Show portrait photos to viewers"
   is on (default) — only each person's main portrait photo and moving portrait. Gallery photos and documents are never published. */
const enc=new TextEncoder();
export async function sha256hex(s){const b=await crypto.subtle.digest('SHA-256',enc.encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export const writeSecret=room=>sha256hex('turner-pears-tree/view-write/v1|'+room);
const stable=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const VCOLLS=['persons','media','config'];

// What a viewer gets for one person / which media are published.
export function viewPerson(p,portraits,M){
  const q=structuredClone(p);q.photos=[];q.docs=[];
  q.portrait=portraits&&p.portrait&&M[p.portrait]?p.portrait:null;
  q.video=portraits&&p.video&&M[p.video]?p.video:null;
  return q}
export function viewMediaIds(P,M,portraits){const s=new Set();if(!portraits)return s;
  for(const p of Object.values(P)){if(p.portrait&&M[p.portrait])s.add(p.portrait);if(p.video&&M[p.video])s.add(p.video)}return s}

export function createPublisher(store,{onState=()=>{}}={}){
  let k=null,h=null,cur=null,unsubs=[],pub={persons:{},media:{},config:{}},seen={},timer=null,running=false,again=false,state='off';
  const set=s=>{if(s!==state){state=s;onState(s)}};
  const fb=()=>store.fbHandle();
  const share=()=>{const s=store.data.config.share;return s&&s.on&&/^[a-f0-9]{64}$/.test(s.viewKey||'')?s:null};
  const doc=(v,...p)=>fb().fs.doc(fb().db,'views',v,...p);
  async function secrets(){if(!k){k=await writeSecret(store.room);h=await sha256hex(k)}}
  // one batched write = proof doc + up to 15 ops (keeps within the rules' document-access limits)
  async function commit(v,ops){const {fs,db}=fb();const b=fs.writeBatch(db);
    b.set(doc(v,'w','proof'),{k,t:fs.serverTimestamp()});
    for(const o of ops){if(o.del)b.delete(doc(v,o.c,o.id));else b.set(doc(v,o.c,o.id),o.d)}
    await b.commit()}
  async function run(v,ops,size=15){for(let i=0;i<ops.length;i+=size)await commit(v,ops.slice(i,i+size))}
  async function ensureMeta(v,revoked=false){const {fs}=fb();const m=doc(v,'meta','m');let s=null;
    try{s=await fs.getDocFromServer(m)}catch(e){}
    if(!s||!s.exists()){await fs.setDoc(m,{h,revoked,updatedAt:Date.now()});return}
    if(s.data().h!==h)throw new Error('This viewer code is already used by a different tree. Please choose another.');
    if(!!s.data().revoked!==revoked){const {fs:F,db}=fb();const b=F.writeBatch(db);b.set(doc(v,'w','proof'),{k,t:F.serverTimestamp()});b.set(m,{h,revoked,updatedAt:Date.now()});await b.commit()}}
  function listen(v){unsubs.forEach(u=>u());unsubs=[];pub={persons:{},media:{},config:{}};seen={};const {fs,db}=fb();
    for(const c of VCOLLS)unsubs.push(fs.onSnapshot(fs.collection(db,'views',v,c),snap=>{const o={};snap.forEach(d=>o[d.id]=d.data());pub[c]=o;seen[c]=true;kick()},
      e=>{console.warn('view listen',c,e);set(String(e.code||e).includes('permission')?'blocked':'error')}))}
  async function reconcile(){
    const s=share(); if(!s){set('off');return}
    if(!fb()){set(store.demo?'demo':'offline');return}
    await secrets();
    if(cur!==s.viewKey){set('publishing');await ensureMeta(s.viewKey,false);cur=s.viewKey;listen(cur);return}
    if(!VCOLLS.every(c=>seen[c]))return;
    set('publishing');
    const P=store.data.persons,M=store.data.media,portraits=s.portraits!==false;
    const want=viewMediaIds(P,M,portraits),ops=[];
    // media first (chunks, then the media doc), so a person never points at a portrait that isn't there yet
    for(const mid of want){const m=M[mid];if(pub.media[mid]&&stable(pub.media[mid])===stable(m))continue;
      for(let i=0;i<m.n;i++){const d=await store.getChunk(mid+'_'+i);if(d==null)throw new Error('chunk missing '+mid);await run(cur,[{c:'chunks',id:mid+'_'+i,d:{d}}],1)}
      await run(cur,[{c:'media',id:mid,d:m}],1)}
    for(const p of Object.values(P)){const q=viewPerson(p,portraits,M);if(!pub.persons[p.id]||stable(pub.persons[p.id])!==stable(q))ops.push({c:'persons',id:p.id,d:q})}
    const main=store.data.config.main;if(main&&(!pub.config.main||stable(pub.config.main)!==stable(main)))ops.push({c:'config',id:'main',d:main});
    for(const id of Object.keys(pub.persons))if(!P[id])ops.push({c:'persons',id,del:true});
    await run(cur,ops);
    const dels=[];for(const [mid,m] of Object.entries(pub.media))if(!want.has(mid)){dels.push({c:'media',id:mid,del:true});for(let i=0;i<(m.n||0);i++)dels.push({c:'chunks',id:mid+'_'+i,del:true})}
    await run(cur,dels);
    set('published')}
  async function loop(){if(running){again=true;return}running=true;
    try{do{again=false;await reconcile()}while(again)}catch(e){console.warn('publish',e);set(String(e.code||e.message||e).includes('permission')?'blocked':'error');if(/different tree/.test(e.message||''))set('taken')}
    finally{running=false}}
  function kick(){const sh=share();if(sh&&sh.viewKey!==cur&&fb())set('publishing');clearTimeout(timer);timer=setTimeout(loop,1200)}
  // Wipe a previous viewer copy (code changed or sharing stopped). The meta doc stays, marked revoked, so nobody can take over that address.
  async function wipe(v){if(!fb()||!/^[a-f0-9]{64}$/.test(v||''))return;await secrets();const {fs,db}=fb();
    await ensureMeta(v,true);const ops=[];
    for(const c of VCOLLS){const snap=await fs.getDocs(fs.collection(db,'views',v,c));snap.forEach(d=>{ops.push({c,id:d.id,del:true});if(c==='media')for(let i=0;i<(d.data().n||0);i++)ops.push({c:'chunks',id:d.id+'_'+i,del:true})})}
    await run(v,ops);if(cur===v){unsubs.forEach(u=>u());unsubs=[];cur=null}}
  return {kick,wipe,get state(){return state},secrets:async()=>{await secrets();return h}};
}
