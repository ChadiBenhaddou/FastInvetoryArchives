import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderInput, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { uploadZip } from '../lib/upload';
import { formatBytes, formatDateTime } from '../lib/format';
import ImportReport from '../components/ImportReport';
import { isFinished, StatusBadge, SummaryLine } from '../components/ImportStatus';

const SOURCES = { upload: 'Glisser-déposer', watched_folder: 'Dossier surveillé' };
let nextKey = 1;

/** One file being uploaded then imported. */
function QueueItem({ item, onOpenReport }) {
    const { file, phase, progress, error, imp } = item;
    const status = imp?.status;
    return (
        <li className="space-y-2 rounded-lg border border-stone-200 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-mono">{file.name}</span>
                <span className="shrink-0 text-stone-500">{formatBytes(file.size)}</span>
            </div>
            {phase === 'uploading' && (
                <>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <p className="text-xs text-stone-500">Envoi… {Math.round(progress * 100)} %</p>
                </>
            )}
            {phase === 'waiting' && <p className="text-xs text-stone-500">En attente d'envoi…</p>}
            {phase === 'error' && <p className="text-sm text-red-700">{error}</p>}
            {imp && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <StatusBadge status={status} />
                    {!isFinished(status) && <span className="text-stone-500">Vérification et copie des photos…</span>}
                    {isFinished(status) && (imp.fatal ? <span className="text-red-700">{imp.fatal}</span> : <SummaryLine summary={imp.summary} />)}
                    {isFinished(status) && (
                        <button onClick={() => onOpenReport(imp.id)} className="ms-auto text-amber-700 hover:underline">
                            Voir le rapport
                        </button>
                    )}
                </div>
            )}
        </li>
    );
}

export default function ImportPage() {
    const [queue, setQueue] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [history, setHistory] = useState({ data: [], meta: null });
    const [page, setPage] = useState(1);
    const [report, setReport] = useState(null);
    const [folders, setFolders] = useState(null);
    const inputRef = useRef(null);
    const busy = useRef(false);

    const update = (key, changes) => setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...changes } : it)));

    const loadHistory = useCallback(() => api(`imports?page=${page}`).then(setHistory), [page]);
    useEffect(() => {
        loadHistory();
    }, [loadHistory]);
    useEffect(() => {
        api('system/status').then((s) => setFolders(s.folders));
    }, []);

    // Uploads run one at a time, in the order the files were dropped.
    useEffect(() => {
        if (busy.current) return;
        const next = queue.find((it) => it.phase === 'waiting');
        if (!next) return;
        busy.current = true;
        update(next.key, { phase: 'uploading', progress: 0 });
        uploadZip(next.file, (progress) => update(next.key, { progress }))
            .then((imp) => update(next.key, { phase: 'imported', imp }))
            .catch((e) => update(next.key, { phase: 'error', error: e.message }))
            .finally(() => {
                busy.current = false;
                setQueue((q) => [...q]); // wake the effect for the next file
            });
    }, [queue]);

    // Follow the imports being processed by the queue worker.
    useEffect(() => {
        const ids = queue.filter((it) => it.imp && !isFinished(it.imp.status)).map((it) => it.imp.id);
        if (!ids.length) return;
        const timer = setTimeout(async () => {
            const res = await api(`imports?ids=${ids.join(',')}`);
            setQueue((q) => q.map((it) => ({ ...it, imp: res.data.find((d) => d.id === it.imp?.id) ?? it.imp })));
            if (res.data.some((d) => isFinished(d.status))) loadHistory();
        }, 2000);
        return () => clearTimeout(timer);
    }, [queue, loadHistory]);

    function addFiles(fileList) {
        const files = [...fileList];
        const rejected = files.filter((f) => !f.name.toLowerCase().endsWith('.zip'));
        const items = files.map((file) => ({
            key: nextKey++,
            file,
            phase: rejected.includes(file) ? 'error' : 'waiting',
            error: rejected.includes(file) ? "Ce n'est pas un fichier .zip exporté par l'application." : null,
            progress: 0,
        }));
        setQueue((q) => [...items, ...q]);
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Import des exports téléphone</h1>

            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition ${
                    dragging ? 'border-amber-500 bg-amber-50' : 'border-stone-300 bg-white hover:border-amber-400'
                }`}
            >
                <Upload className="size-10 text-amber-600" />
                <p className="text-lg font-medium">Déposer ici un ou plusieurs fichiers ZIP</p>
                <p className="text-sm text-stone-500">ou cliquer pour les choisir (fichiers copiés depuis Documents/ArchiveInventory/exports du téléphone)</p>
                <input ref={inputRef} type="file" accept=".zip" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {folders && (
                <p className="flex items-center gap-2 text-sm text-stone-600">
                    <FolderInput className="size-4 shrink-0" />
                    Les ZIP copiés dans <span className="font-mono">{folders.import}</span> sont importés automatiquement
                    (puis rangés dans <span className="font-mono">imported</span> ou <span className="font-mono">failed</span>).
                </p>
            )}

            {queue.length > 0 && (
                <ul className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
                    {queue.map((item) => <QueueItem key={item.key} item={item} onOpenReport={setReport} />)}
                </ul>
            )}

            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Historique</h2>
                <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
                    <thead className="bg-stone-50 text-left text-stone-500">
                        <tr>
                            <th className="px-3 py-2 font-medium">N°</th>
                            <th className="px-3 py-2 font-medium">Date</th>
                            <th className="px-3 py-2 font-medium">Fichier</th>
                            <th className="px-3 py-2 font-medium">Source</th>
                            <th className="px-3 py-2 font-medium">Appareil</th>
                            <th className="px-3 py-2 font-medium">Résultat</th>
                            <th className="px-3 py-2 font-medium">Statut</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {history.data.map((imp) => (
                            <tr key={imp.id} onClick={() => setReport(imp.id)} className="cursor-pointer hover:bg-stone-50">
                                <td className="px-3 py-2 text-stone-500">{imp.id}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(imp.created_at)}</td>
                                <td className="max-w-64 truncate px-3 py-2 font-mono">{imp.file_name}</td>
                                <td className="px-3 py-2">{SOURCES[imp.source] ?? imp.source}</td>
                                <td className="px-3 py-2">{imp.device ?? '—'}{imp.agent_name && ` · ${imp.agent_name}`}</td>
                                <td className="px-3 py-2">{imp.fatal ? <span className="text-red-700">{imp.fatal}</span> : <SummaryLine summary={imp.summary} />}</td>
                                <td className="px-3 py-2"><StatusBadge status={imp.status} /></td>
                            </tr>
                        ))}
                        {!history.data.length && (
                            <tr><td colSpan={7} className="px-3 py-6 text-center text-stone-500">Aucun import pour le moment.</td></tr>
                        )}
                    </tbody>
                </table>
                {history.meta && history.meta.last_page > 1 && (
                    <div className="flex items-center justify-end gap-3 text-sm">
                        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Précédent</button>
                        <span>Page {history.meta.current_page} / {history.meta.last_page}</span>
                        <button disabled={page >= history.meta.last_page} onClick={() => setPage(page + 1)} className="rounded px-2 py-1 hover:bg-stone-200 disabled:opacity-40">Suivant</button>
                    </div>
                )}
            </section>

            {report && <ImportReport importId={report} onClose={() => setReport(null)} />}
        </div>
    );
}
