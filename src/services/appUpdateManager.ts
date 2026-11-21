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

function emit() {
  const snapshot = { ...state };
  listeners.forEach((fn) => fn(snapshot));
}

function setState(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch };
  emit();
}

function isManagerRoutePath(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.replace(/\/+$/, '');
  const searchParams = new URLSearchParams(window.location.search);
  return (
    pathname === '/manager' ||
    searchParams.get('page') === 'manager' ||
    window.location.hash === '#/manager'
  );
}

async function checkRemoteVersion(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  if (isManagerRoutePath()) {
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
    const data = (await res.json()) as { buildId?: string; userBuildId?: string };
    const currentUserBuildId = typeof __USER_BUILD_ID__ !== 'undefined' ? __USER_BUILD_ID__ : '';
    const currentBuildId = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '';

    // Ignore updates restricted solely to the manager portal (ManagerDashboard)
    if (data?.userBuildId && currentUserBuildId) {
      return data.userBuildId !== currentUserBuildId;
    }

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

  // Automatic background update notifications to user accounts are intentionally disabled.
  // Also skip service worker update registration on the independent manager portal.
  if (isManagerRoutePath()) return;

  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Do not push automatic update notifications to user accounts
      },
      onRegisteredSW(_swUrl, registration) {
        swRegistration = registration;
      },
      onRegisterError(err) {
        console.warn('SW registration notice:', err);
      },
    });
  } catch (err) {
    console.warn('PWA register skipped:', err);
  }
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
    if (isManagerRoutePath()) {
      return 'up-to-date';
    }

    if (!silent) {
      setState({ isChecking: true });
    }

    try {
      const versionChanged = await checkRemoteVersion();
      let foundUpdate = false;

      if (versionChanged) {
        foundUpdate = true;
        if (swRegistration) {
          await swRegistration.update().catch(() => {});
        }
      }

      setState({
        // Never emit automatic notifications when running silently
        hasUpdate: silent ? false : foundUpdate,
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

      if (swRegistration?.waiting && updateSWFn) {
        await updateSWFn(true);
        setTimeout(() => {
          window.location.reload();
        }, 900);
        return;
      }

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

  cleanup() {},
};
