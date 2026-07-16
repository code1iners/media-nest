import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { ErrorBoundary } from './app/components/error-boundary';
import { applyTheme, getThemePreference } from './app/utils/theme-preference.util';
import './styles/global.css';

/** React Query client. */
const queryClient = new QueryClient();

/** React application root element. */
const rootElement = document.querySelector('#root');

// 첫 paint 전에 문서 token을 맞춰 theme 전환 깜빡임을 피한다.
applyTheme(getThemePreference());

if (!rootElement) {
  throw new Error('Root element was not found.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
