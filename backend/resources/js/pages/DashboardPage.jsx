import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import AgentChart from '../components/AgentChart';

const SERVICE_LABELS = {
    database: 'Base de données',
    search: 'Moteur de recherche (Meilisearch)',
    ocr: 'OCR',
    llm: 'IA locale (Ollama)',
};

// Engine reading the photos right now (OCR_ENGINE, with PaddleOCR as fallback).
const OCR_ENGINES = {
    'windows-oneocr': 'Windows (Outil Capture d\'écran)',
    paddle: 'PaddleOCR + Tesseract',
};

function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return 'calcul en cours…';
    if (seconds < 60) return `${seconds} s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

function Card({ title, children }) {
    return (
        <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-stone-500">{title}</h2>
            {children}
        </section>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);
    const [pipeline, setPipeline] = useState(null);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = () => {
            api('system/status').then(setStatus).catch((e) => setError(e.message));
            api('pipeline/status').then(setPipeline).catch(() => {});
            api('dashboard').then(setStats).catch(() => {});
        };
        load();
        const timer = setInterval(load, 10000);
        return () => clearInterval(timer);
    }, []);

    const waiting = pipeline ? pipeline.images.pending + pipeline.images.processing : 0;
    const total = pipeline ? waiting + pipeline.images.done + pipeline.images.failed : 0;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Tableau de bord</h1>

            {error && <p className="text-red-700">{error}</p>}

            {stats?.backup.reminder && (
                <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
                    <AlertTriangle className="size-5 shrink-0" />
                    <span className="flex-1">
                        Aucune sauvegarde depuis plus de 24 h
                        {stats.backup.last_success_at ? ` (dernière : ${formatDateTime(stats.backup.last_success_at)})` : ' (jamais)'}.
                    </span>
                    {user.role === 'admin' && <Link to="/backup" className="font-medium underline">Sauvegarder</Link>}
                </div>
            )}
            {stats?.conflicts_pending > 0 && user.role === 'admin' && (
                <Link to="/conflicts" className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
                    <AlertTriangle className="size-5 shrink-0" /> {stats.conflicts_pending} conflit(s) de code de boîte à examiner.
                </Link>
            )}

            {pipeline && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card title="Traitement des photos (OCR)">
                        <p className="text-3xl font-semibold">{waiting}</p>
                        <p className="text-sm text-stone-500">
                            photo(s) en attente · {pipeline.images.done} traitée(s)
                            {pipeline.images.failed > 0 && <span className="text-red-700"> · {pipeline.images.failed} en échec</span>}
                        </p>
                        {total > 0 && (
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
                                <div className="h-full bg-amber-500" style={{ width: `${Math.round(((total - waiting) / total) * 100)}%` }} />
                            </div>
                        )}
                        {waiting > 0 && (
                            <p className="mt-2 text-sm">
                                Temps restant estimé : <strong>{formatDuration(pipeline.eta_seconds)}</strong>
                                {pipeline.avg_ocr_ms && <span className="text-stone-500"> ({(pipeline.avg_ocr_ms / 1000).toFixed(1)} s/photo, {pipeline.workers} en parallèle)</span>}
                            </p>
                        )}
                    </Card>
                    <Card title="Boîtes">
                        <ul className="space-y-1 text-sm">
                            <li>Importées : <strong>{pipeline.boxes.imported}</strong></li>
                            <li>En traitement : <strong>{pipeline.boxes.processing}</strong></li>
                            <li>Terminées : <strong>{pipeline.boxes.done}</strong></li>
                        </ul>
                    </Card>
                    <Card title="Documents signalés">
                        <p className="text-3xl font-semibold">{pipeline.needs_review}</p>
                        <p className="text-sm text-stone-500">lecture peu sûre, manuscrit, sans texte… (pour information, à corriger depuis la boîte si besoin)</p>
                    </Card>
                </div>
            )}

            {stats && (
                <div className="grid gap-4 lg:grid-cols-3">
                    <section className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
                        <h2 className="mb-3 text-sm font-medium text-stone-500">Photos par agent et par jour (14 derniers jours)</h2>
                        <AgentChart days={stats.days} data={stats.photos_per_agent_per_day} />
                    </section>
                    <Card title="Numéros de boîtes non reçus">
                        {stats.gaps.length ? (
                            <ul className="space-y-2 text-sm">
                                {stats.gaps.map((g) => (
                                    <li key={g.device}>
                                        <span className="font-medium">Appareil {g.device}</span> <span className="text-stone-500">({g.label})</span>
                                        <div className="font-mono text-amber-700">
                                            {g.gaps.map((x) => (x.count === 1 ? x.first_code : `${x.first_code} → ${x.last_code} (${x.count})`)).join(', ')}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="flex items-center gap-2 text-sm text-stone-600"><CheckCircle2 className="size-4 text-green-600" /> Aucun : toutes les boîtes numérotées ont été reçues.</p>}
                    </Card>
                </div>
            )}

            {status && (
                <div className="grid gap-4 md:grid-cols-3">
                    <Card title="Services locaux">
                        <ul className="space-y-2">
                            {Object.entries(status.services).map(([key, s]) => (
                                <li key={key} className="flex items-center gap-2 text-sm" title={s.error}>
                                    {s.ok ? <CheckCircle2 className="size-4 text-green-600" /> : <XCircle className="size-4 text-red-600" />}
                                    {SERVICE_LABELS[key] ?? key}
                                    {key === 'ocr' && status.ocr_engine && ` : ${OCR_ENGINES[status.ocr_engine] ?? status.ocr_engine}`}
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Card title="File de tâches">
                        <p className="text-3xl font-semibold">{status.queue.pending}</p>
                        <p className="text-sm text-stone-500">tâches en attente · {status.queue.failed} en échec</p>
                    </Card>

                    <Card title="Espace disque (archives)">
                        {status.disk ? (
                            <>
                                <p className="text-3xl font-semibold">{formatBytes(status.disk.free_bytes)}</p>
                                <p className="text-sm text-stone-500">libres sur {formatBytes(status.disk.total_bytes)}</p>
                            </>
                        ) : (
                            <p className="text-sm text-red-700">Dossier d'archives introuvable</p>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}
