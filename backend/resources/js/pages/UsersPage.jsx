import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

const ROLES = { admin: 'Administrateur', reviewer: 'Réviseur' };
const EMPTY = { name: '', username: '', password: '', role: 'reviewer' };

export default function UsersPage() {
    const { user: me } = useAuth();
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState(EMPTY);
    const [formError, setFormError] = useState(null);
    const [rowError, setRowError] = useState(null);

    const load = () => api('users').then((res) => setUsers(res.data));
    useEffect(() => {
        load();
    }, []);

    async function create(e) {
        e.preventDefault();
        setFormError(null);
        try {
            await api('users', { method: 'POST', body: form });
            setForm(EMPTY);
            load();
        } catch (err) {
            setFormError(Object.values(err.errors).flat()[0] || err.message);
        }
    }

    async function update(user, changes) {
        setRowError(null);
        try {
            await api(`users/${user.id}`, { method: 'PUT', body: changes });
            load();
        } catch (err) {
            setRowError(Object.values(err.errors).flat()[0] || err.message);
        }
    }

    function resetPassword(user) {
        const password = window.prompt(`Nouveau mot de passe pour ${user.username} (8 caractères minimum) :`);
        if (password) update(user, { password });
    }

    const input = 'rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Utilisateurs</h1>

            <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-5 shadow-sm">
                <input className={input} placeholder="Nom complet" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className={input} placeholder="Identifiant" value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })} />
                <input className={input} type="password" placeholder="Mot de passe" autoComplete="new-password"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {Object.entries(ROLES).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                </select>
                <button className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                    <UserPlus className="size-4" /> Ajouter
                </button>
                {formError && <p className="w-full text-sm text-red-700">{formError}</p>}
            </form>

            {rowError && <p className="text-sm text-red-700">{rowError}</p>}

            <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                    <tr>
                        <th className="px-4 py-3 font-medium">Nom</th>
                        <th className="px-4 py-3 font-medium">Identifiant</th>
                        <th className="px-4 py-3 font-medium">Rôle</th>
                        <th className="px-4 py-3 font-medium">Dernière connexion</th>
                        <th className="px-4 py-3 font-medium">Statut</th>
                        <th className="px-4 py-3" />
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {users.map((u) => (
                        <tr key={u.id} className={u.is_active ? '' : 'text-stone-400'}>
                            <td className="px-4 py-3">{u.name}</td>
                            <td className="px-4 py-3 font-mono">{u.username}</td>
                            <td className="px-4 py-3">
                                <select value={u.role} disabled={u.id === me.id} className="bg-transparent"
                                    onChange={(e) => update(u, { role: e.target.value })}>
                                    {Object.entries(ROLES).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </td>
                            <td className="px-4 py-3">{formatDateTime(u.last_login_at)}</td>
                            <td className="px-4 py-3">{u.is_active ? 'Actif' : 'Désactivé'}</td>
                            <td className="space-x-3 px-4 py-3 text-right">
                                <button className="text-amber-700 hover:underline" onClick={() => resetPassword(u)}>
                                    Mot de passe
                                </button>
                                {u.id !== me.id && (
                                    <button className="text-amber-700 hover:underline"
                                        onClick={() => update(u, { is_active: !u.is_active })}>
                                        {u.is_active ? 'Désactiver' : 'Réactiver'}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
