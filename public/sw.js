// キャッシュのバージョンと名前を定義
const CACHE_NAME = 'museum-portal-cache-v1';

// インストール時にキャッシュするファイルのリスト
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
  'https://unpkg.com/lucide@latest'
];

// 1. インストール処理
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Core assets caching...');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. 有効化処理 (古いキャッシュの削除)
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache:', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// 3. フェッチ処理 (ネットワークファースト)
self.addEventListener('fetch', (evt) => {
  // GETリクエスト以外は無視
  if (evt.request.method !== 'GET') {
    return;
  }

  evt.respondWith(
    // まずはネットワークからの取得を試みる
    fetch(evt.request)
      .then((response) => {
        // 取得に成功した場合
        const responseToCache = response.clone();
        // キャッシュを更新しておく
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(evt.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // ネットワーク取得に失敗した場合 (オフライン時など)
        // キャッシュから一致するものを探す
        return caches.match(evt.request).then((response) => {
          // キャッシュにあればそれを返す
          if (response) {
            return response;
          }
          // ページ遷移のリクエストで、キャッシュにもない場合はオフラインページを表示
          if (evt.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
      })
  );
});
