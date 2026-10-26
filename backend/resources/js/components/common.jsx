import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCw, X } from 'lucide-react';

export const BOX_STATUS = {
    imported: { label: 'Importée', className: 'bg-stone-100 text-stone-700' },
    processing: { label: 'En traitement', className: 'bg-sky-100 text-sky-800' },
    review: { label: 'À réviser', className: 'bg-amber-100 text-amber-800' }, // older versions only
    done: { label: 'Terminée', className: 'bg-green-100 text-green-800' },
};

export const REVIEW_REASONS = {
    ocr_failed: 'OCR en échec',
    no_text: 'Aucun texte détecté',
    low_ocr_confidence: 'Lecture (OCR) peu sûre',
    handwritten: 'Manuscrit probable',
    low_extraction_confidence: 'Extraction peu sûre',
    extraction_failed: 'Extraction en échec',
};

export function BoxStatusBadge({ status }) {
    const s = BOX_STATUS[status] ?? { label: status, className: 'bg-stone-100' };
    return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

/** Box codes are always shown left-to-right in a monospace font. */
export function Code({ children, className = '' }) {
    return <span dir="ltr" className={`font-mono font-semibold tracking-wide ${className}`}>{children}</span>;
}

/**
 * Renders search highlights. The API delimits matches with private-use characters
 * U+E000/U+E001 (never HTML), so OCR text cannot inject markup: we only build <mark>s.
 */
export function Highlight({ text, className = '' }) {
    if (!text) return null;
    const parts = String(text).split(/([^]*)/);
    return (
        <span dir="auto" className={className}>
            {parts.map((part, i) =>
                part.startsWith('') ? (
                    <mark key={i} className="rounded bg-amber-200 px-0.5">{part.slice(1, -1)}</mark>
                ) : (
                    part
                ),
            )}
        </span>
    );
}

/** Editable list of short values (persons, organizations, keywords). */
export function TagInput({ value = [], onChange, max, placeholder }) {
    const [draft, setDraft] = useState('');
    const add = () => {
        const v = draft.trim();
        if (v && !value.includes(v) && (!max || value.length < max)) onChange([...value, v]);
        setDraft('');
    };
    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-stone-300 p-1.5 focus-within:border-amber-500">
            {value.map((v) => (
                <span key={v} dir="auto" className="flex items-center gap-1 rounded bg-stone-100 py-0.5 pe-1 ps-2 text-sm">
                    {v}
                    <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 hover:bg-stone-200" aria-label={`Retirer ${v}`}>
                        <X className="size-3" />
                    </button>
                </span>
            ))}
            <input
                dir="auto"
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey) {
                        e.preventDefault();
                        add();
                    } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
                }}
                onBlur={add}
                className="min-w-24 flex-1 px-1 py-0.5 text-sm outline-none"
            />
        </div>
    );
}

/** Photo with zoom (+/- or wheel), pan (drag) and 90° rotation, fitted to its container. */
export function ImageViewer({ src, alt = '', className = '' }) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const drag = useRef(null);

    useEffect(() => {
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
    }, [src]);

    const clamp = (z) => Math.min(6, Math.max(1, z));

    return (
        <div className={`relative overflow-hidden rounded-lg bg-stone-800 ${className}`}>
            <div
                className="flex h-full w-full cursor-grab items-center justify-center active:cursor-grabbing"
                onWheel={(e) => setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.15 : 0.87)))}
                onMouseDown={(e) => (drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y })}
                onMouseMove={(e) => drag.current && setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
                onMouseUp={() => (drag.current = null)}
                onMouseLeave={() => (drag.current = null)}
            >
                {src && (
                    // key: a new <img> per photo, otherwise the browser keeps showing the previous
                    // photo until the new one is loaded (e.g. the last box's code photo next to the new code).
                    <img
                        key={src}
                        src={src}
                        alt={alt}
                        draggable={false}
                        className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
                        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }}
                    />
                )}
            </div>
            <div className="absolute bottom-2 end-2 flex gap-1 rounded-md bg-black/60 p-1 text-white">
                <button type="button" onClick={() => setZoom((z) => clamp(z / 1.3))} className="rounded p-1 hover:bg-white/20" aria-label="Dézoomer"><Minus className="size-4" /></button>
                <button type="button" onClick={() => setZoom((z) => clamp(z * 1.3))} className="rounded p-1 hover:bg-white/20" aria-label="Zoomer"><Plus className="size-4" /></button>
                <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className="rounded p-1 hover:bg-white/20" aria-label="Pivoter"><RotateCw className="size-4" /></button>
            </div>
        </div>
    );
}

export function Pagination({ meta, onPage }) {
    if (!meta || meta.last_page <= 1) return null;
    return (
        <div className="flex items-center justify-end gap-3 text-sm">
            <button disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Précédent</button>
            <span>Page {meta.current_page} / {meta.last_page} ({meta.total})</span>
            <button disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Suivant</button>
        </div>
    );
}

export const inputClass = 'rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';
