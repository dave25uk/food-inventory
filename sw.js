const CACHE_NAME = 'pantry-v2'; // Changed version to force an update

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Forces the new service worker to take over immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache); // Delete the old version's cache
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Network-first strategy for our main app files
  if (e.request.url.includes('app.js') || e.request.url.includes('index.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for images and external libraries
    e.respondWith(
      caches.match(e.request).then((response) => response || fetch(e.request))
    );
  }
});

// ... keep your 'push' and 'notificationclick' listeners exactly as they are ...

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'Pantry Update', body: 'Check your expiry dates!' };

    const options = {
        body: data.body,
        icon: 'icon-192.png', // Use your new icon!
        badge: 'icon-192.png',
        vibrate: [100, 50, 100],
        data: { url: '/' } // Opens the app when clicked
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});