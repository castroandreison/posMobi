import React, { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router';
import Login from './views/login/login.jsx';
import { createAppRouter } from './routes/index.jsx';
import { setSession } from './api/client.js';

const STORAGE_KEY = 'posmobi_session';

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

const App = () => {
  const [session, setSessionState] = useState(loadSession);

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setSession(session).catch(() => {});
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  const handleLogout = () => setSessionState(null);

  if (!session) {
    return <Login onLogin={setSessionState} />;
  }

  return <RouterProvider router={createAppRouter({ onLogout: handleLogout })} />;
};

export default App;