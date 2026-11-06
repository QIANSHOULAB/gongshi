// 车间小工具的离线看门狗（工时榨汁机 + 英寸照妖镜）：页面先上网拿新的，断网就用存下的；
// 照妖镜的识字模型和运行库存一次用到底。
const PAGES = 'gongshi-pages-v4';
const ASSETS = 'inch-mirror-assets-v1';
const BIG = /\/(ort\/[^/]+|models\/[^/]+)$/;
const TEXT = /\/strings\.js$/;                    // 两页共用的中英文字，跟页面一样先上网拿新的

self.addEventListener('install', e => {
  self.skipWaiting();
  // 两张页面和它们的字先存一份：第一次打开以后，断网也进得去
  e.waitUntil(caches.open(PAGES).then(c => Promise.all(['./', './inch/', './strings.js'].map(u => {
    const url = new URL(u, self.location).href;
    return fetch(url).then(r => r.ok && c.put(url, r)).catch(() => {});
  }))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [PAGES, ASSETS];
    for (const k of await caches.keys()) if ((k.startsWith('inch-mirror-') || k.startsWith('gongshi-')) && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  if (BIG.test(url.pathname)) {            // 大件：缓存优先
    e.respondWith((async () => {
      const c = await caches.open(ASSETS);
      const hit = await c.match(url.href, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(url.href, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || TEXT.test(url.pathname)) {   // 页面和文字：网络优先
    e.respondWith((async () => {
      const c = await caches.open(PAGES);
      try {
        const res = await fetch(req, { cache: 'no-cache' });   // 每次跟服务器核一下，改了马上见
        if (res.ok) c.put(url.origin + url.pathname, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const hit = await c.match(url.origin + url.pathname);
        if (hit || TEXT.test(url.pathname)) return hit || Response.error();   // 文字文件别拿首页顶替
        return (await c.match(new URL('./', self.registration.scope).href)) || Response.error();
      }
    })());
  }
});
