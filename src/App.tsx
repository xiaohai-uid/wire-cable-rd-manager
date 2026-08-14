import type { DataPort } from './ports/data-port';
import { AppShell } from './ui/AppShell';
import { DataPortProvider } from './ui/data-port-context';
import { HeatmapPage } from './ui/HeatmapPage';

export function App({ port }: { readonly port: DataPort }) {
  return (
    <DataPortProvider port={port}>
      <AppShell>
        <HeatmapPage />
      </AppShell>
    </DataPortProvider>
  );
}
