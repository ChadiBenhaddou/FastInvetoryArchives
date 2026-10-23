import { useEffect, useState } from 'react';
import { HardDriveDownload, Usb } from 'lucide-react';
import { api } from '../lib/api';
import { formatBytes, formatDateTime } from '../lib/format';

const STATUS = { running: 'En cours…', done: 'Terminée', failed: 'Échec' };

export default function BackupPage() {
    const [info, setInfo] = useState(null);
    const [message, setMessage] = useState(null);

    const load = () => api('backups').then(setInfo);
    useEffect(() => {
        load();
        const timer = setInterval(load, 5000);
        return () => clearInterval(timer);
    }, []);

    async function start() {
        setMessage(null);
        try {
            await api('backups', { method: 'POST' });
            setMessage('Sauvegarde lancée.');
            load();
        } catch (e) {
            setMessage(e.message);
        }
    }

    const running = info?.data.some((b) => b.status === 'running');

    return (
        <div className="space-y-5">
            <h1 className="text-2xl font-semibold">Sauvegarde</h1>

            <div className="grid gap-4 md:grid-cols-2">
                <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
                    <h2 className="flex items-center gap-2 font-semibold"><HardDriveDownload className="size-5" /> Sauvegarde sur ce PC</h2>
                    <p className="text-sm text-stone-600">
                        Base de données + index de recherche + liste de contrôle des photos, dans le dossier <span className="font-mono">backups</span>.
                        Faite automatiquement chaque nuit à 2 h ; les 7 dernières sont conservées.
                    </p>
                    <p className="text-sm">Dernière sauvegarde réussie : <strong>{formatDateTime(info?.last_success_at)}</strong></p>
                    <button onClick={start} disabled={running} className="rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                        {running ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
                    </button>
                    {message && <p className="text-sm text-stone-600">{message}</p>}
                </section>

                <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
                    <h2 className="flex items-center gap-2 font-semibold"><Usb className="size-5" /> Copie sur disque USB (indispensable)</h2>
                    <p className="text-sm text-stone-600">
                        Une sauvegarde sur le même disque ne protège pas d'une panne du PC. Brancher le disque USB, puis double-cliquer
                        sur le raccourci <strong>« Sauvegarde vers USB »</strong> du bureau et choisir le disque : la base, l'index et les
                        nouvelles photos y sont copiés (seules les photos nouvelles sont copiées, c'est rapide après la première fois).
                    </p>
                    {info && <p className="text-xs text-stone-500">Photos : <span className="font-mono">{info.photos_folder}</span></p>}
                </section>
            </div>

            <table className="w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                    <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Statut</th>
                        <th className="px-3 py-2 font-medium">Taille</th>
                        <th className="px-3 py-2 font-medium">Photos listées</th>
                        <th className="px-3 py-2 font-medium">Dossier</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {info?.data.map((b) => (
                        <tr key={b.id}>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                            <td className={`px-3 py-2 ${b.status === 'failed' ? 'text-red-700' : ''}`} title={b.error ?? ''}>{STATUS[b.status] ?? b.status}</td>
                            <td className="px-3 py-2">{b.size_bytes ? formatBytes(b.size_bytes) : '—'}</td>
                            <td className="px-3 py-2">{b.photos ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{b.folder}</td>
                        </tr>
                    ))}
                    {!info?.data.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-stone-500">Aucune sauvegarde.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
