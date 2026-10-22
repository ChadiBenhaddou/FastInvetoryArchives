import { useEffect, useState } from 'react';
import { Archive, Boxes, History, PackagePlus, Settings, Upload } from 'lucide-react';
import { navigate } from '../app/nav';
import { useApp } from '../app/AppContext';
import { askPin } from '../components/dialogs';
import { BigButton, Card, Code, formatBytes } from '../components/ui';
import { useT } from '../i18n';
import { currentOpenBox } from '../lib/boxes';
import { pendingExport, type PendingExport } from '../lib/exporter';
import { ArchiveNative } from '../lib/native';
import type { Box } from '../lib/types';

export default function HomeScreen() {
    const t = useT();
    const { profile } = useApp();
    const [openBox, setOpenBox] = useState<Box | undefined>();
    const [pending, setPending] = useState<PendingExport | null>(null);
    const [storage, setStorage] = useState<{ freeBytes: number; photosBytes: number } | null>(null);

    useEffect(() => {
        currentOpenBox().then(setOpenBox);
        pendingExport().then(setPending);
        ArchiveNative.storageInfo().then(setStorage).catch(() => {});
    }, []);

    async function openAdmin() {
        if (await askPin(profile)) navigate({ name: 'admin' });
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),16px)]">
                <Archive className="size-8 text-amber-500" />
                <div className="flex-1">
                    <div className="text-lg font-bold">{profile.agentName}</div>
                    <div className="text-sm text-stone-400">
                        {t('device')} <Code code={profile.deviceLetter} />
                    </div>
                </div>
                <button onClick={openAdmin} aria-label={t('adminSettings')} className="rounded-full p-3 active:bg-stone-800">
                    <Settings className="size-7" />
                </button>
            </header>

            <main className="flex-1 space-y-4 overflow-y-auto p-4">
                {openBox && (
                    <Card className="border-2 border-amber-500">
                        <div className="text-sm text-stone-400">{t('openBox')}</div>
                        <div className="my-1 flex items-baseline justify-between">
                            <Code code={openBox.code} className="text-3xl" />
                            <span className="text-stone-400">
                                {openBox.photoCount} {t('photos')}
                            </span>
                        </div>
                        <BigButton className="mt-3" onClick={() => navigate({ name: 'capture', code: openBox.code })}>
                            {t('continueBox')}
                        </BigButton>
                    </Card>
                )}

                <Card>
                    <p className="text-stone-300">
                        {pending && (pending.boxes.length
                            ? t('toExport', { boxes: pending.boxes.length, photos: pending.photoCount })
                            : t('nothingToExport'))}
                    </p>
                    {storage && (
                        <p className="mt-1 text-sm text-stone-500">
                            {t('storage')} : {t('storageLine', { photos: formatBytes(storage.photosBytes), free: formatBytes(storage.freeBytes) })}
                        </p>
                    )}
                </Card>

                <div className="grid grid-cols-2 gap-3">
                    <BigButton variant="secondary" icon={<Boxes className="size-6" />} onClick={() => navigate({ name: 'boxes' })}>
                        {t('allBoxes')}
                    </BigButton>
                    <BigButton variant="secondary" icon={<History className="size-6" />} onClick={() => navigate({ name: 'history' })}>
                        {t('history')}
                    </BigButton>
                </div>
            </main>

            <footer className="space-y-3 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
                <BigButton
                    variant="secondary"
                    icon={<Upload className="size-6" />}
                    disabled={!pending || (!pending.boxes.length && !pending.voided.length)}
                    onClick={() => navigate({ name: 'export' })}
                >
                    {t('exportSession')}
                </BigButton>
                <BigButton
                    className="min-h-24 text-2xl"
                    icon={<PackagePlus className="size-8" />}
                    disabled={Boolean(openBox)}
                    onClick={() => navigate({ name: 'newBox' })}
                >
                    {t('newBox')}
                </BigButton>
                {openBox && <p className="text-center text-sm text-stone-500">{t('finishOpenBoxFirst', { code: openBox.code })}</p>}
            </footer>
        </div>
    );
}
