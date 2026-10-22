import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    // undefined = still checking the session, null = logged out
    const [user, setUser] = useState(undefined);

    useEffect(() => {
        setUnauthorizedHandler(() => setUser(null));
        api('auth/me')
            .then((res) => setUser(res.data))
            .catch(() => setUser(null));
    }, []);

    const login = useCallback(async (username, password) => {
        const res = await api('auth/login', { method: 'POST', body: { username, password } });
        setUser(res.data);
    }, []);

    const logout = useCallback(async () => {
        await api('auth/logout', { method: 'POST' }).catch(() => {});
        setUser(null);
    }, []);

    return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
