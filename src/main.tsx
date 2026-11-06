import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/theme.css';

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch(() => { /* the app works online without it */ });
}
