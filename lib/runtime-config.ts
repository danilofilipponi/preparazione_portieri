export type KeeperLabRuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  baseUrl?: string;
  assetUrl?: string;
  slug?: string;
  wordpress?: boolean;
  hashRouting?: boolean;
};

declare global {
  interface Window {
    KEEPERLAB_CONFIG?: KeeperLabRuntimeConfig;
  }
}

export function getKeeperLabRuntimeConfig(): KeeperLabRuntimeConfig {
  return typeof window === "undefined" ? {} : window.KEEPERLAB_CONFIG ?? {};
}

export function isWordPressRuntime() {
  return getKeeperLabRuntimeConfig().wordpress === true;
}
