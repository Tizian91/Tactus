'use strict';
/*
 * Service worker: makes Tactus installable ("Install app" in Chrome / Edge)
 * and usable offline once it was opened online (taken over from MindMapper).
 *
 * Network first: online you always get the current files, the cache is only the offline copy.
 * New file in index.html? Add it to FILES, so it is there offline from the start.
 */
const CACHE = 'tactus-v50';
const SAMPLES = 'tactus-samples-v1'; // samples/*.flac (new version only when the recordings change)
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'css/bravura.css',
  'css/app.css',
  'js/state.js',
  'js/i18n.js',
  'js/model.js',
  'js/drummap.js',
  'js/cubase.js',
  'js/kits.js',
  'js/midi.js',
  'js/midiin.js',
  'js/midiout.js',
  'js/rhythm.js',
  'js/render.js',
  'js/contextmenu.js',
  'js/actions.js',
  'js/panel.js',
  'js/interaction.js',
  'js/playback.js',
  'js/audio.js',
  'js/storage.js',
  'js/dropbox.js',
  'js/share.js',
  'js/help.js',
  'js/samples.js',
  'js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => console.warn('Tactus offline copy: missing ' + f)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SAMPLES).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // recorded drum sounds: from their own cache once loaded (they do not change; kept across updates)
  if (/\/samples\/[^/]+\.flac$/.test(new URL(req.url).pathname)) {
    e.respondWith(caches.open(SAMPLES).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  e.respondWith(fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
