import React, { useState, useEffect } from 'react';
import { Route } from 'react-router-dom';
import Login from './views/login/login.jsx';
import Fulllayout from './layouts/fulllayout.jsx';

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
    const [session, setSession] = useState(loadSession);

    useEffect(() => {
        if (session) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
            fetch('/set-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session),
            }).catch(() => {});
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [session]);

    if (!session) {
        return <Login onLogin={setSession} />;
    }

    return (
        <Route
            render={(props) => (
                <Fulllayout
                    {...props}
                    session={session}
                    onLogout={() => setSession(null)}
                />
            )}
        />
    );
};

export default App;
