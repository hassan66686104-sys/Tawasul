// Service Worker بسيط: يخزن واجهة التطبيق للتشغيل السريع، ولا يخزن أي بيانات من Supabase
const CACHE = 'tawasul-v1'
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // لا نتدخل في طلبات Supabase أو الصور
  if (req.mode === 'navigate') {
    // الصفحات: الشبكة أولًا، ثم النسخة المخزنة عند انقطاع الإنترنت
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return r }).catch(() => caches.match('./')))
    return
  }
  if (/\/assets\/|\/icons\/|\.woff2?$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r })))
  }
})
