import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from '../../src/app/popup-app';
import { applyTheme, getThemePreference } from '../../src/shared/theme-preference';
import { installDevPreviewChromeApi } from './dev-preview-chrome-api';
import './style.css';

installDevPreviewChromeApi();

/** React popup root element. */
const rootElement = document.querySelector('#root');

// 첫 popup paint 전에 semantic token이 참조할 theme를 정한다.
applyTheme(getThemePreference());

if (!rootElement) {
  throw new Error('Popup root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
