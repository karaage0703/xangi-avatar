import { defineConfig } from 'vite';
import { createAvatarProxy } from './server/proxy.mjs';

export default defineConfig({
  root: 'src',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 1420, strictPort: true },
  plugins: [{
    name: 'xangi-avatar-proxy',
    configureServer(server) {
      const proxy = createAvatarProxy();
      server.middlewares.use((request, response, next) => void proxy(request, response, next));
    },
  }],
  clearScreen: false,
});
