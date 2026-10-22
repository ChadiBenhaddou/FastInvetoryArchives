import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';

const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY'.split('');

function gapText(gaps) {
    if (!gaps.length) return null;
    return gaps.map((g) => (g.count === 1 ? g.first_code : `${g.first_code} → ${g.last_code} (${g.count})`)).join(', ');
}

/** Phones and their letters. (PIN generation comes with the full device page.) */
export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [form, setForm] = useState({ letter: '', label: '' });
    const [error, setError] = useState(null);

    const load = () => api('devices').then((res) => setDevices(res.data));
    useEffect(() => {
        load();
    }, []);

    const used = new Set(devices.map((d) => d.letter));
    const free = ALPHABET.filter((l) => !used.has(l));

    async function create(e) {
        e.preventDefault();
        setError(null);
        try {
            await api('devices', { method: 'POST', body: form });
            setForm({ letter: '', label: '' });
            load();
        } catch (err) {
            setError(Object.values(err.errors).flat()[0] || err.message);
        }
    }

    async function toggle(device) {
        await api(`devices/${device.id}`, { method: 'PUT', body: { is_active: !device.is_active } });
        load();
    }

    const input = 'rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Appareils</h1>
            <p className="text-sm text-stone-600">
                Chaque téléphone reçoit une lettre unique, saisie lors de sa configuration. Un export n'est importé que si sa lettre est enregistrée ici.
            </p>

            <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-5 shadow-sm">
                <select className={`${input} font-mono`} value={form.letter} onChange={(e) => setForm({ ...form, letter: e.target.value })}>
                    <option value="">Lettre…</option>
                    {free.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <input className={`${input} w-72`} placeholder="Nom (ex. Téléphone salle 2 — Samsung A15)" value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })} />
                <button disabled={!form.letter || !form.label} className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                    <Plus className="size-4" /> Enregistrer
                </button>
                {error && <p className="w-full text-sm text-red-700">{error}</p>}
            </form>

            <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                    <tr>
                        <th className="px-4 py-3 font-medium">Lettre</th>
                        <th className="px-4 py-3 font-medium">Nom</th>
                        <th className="px-4 py-3 font-medium">Boîtes reçues</th>
                        <th className="px-4 py-3 font-medium">Dernier n° reçu / émis</th>
                        <th className="px-4 py-3 font-medium">Numéros non reçus</th>
                        <th className="px-4 py-3" />
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {devices.map((d) => (
                        <tr key={d.id} className={d.is_active ? '' : 'text-stone-400'}>
                            <td className="px-4 py-3 font-mono text-lg font-bold">{d.letter}</td>
                            <td className="px-4 py-3">{d.label}</td>
                            <td className="px-4 py-3">{d.box_count}</td>
                            <td className="px-4 py-3">{d.last_sequence_seen} / {d.last_sequence_issued}
                                {d.open_sequences.length > 0 && <span className="text-stone-500"> (en cours sur le téléphone : {d.open_sequences.join(', ')})</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-amber-700">{gapText(d.gaps) ?? <span className="font-sans text-stone-400">aucun</span>}</td>
                            <td className="px-4 py-3 text-right">
                                <button onClick={() => toggle(d)} className="text-amber-700 hover:underline">{d.is_active ? 'Désactiver' : 'Réactiver'}</button>
                            </td>
                        </tr>
                    ))}
                    {!devices.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-stone-500">Aucun appareil enregistré.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
