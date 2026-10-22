import { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { back } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog, askPin, confirmDialog } from '../components/dialogs';
import { BigButton, Card, Screen, formatBytes } from '../components/ui';
import { useT } from '../i18n';
import { listExports } from '../lib/db';
import { purgeExport, reExport } from '../lib/exporter';
import { ArchiveNative } from '../lib/native';
import type { ExportRecord } from '../lib/types';

type Row = ExportRecord & { fileExists: boolean };

export default function HistoryScreen() {
    const t = useT();
    const { profile } = useApp();
    const lang = profile.language;
    const [rows, setRows] = useState<Row[]>([]);
    const [storage, setStorage] = useState<{ freeBytes: number; totalBytes: number; photosBytes: number } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    async function load() {
        const exports = await listExports();
        setRows(
            await Promise.all(
                exports.map(async (e) => ({ ...e, fileExists: (await ArchiveNative.exportFileInfo({ fileName: e.fileName })).exists })),
            ),
        );
        ArchiveNative.storageInfo().then(setStorage).catch(() => {});
    }
    useEffect(() => {
        load();
    }, []);

    async function redo(record: ExportRecord) {
        setBusy(record.exportId);
        try {
            await reExport(profile, record);
            await alertDialog(lang, t('reExportDone', { file: record.fileName }));
        } catch (e) {
            await alertDialog(lang, `${t('error')} : ${(e as Error).message}`);
        } finally {
            setBusy(null);
            load();
        }
    }

    async function purge(record: ExportRecord) {
        if (!(await confirmDialog(lang, t('confirmImportedWarn'), true))) return;
        if (!(await askPin(profile))) return;
        setBusy(record.exportId);
        await purgeExport(record);
        setBusy(null);
        load();
    }

    const formatDate = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });

    return (
        <Screen title={t('historyTitle')} onBack={back}>
            {storage && (
                <Card className="flex items-center gap-3">
                    <HardDrive className="size-8 text-stone-400" />
                    <div>
                        <div className="text-sm text-stone-400">{t('storage')}</div>
                        <div>{t('storageLine', { photos: formatBytes(storage.photosBytes), free: formatBytes(storage.freeBytes) })}</div>
                        <div className="mt-1 h-2 w-48 overflow-hidden rounded-full bg-stone-800">
                            <div className="h-full bg-amber-500" style={{ width: `${Math.round(100 - (storage.freeBytes / storage.totalBytes) * 100)}%` }} />
                        </div>
                    </div>
                </Card>
            )}

            {!rows.length && <p className="text-center text-stone-500">{t('noExports')}</p>}

            {rows.map((r) => (
                <Card key={r.exportId} className="space-y-3">
                    <div>
                        <div dir="ltr" className="break-all text-start font-mono">{r.fileName}</div>
                        <div className="text-stone-400">
                            {formatDate(r.createdAt)} · {t('exportLine', { boxes: r.boxCount, photos: r.photoCount, size: formatBytes(r.sizeBytes) })}
                        </div>
                        {r.purgedAt ? (
                            <div className="text-green-400">{t('purgedOn', { date: formatDate(r.purgedAt) })}</div>
                        ) : (
                            !r.fileExists && <div className="text-amber-400">{t('fileMissing')}</div>
                        )}
                    </div>
                    {!r.purgedAt && (
                        <div className="grid grid-cols-1 gap-2">
                            <BigButton variant="secondary" className="min-h-14 text-lg" icon={<RefreshCw className="size-5" />}
                                disabled={busy !== null} onClick={() => redo(r)}>
                                {t('reExport')}
                            </BigButton>
                            <BigButton variant="danger" className="min-h-14 text-lg" icon={<Trash2 className="size-5" />}
                                disabled={busy !== null} onClick={() => purge(r)}>
                                {t('confirmImported')}
                            </BigButton>
                        </div>
                    )}
                </Card>
            ))}
        </Screen>
    );
}
