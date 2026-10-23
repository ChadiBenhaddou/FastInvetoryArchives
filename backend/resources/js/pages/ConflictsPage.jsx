import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Code, inputClass } from '../components/common';

function PhotoStrip({ title, side }) {
    return (
        <section className="space-y-2">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-stone-500">
                {side.location?.join(' · ') || 'emplacement inconnu'} · {side.agent_name ?? '—'} · {formatDateTime(side.created_on_phone_at)}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
                {side.photos.map((p) => (
                    <a key={p.sequence} href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                        <img src={p.thumb_url} alt="" className={`h-40 rounded object-cover ${p.type === 'code_photo' ? 'ring-2 ring-amber-500' : ''}`} />
                    </a>
                ))}
            </div>
        </section>
    );
}

/** Admin: a box code received twice with different photos. */
export default function ConflictsPage() {
    const [list, setList] = useState([]);
    const [current, setCurrent] = useState(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);

    const load = () => api('conflicts').then((res) => setList(res.data));
    useEffect(() => {
        load();
    }, []);

    async function open(id) {
        setError(null);
        setCode('');
        setCurrent((await api(`conflicts/${id}`)).data);
    }

    async function resolve(action) {
        setError(null);
        try {
            await api(`conflicts/${current.id}/resolve`, { method: 'POST', body: { action, code: code || null } });
            setCurrent(null);
            load();
        } catch (err) {
            setError(Object.values(err.errors ?? {}).flat()[0] || err.message);
        }
    }

    return (
        <div className="space-y-5">
            <h1 className="text-2xl font-semibold">Conflits de codes</h1>
            <p className="text-sm text-stone-600">
                Un même code de boîte a été reçu avec des photos différentes : code réutilisé (téléphone réinstallé) ou mal recopié.
                Comparer les photos du code, puis décider.
            </p>

            {!list.length && <p className="rounded-xl bg-white p-6 text-stone-500 shadow-sm">Aucun conflit en attente.</p>}
            <ul className="divide-y divide-stone-100 rounded-xl bg-white shadow-sm">
                {list.map((c) => (
                    <li key={c.id}>
                        <button onClick={() => open(c.id)} className={`flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-stone-50 ${current?.id === c.id ? 'bg-amber-50' : ''}`}>
                            <Code className="text-base">{c.code}</Code>
                            <span>{c.existing_photos} photo(s) au PC · {c.incoming_photos} reçue(s)</span>
                            <span className="text-stone-500">import n° {c.import_id} ({c.import_file})</span>
                            <span className="ms-auto text-stone-500">{formatDateTime(c.created_at)}</span>
                        </button>
                    </li>
                ))}
            </ul>

            {current && (
                <div className="space-y-5 rounded-xl bg-white p-5 shadow-sm">
                    <PhotoStrip title={<>Déjà au PC : <Link className="text-amber-800 underline" to={`/boxes/${current.existing?.id}`}><Code>{current.code}</Code></Link></>} side={current.existing} />
                    <PhotoStrip title="Reçu dans le nouvel import" side={current.incoming} />

                    <div className="grid gap-3 md:grid-cols-3">
                        <button onClick={() => resolve('keep_existing')} className="rounded-lg border border-stone-300 p-3 text-left text-sm hover:bg-stone-50">
                            <strong>Garder l'existant</strong><br />Les photos reçues sont un doublon ou une erreur : elles sont supprimées.
                        </button>
                        <div className="rounded-lg border border-stone-300 p-3 text-sm">
                            <strong>Nouvelle boîte</strong><br />Les photos reçues sont une autre boîte dont le code a été mal écrit :
                            <input placeholder="Bon code (ex. A-0124-F)" className={`${inputClass} mt-2 w-full font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} />
                            <button onClick={() => resolve('new_box')} disabled={!code} className="mt-2 w-full rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-40">Créer la boîte</button>
                        </div>
                        <button onClick={() => window.confirm('Remplacer les photos de la boîte par celles reçues ? (les anciennes sont conservées à part)') && resolve('replace')}
                            className="rounded-lg border border-stone-300 p-3 text-left text-sm hover:bg-stone-50">
                            <strong>Remplacer</strong><br />Les photos reçues sont les bonnes : elles remplacent celles de la boîte (les anciennes sont mises de côté).
                        </button>
                    </div>
                    {error && <p className="text-sm text-red-700">{error}</p>}
                </div>
            )}
        </div>
    );
}
