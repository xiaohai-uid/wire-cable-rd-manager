import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 部署在 /<repo>/ 子路径下，本地开发在根路径。
// 由 DEPLOY_TARGET 环境变量区分（见工单 07）。
const isPages = process.env.DEPLOY_TARGET === 'pages';

export default defineConfig({
  base: isPages ? '/wire-cable-rd-manager/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
