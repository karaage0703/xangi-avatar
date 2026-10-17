import { defineConfig } from 'vite';
import { createAvatarAccess } from './server/access.mjs';
import { createAvatarProxy } from './server/proxy.mjs';

function installProxy(server) {
  const allow = createAvatarAccess();
  const proxy = createAvatarProxy();
  server.middlewares.use((request, response, next) => {
    if (allow(request, response)) void proxy(request, response, next);
  });
}

export default defineConfig({
  root: 'src',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 1420, strictPort: true, allowedHosts: process.env.AVATAR_PUBLIC_URL ? [new URL(process.env.AVATAR_PUBLIC_URL).hostname] : [] },
  preview: { host: '127.0.0.1', allowedHosts: process.env.AVATAR_PUBLIC_URL ? [new URL(process.env.AVATAR_PUBLIC_URL).hostname] : [] },
  plugins: [{
    name: 'xangi-avatar-proxy',
    configureServer: installProxy,
    configurePreviewServer: installProxy,
  }],
  clearScreen: false,
});
