/* Turner & Pears Family Tree — storage + sync.
   Local copy always lives in IndexedDB on the device (works offline, and before Firestore rules are published).
   If window.BS_FIREBASE_CONFIG.apiKey is set it also syncs through Firestore at
     trees/{roomKey}/{persons|media|chunks|config}/{docId}
   roomKey = PBKDF2-SHA256(family passcode, salt "turner-pears-tree/room/v1", 600,000 rounds) as 64 hex.
   The passcode itself is never stored or sent anywhere. Photos/PDFs/videos are stored as base64 "chunks" docs
   (each < 1 MiB) so no paid Firebase Storage is needed. */
const SDK='10.12.2';
export const COLLS=['persons','media','config'];  // synced live; 'chunks' are fetched on demand
export const CHUNK=900000;                         // base64 chars per chunk doc (< 1 MiB Firestore limit)
const fbEnabled=()=>{const c=window.BS_FIREBASE_CONFIG||{};return !!(c.apiKey&&c.projectId&&c.appId)};

export async function deriveRoomKey(code){
  const norm=code.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(norm),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode('turner-pears-tree/room/v1'),iterations:600000},km,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function openIDB(name){return new Promise((res,rej)=>{const r=indexedDB.open(name,1);
  r.onupgradeneeded=()=>{const db=r.result;['docs','chunks','pending'].forEach(s=>db.createObjectStore(s))};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function tx(db,store,mode,fn){return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);
  let out;const r=fn(s);if(r)r.onsuccess=()=>out=r.result;t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
async function allEntries(db,store){return new Promise((res,rej)=>{const out=[];const t=db.transaction(store);const c=t.objectStore(store).openCursor();
  c.onsuccess=()=>{const cur=c.result;if(cur){out.push([cur.key,cur.value]);cur.continue()}else res(out)};c.onerror=()=>rej(c.error)})}

export async function createStore(room,{demo=false,onChange=()=>{},onStatus=()=>{}}={}){
  const db=await openIDB('tpt-'+(demo?'demo':room.slice(0,24)));
  const data={persons:{},media:{},config:{}};
  for(const [k,v] of await allEntries(db,'docs')){const [c,id]=k.split('/');if(data[c])data[c][id]=v}
  const pending=new Map(await allEntries(db,'pending'));   // "coll/id" -> 'put' | 'del'
  let fb=null, status=(demo||!fbEnabled())?'local':'offline', serverSeen=false, blocked=false;
  const setStatus=s=>{if(s!==status){status=s;onStatus(s)}};
  const bc=('BroadcastChannel'in window)?new BroadcastChannel('tpt-'+room.slice(0,12)):null;
  if(bc)bc.onmessage=async()=>{for(const c of COLLS)data[c]={};for(const [k,v] of await allEntries(db,'docs')){const [c,id]=k.split('/');if(data[c])data[c][id]=v}COLLS.forEach(c=>onChange(c))};
  const idbPut=(c,id,doc)=>tx(db,'docs','readwrite',s=>s.put(doc,c+'/'+id));
  const idbDel=(c,id)=>tx(db,'docs','readwrite',s=>s.delete(c+'/'+id));
  const markPending=(k,v)=>{pending.set(k,v);return tx(db,'pending','readwrite',s=>s.put(v,k))};
  const clearPending=k=>{pending.delete(k);return tx(db,'pending','readwrite',s=>s.delete(k))};
  const ref=(c,id)=>fb.fs.doc(fb.db,'trees',room,c,id);
  const recompute=()=>{if(demo||!fbEnabled())return setStatus('local');if(blocked)return setStatus('blocked');
    if(!fb||!navigator.onLine||!serverSeen)return setStatus('offline');setStatus(pending.size?'syncing':'synced')};
  window.addEventListener('online',recompute);window.addEventListener('offline',recompute);

  async function pushOne(k){
    if(!fb||blocked)return; const v=pending.get(k); if(!v)return; const [c,id]=k.split('/');
    try{
      if(c==='chunks'){ if(v==='del')await fb.fs.deleteDoc(ref(c,id)); else {const d=await tx(db,'chunks','readonly',s=>s.get(id)); if(d!=null)await fb.fs.setDoc(ref(c,id),{d});} }
      else if(v==='del')await fb.fs.deleteDoc(ref(c,id));
      else {const d=data[c][id]; if(d)await fb.fs.setDoc(ref(c,id),d);}
      if(pending.get(k)===v)await clearPending(k);
    }catch(e){console.warn('push',k,e); if(String(e.code||e).includes('permission'))blocked=true}
    recompute();
  }
  let flushing=false;
  async function flush(){if(flushing||!fb||blocked||!serverSeen)return;flushing=true;
    try{for(const k of [...pending.keys()])await pushOne(k)}finally{flushing=false}}

  const api={
    data, demo, get status(){return status}, firebase:()=>!!fb,
    async put(c,id,doc,{keepTime=false}={}){if(!keepTime)doc.updatedAt=Date.now();data[c][id]=doc;await idbPut(c,id,doc);
      await markPending(c+'/'+id,'put');if(bc)bc.postMessage(1);onChange(c);if(fb)pushOne(c+'/'+id);recompute()},
    async del(c,id){delete data[c][id];await idbDel(c,id);await markPending(c+'/'+id,'del');if(bc)bc.postMessage(1);onChange(c);if(fb)pushOne(c+'/'+id);recompute()},
    async putChunk(id,str){await tx(db,'chunks','readwrite',s=>s.put(str,id));await markPending('chunks/'+id,'put');if(fb)pushOne('chunks/'+id)},
    async delChunk(id){await tx(db,'chunks','readwrite',s=>s.delete(id));await markPending('chunks/'+id,'del');if(fb)pushOne('chunks/'+id)},
    async getChunk(id){let d=await tx(db,'chunks','readonly',s=>s.get(id));if(d!=null)return d;
      if(fb){try{const s=await fb.fs.getDoc(ref('chunks',id));if(s.exists()){d=s.data().d;await tx(db,'chunks','readwrite',st=>st.put(d,id));return d}}catch(e){console.warn('chunk',id,e)}}
      return null},
    // true = a tree already exists in the cloud for this key, false = none, null = can't tell (offline / rules not published / local mode)
    async exists(){if(Object.keys(data.config).length)return true;if(!fb||blocked)return null;
      try{const s=await Promise.race([fb.fs.getDocFromServer(ref('config','main')),new Promise((_,r)=>setTimeout(()=>r('timeout'),8000))]);return s.exists()}
      catch(e){if(String(e.code||e).includes('permission')){blocked=true;recompute()}return null}},
    async wipeLocal(){db.close();await new Promise(r=>{const q=indexedDB.deleteDatabase('tpt-'+(demo?'demo':room.slice(0,24)));q.onsuccess=q.onerror=q.onblocked=()=>r()})},
    pendingCount:()=>pending.size,
  };

  if(!demo&&fbEnabled()){
    try{
      const [appM,fs]=await Promise.all([import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)]);
      const app=appM.getApps().find(a=>a.name==='tree')||appM.initializeApp(window.BS_FIREBASE_CONFIG,'tree');
      const fdb=fs.getFirestore(app);
      if(window.BS_FIREBASE_CONFIG.emulatorHost){const [h,p]=window.BS_FIREBASE_CONFIG.emulatorHost.split(':');try{fs.connectFirestoreEmulator(fdb,h,+p)}catch(e){}}
      fb={fs,db:fdb,unsubs:[]};
      const seen={};
      COLLS.forEach(c=>{
        fb.unsubs.push(fs.onSnapshot(fs.collection(fdb,'trees',room,c),{includeMetadataChanges:true},async snap=>{
          if(snap.metadata.fromCache)return;
          blocked=false; let changed=false; const server={};
          snap.forEach(d=>{if(!d.metadata.hasPendingWrites)server[d.id]=d.data()});
          for(const [id,s] of Object.entries(server)){
            const k=c+'/'+id, l=data[c][id], p=pending.get(k);
            if(p==='del')continue;                               // our delete wins; pushed by flush
            if(p==='put'&&l&&(l.updatedAt||0)>=(s.updatedAt||0))continue;   // our newer edit; pushed by flush
            if(!l||JSON.stringify(l)!==JSON.stringify(s)){data[c][id]=s;await idbPut(c,id,s);changed=true}
            if(p==='put')await clearPending(k);
          }
          for(const id of Object.keys(data[c])) if(!(id in server)&&!pending.has(c+'/'+id)&&!snap.metadata.hasPendingWrites){
            delete data[c][id];await idbDel(c,id);changed=true}   // deleted on the other device
          seen[c]=true; if(COLLS.every(x=>seen[x])&&!serverSeen){serverSeen=true;flush()}
          if(changed)onChange(c); recompute();
        },err=>{console.warn('snapshot',c,err);if(String(err.code||err).includes('permission'))blocked=true;recompute()}));
      });
    }catch(e){console.warn('Firebase unavailable, staying local',e);fb=null}
  }
  recompute(); onStatus(status);
  return api;
}
