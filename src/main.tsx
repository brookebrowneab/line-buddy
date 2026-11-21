import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

try { localStorage.removeItem('lines-class-session'); } catch { /* Browser storage may be unavailable. */ }
registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
