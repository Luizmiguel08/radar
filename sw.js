// Radar de Comissões · service worker (app sem internet + avisos no celular)
const V = 'radar-202610131700';
const SHELL = ["./", "./index.html", "./radar-app.js?v=d56c959ee9", "./manifest.webmanifest", "./logo.png", "./icon-192.png", "./icon-512.png", "./badge-96.png", "./favicon-64.png", "./apple-touch-icon.png", "./vendor/chart.umd.js", "./vendor/jspdf.umd.min.js", "./vendor/jspdf.plugin.autotable.min.js", "./vendor/xlsx.full.min.js"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('radar-') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const ESCOPO = new URL('./', self.location).pathname;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (!u.pathname.startsWith(ESCOPO)) return;
    const rel = u.pathname.slice(ESCOPO.length);
    if (req.mode === 'navigate') {
      // página: sempre a mais nova quando há internet; sem internet, a última guardada
      e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); } return r; })
        .catch(() => caches.match('./index.html').then(m => m || caches.match('./'))));
      return;
    }
    if (rel.startsWith('vendor/') || /\.(png|js|webmanifest)$/.test(rel)) {
      e.respondWith(caches.match(req).then(m => {
        const net = fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; }).catch(() => m);
        return m || net;
      }));
    }
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r; })));
  }
  // banco (supabase.co): nunca passa pelo cache
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Radar de Comissões', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Radar de Comissões', {
      body: d.body || '',
      icon: './icon-192.png',
      badge: './badge-96.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || './' }
    });
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ tipo: 'atualizar' }));
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope);
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberto = cs.find(c => new URL(c.url).pathname.startsWith(new URL('./', self.registration.scope).pathname));
    if (aberto) { await aberto.focus(); aberto.postMessage({ tipo: 'abrir', url: alvo.href }); return; }
    await self.clients.openWindow(alvo.href);
  })());
});
