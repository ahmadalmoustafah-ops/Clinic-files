import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

interface SubscriptionEntry {
  id: string;
  fullName: string;
  status: 'active' | 'suspended';
  adminMessage: string;
  adminMessageUpdatedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface ManagerAuthConfig {
  email: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
}

interface RegistryData {
  tokenSecret: string;
  managerAuth: ManagerAuthConfig | null;
  subscriptions: SubscriptionEntry[];
}

const PORT = Number(process.env.PORT) || 3000;
const MANAGER_EMAIL = (process.env.MANAGER_EMAIL || 'ahmad.almoustafah@gmail.com')
  .trim()
  .toLowerCase();

function resolveWritableDataDir(): string {
  const primary = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(primary)) {
      fs.mkdirSync(primary, { recursive: true });
    }
    fs.accessSync(primary, fs.constants.W_OK);
    return primary;
  } catch {
    const fallback = path.join(os.tmpdir(), 'easy-clinic-data');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

const DATA_DIR = resolveWritableDataDir();
const REGISTRY_FILE = path.join(DATA_DIR, 'easy_clinic_registry.json');

function defaultTokenSecret(): string {
  return (
    process.env.MANAGER_TOKEN_SECRET ||
    crypto
      .createHmac('sha256', 'easy_clinic_manager_token_secret_v1')
      .update(`${MANAGER_EMAIL}::${process.env.K_SERVICE || 'local'}`)
      .digest('hex')
  );
}

function ensureRegistryFile(): RegistryData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(REGISTRY_FILE)) {
    const initial: RegistryData = {
      tokenSecret: defaultTokenSecret(),
      managerAuth: null,
      subscriptions: [],
    };
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RegistryData>;
    return {
      tokenSecret: parsed.tokenSecret || defaultTokenSecret(),
      managerAuth: parsed.managerAuth || null,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    };
  } catch {
    const fallback: RegistryData = {
      tokenSecret: defaultTokenSecret(),
      managerAuth: null,
      subscriptions: [],
    };
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

function saveRegistry(data: RegistryData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${REGISTRY_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, REGISTRY_FILE);
}

function hashManagerPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, `${salt}::easy_clinic_manager`, 64).toString('hex');
}

