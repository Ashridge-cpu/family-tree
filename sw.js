// Offline-first: serve the app shell from cache instantly, refresh it in the background.
const V='tpt-v1-202611161140';
const SHELL=['./','./index.html','./app.js','./store.js','./seed.js','./config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png',
 './vendor/three.module.min.js','./vendor/OrbitControls.js','./vendor/cinzel.woff2','./vendor/cormorant.woff2','./vendor/cormorant-italic.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('tpt-')&&x!==V&&x!=='tpt-sdk').map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.open('tpt-sdk').then(c=>c.match(r).then(m=>m||fetch(r).then(n=>{if(n.ok)c.put(r,n.clone());return n}))));return}
  if(u.origin!==location.origin||!u.pathname.startsWith('/family-tree/'))return;
  e.respondWith(caches.open(V).then(c=>c.match(r,{ignoreSearch:true}).then(m=>{
    const net=fetch(r).then(n=>{if(n.ok)c.put(r,n.clone());return n}).catch(()=>m);
    return m||net})));
});
