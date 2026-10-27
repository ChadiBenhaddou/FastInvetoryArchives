import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatDateTime, location } from '../lib/format';
import { BoxStatusBadge, Code, ImageViewer } from '../components/common';
import CodeCheck from '../components/CodeCheck';
import DocumentForm, { fromForm, toForm } from '../components/DocumentForm';

export default function BoxDetailPage() {
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const [box, setBox] = useState(null);
    const [form, setForm] = useState(null);
    const [message, setMessage] = useState(null);

    const load = () => api(`boxes/${id}`).then((res) => setBox(res.data));
    useEffect(() => {
        load();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const docs = box ? box.images.filter((i) => i.type === 'document') : [];
    const selected = docs.find((d) => String(d.id) === params.get('image')) ?? null;

    useEffect(() => {
        setForm(selected?.document ? toForm(selected.document) : null);
        setMessage(null);
    }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    async function save() {
        try {
            await api(`documents/${selected.document.id}`, { method: 'PUT', body: fromForm(form) });
            setMessage('Correction enregistrée.');
            load();
        } catch (err) {
            setMessage(Object.values(err.errors ?? {}).flat()[0] || err.message);
        }
    }

    if (!box) return <p>Chargement…</p>;

    return (
        <div className="space-y-5">
            <Link to="/boxes" className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft className="size-4" /> Boîtes</Link>

            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
                <CodeCheck box={box} onCorrected={() => load()} />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <dt className="text-stone-500">Statut</dt><dd><BoxStatusBadge status={box.status} /></dd>
                    <dt className="text-stone-500">Emplacement</dt><dd>{location(box)}</dd>
                    <dt className="text-stone-500">Agent · appareil</dt><dd>{box.agent_name ?? '—'} · {box.device}</dd>
                    <dt className="text-stone-500">Créée / fermée</dt><dd>{formatDateTime(box.created_on_phone_at)} → {formatDateTime(box.closed_at)}</dd>
                    <dt className="text-stone-500">Import</dt><dd>n° {box.import_id ?? '—'}</dd>
                </dl>
                {box.pending_conflicts > 0 && (
                    <Link to="/conflicts" className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <AlertTriangle className="size-4" /> Conflit en attente pour ce code
                    </Link>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {docs.map((d) => (
                    <button key={d.id} onClick={() => setParams({ image: d.id })}
                        className={`overflow-hidden rounded-lg bg-white text-left shadow-sm ring-2 ${selected?.id === d.id ? 'ring-amber-500' : 'ring-transparent'}`}>
                        <img key={d.thumb_url} src={d.thumb_url} alt="" className="aspect-[3/4] w-full bg-stone-100 object-contain" loading="lazy" />
                        <div className="space-y-0.5 p-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-stone-500">n° {d.sequence}</span>
                                {d.document?.reviewed_at ? <CheckCircle2 className="size-4 text-green-600" /> : d.document?.needs_review && <AlertTriangle className="size-4 text-amber-500" />}
                            </div>
                            <div className="truncate font-medium">{d.document?.doc_type ?? (d.ocr_status === 'done' ? '—' : 'en traitement…')}</div>
                            <div className="truncate" dir="auto">{d.document?.title ?? ''}</div>
                            <div className="text-stone-500">{formatDate(d.document?.doc_date)}</div>
                        </div>
                    </button>
                ))}
            </div>

            {selected && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <ImageViewer src={selected.url} className="h-[70vh]" />
                    <div className="flex h-[70vh] flex-col rounded-xl bg-white shadow-sm">
                        <div className="flex-1 overflow-y-auto p-4">
                            {form ? <DocumentForm doc={selected.document} form={form} setForm={setForm} /> : <p>Photo pas encore traitée.</p>}
                        </div>
                        {form && (
                            <div className="flex items-center gap-2 border-t border-stone-100 p-3">
                                <span className="flex-1 text-sm text-green-700">{message}</span>
                                <button onClick={save} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">Enregistrer la correction</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {!docs.length && <p className="text-stone-500">Cette boîte ne contient que la photo du code <Code>{box.code}</Code>.</p>}
        </div>
    );
}
