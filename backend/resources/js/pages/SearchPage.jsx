import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MapPin, Search } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Code, Highlight, inputClass } from '../components/common';

const FILTER_KEYS = ['box', 'doc_type', 'year_from', 'year_to', 'room', 'agent'];

function Facet({ label, values, value, onChange }) {
    const entries = Object.entries(values ?? {}).sort((a, b) => b[1] - a[1]);
    return (
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{label}</option>
            {entries.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
        </select>
    );
}

export default function SearchPage() {
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState(params.get('q') ?? '');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setError(null);
        api(`search?${params.toString()}`).then(setResult).catch((e) => setError(e.message));
    }, [params]);

    const update = (changes) => {
        const next = new URLSearchParams(params);
        Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        next.delete('page');
        setParams(next);
    };
    const value = (k) => params.get(k) ?? '';
    const facets = result?.facets ?? {};
    const years = Object.keys(facets.year ?? {}).map(Number).sort();

    return (
        <div className="space-y-5">
            <h1 className="text-2xl font-semibold">Recherche</h1>

            <form onSubmit={(e) => { e.preventDefault(); update({ q: query.trim() }); }} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
                    <input
                        autoFocus dir="auto" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Mots, nom, référence… en français ou en arabe"
                        className="w-full rounded-xl border border-stone-300 bg-white py-3 pe-4 ps-11 text-lg shadow-sm focus:border-amber-500 focus:outline-none"
                    />
                </div>
                <button className="rounded-xl bg-amber-600 px-6 font-medium text-white hover:bg-amber-700">Chercher</button>
            </form>

            <div className="flex flex-wrap gap-2">
                <input placeholder="Boîte (code)" className={`${inputClass} w-36 font-mono`} value={value('box')} onChange={(e) => update({ box: e.target.value })} />
                <Facet label="Tous les types" values={facets.doc_type} value={value('doc_type')} onChange={(v) => update({ doc_type: v })} />
                <select className={inputClass} value={value('year_from')} onChange={(e) => update({ year_from: e.target.value })}>
                    <option value="">Année de…</option>
                    {years.map((y) => <option key={y}>{y}</option>)}
                </select>
                <select className={inputClass} value={value('year_to')} onChange={(e) => update({ year_to: e.target.value })}>
                    <option value="">…à</option>
                    {years.map((y) => <option key={y}>{y}</option>)}
                </select>
                <Facet label="Toutes les salles" values={facets.room} value={value('room')} onChange={(v) => update({ room: v })} />
                <Facet label="Tous les agents" values={facets.agent_name} value={value('agent')} onChange={(v) => update({ agent: v })} />
                {FILTER_KEYS.some((k) => params.get(k)) && (
                    <button onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))} className="text-sm text-amber-700 hover:underline">Effacer les filtres</button>
                )}
            </div>

            {error && <p className="text-red-700">{error}</p>}
            {result && (
                <p className="text-sm text-stone-500">
                    {result.total} document(s){result.processing_ms !== null && ` · ${result.processing_ms} ms`}
                </p>
            )}

            <ul className="space-y-3">
                {result?.hits.map((hit) => (
                    <li key={hit.id}>
                        <Link to={`/boxes/${hit.box_id}?image=${hit.image_id}`} className="flex gap-4 rounded-xl bg-white p-3 shadow-sm hover:ring-2 hover:ring-amber-400">
                            <img src={hit.thumb_url} alt="" loading="lazy" className="h-32 w-24 shrink-0 rounded bg-stone-100 object-contain" />
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                    <Code className="text-base text-amber-800">{hit.box_code}</Code>
                                    <span className="flex items-center gap-1 text-stone-600">
                                        <MapPin className="size-3.5" />
                                        {Object.values(hit.location).join(' · ') || 'emplacement inconnu'}
                                    </span>
                                    {hit.doc_type && <span className="rounded bg-stone-100 px-1.5">{hit.doc_type}</span>}
                                    {hit.doc_date && <span>{formatDate(hit.doc_date)}</span>}
                                    {hit.reference_number && <span className="font-mono"><Highlight text={hit.reference_number} /></span>}
                                    {hit.needs_review && <span className="rounded bg-amber-100 px-1.5 text-amber-800">signalé</span>}
                                </div>
                                {hit.title && <p className="font-medium"><Highlight text={hit.title} /></p>}
                                {hit.snippet && <p className="text-sm leading-relaxed text-stone-600"><Highlight text={hit.snippet} /></p>}
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>

            {result && result.pages > 1 && (
                <div className="flex items-center justify-end gap-3 text-sm">
                    <button disabled={result.page <= 1} onClick={() => { const n = new URLSearchParams(params); n.set('page', result.page - 1); setParams(n); }} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Précédent</button>
                    <span>Page {result.page} / {result.pages}</span>
                    <button disabled={result.page >= result.pages} onClick={() => { const n = new URLSearchParams(params); n.set('page', result.page + 1); setParams(n); }} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Suivant</button>
                </div>
            )}
        </div>
    );
}
