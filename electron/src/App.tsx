import React, { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router';
import Login from './views/login/login';
import { createAppRouter } from './routes/index';
import { setSession } from './api/client';

const STORAGE_KEY = 'posmobi_session';

interface Session {
  token: string;
  tenant_uuid: string;
  tenant_pk: number;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const App = () => {
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const saved = loadSession();
      if (saved) {
        try {
          await setSession(saved);
        } catch {
          /* ignora erro de sincronizacao */
        }
        if (!active) return;
        setSessionState(saved);
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (data: Session) => {
    try {
      await setSession(data);
    } catch {
      /* garante que o dashboard tenta mesmo se falhar */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSessionState(data);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.electronAPI.logout?.().catch(() => {});
    setSessionState(null);
  };

  if (!ready || !session) {
    return <Login onLogin={handleLogin} />;
  }

  return <RouterProvider router={createAppRouter({ onLogout: handleLogout })} />;
};

export default App;
