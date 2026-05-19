/* Service Worker for 課程管理系統 v3 — Phase 5 (Network-first for HTML) */
const CACHE_NAME = 'cms-v3-2026-05-19';
const CORE_ASSETS = [
  'manifest.json',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS).catch(()=>null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // never intercept API calls
  if(url.host.includes('anthropic.com')) return;
  if(url.host.includes('firebaseio.com')) return;
  if(url.host.includes('googleapis.com')) return;
  if(url.host.includes('discord.com')) return;
  if(url.host.includes('api.qrserver.com')) return;
  if(e.request.method !== 'GET') return;

  const isHTML = e.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' || url.pathname.endsWith('/');

  if(isHTML){
    // 對 HTML 一律 network-first：永遠抓最新，避免使用者看到舊版
    e.respondWith(
      fetch(e.request).then(resp => {
        if(resp && resp.status === 200){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => { try { c.put(e.request, clone); } catch(_){} });
        }
        return resp;
      }).catch(() => caches.match(e.request).then(hit => hit || new Response('Offline', {status:503})))
    );
    return;
  }

  // 其他靜態資源 cache-first
  e.respondWith(
    caches.match(e.request).then(hit => {
      if(hit) return hit;
      return fetch(e.request).then(resp => {
        if(resp && resp.status === 200 && (url.origin === self.location.origin || url.host.includes('gstatic.com'))){
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => { try { c.put(e.request, clone); } catch(_){} });
        }
        return resp;
      }).catch(()=> hit || new Response('Offline', {status:503}));
    })
  );
});

self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
