export {};

declare global {
  interface Window {
    electronAPI: {
      login: (email: string, password: string) => Promise<Record<string, unknown>>;
      setSession: (session: { token: string; tenant_uuid: string; tenant_pk: number }) => Promise<{ ok: boolean }>;
      logout: () => Promise<{ ok: boolean }>;
      isOnline: () => Promise<boolean>;
      health: () => Promise<Record<string, unknown>>;
      proxyGet: (path: string, params?: Record<string, unknown>) => Promise<unknown>;
      proxyPost: (path: string, body?: unknown) => Promise<unknown>;
      proxyPut: (path: string, body?: unknown) => Promise<unknown>;
      proxyDelete: (path: string) => Promise<unknown>;
      getLocalLogs: () => Promise<string>;
      getCloudLogs: (tenant: string) => Promise<string>;
      downloadLogs: (tenant: string) => Promise<string>;
      getFirmware: () => Promise<{ blocks: unknown[]; modelLinks: Record<string, string> }>;
      saveFirmware: (blocks: unknown[], modelLinks: Record<string, string>) => Promise<Record<string, unknown>>;
      deleteFirmwareBlock: (blockId: string) => Promise<Record<string, unknown>>;
      getFirmwareHistory: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
      getConfig: () => Promise<{ email: string; baseUrl: string; loaded: boolean; error: string | null }>;
    };
  }
}
