import { mountControllerScreen } from './ui/controller-screen';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
mountControllerScreen(root);
