// Promise-based confirm / alert / PIN dialogs with big buttons.
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useT, type Lang } from '../i18n';
import { verifyPin } from '../lib/pin';
import type { Profile } from '../lib/types';
import { BigButton, inputClass } from './ui';

function mount<T>(lang: Lang, render: (done: (value: T) => void) => ReactNode): Promise<T> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    return new Promise<T>((resolve) => {
        const done = (value: T) => {
            root.unmount();
            host.remove();
            resolve(value);
        };
        root.render(<I18nProvider lang={lang}>{render(done)}</I18nProvider>);
    });
}

function Modal({ children }: { children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 sm:items-center">
            <div className="w-full space-y-4 rounded-3xl bg-stone-900 p-6 text-stone-100 shadow-xl">{children}</div>
        </div>
    );
}

function ConfirmDialog({ message, danger, done }: { message: string; danger?: boolean; done: (ok: boolean) => void }) {
    const t = useT();
    return (
        <Modal>
            <p className="text-xl leading-relaxed">{message}</p>
            <BigButton variant={danger ? 'danger' : 'primary'} onClick={() => done(true)}>
                {t('confirm')}
            </BigButton>
            <BigButton variant="secondary" onClick={() => done(false)}>
                {t('cancel')}
            </BigButton>
        </Modal>
    );
}

function AlertDialog({ message, done }: { message: string; done: () => void }) {
    const t = useT();
    return (
        <Modal>
            <p className="whitespace-pre-line text-xl leading-relaxed">{message}</p>
            <BigButton onClick={done}>{t('close')}</BigButton>
        </Modal>
    );
}

function PinDialog({ profile, done }: { profile: Profile; done: (ok: boolean) => void }) {
    const t = useT();
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        const ok = await verifyPin(pin, profile.pinHash, profile.pinSalt);
        setBusy(false);
        if (ok) done(true);
        else {
            setError(true);
            setPin('');
        }
    }

    return (
        <Modal>
            <p className="text-xl font-semibold">{t('enterPin')}</p>
            <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={8}
                dir="ltr"
                className={`${inputClass} text-center text-3xl tracking-[0.5em]`}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            {error && <p className="text-red-400">{t('wrongPin')}</p>}
            <BigButton disabled={pin.length < 6 || busy} onClick={submit}>
                {t('confirm')}
            </BigButton>
            <BigButton variant="secondary" onClick={() => done(false)}>
                {t('cancel')}
            </BigButton>
        </Modal>
    );
}

export const confirmDialog = (lang: Lang, message: string, danger = false) =>
    mount<boolean>(lang, (done) => <ConfirmDialog message={message} danger={danger} done={done} />);

export const alertDialog = (lang: Lang, message: string) =>
    mount<void>(lang, (done) => <AlertDialog message={message} done={() => done()} />);

export const askPin = (profile: Profile) =>
    mount<boolean>(profile.language, (done) => <PinDialog profile={profile} done={done} />);
