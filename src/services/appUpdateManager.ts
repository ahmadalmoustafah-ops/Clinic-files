import { registerSW } from 'virtual:pwa-register';

export type UpdateCheckResult = 'update-available' | 'up-to-date' | 'offline';

interface AppUpdateState {
  hasUpdate: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  lastCheckedAt: string | null;
}

type Listener = (state: AppUpdateState) => void;

let state: AppUpdateState = {
  hasUpdate: false,
  isChecking: false,
  isUpdating: false,
  lastCheckedAt: null,
};

const listeners = new Set<Listener>();
let swRegistration: ServiceWorkerRegistration | undefined;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | undefined;
let initialized = false;
let intervalId: number | undefined;

function emit() {
  const snapshot = { ...state };
  listeners.forEach((fn) => fn(snapshot));
}

function setState(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch };
  emit();
}

async function checkRemoteVersion(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { buildId?: string };
    const currentBuildId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';
    if (data?.buildId && currentBuildId && data.buildId !== currentBuildId) {
      return true;
    }
  } catch {
    // Ignore transient network errors while offline or restarting
  }
  return false;
}

export function initAppUpdateManager(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        setState({ hasUpdate: true });
      },
      onRegisteredSW(_swUrl, registration) {
        swRegistration = registration;
        if (registration?.waiting) {
          setState({ hasUpdate: true });
        }
      },
      onRegisterError(err) {
        console.warn('SW registration notice:', err);
      },
    });
  } catch (err) {
    console.warn('PWA register skipped:', err);
  }

  // Listen for waiting service worker updates directly if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        swRegistration = reg;
        if (reg.waiting) {
          setState({ hasUpdate: true });
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setState({ hasUpdate: true });
            }
          });
        });
      })
      .catch(() => {});
  }

  // Background check on startup (after a short delay), focus/visibility, online regain, and every 2 mins
  const runSilentCheck = () => {
    if (navigator.onLine) {
      void AppUpdateManager.checkForUpdates(true);
    }
  };

  setTimeout(runSilentCheck, 4000);
  intervalId = window.setInterval(runSilentCheck, 2 * 60 * 1000);

  window.addEventListener('online', runSilentCheck);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      runSilentCheck();
    }
  });
}

export const AppUpdateManager = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({ ...state });
    return () => {
      listeners.delete(listener);
    };
  },

  getState(): AppUpdateState {
    return { ...state };
  },

  async checkForUpdates(silent = false): Promise<UpdateCheckResult> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline';
    }

    if (!silent) {
      setState({ isChecking: true });
    }

    try {
      let foundUpdate = state.hasUpdate;

      if (swRegistration) {
        try {
          await swRegistration.update();
          if (swRegistration.waiting) {
            foundUpdate = true;
          }
        } catch {
          // Ignore SW update check errors if dev server or offline
        }
      }

      if (!foundUpdate) {
        const versionChanged = await checkRemoteVersion();
        if (versionChanged) {
          foundUpdate = true;
        }
      }

      setState({
        hasUpdate: foundUpdate,
        lastCheckedAt: new Date().toISOString(),
        ...(silent ? {} : { isChecking: false }),
      });

      return foundUpdate ? 'update-available' : 'up-to-date';
    } catch {
      if (!silent) {
        setState({ isChecking: false });
      }
      return 'up-to-date';
    }
  },

  async applyUpdate(): Promise<void> {
    if (state.isUpdating) return;
    setState({ isUpdating: true });

    try {
      if (swRegistration) {
        await swRegistration.update().catch(() => {});
      }

      // If waiting SW exists, activate it and reload cleanly
      if (swRegistration?.waiting && updateSWFn) {
        await updateSWFn(true);
        // Fallback reload in case controllerchange doesn't reload automatically
        setTimeout(() => {
          window.location.reload();
        }, 900);
        return;
      }

      // Clear Service Worker asset caches only (NEVER touch localStorage or IndexedDB)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.includes('workbox') || name.includes('precache') || name.includes('vite-pwa'))
            .map((name) => caches.delete(name))
        );
      }

      if (updateSWFn) {
        try {
          await updateSWFn(true);
        } catch {}
      }

      window.location.reload();
    } catch {
      window.location.reload();
    }
  },

  cleanup() {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
    }
  },
};
