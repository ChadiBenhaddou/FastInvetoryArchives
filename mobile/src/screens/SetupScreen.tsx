import { useState } from 'react';
import { I18nProvider, useT, type Lang } from '../i18n';
import { ALPHABET } from '../lib/boxCode';
import { hashPin, isValidPinFormat } from '../lib/pin';
import { saveProfile, setNextSequence } from '../lib/settings';
import { isoLocal } from '../lib/time';
import type { Profile } from '../lib/types';
import { BigButton, Field, Screen, inputClass } from '../components/ui';

/** First launch: done once by the admin. There is no server, everything stays on the phone. */
export default function SetupScreen({ onDone }: { onDone: (p: Profile) => void }) {
    const [lang, setLang] = useState<Lang>('fr');
    return (
        <I18nProvider lang={lang}>
            <SetupForm lang={lang} setLang={setLang} onDone={onDone} />
        </I18nProvider>
    );
}

function SetupForm({ lang, setLang, onDone }: { lang: Lang; setLang: (l: Lang) => void; onDone: (p: Profile) => void }) {
    const t = useT();
    const [agentName, setAgentName] = useState('');
    const [letter, setLetter] = useState('');
    const [next, setNext] = useState('1');
    const [pin, setPin] = useState('');
    const [pin2, setPin2] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const nextNumber = Number(next);
    const valid = agentName.trim() && letter && Number.isInteger(nextNumber) && nextNumber >= 1 && nextNumber <= 9999;

    async function submit() {
        if (!isValidPinFormat(pin)) return setError(t('pinFormat'));
        if (pin !== pin2) return setError(t('pinMismatch'));
        setBusy(true);
        const { hash, salt } = await hashPin(pin);
        const profile: Profile = {
            agentName: agentName.trim(),
            deviceLetter: letter,
            language: lang,
            pinHash: hash,
            pinSalt: salt,
            setupAt: isoLocal(),
        };
        await setNextSequence(nextNumber);
        await saveProfile(profile);
        onDone(profile);
    }

    const pinInput = `${inputClass} text-center tracking-[0.4em]`;

    return (
        <Screen
            title={t('setupTitle')}
            footer={
                <BigButton disabled={!valid || busy} onClick={submit}>
                    {t('setupDone')}
                </BigButton>
            }
        >
            <p className="text-stone-400">{t('setupIntro')}</p>

            <Field label={t('language')} group>
                <div className="grid grid-cols-2 gap-2">
                    {(['fr', 'ar'] as const).map((l) => (
                        <button
                            key={l}
                            onClick={() => setLang(l)}
                            className={`min-h-14 rounded-xl text-lg font-semibold ${lang === l ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}
                        >
                            {l === 'fr' ? 'Français' : 'العربية'}
                        </button>
                    ))}
                </div>
            </Field>

            <Field label={t('agentName')}>
                <input className={inputClass} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </Field>

            <Field label={t('deviceLetter')} group>
                <div dir="ltr" className="grid grid-cols-7 gap-2">
                    {ALPHABET.split('').map((l) => (
                        <button
                            key={l}
                            onClick={() => setLetter(l)}
                            className={`h-12 rounded-lg font-mono text-xl font-bold ${letter === l ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </Field>

            <Field label={t('nextSequence')}>
                <input className={inputClass} inputMode="numeric" dir="ltr" value={next}
                    onChange={(e) => setNext(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                <span className="block text-sm text-stone-500">{t('nextSequenceHelp')}</span>
            </Field>

            <Field label={t('adminPin')}>
                <input className={pinInput} type="password" inputMode="numeric" dir="ltr" maxLength={8} value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label={t('adminPinConfirm')}>
                <input className={pinInput} type="password" inputMode="numeric" dir="ltr" maxLength={8} value={pin2}
                    onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            </Field>

            {error && <p className="rounded-xl bg-red-950 p-3 text-red-300">{error}</p>}
        </Screen>
    );
}
