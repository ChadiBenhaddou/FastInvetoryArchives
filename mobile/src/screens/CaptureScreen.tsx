import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Flashlight, FlashlightOff, Loader2, Trash2 } from 'lucide-react';
import { navigate } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog, confirmDialog } from '../components/dialogs';
import { BigButton, Code } from '../components/ui';
import { useT } from '../i18n';
import { addPhoto, deleteLastPhoto } from '../lib/boxes';
import { Camera } from '../lib/camera';
import * as db from '../lib/db';
import type { QualityVerdict } from '../lib/imageQuality';
import { processPhoto, warmUpProcessor } from '../lib/processor';
import { getOptions } from '../lib/settings';
import type { Box, CaptureOptions, Photo } from '../lib/types';

interface Rejection {
    verdict: QualityVerdict;
    blob: Blob;
}

/**
 * Rapid capture: the camera stays open, one tap = one photo.
 * Photo 0 is the handwritten code on the box, then one photo per file.
 */
export default function CaptureScreen({ code }: { code: string }) {
    const t = useT();
    const { profile } = useApp();
    const videoRef = useRef<HTMLVideoElement>(null);
    const cameraRef = useRef(new Camera());
    const [box, setBox] = useState<Box | null>(null);
    const [options, setOptions] = useState<CaptureOptions | null>(null);
    const [last, setLast] = useState<Photo | null>(null);
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState(false);
    const [torch, setTorch] = useState(false);
    const [hasTorch, setHasTorch] = useState(false);
    const [rejection, setRejection] = useState<Rejection | null>(null);
    const [cameraError, setCameraError] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);

    const refreshLast = useCallback(async () => {
        const photos = await db.photosOf(code);
        setLast(photos.at(-1) ?? null);
    }, [code]);

    useEffect(() => {
        db.getBox(code).then((b) => setBox(b ?? null));
        getOptions().then((o) => {
            setOptions(o);
            if (o.autoCrop) warmUpProcessor();
        });
        refreshLast();

        const camera = cameraRef.current;
        camera
            .start(videoRef.current!)
            .then(() => {
                setHasTorch(camera.hasTorch);
                setCameraReady(true); // the shutter stays disabled until frames are flowing
            })
            .catch(() => setCameraError(true));
        return () => camera.stop();
    }, [code, refreshLast]);

    useEffect(() => {
        const url = last ? URL.createObjectURL(last.thumb) : null;
        setThumbUrl(url);
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [last]);

    async function store(blob: Blob, override: boolean) {
        if (!box || !options) return;
        const type = box.photoCount === 0 ? 'code_photo' : 'document';
        const { rejected, result } = await processPhoto(blob, type, options, override);
        if (rejected) {
            navigator.vibrate?.([80, 60, 80]);
            setRejection({ verdict: rejected, blob });
            return;
        }
        const photo = await addPhoto(box, result!);
        setBox({ ...box });
        setLast(photo);
    }

    async function shoot() {
        if (busy || !box) return;
        setBusy(true);
        setFlash(true);
        setTimeout(() => setFlash(false), 120);
        try {
            await store(await cameraRef.current.shoot(videoRef.current!), false);
        } catch (e) {
            await alertDialog(profile.language, `${t('error')} : ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    }

    async function keepAnyway() {
        if (!rejection) return;
        const { blob } = rejection;
        setRejection(null);
        setBusy(true);
        try {
            await store(blob, true);
        } catch (e) {
            await alertDialog(profile.language, `${t('error')} : ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    }

    async function removeLast() {
        if (!box || !last) return;
        const message = last.type === 'code_photo' ? t('deleteLastCode') : t('deleteLast');
        if (await confirmDialog(profile.language, message, true)) {
            await deleteLastPhoto(box);
            setBox({ ...box });
            await refreshLast();
        }
    }

    async function toggleTorch() {
        await cameraRef.current.setTorch(!torch).catch(() => {});
        setTorch(cameraRef.current.torch);
    }

    const needsCodePhoto = !box || box.photoCount === 0;

    return (
        <div className="relative h-full overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            {flash && <div className="absolute inset-0 bg-white/60" />}

            {/* Top bar: box code, count, hint */}
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-[max(env(safe-area-inset-top),12px)]">
                <div className="flex items-baseline justify-between">
                    <Code code={code} className="text-3xl" />
                    <span className="text-2xl font-bold">
                        {box?.photoCount ?? 0} <span className="text-base font-normal">{t('photos')}</span>
                    </span>
                </div>
                <p className={`mt-1 text-lg ${needsCodePhoto ? 'font-semibold text-amber-400' : 'text-stone-200'}`}>
                    {needsCodePhoto ? t('shootCode') : t('shootDocs')}
                </p>
                {last && (
                    <p className="text-xs text-stone-400">
                        {t('score', { s: Math.round(last.sharpness), b: Math.round(last.brightness) })}
                    </p>
                )}
            </div>

            {cameraError && (
                <div className="absolute inset-x-4 top-1/3 rounded-2xl bg-red-950 p-4 text-lg text-red-200">{t('cameraError')}</div>
            )}

            {/* Bottom controls, reachable with one thumb */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-6 pb-[max(env(safe-area-inset-bottom),20px)] pt-10">
                <div className="flex items-center justify-between">
                    <button
                        onClick={removeLast}
                        disabled={!last || busy}
                        aria-label={t('deleteLast')}
                        className="relative size-20 overflow-hidden rounded-xl border-2 border-stone-500 bg-stone-900 disabled:opacity-30"
                    >
                        {thumbUrl && <img src={thumbUrl} alt="" className="h-full w-full object-cover" />}
                        {last && <Trash2 className="absolute bottom-1 end-1 size-6 rounded bg-black/70 p-0.5 text-red-400" />}
                    </button>

                    <button
                        onClick={shoot}
                        disabled={busy || !cameraReady || !box}
                        aria-label="Photo"
                        className="flex size-24 items-center justify-center rounded-full border-[6px] border-white bg-white/20 active:bg-white/60 disabled:opacity-50"
                    >
                        {busy && <Loader2 className="size-10 animate-spin" />}
                    </button>

                    <button
                        onClick={toggleTorch}
                        disabled={!hasTorch}
                        aria-label={t('torch')}
                        className={`flex size-20 items-center justify-center rounded-full disabled:opacity-20 ${torch ? 'bg-amber-400 text-black' : 'bg-stone-800'}`}
                    >
                        {torch ? <Flashlight className="size-9" /> : <FlashlightOff className="size-9" />}
                    </button>
                </div>

                <BigButton
                    variant="secondary"
                    className="mt-5"
                    icon={<Check className="size-6" />}
                    disabled={busy}
                    onClick={() => navigate({ name: 'box', code }, { replace: true })}
                >
                    {t('finish')}
                </BigButton>
            </div>

            {rejection && (
                <div className="absolute inset-0 flex flex-col justify-end bg-black/75 p-4 pb-[max(env(safe-area-inset-bottom),20px)]">
                    <div className="space-y-4 rounded-3xl bg-stone-900 p-6">
                        <p className="text-3xl font-bold text-red-400">{rejection.verdict.problem === 'dark' ? t('dark') : t('blurry')}</p>
                        <p className="text-xl">{rejection.verdict.problem === 'dark' ? t('darkHelp') : t('retakeHelp')}</p>
                        <p className="text-sm text-stone-500">
                            {t('score', { s: Math.round(rejection.verdict.sharpness), b: Math.round(rejection.verdict.brightness) })}
                        </p>
                        <BigButton className="min-h-20 text-2xl" onClick={() => setRejection(null)}>
                            {t('retake')}
                        </BigButton>
                        <BigButton variant="ghost" className="min-h-12 text-base" onClick={keepAnyway}>
                            {t('keepAnyway')}
                        </BigButton>
                    </div>
                </div>
            )}
        </div>
    );
}
