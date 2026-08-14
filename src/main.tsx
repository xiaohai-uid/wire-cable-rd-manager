import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { MemoryAdapter } from './adapters/memory-adapter';
import type { DataPort } from './ports/data-port';

/**
 * 适配器在这里选定，且只在这里 —— 界面代码不认识任何具体适配器。
 * 工单 06 会在这里加上 HttpAdapter 分支（由构建时环境变量决定），届时改动只在本文件。
 */
const port: DataPort = new MemoryAdapter();

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App port={port} />
  </StrictMode>,
);
