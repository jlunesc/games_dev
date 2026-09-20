import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountApp(root);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.error('Service worker registration failed', error);
  });
}
