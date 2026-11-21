import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isValidFirestoreId,
  OperationType,
} from '../firebase';

export type SubscriptionStatus = 'active' | 'suspended';

export interface ClientSubscriptionState {
  status: SubscriptionStatus;
  adminMessage: string;
  adminMessageUpdatedAt: string | null;
}

const OWNER_ADMIN_EMAIL = 'ahmad.almoustafah@gmail.com';

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
          typeof parsed.adminMessageUpdatedAt === 'string' && parsed.adminMessageUpdatedAt
            ? parsed.adminMessageUpdatedAt
            : null,
      };
    }
  } catch {
    // Ignore cache parse error
  }
  return {
    status: 'active',
    adminMessage: '',
    adminMessageUpdatedAt: null,
  };
}

function writeCache(userId: string, state: ClientSubscriptionState): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage quota warnings
  }
}

function canUseFirestore(): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  const user = auth.currentUser;
  return Boolean(user && user.emailVerified && isValidFirestoreId(user.uid));
}

function isOwnerAdmin(): boolean {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.trim().toLowerCase() === OWNER_ADMIN_EMAIL
  );
}

function extractClientState(data: Record<string, unknown>): ClientSubscriptionState {
  const status: SubscriptionStatus = data.status === 'suspended' ? 'suspended' : 'active';
  const adminMessage = typeof data.adminMessage === 'string' ? data.adminMessage : '';
  const updatedRaw =
    typeof data.adminMessageUpdatedAt === 'string' ? data.adminMessageUpdatedAt.trim() : '';
  return {
    status,
    adminMessage,
    adminMessageUpdatedAt: updatedRaw || null,
  };
}

function clampName(raw: string): string {
  return raw.trim().slice(0, 150);
}

function clampCreatedAt(raw?: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 64) : '';
  return trimmed || new Date().toISOString();
}

function clampFilesCount(incoming: number | undefined, fallback = 0): number {
  if (typeof incoming === 'number' && Number.isFinite(incoming)) {
    return Math.min(1000000, Math.max(0, Math.floor(incoming)));
  }
  return Math.min(1000000, Math.max(0, Math.floor(fallback)));
}

export const SubscriptionService = {
  getCachedState(userId: string): ClientSubscriptionState {
    return readCache(userId);
  },

  isCloudSyncReady(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified);
  },

  async syncAllAccounts(
    accounts: Array<{ id: string; fullName: string; createdAt: string; filesCount?: number }>
  ): Promise<void> {
    if (!accounts.length || !canUseFirestore()) return;

    const uid = auth.currentUser!.uid;
    let existingSnap;
    try {
      existingSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('ownerUid', '==', uid))
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'subscriptions');
    }

    const existingMap = new Map<string, Record<string, unknown>>();
    existingSnap.forEach((d) => {
      existingMap.set(d.id, d.data() as Record<string, unknown>);
    });

    for (const acc of accounts) {
      if (!isValidFirestoreId(acc.id)) continue;
      const safeName = clampName(acc.fullName);
      if (!safeName) continue;

      const existing = existingMap.get(acc.id);
      const docPath = `subscriptions/${acc.id}`;
      const docRef = doc(db, 'subscriptions', acc.id);

      if (existing) {
        const currentCount =
          typeof existing.filesCount === 'number' ? existing.filesCount : 0;
        const nextCount = clampFilesCount(acc.filesCount, currentCount);
        const nameChanged = existing.fullName !== safeName;
        const countChanged = currentCount !== nextCount;

        if (nameChanged || countChanged) {
          try {
            await updateDoc(docRef, {
              fullName: safeName,
              filesCount: nextCount,
              lastSeenAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, docPath);
          }
        }
      } else {
        // Admin may already have visibility into doc created by another uid
        if (isOwnerAdmin()) {
          let adminCheck;
          try {
            adminCheck = await getDoc(docRef);
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, docPath);
          }
          if (adminCheck.exists()) {
            const d = adminCheck.data() as Record<string, unknown>;
            const nextCount = clampFilesCount(
              acc.filesCount,
              typeof d.filesCount === 'number' ? d.filesCount : 0
            );
            try {
              await updateDoc(docRef, {
                fullName: safeName,
                filesCount: nextCount,
                lastSeenAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, docPath);
            }
            continue;
          }
        }

        try {
          await setDoc(docRef, {
            id: acc.id,
            ownerUid: uid,
            fullName: safeName,
            status: 'active',
            adminMessage: '',
            adminMessageUpdatedAt: '',
            filesCount: clampFilesCount(acc.filesCount, 0),
            clientCreatedAt: clampCreatedAt(acc.createdAt),
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, docPath);
        }
      }
    }
  },

  async syncAccount(params: {
    id: string;
    fullName: string;
    createdAt: string;
    filesCount?: number;
  }): Promise<ClientSubscriptionState> {
    const cached = readCache(params.id);
    if (!canUseFirestore() || !isValidFirestoreId(params.id)) {
      return cached;
    }

    const safeName = clampName(params.fullName);
    if (!safeName) return cached;

    const uid = auth.currentUser!.uid;
    const docPath = `subscriptions/${params.id}`;
    const docRef = doc(db, 'subscriptions', params.id);

    let existingData: Record<string, unknown> | null = null;

    if (isOwnerAdmin()) {
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          existingData = snap.data() as Record<string, unknown>;
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, docPath);
      }
    } else {
      try {
        const qSnap = await getDocs(
          query(collection(db, 'subscriptions'), where('ownerUid', '==', uid))
        );
        const match = qSnap.docs.find((d) => d.id === params.id);
        if (match) {
          existingData = match.data() as Record<string, unknown>;
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'subscriptions');
      }
    }

    if (existingData) {
      const currentCount =
        typeof existingData.filesCount === 'number' ? existingData.filesCount : 0;
      const nextCount = clampFilesCount(params.filesCount, currentCount);

      try {
        await updateDoc(docRef, {
          fullName: safeName,
          filesCount: nextCount,
          lastSeenAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }

      const nextState = extractClientState(existingData);
      writeCache(params.id, nextState);
      return nextState;
    }

    try {
      await setDoc(docRef, {
        id: params.id,
        ownerUid: uid,
        fullName: safeName,
        status: 'active',
        adminMessage: '',
        adminMessageUpdatedAt: '',
        filesCount: clampFilesCount(params.filesCount, 0),
        clientCreatedAt: clampCreatedAt(params.createdAt),
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    }

    const initialState: ClientSubscriptionState = {
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: null,
    };
    writeCache(params.id, initialState);
    return initialState;
  },

  subscribeToAccount(
    userId: string,
    onStateChange: (state: ClientSubscriptionState) => void
  ): () => void {
    if (!canUseFirestore() || !isValidFirestoreId(userId)) {
      return () => {};
    }

    if (isOwnerAdmin()) {
      const docPath = `subscriptions/${userId}`;
      return onSnapshot(
        doc(db, 'subscriptions', userId),
        (snap) => {
          if (snap.exists()) {
            const nextState = extractClientState(snap.data() as Record<string, unknown>);
            writeCache(userId, nextState);
            onStateChange(nextState);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, docPath);
        }
      );
    }

    const uid = auth.currentUser!.uid;
    return onSnapshot(
      query(collection(db, 'subscriptions'), where('ownerUid', '==', uid)),
      (snapshot) => {
        const match = snapshot.docs.find((d) => d.id === userId);
        if (match) {
          const nextState = extractClientState(match.data() as Record<string, unknown>);
          writeCache(userId, nextState);
          onStateChange(nextState);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'subscriptions');
      }
    );
  },
};
