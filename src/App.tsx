import type { DataPort } from './ports/data-port';
import { AppShell } from './ui/AppShell';
import { DataPortProvider } from './ui/data-port-context';
import { HeatmapPage } from './ui/HeatmapPage';
import { BatchEntryPage } from './ui/BatchEntryPage';
import { ProductsPage } from './ui/ProductsPage';
import { useUrlState } from './ui/use-url-state';

/**
 * 组合根。URL 状态在这里只初始化一次，再传给 AppShell，
 * 这样顶栏页签和页面切换读的是同一份状态，不会出现「点页签切了但页面没动」。
 */
export function App({ port }: { readonly port: DataPort }) {
  const url = useUrlState();
  const page =
    url.params.page === 'batch' ? (
      <BatchEntryPage />
    ) : url.params.page === 'manage' ? (
      <ProductsPage />
    ) : (
      <HeatmapPage />
    );

  return (
    <DataPortProvider port={port}>
      <AppShell url={url}>{page}</AppShell>
    </DataPortProvider>
  );
}
