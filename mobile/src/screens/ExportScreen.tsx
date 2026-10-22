import { useEffect, useState } from 'react';
import { FileArchive, Usb } from 'lucide-react';
import { back, goHome } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog } from '../components/dialogs';
import { BigButton, Card, Code, Screen, formatBytes } from '../components/ui';
import { useT } from '../i18n';
import { pendingExport, runExport, type PendingExport } from '../lib/exporter';
import type { ExportRecord } from '../lib/types';

export default function ExportScreen() {
    const t = useT();
    const { profile } = useApp();
    const [pending, setPending] = useState<PendingExport | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<ExportRecord | null>(null);

    useEffect(() => {
        pendingExport().then(setPending);
    }, []);

    async function start() {
        setProgress({ done: 0, total: pending?.photoCount ?? 0 });
        try {
            setResult(await runExport(profile, (done, total) => setProgress({ done, total })));
        } catch (e) {
            await alertDialog(profile.language, `${t('error')} : ${(e as Error).message}`);
        } finally {
            setProgress(null);
        }
    }

    if (result) {
        return (
            <Screen title={t('exportTitle')} footer={<BigButton onClick={goHome}>{t('close')}</BigButton>}>
                <Card className="space-y-4 text-center">
                    <Usb className="mx-auto size-16 text-green-400" />
                    <p className="text-2xl font-bold">{t('exportDone', { boxes: result.boxCount, photos: result.photoCount })}</p>
                    <p className="text-xl leading-relaxed">{t('exportCopyHelp')}</p>
                    <p className="text-stone-400">
                        {t('file')} : <span dir="ltr" className="break-all font-mono text-stone-200">{result.fileName}</span> ({formatBytes(result.sizeBytes)})
                    </p>
                </Card>
            </Screen>
        );
    }

    const busy = progress !== null;
    const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <Screen
            title={t('exportTitle')}
            onBack={busy ? undefined : back}
            footer={
                <BigButton icon={<FileArchive className="size-6" />} disabled={busy || !pending || (!pending.boxes.length && !pending.voided.length)} onClick={start}>
                    {t('createExport')}
                </BigButton>
            }
        >
            <p className="text-stone-400">{t('exportExplain')}</p>
            {pending && (
                <Card>
                    <p className="text-xl">{t('toExport', { boxes: pending.boxes.length, photos: pending.photoCount })}</p>
                    <div dir="ltr" className="mt-3 flex flex-wrap gap-2">
                        {pending.boxes.map((b) => (
                            <Code key={b.code} code={b.code} className="rounded bg-stone-800 px-2 py-1 text-sm" />
                        ))}
                    </div>
                    {pending.voided.length > 0 && <p className="mt-3 text-stone-400">{t('voidedIncluded', { count: pending.voided.length })}</p>}
                </Card>
            )}
            {progress && (
                <Card>
                    <p className="mb-2">{t('exporting', { done: progress.done, total: progress.total })}</p>
                    <div className="h-4 overflow-hidden rounded-full bg-stone-800">
                        <div className="h-full bg-amber-500 transition-all" style={{ width: `${percent}%` }} />
                    </div>
                </Card>
            )}
        </Screen>
    );
}
