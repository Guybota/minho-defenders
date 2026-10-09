// Minho Defenders: guarda o jogo para abrir sem rede (app instalada).
// Página: rede primeiro (apanha logo as versões novas), cache se não houver rede.
// Resto (ícone, manifesto, letras, PeerJS): cache primeiro e atualiza por trás.
const C='cerco-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','icon.png','manifest.webmanifest']).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(!/^https?:$/.test(u.protocol))return;
  const keep=res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;};
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(keep).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));return;}
  e.respondWith(caches.match(r).then(m=>{const net=fetch(r).then(keep).catch(()=>m);return m||net;}));
});
