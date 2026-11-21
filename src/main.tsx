import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initAppUpdateManager } from './services/appUpdateManager.ts';

// Register PWA service worker and live update detector (100% offline safe)
initAppUpdateManager();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </ErrorBoundary>
);
