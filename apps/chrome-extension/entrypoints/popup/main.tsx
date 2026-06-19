import React from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from '../../src/app/popup-app';
import './style.css';

/** React popup root element. */
const rootElement = document.querySelector('#root');

if (!rootElement) {
  throw new Error('Popup root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
