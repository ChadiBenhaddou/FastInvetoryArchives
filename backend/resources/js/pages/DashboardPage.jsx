import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';

const SERVICE_LABELS = { database: 'Base de données (MySQL)', search: 'Moteur de recherche (Meilisearch)' };

export default function DashboardPage() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = () => api('system/status').then(setStatus).catch((e) => setError(e.message));
        load();
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Tableau de bord</h1>

            {error && <p className="text-red-700">{error}</p>}

            {status && (
                <div className="grid gap-4 md:grid-cols-3">
                    <section className="rounded-xl bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-medium text-stone-500">Services locaux</h2>
                        <ul className="space-y-2">
                            {Object.entries(status.services).map(([key, s]) => (
                                <li key={key} className="flex items-center gap-2 text-sm" title={s.error}>
                                    {s.ok ? (
                                        <CheckCircle2 className="size-4 text-green-600" />
                                    ) : (
                                        <XCircle className="size-4 text-red-600" />
                                    )}
                                    {SERVICE_LABELS[key] ?? key}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-xl bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-medium text-stone-500">File de traitement</h2>
                        <p className="text-3xl font-semibold">{status.queue.pending}</p>
                        <p className="text-sm text-stone-500">tâches en attente · {status.queue.failed} en échec</p>
                    </section>

                    <section className="rounded-xl bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-medium text-stone-500">Espace disque (archives)</h2>
                        {status.disk ? (
                            <>
                                <p className="text-3xl font-semibold">{formatBytes(status.disk.free_bytes)}</p>
                                <p className="text-sm text-stone-500">libres sur {formatBytes(status.disk.total_bytes)}</p>
                            </>
                        ) : (
                            <p className="text-sm text-red-700">Dossier d'archives introuvable</p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
