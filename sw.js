// App version and data version are independent. Never delete IndexedDB here.
// Keep this a classic worker: installed v1 clients register without type: module.
const VERSION = '2.3.1';
const PREFIX = `quizlab-app:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const absolute = path => new URL(path, self.registration.scope).href;
const ASSETS = ['./','./index.html','./styles.css','./js/app.js','./js/model.js','./js/db.js','./js/bank.js','./js/bank-schema.js','./js/quiz-config.js','./js/exam.js','./js/memory.js','./data/memory-tips.json','./js/icons.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
const ASSET_URLS = new Set(ASSETS.map(absolute));
const MANIFEST = absolute('./data/bank-manifest.json');

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path=>new Request(absolute(path),{cache:'reload'})));
    const response=await fetch(MANIFEST,{cache:'no-store'});
    if (!response.ok) throw new Error('Bank manifest unavailable');
    const manifest=await response.clone().json();
    if (manifest.schemaVersion!==2 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.dataVersion) || manifest.chapters?.length!==5 || manifest.sections?.length!==8) throw new Error('Unsupported bank manifest');
    if (manifest.sections.some(s=>s.url!==`releases/${manifest.dataVersion}/${s.id}.json` || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id))) throw new Error('Invalid bank URL');
    const urls=manifest.sections.map(section=>absolute(`./data/${section.url}`));
    const parts=await Promise.all(urls.map(async url=>{
      const result=await fetch(url,{cache:'no-store'});
      if (!result.ok) throw new Error('Incomplete bank release');
      return result;
    }));
    // Verify every byte/version before installing. The application also validates
    // question fields and roles before committing the complete bank to IndexedDB.
    await Promise.all(parts.map(async (part,i)=>{
      const bytes=await part.clone().arrayBuffer();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const data=JSON.parse(new TextDecoder().decode(bytes));
      if (hash!==manifest.sections[i].sha256 || data.schemaVersion!==2 || data.dataVersion!==manifest.dataVersion || data.sectionId!==manifest.sections[i].id || data.questions?.length!==manifest.sections[i].count) throw new Error('Invalid bank release');
    }));
    await Promise.all(parts.map((part,i)=>cache.put(urls[i],part)));
    await cache.put(MANIFEST,response);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    await self.clients.claim();
    // Keep the preceding app while another open page could still need its assets.
    if ((await self.clients.matchAll({type:'window',includeUncontrolled:true})).length<=1) {
      const names=(await caches.keys()).filter(name=>name.startsWith(PREFIX) || name.startsWith(`quizlab:${self.registration.scope}:`));
      const older=names.filter(name=>name!==CACHE);
      await Promise.all(older.slice(0,-1).map(name=>caches.delete(name)));
    }
  })());
});

self.addEventListener('message', event => {
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
  if (event.data?.type==='CLEAN_BANK_CACHES') event.waitUntil((async()=>{
    if ((await self.clients.matchAll({type:'window',includeUncontrolled:true})).length>1) return;
    const prefix=`quizlab-bank:${self.registration.scope}:`;
    const names=(await caches.keys()).filter(name=>name.startsWith(prefix));
    const old=names.filter(name=>name!==prefix+event.data.version);
    await Promise.all(old.slice(0,-1).map(name=>caches.delete(name)));
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);url.search='';url.hash='';
  if(url.origin!==self.location.origin || !url.href.startsWith(self.registration.scope))return;
  if(url.href===MANIFEST) {
    event.respondWith((async()=>{
      try {return await fetch(request,{cache:'no-store',signal:AbortSignal.timeout(6000)});}
      catch {
        const cached=await caches.match(MANIFEST);
        if (!cached) return Response.error();
        const headers=new Headers(cached.headers);headers.set('X-QuizLab-Cache','1');
        return new Response(await cached.arrayBuffer(),{headers});
      }
    })());return;
  }
  if (url.href.startsWith(absolute('./data/releases/')) && url.pathname.endsWith('.json')) {
    event.respondWith(caches.match(url.href).then(cached=>cached || fetch(request)));return;
  }
  if(request.mode==='navigate') {
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(absolute('./index.html')) || fetch(request)));
    return;
  }
  if(ASSET_URLS.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.href) || fetch(request)));
  }
});
