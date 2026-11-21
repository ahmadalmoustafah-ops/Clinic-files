# Security Specification & Payload-First TDD (`Easy clinic`)

## 1. Data Invariants
1. **Subscription Ownership & Identity Integrity**:
   - Every `/subscriptions/{subscriptionId}` document must have `id == subscriptionId`, valid ID format (`^[a-zA-Z0-9_\-]+$`, `<= 128`), and `ownerUid` matching `request.auth.uid` on client creation.
   - A regular subscriber (`ownerUid == request.auth.uid`) can only create with `status == 'active'` and `adminMessage == ''`, and can never change `status`, `adminMessage`, `adminMessageUpdatedAt`, `ownerUid`, `id`, `clientCreatedAt`, or `createdAt` on update.
2. **Admin Exclusivity**:
   - Only verified admins (`isAdmin()` — bootstrapped to verified `ahmad.almoustafah@gmail.com` or `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`) may suspend/reactivate accounts, send/clear `adminMessage`, list all subscriptions, or delete subscriptions.
3. **Email Verification Enforcement**:
   - All authenticated reads/writes require `request.auth != null && request.auth.token.email_verified == true`.
4. **Temporal Integrity & Field Allowlisting**:
   - `createdAt`, `updatedAt`, and `lastSeenAt` must strictly equal `request.time`.
   - Extra/ghost keys are rejected via `keys().hasAll(...) && keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.
5. **PII Isolation**:
   - `/users/{userId}` and `/subscriptions/{subscriptionId}` are strictly readable only by the document owner or verified admin (no blanket `isSignedIn()` reads or unfiltered `list` queries).

## 2. The "Dirty Dozen" Attack Payloads
1. **Shadow / Ghost Field Injection on Create**: `{ ...validSub, "isAdmin": true }` -> `PERMISSION_DENIED`.
2. **Self-Suspension Bypass / Privilege Escalation on Create**: `{ ...validSub, "status": "suspended" }` or `{ ...validSub, "adminMessage": "Fake" }` by non-admin -> `PERMISSION_DENIED`.
3. **Owner UID Spoofing on Create**: `{ ...validSub, "ownerUid": "victim-uid" }` -> `PERMISSION_DENIED`.
4. **ID Poisoning (>128 chars or invalid chars)**: docId `"sub/../../admin"` or 200-char string -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery on Create**: `{ ...validSub, "createdAt": "2020-01-01T00:00:00Z" }` (not `serverTimestamp()`) -> `PERMISSION_DENIED`.
6. **Non-Admin Modifying Subscription Status**: `updateDoc(subRef, { status: "active", updatedAt: serverTimestamp() })` by non-admin owner -> `PERMISSION_DENIED`.
7. **Non-Admin Forging Admin Message**: `updateDoc(subRef, { adminMessage: "Pay now", updatedAt: serverTimestamp() })` by non-admin owner -> `PERMISSION_DENIED`.
8. **Immortal Field Mutation (`createdAt` / `ownerUid`)**: `updateDoc(subRef, { ownerUid: "other-uid", updatedAt: serverTimestamp() })` -> `PERMISSION_DENIED`.
9. **String Size Exhaustion (Denial of Wallet)**: `{ ...validSub, "fullName": "<500 chars>" }` or `{ "adminMessage": "<5000 chars>" }` -> `PERMISSION_DENIED`.
10. **Unverified Email Admin Spoof**: `auth.token = { email: "ahmad.almoustafah@gmail.com", email_verified: false }` attempting list/update -> `PERMISSION_DENIED`.
11. **Self-Assigned Admin Escalation**: Non-admin creating `/admins/{uid}` with `{ role: "admin" }` -> `PERMISSION_DENIED`.
12. **Blanket User PII Scraping**: Authenticated non-owner querying/reading `/users/{otherUid}` or `list` `/subscriptions` without `ownerUid == auth.uid` filter -> `PERMISSION_DENIED`.
