import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker for 100% offline local capability
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
