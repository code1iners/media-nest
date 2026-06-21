import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { registerServiceWorker } from './pwa/register-service-worker';
import './styles/global.css';

/** React application root element. */
const rootElement = document.querySelector('#root');

if (!rootElement) {
  throw new Error('Root element was not found.');
}

registerServiceWorker();

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
