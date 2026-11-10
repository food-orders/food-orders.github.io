const CACHE='shranck-shell-v15';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','favicon.ico','favicon.png','logo.png','logo-512.jpg']).catch(()=>{})));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  const nav=e.request.mode==='navigate';
  e.respondWith(fetch(new Request(e.request,{cache:'reload'})).then(r=>{
    if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))} // never cache 404s/errors
    return r;
  }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(m=>m||(nav?caches.match('index.html',{ignoreSearch:true}):null)).then(m=>m||Response.error())));
});
