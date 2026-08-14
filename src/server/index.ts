import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { openDb, seedIfEmpty } from './db';
import { createApp } from './app';

/**
 * 本地真干活的入口：把 Hono 跑在 Node 上，数据落到 SQLite 文件（默认 ./wire-cable.db）。
 *
 * 同时托管 `dist/` 里构建好的前端，所以 `npm run build && npm run server` 之后，
 * 打开 http://localhost:8787 就是一个完整本地应用，数据刷新不丢。
 *
 * 路由约定（与 HttpAdapter 的 `/api/...` 路径、createApp 里的定义一致）：
 * - API 在 /api/* —— 静态资源与 SPA 回退在 / 下其余路径。
 * - 本服务假定以根路径（/）对外暴露，不做子路径部署（演示站走的是 MemoryAdapter，无后端）。
 *
 * 环境变量：
 * - WIRE_DB  SQLite 文件路径（默认 ./wire-cable.db）
 * - PORT     监听端口（默认 8787）
 */

const dbPath = process.env.WIRE_DB ?? './wire-cable.db';
const port = Number(process.env.PORT ?? 8787);

const db = openDb(dbPath);
seedIfEmpty(db);
const api = createApp(db);

const DIST = resolve(process.cwd(), 'dist');
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// /api 之外（含 SPA 路由）交给静态文件：存在则返回，否则回退到 index.html。
api.get('*', (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith('/api')) {
    return c.json({ code: 'not-found', message: 'not found' }, 404);
  }
  if (!existsSync(DIST)) {
    return c.text('前端尚未构建：请先运行 `npm run build`（dist/ 不存在）。', 503);
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(DIST, rel));
  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA 回退：非文件都给 index.html
    const index = readFileSync(join(DIST, 'index.html'));
    return new Response(index, { headers: { 'content-type': CONTENT_TYPES['.html'] ?? 'text/html; charset=utf-8' } });
  }
  const data = readFileSync(filePath);
  const ct = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
  return new Response(data, { headers: { 'content-type': ct } });
});

const server = serve({ fetch: api.fetch, port }, (info) => {
  console.log(`[wire-cable-rd-manager] 本地服务已启动：http://localhost:${info.port}  (数据库: ${dbPath})`);
});

// 优雅退出
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    process.exit(0);
  });
}

// 暴露给测试 / 程序化调用
export { api, server, db };
