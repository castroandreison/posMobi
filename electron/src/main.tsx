import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: '#18181b',
          border: '1px solid #3f3f46',
          color: '#fafafa',
        },
      }}
    />
  </React.StrictMode>
);
