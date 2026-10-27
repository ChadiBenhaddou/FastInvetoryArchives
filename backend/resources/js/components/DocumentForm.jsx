import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDateTime, percent } from '../lib/format';
import { REVIEW_REASONS, TagInput, inputClass } from './common';

export const DOC_TYPES = ['arrêté', 'décision', 'décret', 'circulaire', 'note de service', 'correspondance', 'procès-verbal',
    'rapport', 'demande', 'attestation', 'contrat', 'facture', 'état', 'liste', 'autre'];

export function toForm(doc) {
    return {
        doc_type: doc.doc_type ?? '',
        title: doc.title ?? '',
        doc_date: doc.doc_date ?? '',
        reference_number: doc.reference_number ?? '',
        persons: doc.persons ?? [],
        organizations: doc.organizations ?? [],
        keywords: doc.keywords ?? [],
        summary: doc.summary ?? '',
        ocr_text: doc.ocr_text ?? '',
    };
}

/** Form payload: empty strings become null (the API stores "unknown" as null). */
export function fromForm(form) {
    const out = { ...form };
    for (const k of ['doc_type', 'title', 'doc_date', 'reference_number', 'summary']) out[k] = out[k]?.trim() ? out[k].trim() : null;
    return out;
}

function Label({ children }) {
    return <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">{children}</span>;
}

/** Controlled form of the extracted fields + OCR text of one document. */
export default function DocumentForm({ doc, form, setForm, disabled = false }) {
    const set = (k) => (v) => setForm({ ...form, [k]: v?.target ? v.target.value : v });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
                {doc.reviewed_at ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                        <CheckCircle2 className="size-3.5" /> Corrigé par {doc.reviewed_by} le {formatDateTime(doc.reviewed_at)}
                    </span>
                ) : (
                    doc.review_reasons.map((r) => (
                        <span key={r} className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                            <AlertTriangle className="size-3.5" /> {REVIEW_REASONS[r] ?? r}
                        </span>
                    ))
                )}
                <span className="text-stone-500">
                    OCR {percent(doc.ocr_confidence)} ({doc.ocr_engine ?? '—'}, {doc.language ?? '—'})
                    {' · '}extraction {doc.extraction_status === 'done' ? percent(doc.extraction_confidence) : doc.extraction_status}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label>
                    <Label>Type</Label>
                    <input list="doc-types" disabled={disabled} className={`${inputClass} w-full`} value={form.doc_type} onChange={set('doc_type')} />
                    <datalist id="doc-types">{DOC_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
                </label>
                <label>
                    <Label>Date</Label>
                    <input type="date" disabled={disabled} className={`${inputClass} w-full`} value={form.doc_date} onChange={set('doc_date')} />
                </label>
                <label className="col-span-2">
                    <Label>Titre / objet</Label>
                    <input dir="auto" disabled={disabled} className={`${inputClass} w-full`} value={form.title} onChange={set('title')} />
                </label>
                <label>
                    <Label>Référence</Label>
                    <input dir="auto" disabled={disabled} className={`${inputClass} w-full font-mono`} value={form.reference_number} onChange={set('reference_number')} />
                </label>
                <div>
                    <Label>Mots-clés (8 max)</Label>
                    <TagInput value={form.keywords} onChange={set('keywords')} max={8} placeholder="Entrée pour ajouter" />
                </div>
                <div className="col-span-2">
                    <Label>Personnes</Label>
                    <TagInput value={form.persons} onChange={set('persons')} placeholder="Entrée pour ajouter" />
                </div>
                <div className="col-span-2">
                    <Label>Organismes</Label>
                    <TagInput value={form.organizations} onChange={set('organizations')} placeholder="Entrée pour ajouter" />
                </div>
                <label className="col-span-2">
                    <Label>Résumé (français)</Label>
                    <textarea rows={2} disabled={disabled} className={`${inputClass} w-full`} value={form.summary} onChange={set('summary')} />
                </label>
            </div>

            <label className="block">
                <Label>Texte lu (OCR) — corrigeable</Label>
                <textarea dir="auto" rows={10} disabled={disabled} className={`${inputClass} w-full font-[inherit] leading-relaxed`} value={form.ocr_text} onChange={set('ocr_text')} />
            </label>
        </div>
    );
}
