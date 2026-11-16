import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { initAppUpdateManager } from './services/appUpdateManager.ts';

// Register PWA service worker and live update detector (100% offline safe)
initAppUpdateManager();

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
