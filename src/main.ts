import { mountControllerScreen } from './ui/controller-screen';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountControllerScreen(root);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.error('Service worker registration failed', error);
  });
}
