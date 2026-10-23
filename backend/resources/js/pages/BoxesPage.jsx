import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateTime, location } from '../lib/format';
import { BOX_STATUS, BoxStatusBadge, Code, Pagination, inputClass } from '../components/common';
import { useAuth } from '../auth/AuthContext';

const FILTERS = ['status', 'agent', 'device', 'room', 'from', 'to', 'code'];

export default function BoxesPage() {
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const [boxes, setBoxes] = useState({ data: [], meta: null });
    const [options, setOptions] = useState({ agents: [], rooms: [], devices: [], statuses: {} });

    useEffect(() => {
        api('boxes/filters').then(setOptions);
    }, []);
    useEffect(() => {
        api(`boxes?${params.toString()}`).then(setBoxes);
    }, [params]);

    const set = (key) => (e) => {
        const next = new URLSearchParams(params);
        e.target.value ? next.set(key, e.target.value) : next.delete(key);
        next.delete('page');
        setParams(next);
    };
    const value = (k) => params.get(k) ?? '';

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Boîtes</h1>
                {user.role === 'admin' && (
                    <div className="flex gap-2 text-sm">
                        <a href="/api/export?format=xlsx" className="flex items-center gap-2 rounded-md bg-green-700 px-3 py-2 font-medium text-white hover:bg-green-800">
                            <FileSpreadsheet className="size-4" /> Inventaire Excel
                        </a>
                        <a href="/api/export?format=csv&sheet=boxes" className="rounded-md bg-white px-3 py-2 shadow-sm hover:bg-stone-50">CSV boîtes</a>
                        <a href="/api/export?format=csv&sheet=documents" className="rounded-md bg-white px-3 py-2 shadow-sm hover:bg-stone-50">CSV documents</a>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl bg-white p-4 shadow-sm">
                <input placeholder="Code (A-0123…)" className={`${inputClass} w-36 font-mono`} value={value('code')} onChange={set('code')} />
                <select className={inputClass} value={value('status')} onChange={set('status')}>
                    <option value="">Tous statuts</option>
                    {Object.entries(BOX_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label} ({options.statuses[k] ?? 0})</option>)}
                </select>
                <select className={inputClass} value={value('agent')} onChange={set('agent')}>
                    <option value="">Tous agents</option>
                    {options.agents.map((a) => <option key={a}>{a}</option>)}
                </select>
                <select className={inputClass} value={value('device')} onChange={set('device')}>
                    <option value="">Tous appareils</option>
                    {options.devices.map((d) => <option key={d}>{d}</option>)}
                </select>
                <select className={inputClass} value={value('room')} onChange={set('room')}>
                    <option value="">Toutes salles</option>
                    {options.rooms.map((r) => <option key={r}>{r}</option>)}
                </select>
                <label className="flex items-center gap-1 text-sm text-stone-500">du <input type="date" className={inputClass} value={value('from')} onChange={set('from')} /></label>
                <label className="flex items-center gap-1 text-sm text-stone-500">au <input type="date" className={inputClass} value={value('to')} onChange={set('to')} /></label>
                {FILTERS.some((f) => params.get(f)) && (
                    <button onClick={() => setParams({})} className="text-sm text-amber-700 hover:underline">Effacer les filtres</button>
                )}
            </div>

            <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                    <tr>
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">Statut</th>
                        <th className="px-3 py-2 font-medium">Emplacement</th>
                        <th className="px-3 py-2 font-medium">Agent · appareil</th>
                        <th className="px-3 py-2 font-medium">Photos</th>
                        <th className="px-3 py-2 font-medium">À réviser</th>
                        <th className="px-3 py-2 font-medium">Créée le</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {boxes.data.map((b) => (
                        <tr key={b.id} className="hover:bg-stone-50">
                            <td className="px-3 py-2"><Link to={`/boxes/${b.id}`} className="text-amber-800 hover:underline"><Code>{b.code}</Code></Link></td>
                            <td className="px-3 py-2"><BoxStatusBadge status={b.status} /></td>
                            <td className="px-3 py-2">{location(b)}</td>
                            <td className="px-3 py-2">{b.agent_name ?? '—'} · {b.device}</td>
                            <td className="px-3 py-2">{b.photo_count}</td>
                            <td className="px-3 py-2">{b.to_review_count ? <span className="font-medium text-amber-700">{b.to_review_count}</span> : '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(b.created_on_phone_at)}</td>
                        </tr>
                    ))}
                    {!boxes.data.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">Aucune boîte.</td></tr>}
                </tbody>
            </table>
            <Pagination meta={boxes.meta} onPage={(p) => { const n = new URLSearchParams(params); n.set('page', p); setParams(n); }} />
        </div>
    );
}
