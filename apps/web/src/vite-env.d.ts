/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** MyTube Extract API base URL. */
  readonly VITE_MYTUBE_EXTRACT_API_BASE_URL?: string;
  /** 이전 Media Nest API base URL fallback. */
  readonly VITE_MEDIA_NEST_API_BASE_URL?: string;
}

interface ImportMeta {
  /** Vite environment variables. */
  readonly env: ImportMetaEnv;
}
