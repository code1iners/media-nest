/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Media Nest API base URL. */
  readonly VITE_MEDIA_NEST_API_BASE_URL?: string;
}

interface ImportMeta {
  /** Vite environment variables. */
  readonly env: ImportMetaEnv;
}
