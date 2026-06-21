/** PWA service worker를 등록한다. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', function registerPwaWorkerOnLoad() {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}
