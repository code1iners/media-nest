import { defineConfig } from 'wxt';

/** WXT extension configuration. */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Media Chrome Extension',
    description: 'Simple media chrome extension.',
    permissions: ['storage', 'activeTab', 'downloads'],
    host_permissions: ['<all_urls>'],
  },
});
