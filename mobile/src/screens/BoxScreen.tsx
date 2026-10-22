import { useEffect, useState } from 'react';
import { Camera, Lock, RotateCcw, XCircle } from 'lucide-react';
import { back, goHome, navigate } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog, confirmDialog } from '../components/dialogs';
import { BigButton, Card, Code, Screen } from '../components/ui';
import { useT } from '../i18n';
import { BoxError, closeBox, currentOpenBox, reopenBox, voidBox } from '../lib/boxes';
import * as db from '../lib/db';
import { photoUrl } from '../lib/photoStore';
import type { Box, Photo } from '../lib/types';

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        const u = URL.createObjectURL(photo.thumb);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [photo]);
    return (
        <button onClick={onOpen} className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-stone-800 ${photo.type === 'code_photo' ? 'ring-2 ring-amber-500' : ''}`}>
            {url && <img src={url} alt="" className="h-full w-full object-cover" />}
            <span dir="ltr" className="absolute bottom-0 start-0 bg-black/70 px-1 font-mono text-xs">
                {String(photo.sequence).padStart(3, '0')}
            </span>
            {photo.override && <span className="absolute end-1 top-1 size-3 rounded-full bg-red-500" />}
        </button>
    );
}

export default function BoxScreen({ code }: { code: string }) {
    const t = useT();
    const { profile } = useApp();
    const [box, setBox] = useState<Box | null>(null);
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [viewer, setViewer] = useState<string | null>(null);

    async function load() {
        setBox((await db.getBox(code)) ?? null);
        setPhotos(await db.photosOf(code));
    }
    useEffect(() => {
        load();
    }, [code]);

    if (!box) return null;
    const lang = profile.language;

    async function close() {
        if (!box) return;
        if (box.photoCount < 1) return alertDialog(lang, t('closeNeedsCode'));
        let message = t('closeBoxConfirm', { code: box.code, count: box.photoCount });
        if (box.photoCount === 1) message += `\n\n${t('onlyCodePhoto')}`;
        if (!(await confirmDialog(lang, message))) return;
        await closeBox(box);
        await alertDialog(lang, t('boxClosed', { code: box.code, count: box.photoCount }));
        goHome();
    }

    async function reopen() {
        if (!box) return;
        try {
            await reopenBox(box);
            navigate({ name: 'capture', code: box.code }, { replace: true });
        } catch (e) {
            if (e instanceof BoxError && e.code === 'BOX_ALREADY_OPEN') {
                const open = await currentOpenBox();
                await alertDialog(lang, t('finishOpenBoxFirst', { code: open?.code ?? '' }));
            } else throw e;
        }
    }

    async function cancelBox() {
        if (!box || !(await confirmDialog(lang, t('voidConfirm', { code: box.code }), true))) return;
        await voidBox(box);
        goHome();
    }

    const location = [box.location.room, box.location.shelf, box.location.row].filter(Boolean).join(' · ');

    return (
        <Screen
            title={t('allBoxes')}
            onBack={back}
            footer={
                <>
                    {box.status === 'open' && (
                        <>
                            <BigButton icon={<Lock className="size-6" />} onClick={close}>
                                {t('closeBox')} ({box.photoCount})
                            </BigButton>
                            <BigButton variant="secondary" icon={<Camera className="size-6" />}
                                onClick={() => navigate({ name: 'capture', code: box.code }, { replace: true })}>
                                {t('takePhotos')}
                            </BigButton>
                        </>
                    )}
                    {box.status === 'closed' && (
                        <BigButton variant="secondary" icon={<RotateCcw className="size-6" />} onClick={reopen}>
                            {t('reopen')}
                        </BigButton>
                    )}
                </>
            }
        >
            <Card className="text-center">
                <Code code={box.code} className="text-5xl text-amber-400" />
                <p className="mt-2 text-lg">{t(`boxStatus_${box.status}`)}{box.purged && ` · ${t('purged')}`}</p>
                {location && <p className="text-stone-400">{location}</p>}
            </Card>

            {photos.length ? (
                <div className="grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                        <Thumb key={p.id} photo={p} onOpen={async () => setViewer(await photoUrl(p.path))} />
                    ))}
                </div>
            ) : (
                <p className="text-center text-stone-500">{t('noPhotos')}</p>
            )}

            {box.status === 'open' && (
                <BigButton variant="ghost" className="text-base text-red-400" icon={<XCircle className="size-5" />} onClick={cancelBox}>
                    {t('voidBox')}
                </BigButton>
            )}

            {viewer && (
                <button onClick={() => setViewer(null)} className="fixed inset-0 z-40 bg-black">
                    <img src={viewer} alt="" className="h-full w-full object-contain" />
                </button>
            )}
        </Screen>
    );
}
