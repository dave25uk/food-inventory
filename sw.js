const CACHE_NAME = 'pantry-v1';
const ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'icon-192.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

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