import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { MemoryAdapter } from './adapters/memory-adapter';
import { HttpAdapter } from './adapters/http-adapter';
import type { DataPort } from './ports/data-port';

/**
 * 适配器在这里选定，且只在这里 —— 界面代码不认识任何具体适配器。
 *
 * 构建时由环境变量决定用哪个（ADR 0002 / 工单 06）：
 * - 默认（含 GitHub Pages 在线 demo）：MemoryAdapter，数据在内存里，刷新即还原；
 * - `VITE_DATA_MODE=local`：HttpAdapter，打到本地 Hono + SQLite，数据真正落盘。
 */
const dataMode = import.meta.env.VITE_DATA_MODE;
const port: DataPort =
  dataMode === 'local'
    ? new HttpAdapter({
        baseUrl: import.meta.env.VITE_API_BASE ?? 'http://localhost:8787/api',
      })
    : new MemoryAdapter();

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App port={port} />
  </StrictMode>,
);
