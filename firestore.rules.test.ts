/**
 * Payload-First Security TDD specification for Easy clinic Firestore rules.
 * Verifies the 12 "Dirty Dozen" malicious attack payloads and legitimate role boundaries.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: 'subscriptions' | 'users' | 'admins';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actor: {
    uid: string;
    email: string;
    email_verified: boolean;
  };
  docId: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow / Ghost Field Injection on Create',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-101',
    payload: {
      id: 'usr-101',
      ownerUid: 'doctor_1',
      fullName: 'Dr. Ali',
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
      isAdmin: true, // Ghost field
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Non-admin creating suspended or admin-messaged subscription',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-102',
    payload: {
      id: 'usr-102',
      ownerUid: 'doctor_1',
      fullName: 'Dr. Ali',
      status: 'suspended',
      adminMessage: 'Spoofed notice',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Owner UID Spoofing on Create',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    docId: 'usr-103',
    payload: {
      id: 'usr-103',
      ownerUid: 'victim_uid',
      fullName: 'Victim Clinic',
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'ID Poisoning (>128 chars or invalid characters)',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'bad$id_'.repeat(30),
    payload: {
      id: 'bad$id_'.repeat(30),
      ownerUid: 'doctor_1',
      fullName: 'Dr. Ali',
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Client Timestamp Forgery on Create',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-105',
    payload: {
      id: 'usr-105',
      ownerUid: 'doctor_1',
      fullName: 'Dr. Ali',
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
      createdAt: '2020-01-01T00:00:00.000Z', // Not request.time
      lastSeenAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Non-admin reactivating own suspended subscription',
    collection: 'subscriptions',
    operation: 'update',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-106',
    payload: { status: 'active' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Non-admin forging adminMessage on update',
    collection: 'subscriptions',
    operation: 'update',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-107',
    payload: { adminMessage: 'Unauthorized message' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immortal Field Mutation (ownerUid / createdAt)',
    collection: 'subscriptions',
    operation: 'update',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-108',
    payload: { ownerUid: 'other_uid' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'String Size Exhaustion (Denial of Wallet)',
    collection: 'subscriptions',
    operation: 'create',
    actor: { uid: 'doctor_1', email: 'doc1@example.com', email_verified: true },
    docId: 'usr-109',
    payload: {
      id: 'usr-109',
      ownerUid: 'doctor_1',
      fullName: 'A'.repeat(500),
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: '',
      filesCount: 0,
      clientCreatedAt: '2026-11-21T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unverified Email Admin Spoofing',
    collection: 'subscriptions',
    operation: 'list',
    actor: {
      uid: 'spoof_uid',
      email: 'ahmad.almoustafah@gmail.com',
      email_verified: false,
    },
    docId: 'usr-110',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Self-Assigned Admin Document Creation',
    collection: 'admins',
    operation: 'create',
    actor: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    docId: 'attacker_uid',
    payload: {
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      role: 'admin',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Blanket User PII Read by Non-Owner',
    collection: 'users',
    operation: 'get',
    actor: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    docId: 'victim_uid',
    expectedResult: 'PERMISSION_DENIED',
  },
];
