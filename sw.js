/* Same-origin public assets only. Tokens and GitHub requests never enter this cache. */
importScripts('./offline-assets.js');
const CACHE = `scor-${self.OFFLINE_ASSETS.version}`;
const url = path => new URL(path, self.registration.scope).href;
const allowed = new Set([...self.OFFLINE_ASSETS.shell, ...self.OFFLINE_ASSETS.data].map(url));
self.addEventListener('install', event => {
  // Keep first-visit transfers small. Full offline data is an explicit Study action.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(self.OFFLINE_ASSETS.shell.map(url))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if(key.startsWith('scor-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request=event.request, target=new URL(request.url);
  if(request.method !== 'GET' || target.origin !== self.location.origin) return;
  const navigation=request.mode === 'navigate' && (target.href.split('#')[0] === self.registration.scope || target.pathname === new URL('index.html',self.registration.scope).pathname);
  const key=navigation ? url('index.html') : request.url;
  if (!allowed.has(key)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE), hit=await cache.match(key);
    if(hit) return hit;
    const response=await fetch(request);
    if(response.ok) await cache.put(key,response.clone());
    return response;
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if(event.data?.type !== 'DOWNLOAD_OFFLINE') return;
  const port=event.ports[0];
  event.waitUntil((async()=>{
    try {
      const cache=await caches.open(CACHE);
      // Sequential fetches keep peak memory/network use low and permit safe retries.
      for(const path of self.OFFLINE_ASSETS.data) {
        if(!(await cache.match(url(path)))) await cache.add(url(path));
      }
      port?.postMessage({ok:true});
    } catch(e) { port?.postMessage({ok:false,error:'Download interrupted. Reconnect and try again.'}); }
  })());
});
