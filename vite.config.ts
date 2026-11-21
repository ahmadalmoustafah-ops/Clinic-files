import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function collectHashInputs(dir: string, excludedFiles: Set<string>, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHashInputs(fullPath, excludedFiles, out);
    } else if (entry.isFile()) {
      const rel = path.relative(__dirname, fullPath).replace(/\\/g, '/');
      if (!excludedFiles.has(rel)) {
        out.push(fullPath);
      }
    }
  }
}

function computeUserBuildId(): string {
  const hash = crypto.createHash('sha256');
  const excluded = new Set(['src/components/ManagerDashboard.tsx']);
  const files: string[] = [];

  for (const rootFile of ['index.html', 'package.json']) {
    const full = path.resolve(__dirname, rootFile);
    if (fs.existsSync(full)) files.push(full);
  }
  collectHashInputs(path.resolve(__dirname, 'src'), excluded, files);

  for (const filePath of files) {
    const rel = path.relative(__dirname, filePath).replace(/\\/g, '/');
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function appVersionPlugin(buildId: string, userBuildId: string): Plugin {
  const payload = JSON.stringify({
    buildId,
    userBuildId,
    updatedAt: new Date().toISOString(),
  });

  return {
    name: 'easy-clinic-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

export default defineConfig(() => {
  const buildId = String(Date.now());
  const userBuildId = computeUserBuildId();

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __USER_BUILD_ID__: JSON.stringify(userBuildId),
    },
    plugins: [
      react(),
      tailwindcss(),
      appVersionPlugin(buildId, userBuildId),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'Easy clinic',
          short_name: 'Easy clinic',
          description: 'Easy clinic - نظام أندرويد متكامل لإدارة العيادات الطبية والسجلات السريرية بدون إنترنت',
          theme_color: '#0284c7',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/version.json'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/version\.json(\?.*)?$/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
