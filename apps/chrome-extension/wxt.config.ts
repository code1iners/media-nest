import { defineConfig } from 'wxt';

/** 운영 Media Nest API 서버 주소. */
const PRODUCTION_API_BASE_URL = 'https://media-nest.codeliners.cc';

/** 환경 변수 기반 API host permission을 만든다. */
export function createApiHostPermission(
  apiBaseUrl = process.env.WXT_MEDIA_NEST_API_BASE_URL ??
    process.env.MEDIA_NEST_API_BASE_URL ??
    PRODUCTION_API_BASE_URL,
) {
  try {
    /** API 서버 origin. */
    const origin = new URL(apiBaseUrl).origin;

    return `${origin}/*`;
  } catch {
    return `${PRODUCTION_API_BASE_URL}/*`;
  }
}

/** WXT extension configuration. */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'MyTube Extract',
    description: 'YouTube 영상을 오디오 또는 비디오로 추출하는 보조 도구입니다.',
    permissions: ['storage', 'downloads', 'activeTab'],
    host_permissions: [createApiHostPermission()],
  },
});
