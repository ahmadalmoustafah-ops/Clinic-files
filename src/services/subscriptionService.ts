export type SubscriptionStatus = 'active' | 'suspended';

export interface ClientSubscriptionState {
  status: SubscriptionStatus;
  adminMessage: string;
  adminMessageUpdatedAt: string | null;
}

function cacheKey(userId: string): string {
  return `easy_clinic_sub_cache_${userId}`;
}

function readCache(userId: string): ClientSubscriptionState {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClientSubscriptionState>;
      return {
        status: parsed.status === 'suspended' ? 'suspended' : 'active',
        adminMessage: typeof parsed.adminMessage === 'string' ? parsed.adminMessage : '',
        adminMessageUpdatedAt:
          typeof parsed.adminMessageUpdatedAt === 'string' ? parsed.adminMessageUpdatedAt : null,
      };
    }
  } catch {}
  return {
    status: 'active',
    adminMessage: '',
    adminMessageUpdatedAt: null,
  };
}

function writeCache(userId: string, state: ClientSubscriptionState): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(state));
  } catch {}
}

export const SubscriptionService = {
  getCachedState(userId: string): ClientSubscriptionState {
    return readCache(userId);
  },

  async syncAllAccounts(
    accounts: Array<{ id: string; fullName: string; createdAt: string }>
  ): Promise<void> {
    if (!accounts.length) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      await fetch('/api/subscriptions/register-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ accounts }),
      });
    } catch {
      // Offline / transient network error: retry on next focus/online/interval
    }
  },

  async syncAccount(params: {
    id: string;
    fullName: string;
    createdAt: string;
  }): Promise<ClientSubscriptionState> {
    const cached = readCache(params.id);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return cached;
    }

    try {
      const statusRes = await fetch(
        `/api/subscriptions/status/${encodeURIComponent(params.id)}?_t=${Date.now()}`,
        {
          cache: 'no-store',
        }
      );

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as {
          registered?: boolean;
          status?: SubscriptionStatus;
          adminMessage?: string;
          adminMessageUpdatedAt?: string | null;
        };

        if (statusData.registered) {
          const nextState: ClientSubscriptionState = {
            status: statusData.status === 'suspended' ? 'suspended' : 'active',
            adminMessage: typeof statusData.adminMessage === 'string' ? statusData.adminMessage : '',
            adminMessageUpdatedAt: statusData.adminMessageUpdatedAt || null,
          };
          writeCache(params.id, nextState);
          return nextState;
        }
      }

      // Register or refresh name on server registry (only id + fullName + createdAt — zero patient data)
      const regRes = await fetch('/api/subscriptions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          id: params.id,
          fullName: params.fullName,
          createdAt: params.createdAt,
        }),
      });

      if (regRes.ok) {
        const regData = (await regRes.json()) as {
          status?: SubscriptionStatus;
          adminMessage?: string;
          adminMessageUpdatedAt?: string | null;
        };
        const nextState: ClientSubscriptionState = {
          status: regData.status === 'suspended' ? 'suspended' : 'active',
          adminMessage: typeof regData.adminMessage === 'string' ? regData.adminMessage : '',
          adminMessageUpdatedAt: regData.adminMessageUpdatedAt || null,
        };
        writeCache(params.id, nextState);
        return nextState;
      }
    } catch {
      // Offline / transient error: keep cached state gracefully
    }

    return cached;
  },
};
