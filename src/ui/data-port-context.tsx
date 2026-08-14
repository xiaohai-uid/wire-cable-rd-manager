import { createContext, useContext, type ReactNode } from 'react';
import type { DataPort } from '../ports/data-port';

/**
 * UI 只通过这个 context 拿数据端口，永远不 import 具体适配器（ADR 0002）。
 * 换适配器是在 main.tsx 里换一行，界面代码一个字都不用动。
 */
const DataPortContext = createContext<DataPort | null>(null);

export function DataPortProvider({
  port,
  children,
}: {
  readonly port: DataPort;
  readonly children: ReactNode;
}) {
  return <DataPortContext.Provider value={port}>{children}</DataPortContext.Provider>;
}

export function useDataPort(): DataPort {
  const port = useContext(DataPortContext);
  if (!port) throw new Error('useDataPort 必须在 DataPortProvider 内部使用');
  return port;
}
