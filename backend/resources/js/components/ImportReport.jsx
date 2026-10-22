import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Copy, GitCompare, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import { StatusBadge } from './ImportStatus';

const SOURCES = { upload: 'Glisser-déposer', watched_folder: 'Dossier surveillé' };

function Section({ icon: Icon, title, tone, children }) {
    return (
        <section>
            <h3 className={`mb-1 flex items-center gap-2 font-medium ${tone}`}>
                <Icon className="size-4" /> {title}
            </h3>
            <div className="text-sm">{children}</div>
        </section>
    );
}

const Code = ({ children }) => <span className="font-mono">{children}</span>;

/** Full report of one import, in a modal. */
export default function ImportReport({ importId, onClose }) {
    const [imp, setImp] = useState(null);

    useEffect(() => {
        api(`imports/${importId}`).then((res) => setImp(res.data));
    }, [importId]);

    const r = imp?.report;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8" onClick={onClose}>
            <div className="w-full max-w-3xl space-y-5 rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold">Rapport d'import n° {importId}</h2>
                        {imp && <p className="font-mono text-sm text-stone-500">{imp.file_name}</p>}
                    </div>
                    <button onClick={onClose} className="rounded p-1 hover:bg-stone-100" aria-label="Fermer">
                        <X className="size-5" />
                    </button>
                </div>

                {!imp && <p>Chargement…</p>}
                {imp && (
                    <>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                            <div><dt className="text-stone-500">Statut</dt><dd><StatusBadge status={imp.status} /></dd></div>
                            <div><dt className="text-stone-500">Appareil · agent</dt><dd>{imp.device ?? '—'} · {imp.agent_name ?? '—'}</dd></div>
                            <div><dt className="text-stone-500">Source</dt><dd>{SOURCES[imp.source] ?? imp.source}{imp.imported_by && ` (${imp.imported_by})`}</dd></div>
                            <div><dt className="text-stone-500">Exporté le</dt><dd>{formatDateTime(imp.exported_at)}</dd></div>
                            <div><dt className="text-stone-500">Importé le</dt><dd>{formatDateTime(imp.imported_at)}</dd></div>
                            <div><dt className="text-stone-500">Taille</dt><dd>{formatBytes(imp.file_size)}</dd></div>
                        </dl>

                        {r?.summary && (
                            <div className="grid grid-cols-5 gap-2 text-center">
                                {[
                                    ['Boîtes ajoutées', r.summary.boxes_added, 'text-green-700'],
                                    ['Photos ajoutées', r.summary.photos_added, 'text-green-700'],
                                    ['Doublons ignorés', r.summary.duplicates_skipped, 'text-stone-700'],
                                    ['Conflits', r.summary.conflicts, r.summary.conflicts ? 'text-amber-700' : 'text-stone-400'],
                                    ['Erreurs', r.summary.errors, r.summary.errors ? 'text-red-700' : 'text-stone-400'],
                                ].map(([label, value, tone]) => (
                                    <div key={label} className="rounded-lg bg-stone-50 p-3">
                                        <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
                                        <div className="text-xs text-stone-500">{label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {r?.fatal && (
                            <Section icon={Ban} title="Import refusé" tone="text-red-700">
                                <p>{r.fatal}</p>
                                {r.fatal_details?.length > 0 && (
                                    <ul className="mt-1 list-disc ps-5 font-mono text-xs text-stone-600">
                                        {r.fatal_details.map((d) => <li key={d}>{d}</li>)}
                                    </ul>
                                )}
                            </Section>
                        )}

                        {r?.errors?.length > 0 && (
                            <Section icon={Ban} title="Boîtes refusées" tone="text-red-700">
                                <ul className="space-y-1">
                                    {r.errors.map((e, i) => <li key={i}>{e.code && <Code>{e.code} — </Code>}{e.message}</li>)}
                                </ul>
                            </Section>
                        )}

                        {r?.conflicts?.length > 0 && (
                            <Section icon={GitCompare} title="Conflits à examiner" tone="text-amber-700">
                                <ul className="space-y-1">
                                    {r.conflicts.map((c) => <li key={c.code}><Code>{c.code}</Code> — {c.message}</li>)}
                                </ul>
                            </Section>
                        )}

                        {r?.warnings?.length > 0 && (
                            <Section icon={AlertTriangle} title="Points d'attention" tone="text-amber-700">
                                <ul className="list-disc space-y-1 ps-5">
                                    {r.warnings.map((w) => <li key={w}>{w}</li>)}
                                </ul>
                            </Section>
                        )}

                        {r?.gaps?.length > 0 && (
                            <Section icon={AlertTriangle} title={`Numéros non reçus pour l'appareil ${imp.device}`} tone="text-amber-700">
                                <p className="mb-1 text-stone-600">Codes émis par le téléphone mais jamais reçus (boîte perdue, export oublié ou code non utilisé) :</p>
                                <p className="font-mono">
                                    {r.gaps.map((g) => (g.count === 1 ? g.first_code : `${g.first_code} → ${g.last_code} (${g.count})`)).join(', ')}
                                </p>
                            </Section>
                        )}

                        {(r?.duplicates?.length > 0 || r?.voided?.length > 0) && (
                            <Section icon={Copy} title="Divers" tone="text-stone-600">
                                {r.duplicates?.length > 0 && <p>Déjà présentes (ignorées) : <Code>{r.duplicates.join(', ')}</Code></p>}
                                {r.voided?.length > 0 && <p>Codes annulés sur le téléphone : <Code>{r.voided.join(', ')}</Code></p>}
                            </Section>
                        )}

                        {imp.archived_path && <p className="text-xs text-stone-400">Fichier rangé dans : <span className="font-mono">{imp.archived_path}</span></p>}
                    </>
                )}
            </div>
        </div>
    );
}
