import { useState } from 'react';
import { Navigate } from 'react-router';
import { Archive } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
    const { user, login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    if (user) return <Navigate to="/" replace />;

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await login(username, password);
        } catch (err) {
            setError(err.field?.('username') || err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex min-h-full items-center justify-center p-6">
            <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl bg-white p-8 shadow-sm">
                <div className="flex items-center gap-3">
                    <Archive className="size-8 text-amber-600" />
                    <h1 className="text-xl font-semibold">Inventaire des archives</h1>
                </div>

                <label className="block">
                    <span className="text-sm font-medium text-stone-700">Identifiant</span>
                    <input
                        autoFocus
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
                    />
                </label>

                <label className="block">
                    <span className="text-sm font-medium text-stone-700">Mot de passe</span>
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
                    />
                </label>

                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                <button
                    disabled={busy || !username || !password}
                    className="w-full rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                    {busy ? 'Connexion…' : 'Se connecter'}
                </button>
            </form>
        </div>
    );
}
