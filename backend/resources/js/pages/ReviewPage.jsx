import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Keyboard, SkipForward } from 'lucide-react';
import { api } from '../lib/api';
import { location } from '../lib/format';
import { ImageViewer } from '../components/common';
import CodeCheck from '../components/CodeCheck';
import DocumentForm, { fromForm, toForm } from '../components/DocumentForm';

/**
 * Review screen, box after box. Keyboard:
 *   Ctrl+Entrée  valider le document et passer au suivant
 *   Ctrl+S       enregistrer sans valider
 *   Alt+← / Alt+→  document précédent / suivant
 */
export default function ReviewPage() {
    const [box, setBox] = useState(undefined); // undefined = loading, null = nothing to review
    const [remaining, setRemaining] = useState(0);
    const [skipped, setSkipped] = useState([]);
    const [index, setIndex] = useState(0);
    const [form, setForm] = useState(null);
    const [message, setMessage] = useState(null);
    const [saving, setSaving] = useState(false);
    const formRef = useRef(form);
    formRef.current = form;

    const docs = box ? box.images.filter((i) => i.type === 'document' && i.document) : [];
    const current = docs[index];

    const loadNext = useCallback(async (skip = skipped) => {
        const res = await api(`review/next?skip=${skip.join(',')}`);
        setRemaining(res.remaining ?? 0);
        setBox(res.data);
        if (res.data) {
            const list = res.data.images.filter((i) => i.type === 'document' && i.document);
            const firstTodo = list.findIndex((i) => !i.document.reviewed_at);
            setIndex(Math.max(0, firstTodo));
        }
    }, [skipped]);

    useEffect(() => {
        loadNext([]);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setForm(current ? toForm(current.document) : null);
    }, [current?.document?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const go = (i) => setIndex(Math.min(docs.length - 1, Math.max(0, i)));

    const save = useCallback(async (approve) => {
        if (!current || saving) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await api(`documents/${current.document.id}`, { method: 'PUT', body: { ...fromForm(formRef.current), approve } });
            const updated = { ...box, images: box.images.map((img) => (img.id === current.id ? { ...img, document: res.data } : img)) };
            setBox(updated);
            if (!approve) {
                setMessage('Enregistré.');
                return;
            }
            const list = updated.images.filter((i) => i.type === 'document' && i.document);
            const next = list.findIndex((i, n) => n > index && !i.document.reviewed_at);
            const anyLeft = list.findIndex((i) => !i.document.reviewed_at);
            if (next >= 0) setIndex(next);
            else if (anyLeft >= 0) setIndex(anyLeft);
            else {
                setMessage(`Boîte ${box.code} terminée.`);
                await loadNext();
            }
        } catch (err) {
            setMessage(Object.values(err.errors ?? {}).flat()[0] || err.message);
        } finally {
            setSaving(false);
        }
    }, [box, current, index, saving, loadNext]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                save(true);
            } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                save(false);
            } else if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                go(index + 1);
            } else if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                go(index - 1);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    async function skipBox() {
        const next = [...skipped, box.id];
        setSkipped(next);
        await loadNext(next);
    }

    async function approveAll() {
        setSaving(true);
        try {
            await api(`boxes/${box.id}/approve`, { method: 'POST' });
            setMessage(`Boîte ${box.code} validée.`);
            await loadNext();
        } finally {
            setSaving(false);
        }
    }

    if (box === undefined) return <p>Chargement…</p>;
    if (box === null) {
        return (
            <div className="space-y-3">
                <h1 className="text-2xl font-semibold">Révision</h1>
                <p className="flex items-center gap-2 rounded-xl bg-white p-6 shadow-sm">
                    <CheckCircle2 className="size-6 text-green-600" />
                    {skipped.length ? `Plus de boîte à réviser (${skipped.length} passée(s) pendant cette session).` : 'Aucune boîte à réviser. Tout est à jour.'}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
                <CodeCheck box={box} onCorrected={(b) => setBox({ ...box, code: b.code })} />
                <div className="space-y-2 text-sm">
                    <p>Emplacement : <strong>{location(box)}</strong></p>
                    <p>Agent : <strong>{box.agent_name ?? '—'}</strong> · appareil {box.device}</p>
                    <p className="text-stone-500">{remaining} boîte(s) à réviser</p>
                    <div className="flex gap-2">
                        <button onClick={skipBox} className="flex items-center gap-1 rounded-md bg-stone-100 px-3 py-1.5 hover:bg-stone-200">
                            <SkipForward className="size-4" /> Passer cette boîte
                        </button>
                        <button onClick={approveAll} disabled={saving} className="rounded-md bg-stone-100 px-3 py-1.5 hover:bg-stone-200">
                            Tout valider tel quel
                        </button>
                    </div>
                </div>
            </div>

            {current ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <ImageViewer src={current.url} alt={`Photo ${current.sequence}`} className="h-[70vh]" />
                    <div className="flex h-[70vh] flex-col rounded-xl bg-white shadow-sm">
                        <div className="flex-1 overflow-y-auto p-4">
                            {form && <DocumentForm doc={current.document} form={form} setForm={setForm} />}
                        </div>
                        <div className="flex items-center gap-2 border-t border-stone-100 p-3">
                            <button onClick={() => go(index - 1)} disabled={index === 0} className="rounded p-2 hover:bg-stone-100 disabled:opacity-30" aria-label="Précédent"><ChevronLeft className="size-5" /></button>
                            <span className="text-sm text-stone-500">Document {index + 1} / {docs.length}</span>
                            <button onClick={() => go(index + 1)} disabled={index >= docs.length - 1} className="rounded p-2 hover:bg-stone-100 disabled:opacity-30" aria-label="Suivant"><ChevronRight className="size-5" /></button>
                            <span className="flex-1 truncate text-sm text-green-700">{message}</span>
                            <button onClick={() => save(false)} disabled={saving} className="rounded-md bg-stone-100 px-3 py-2 text-sm hover:bg-stone-200">Enregistrer</button>
                            <button onClick={() => save(true)} disabled={saving} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                                Valider et suivant
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <p className="rounded-xl bg-white p-4 shadow-sm">Cette boîte ne contient que la photo du code.
                    <button onClick={approveAll} className="ms-2 text-amber-700 hover:underline">La marquer comme terminée</button>
                </p>
            )}

            <div className="flex gap-2 overflow-x-auto pb-2">
                {docs.map((d, i) => (
                    <button key={d.id} onClick={() => go(i)}
                        className={`relative h-20 w-16 shrink-0 overflow-hidden rounded border-2 ${i === index ? 'border-amber-500' : 'border-transparent'}`}>
                        <img key={d.thumb_url} src={d.thumb_url} alt="" className="h-full w-full bg-stone-100 object-contain" />
                        {d.document.reviewed_at && <CheckCircle2 className="absolute end-0.5 top-0.5 size-4 rounded-full bg-white text-green-600" />}
                        {!d.document.reviewed_at && d.document.needs_review && <span className="absolute end-1 top-1 size-2.5 rounded-full bg-amber-500" />}
                    </button>
                ))}
            </div>

            <p className="flex items-center gap-2 text-xs text-stone-500">
                <Keyboard className="size-4" /> Ctrl+Entrée : valider et suivant · Ctrl+S : enregistrer · Alt+← / Alt+→ : document précédent / suivant
            </p>
        </div>
    );
}
