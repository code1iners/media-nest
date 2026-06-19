import { defineConfig } from 'wxt';

/** WXT extension configuration. */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'MyTube Extract',
    description: 'YouTube 영상을 오디오 또는 비디오로 추출하는 보조 도구입니다.',
    permissions: ['storage', 'activeTab', 'downloads'],
    host_permissions: ['<all_urls>'],
  },
});
