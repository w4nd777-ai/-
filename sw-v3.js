/* Service Worker for 課程管理系統 v3 — Phase 5 (Network-first for HTML) */
// M3: CACHE_NAME 動態化 — 每次部署 bump BUILD 字串即可強制取得新版資源
const BUILD = '2026-05-28-attach-chunked-50mb';
const CACHE_NAME = 'cms-v3-' + BUILD;
const CORE_ASSETS = [
  'manifest.json',
  // F-19：把主 HTML 預載到 cache → 離線首訪也能開
  './app-v3.html',
  './index.html',
  './',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS).catch(()=>null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // 清掉所有非當前版本的 cache（避免舊版資源殘留）
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
    // 告知所有開著的頁面：有新版了，請考慮重新整理
    try {
      const list = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
      list.forEach(c => { try { c.postMessage({ type:'NEW_VERSION', build: BUILD }); } catch(_){} });
    } catch(_) {}
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // never intercept API calls (SW 攔截會打亂 long-polling / WebSocket)
  if(url.host.includes('anthropic.com')) return;
  if(url.host.includes('firebaseio.com')) return;            // 舊版 Firebase RTDB host
  if(url.host.includes('firebasedatabase.app')) return;       // 🔧 新版 Firebase RTDB host (e.g. asia-southeast1.firebasedatabase.app)
  if(url.host.includes('firebasestorage.app')) return;        // 🔧 Firebase Storage
  if(url.host.includes('firebaseapp.com')) return;            // 🔧 Firebase Hosting / Auth
  if(url.host.includes('identitytoolkit')) return;            // 🔧 Firebase Auth API
  if(url.host.includes('securetoken')) return;                // 🔧 Firebase Auth token refresh
  if(url.host.includes('ingest.sentry.io') || url.host.includes('ingest.us.sentry.io')) return; // Sentry 上報
  if(url.host.includes('googleapis.com')) return;
  if(url.host.includes('discord.com')) return;
  if(url.host.includes('api.qrserver.com')) return;
  if(e.request.method !== 'GET') return;

  const isHTML = e.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' || url.pathname.endsWith('/');

  if(isHTML){
    // 對 HTML 一律 network-first：永遠抓最新，避免使用者看到舊版
    // F-12: 5 秒 timeout — 網路慢時自動回 cache，不要讓使用者一直白屏
    e.respondWith((() => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { try { controller.abort(); } catch(_){} }, 5000);
      return fetch(e.request, { signal: controller.signal }).then(resp => {
        clearTimeout(timeoutId);
        if(resp && resp.status === 200){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => { try { c.put(e.request, clone); } catch(_){} });
        }
        return resp;
      }).catch(() => {
        clearTimeout(timeoutId);
        return caches.match(e.request).then(hit => hit || new Response('Offline', {status:503}));
      });
    })());
    return;
  }

  // M3: 其他靜態資源（Firebase JS 等）改為 stale-while-revalidate
  //  - 有 cache → 立即回應 cache（快），同時背景 fetch 更新 cache
  //  - 沒 cache → await fetch（慢，但只發生在第一次）
  e.respondWith(
    caches.match(e.request).then(hit => {
      // 背景更新：不論有沒有 cache 都嘗試抓新版寫回
      const networkFetch = fetch(e.request).then(resp => {
        if(resp && resp.status === 200 && (url.origin === self.location.origin || url.host.includes('gstatic.com'))){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => { try { c.put(e.request, clone); } catch(_){} });
        }
        return resp;
      }).catch(()=> hit || new Response('Offline', {status:503}));

      // 有 cache 就先回，背景默默更新；沒 cache 就等 fetch
      return hit || networkFetch;
    })
  );
});

self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // batch 3: 前景頁面要求 SW 代為顯示通知（某些瀏覽器不允許頁面直接 new Notification）
  if(e.data && e.data.type === 'SHOW_NOTIFICATION'){
    const { title, options } = e.data;
    try { self.registration.showNotification(title, options || {}); } catch(_){}
  }
});

// batch 3: Web Push 預備（需要 VAPID server 才會收到，這裡先保留 listener）
self.addEventListener('push', e => {
  if(!e.data) return;
  let data;
  try { data = e.data.json(); } catch(_) { data = { title:'通知', body: e.data.text() }; }
  const title = data.title || '通知';
  const opts = {
    body: data.body || '',
    icon: data.icon || './icon-192.png',
    badge: data.badge,
    tag: data.tag || 'cms-v3',
    data: data.data
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      // 優先 focus 屬於本 app 的 client
      for(const c of list){
        if(c.url.includes(self.location.origin) && 'focus' in c){
          try { c.focus(); } catch(_){}
          if('navigate' in c){ try { c.navigate(url); } catch(_){} }
          return;
        }
      }
      // 沒有就開新視窗
      if(self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
