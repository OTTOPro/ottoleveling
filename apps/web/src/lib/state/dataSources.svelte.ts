import { getDataSourcesStatus, disconnectDataSource } from '$lib/api/client';
import { API_BASE } from '$lib/config/env';
import type { DataSourceRow, ProviderName } from '$lib/api/types';

/**
 * Singleton state store for the /system [ DATA SOURCES ] section. Backs
 * <DataSourceCard> entries. `connect()` redirects the browser to the OAuth
 * authorize endpoint (no JSON round-trip); `disconnect()` deletes the row
 * and reloads.
 */
class DataSourcesState {
  dataSources = $state<DataSourceRow[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.dataSources = await getDataSourcesStatus();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Initiates OAuth by redirecting the browser to the authorize endpoint.
   * Returns void (the redirect navigates away from the SPA).
   */
  connect(provider: ProviderName): void {
    window.location.href = `${API_BASE}/api/data-sources/${provider}/authorize`;
  }

  async disconnect(provider: ProviderName): Promise<void> {
    try {
      await disconnectDataSource(provider);
      await this.load();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  byProvider(provider: ProviderName): DataSourceRow | undefined {
    return this.dataSources.find((d) => d.provider === provider);
  }
}

export const dataSourcesState = new DataSourcesState();
