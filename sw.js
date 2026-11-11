/* Gomoku 的离线缓存。更新静态文件时同步改 VERSION。 */

const VERSION = "20261106-3";
const CACHE = `gomoku-${VERSION}`;
const INDEX_URL = new URL("./index.html", self.location).href;
const CACHE_PREFIX = "gomoku-";
const NAV_TIMEOUT_MS = 3000;
const ASSET_TIMEOUT_MS = 15000;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/game.js",
  "./src/ai.js",
  "./src/renderer.js",
  "./src/rapfi-ai.js",
  "./src/rapfi-worker.js",
  "./src/js-ai.js",
  "./src/js-ai-worker.js",
  "./src/advice.js",
  "./src/eval.js",
  "./src/theme.js",
  "./src/sound.js",
  "./src/pwa.js",
  "./src/sgf.js",
  "./src/series.js",
  "./vendor/rapfi/rapfi-single-simd128.js",
  "./vendor/rapfi/rapfi-single-simd128.wasm",
  "./vendor/rapfi/rapfi-single-simd128.data",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const connection = self.navigator && self.navigator.connection;
      const saveData = Boolean(connection && connection.saveData);
      // 省流量模式不预下载 1.3MB 引擎；联网后第一次用高难度时再按需缓存。
      const assets = saveData
        ? ASSETS.filter((asset) => !asset.includes("/vendor/rapfi/"))
        : ASSETS;

      // 单个资源失败或超时不再阻止新 SW 接管；避免弱网永久卡住安装。
      await Promise.all(
        assets.map(async (asset) => {
          const url = new URL(asset, self.location).href;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS);
          try {
            const response = await fetch(url, {
              cache: "reload",
              signal: controller.signal,
            });
            if (response.ok) await cache.put(url, response);
          } catch {
            // 离线或超时：保留其余资源，联网后仍可使用。
          } finally {
            clearTimeout(timer);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function openCache() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await openCache();
        let cached = null;
        if (cache) {
          try {
            cached = await cache.match(INDEX_URL);
          } catch {
            // 缓存读取失败时继续走网络。
          }
        }

        // 明确离线时不要等网络超时；直接打开缓存页面。
        if (self.navigator && !self.navigator.onLine && cached) return cached;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);

        try {
          const response = await fetch(request, { signal: controller.signal });
          if (cache && response.ok) {
            try {
              await cache.put(INDEX_URL, response.clone());
            } catch {
              // 缓存写入失败不影响这次导航。
            }
          }
          return response;
        } catch {
          if (cached) return cached;
          return new Response("当前处于离线状态，请重新打开应用。", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        } finally {
          clearTimeout(timer);
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await openCache();
      if (cache) {
        try {
          // 先精确匹配：版本号变化时必须去网络拿新文件，不能把旧 JS 配给新 HTML。
          const cached = await cache.match(request);
          if (cached) return cached;
        } catch {
          // 缓存读取失败时继续走网络。
        }
      }

      try {
        const response = await fetch(request);
        if (cache && response.ok && response.type === "basic") {
          try {
            await cache.put(request, response.clone());
          } catch {
            // 缓存写入失败不影响响应。
          }
        }
        return response;
      } catch {
        if (cache) {
          try {
            // 网络不可用时才退回忽略 query 的旧缓存，保证离线首次打开可用。
            const fallback = await cache.match(request, { ignoreSearch: true });
            if (fallback) return fallback;
          } catch {
            // 继续返回 504。
          }
        }
        return new Response("", { status: 504 });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
