import { IdentifierType, UserAccount, UserSession } from '../types';

const ACCOUNTS_KEY = 'easy_clinic_accounts_v1';
const SESSION_KEY = 'easy_clinic_active_session_v1';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return toHex(bytes);
}

// Pure-JS SHA-256 fallback if window.crypto.subtle is unavailable (e.g. non-HTTPS LAN access)
function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) continue;
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash.pop();
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}::easy_clinic::${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: encoder.encode(`${salt}::easy_clinic`),
          iterations: 50000,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );
      return toHex(new Uint8Array(derivedBits));
    } catch {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return toHex(new Uint8Array(digest));
    }
  }

  // Fallback for non-secure contexts
  let digest = sha256Fallback(unescape(encodeURIComponent(input)));
  for (let i = 0; i < 200; i++) {
    digest = sha256Fallback(`${digest}:${salt}`);
  }
  return digest;
}

export function parseAndValidateIdentifier(rawInput: string): {
  valid: boolean;
  type?: IdentifierType;
  normalized?: string;
  display?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) return { valid: false };

  // Convert Arabic-Indic / Persian numerals to ASCII digits first
  const asciiDigitsNormalized = trimmed.replace(/[٠-٩]/g, (d) =>
    String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  ).replace(/[۰-۹]/g, (d) =>
    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  );

  if (asciiDigitsNormalized.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const lower = asciiDigitsNormalized.toLowerCase();
    if (!emailRegex.test(lower)) {
      return { valid: false };
    }
    return {
      valid: true,
      type: 'email',
      normalized: `email:${lower}`,
      display: lower,
    };
  }

  // Phone number validation: strip spaces, dashes, parentheses, leading + or 00
  const digitsOnly = asciiDigitsNormalized.replace(/[\s\-().+]/g, '');
  if (!/^\d{7,15}$/.test(digitsOnly)) {
    return { valid: false };
  }

  return {
    valid: true,
    type: 'phone',
    normalized: `phone:${digitsOnly}`,
    display: asciiDigitsNormalized.trim(),
  };
}

function getStoredAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredAccounts(accounts: UserAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function toSession(account: UserAccount): UserSession {
  return {
    id: account.id,
    fullName: account.fullName,
    identifier: account.identifier,
    identifierType: account.identifierType,
    displayIdentifier: account.displayIdentifier,
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
  };
}

export type AuthErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_IDENTIFIER'
  | 'WEAK_PASSWORD'
  | 'ACCOUNT_EXISTS'
  | 'INVALID_CREDENTIALS';

export interface AuthResult {
  success: boolean;
  session?: UserSession;
  errorCode?: AuthErrorCode;
  isFirstAccountOnDevice?: boolean;
}

export const AuthService = {
  getAccountsCount(): number {
    return getStoredAccounts().length;
  },

  getAllAccountSummaries(): Array<{ id: string; fullName: string; createdAt: string }> {
    return getStoredAccounts().map((a) => ({
      id: a.id,
      fullName: a.fullName,
      createdAt: a.createdAt,
    }));
  },

  getCurrentSession(): UserSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as UserSession;
      if (!session || !session.id) return null;
      // Verify account still exists
      const accounts = getStoredAccounts();
      const exists = accounts.some((a) => a.id === session.id);
      if (!exists) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  async registerAccount(params: {
    fullName: string;
    identifierInput: string;
    password: string;
  }): Promise<AuthResult> {
    const cleanName = params.fullName.trim();
    if (cleanName.length < 2) {
      return { success: false, errorCode: 'INVALID_NAME' };
    }

    const parsedId = parseAndValidateIdentifier(params.identifierInput);
    if (!parsedId.valid || !parsedId.normalized || !parsedId.type || !parsedId.display) {
      return { success: false, errorCode: 'INVALID_IDENTIFIER' };
    }

    if (!params.password || params.password.length < 6) {
      return { success: false, errorCode: 'WEAK_PASSWORD' };
    }

    const accounts = getStoredAccounts();
    const isFirstAccount = accounts.length === 0;

    if (accounts.some((a) => a.identifier === parsedId.normalized)) {
      return { success: false, errorCode: 'ACCOUNT_EXISTS' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(params.password, salt);
    const nowIso = new Date().toISOString();

    const newUser: UserAccount = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fullName: cleanName,
      identifier: parsedId.normalized,
      identifierType: parsedId.type,
      displayIdentifier: parsedId.display,
      passwordSalt: salt,
      passwordHash,
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };

    accounts.push(newUser);
    saveStoredAccounts(accounts);

    const session = toSession(newUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    return {
      success: true,
      session,
      isFirstAccountOnDevice: isFirstAccount,
    };
  },

  async login(params: {
    identifierInput: string;
    password: string;
  }): Promise<AuthResult> {
    const parsedId = parseAndValidateIdentifier(params.identifierInput);
    if (!parsedId.valid || !parsedId.normalized) {
      return { success: false, errorCode: 'INVALID_CREDENTIALS' };
    }

    const accounts = getStoredAccounts();
    const accountIndex = accounts.findIndex((a) => a.identifier === parsedId.normalized);
    if (accountIndex === -1) {
      return { success: false, errorCode: 'INVALID_CREDENTIALS' };
    }

    const account = accounts[accountIndex];
    const computedHash = await hashPassword(params.password || '', account.passwordSalt);
    if (computedHash !== account.passwordHash) {
      return { success: false, errorCode: 'INVALID_CREDENTIALS' };
    }

    const nowIso = new Date().toISOString();
    account.lastLoginAt = nowIso;
    accounts[accountIndex] = account;
    saveStoredAccounts(accounts);

    const session = toSession(account);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    return {
      success: true,
      session,
      isFirstAccountOnDevice: false,
    };
  },

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
  },
};