function verifyManagerPassword(password: string, config: ManagerAuthConfig): boolean {
  const computed = Buffer.from(hashManagerPassword(password, config.passwordSalt), 'hex');
  const stored = Buffer.from(config.passwordHash, 'hex');
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

function signManagerToken(email: string, secret: string): string {
  const payloadObj = {
    email,
    role: 'manager',
    exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyManagerToken(token: string, secret: string): { valid: boolean; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      email?: string;
      role?: string;
      exp?: number;
    };
    if (
      payload.role !== 'manager' ||
      !payload.email ||
      payload.email.toLowerCase() !== MANAGER_EMAIL ||
      !payload.exp ||
      payload.exp < Date.now()
    ) {
      return { valid: false };
    }
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

function requireManagerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: manager token required' });
    return;
  }

  const registry = ensureRegistryFile();
  if (!registry.managerAuth) {
    res.status(401).json({ error: 'Unauthorized: manager credentials not configured' });
    return;
  }
  const verification = verifyManagerToken(token, registry.tokenSecret);
  if (!verification.valid) {
    res.status(401).json({ error: 'Unauthorized: invalid or expired manager session' });
    return;
  }

  next();
}

async function startServer() {
  ensureRegistryFile();
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // --- Client Subscription Registration & Status Sync (Zero Patient PII) ---
  app.post('/api/subscriptions/register-batch', (req: Request, res: Response) => {
    const body = req.body as {
      accounts?: Array<{ id?: string; fullName?: string; createdAt?: string }>;
    };
    const items = Array.isArray(body.accounts) ? body.accounts : [];
    const registry = ensureRegistryFile();
    const nowIso = new Date().toISOString();
    let changed = false;

    for (const item of items) {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const fullName = typeof item?.fullName === 'string' ? item.fullName.trim() : '';
      if (!id || id.length > 128 || !fullName || fullName.length > 150) {
        continue;
      }

      const existingIdx = registry.subscriptions.findIndex((s) => s.id === id);
      if (existingIdx >= 0) {
        if (registry.subscriptions[existingIdx].fullName !== fullName) {
          registry.subscriptions[existingIdx].fullName = fullName;
          changed = true;
        }
      } else {
        registry.subscriptions.push({
          id,
          fullName,
          status: 'active',
          adminMessage: '',
          adminMessageUpdatedAt: null,
          createdAt: typeof item?.createdAt === 'string' && item.createdAt ? item.createdAt : nowIso,
          lastSeenAt: nowIso,
        });
        changed = true;
      }
    }

    if (changed) {
      saveRegistry(registry);
    }

    res.json({ synced: items.length, totalCount: registry.subscriptions.length });
  });

  app.post('/api/subscriptions/register', (req: Request, res: Response) => {
    const body = req.body as {
      id?: string;
      fullName?: string;
      createdAt?: string;
    };

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (!id || id.length > 128 || !fullName || fullName.length > 150) {
      res.status(400).json({ error: 'Invalid subscription account metadata' });
      return;
    }

    const registry = ensureRegistryFile();
    const nowIso = new Date().toISOString();
    const existingIdx = registry.subscriptions.findIndex((s) => s.id === id);

    if (existingIdx >= 0) {
      // Preserve manager-controlled status and adminMessage strictly
      registry.subscriptions[existingIdx].fullName = fullName;
      registry.subscriptions[existingIdx].lastSeenAt = nowIso;
      saveRegistry(registry);
      const sub = registry.subscriptions[existingIdx];
      res.json({
        id: sub.id,
        status: sub.status,
        adminMessage: sub.adminMessage,
        adminMessageUpdatedAt: sub.adminMessageUpdatedAt,
      });
      return;
    }

    const created: SubscriptionEntry = {
      id,
      fullName,
      status: 'active',
      adminMessage: '',
      adminMessageUpdatedAt: null,
      createdAt: typeof body.createdAt === 'string' && body.createdAt ? body.createdAt : nowIso,
      lastSeenAt: nowIso,
    };

    registry.subscriptions.push(created);
    saveRegistry(registry);

    res.status(201).json({
      id: created.id,
      status: created.status,
      adminMessage: created.adminMessage,
      adminMessageUpdatedAt: created.adminMessageUpdatedAt,
    });
  });

  app.get('/api/subscriptions/status/:id', (req: Request, res: Response) => {
    const id = (req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Missing account ID' });
      return;
    }

    const registry = ensureRegistryFile();
    const sub = registry.subscriptions.find((s) => s.id === id);
    if (!sub) {
      res.json({
        id,
        registered: false,
        status: 'active',
        adminMessage: '',
        adminMessageUpdatedAt: null,
      });
      return;
    }

    sub.lastSeenAt = new Date().toISOString();
    saveRegistry(registry);

    res.json({
      id: sub.id,
      registered: true,
      status: sub.status,
      adminMessage: sub.adminMessage,
      adminMessageUpdatedAt: sub.adminMessageUpdatedAt,
    });
  });

  // --- Easy Clinic Manager Authentication (Owner Only) ---
  app.get('/api/manager/auth-status', (_req: Request, res: Response) => {
    const registry = ensureRegistryFile();
    res.json({
      isConfigured: Boolean(registry.managerAuth),
    });
  });

  app.post('/api/manager/setup', (req: Request, res: Response) => {
    const body = req.body as { email?: string; password?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (email !== MANAGER_EMAIL) {
      res.status(403).json({ error: 'Access restricted exclusively to the clinic owner email.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const registry = ensureRegistryFile();
    if (registry.managerAuth) {
      res.status(409).json({ error: 'Manager password is already configured. Please sign in.' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    registry.managerAuth = {
      email: MANAGER_EMAIL,
      passwordSalt: salt,
      passwordHash: hashManagerPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    saveRegistry(registry);

    const token = signManagerToken(MANAGER_EMAIL, registry.tokenSecret);
    res.status(201).json({ token, email: MANAGER_EMAIL });
  });

  app.post('/api/manager/login', (req: Request, res: Response) => {
    const body = req.body as { email?: string; password?: string };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const registry = ensureRegistryFile();
    if (!registry.managerAuth) {
      res.status(400).json({ error: 'Manager access is not configured yet.' });
      return;
    }

    if (email !== MANAGER_EMAIL || !verifyManagerPassword(password, registry.managerAuth)) {
      res.status(401).json({ error: 'Invalid manager credentials.' });
      return;
    }

    const token = signManagerToken(MANAGER_EMAIL, registry.tokenSecret);
    res.json({ token, email: MANAGER_EMAIL });
  });

  // --- Easy Clinic Manager Protected Subscription Controls ---
  app.get('/api/manager/subscriptions', requireManagerAuth, (_req: Request, res: Response) => {
    const registry = ensureRegistryFile();
    const list = [...registry.subscriptions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((s) => ({
        id: s.id,
        fullName: s.fullName,
        status: s.status,
        adminMessage: s.adminMessage,
        adminMessageUpdatedAt: s.adminMessageUpdatedAt,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
      }));

    const activeCount = list.filter((s) => s.status === 'active').length;
    const suspendedCount = list.filter((s) => s.status === 'suspended').length;

    res.json({
      totalCount: list.length,
      activeCount,
      suspendedCount,
      subscriptions: list,
    });
  });

  app.patch(
    '/api/manager/subscriptions/:id/status',
    requireManagerAuth,
    (req: Request, res: Response) => {
      const id = (req.params.id || '').trim();
      const body = req.body as { status?: 'active' | 'suspended' };

      const registry = ensureRegistryFile();
      const sub = registry.subscriptions.find((s) => s.id === id);
      if (!sub) {
        res.status(404).json({ error: 'Subscription account not found' });
        return;
      }

      const nextStatus: 'active' | 'suspended' =
        body.status === 'active' || body.status === 'suspended'
          ? body.status
          : sub.status === 'active'
          ? 'suspended'
          : 'active';

      sub.status = nextStatus;
      saveRegistry(registry);

      res.json({
        id: sub.id,
        fullName: sub.fullName,
        status: sub.status,
      });
    }
  );

  app.post(
    '/api/manager/subscriptions/:id/message',
    requireManagerAuth,
    (req: Request, res: Response) => {
      const id = (req.params.id || '').trim();
      const body = req.body as { message?: string };
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      if (!message) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const registry = ensureRegistryFile();
      const sub = registry.subscriptions.find((s) => s.id === id);
      if (!sub) {
        res.status(404).json({ error: 'Subscription account not found' });
        return;
      }

      sub.adminMessage = message;
      sub.adminMessageUpdatedAt = new Date().toISOString();
      saveRegistry(registry);

      res.json({
        id: sub.id,
        adminMessage: sub.adminMessage,
        adminMessageUpdatedAt: sub.adminMessageUpdatedAt,
      });
    }
  );

  app.delete(
    '/api/manager/subscriptions/:id/message',
    requireManagerAuth,
    (req: Request, res: Response) => {
      const id = (req.params.id || '').trim();
      const registry = ensureRegistryFile();
      const sub = registry.subscriptions.find((s) => s.id === id);
      if (!sub) {
        res.status(404).json({ error: 'Subscription account not found' });
        return;
      }

      sub.adminMessage = '';
      sub.adminMessageUpdatedAt = null;
      saveRegistry(registry);

      res.json({ id: sub.id, cleared: true });
    }
  );

  // --- Vite Dev Middleware / Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Easy clinic server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
