import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from '@/components/ui/toast';
import './index.css';

// 開發模式下自動清理舊 Service Worker 與快取，杜絕快取殘留造成的執行期錯誤
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name);
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
