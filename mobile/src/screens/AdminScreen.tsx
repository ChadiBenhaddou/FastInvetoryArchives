import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { back } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog } from '../components/dialogs';
import { BigButton, Card, Code, Field, Screen, inputClass } from '../components/ui';
import { useT } from '../i18n';
import { makeCode } from '../lib/boxCode';
import { listBoxes } from '../lib/db';
import { getNextSequence, getOptions, getPresets, saveOptions, savePresets, setNextSequence } from '../lib/settings';
import type { CaptureOptions, Presets } from '../lib/types';

/** Editable chip list for one location preset. */
function PresetList({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
    const t = useT();
    const [value, setValue] = useState('');
    const add = () => {
        const v = value.trim();
        if (v && !items.includes(v)) onChange([...items, v]);
        setValue('');
    };
    return (
        <Field label={label} group>
            <div className="mb-2 flex flex-wrap gap-2">
                {items.map((item) => (
                    <span key={item} className="flex items-center gap-1 rounded-full bg-stone-800 py-1 pe-1 ps-3">
                        {item}
                        <button onClick={() => onChange(items.filter((i) => i !== item))} className="rounded-full p-1 active:bg-stone-700">
                            <X className="size-4" />
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input className={inputClass} aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
                <button onClick={add} aria-label={t('add')} className="rounded-xl bg-stone-800 px-4 active:bg-stone-700">
                    <Plus className="size-6" />
                </button>
            </div>
        </Field>
    );
}

/** Reached only after the admin PIN was entered. */
export default function AdminScreen() {
    const t = useT();
    const { profile, updateProfile } = useApp();
    const [agentName, setAgentName] = useState(profile.agentName);
    const [presets, setPresets] = useState<Presets | null>(null);
    const [options, setOptions] = useState<CaptureOptions | null>(null);
    const [next, setNext] = useState('');

    useEffect(() => {
        getPresets().then(setPresets);
        getOptions().then(setOptions);
        getNextSequence().then((n) => setNext(String(n)));
    }, []);

    if (!presets || !options) return null;

    async function save() {
        await savePresets(presets!);
        await saveOptions(options!);
        // Never allow going back below a sequence already used on this phone (duplicate codes).
        const highestUsed = Math.max(0, ...(await listBoxes()).map((b) => b.sequence));
        if (Number(next) <= highestUsed) {
            return alertDialog(profile.language, `${t('counterWarn')}\n${t('nextSequence')} > ${highestUsed}`);
        }
        try {
            await setNextSequence(Number(next));
        } catch {
            return alertDialog(profile.language, `${t('nextSequence')} : 1-9999`);
        }
        await updateProfile({ ...profile, agentName: agentName.trim() || profile.agentName });
        await alertDialog(profile.language, t('saved'));
    }

    const nextNumber = Number(next);
    const preview = Number.isInteger(nextNumber) && nextNumber >= 1 && nextNumber <= 9999 ? makeCode(profile.deviceLetter, nextNumber) : '—';

    return (
        <Screen title={t('adminSettings')} onBack={back} footer={<BigButton onClick={save}>{t('save')}</BigButton>}>
            <Card className="space-y-4">
                <Field label={t('agentName')}>
                    <input className={inputClass} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                </Field>
                <Field label={t('language')} group>
                    <div className="grid grid-cols-2 gap-2">
                        {(['fr', 'ar'] as const).map((l) => (
                            <button key={l} onClick={() => updateProfile({ ...profile, language: l })}
                                className={`min-h-12 rounded-xl font-semibold ${profile.language === l ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}>
                                {l === 'fr' ? 'Français' : 'العربية'}
                            </button>
                        ))}
                    </div>
                </Field>
            </Card>

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold">{t('presets')}</h2>
                <PresetList label={t('room')} items={presets.rooms} onChange={(rooms) => setPresets({ ...presets, rooms })} />
                <PresetList label={t('shelf')} items={presets.shelves} onChange={(shelves) => setPresets({ ...presets, shelves })} />
                <PresetList label={t('row')} items={presets.rows} onChange={(rows) => setPresets({ ...presets, rows })} />
            </Card>

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold">{t('captureSettings')}</h2>
                <label className="flex min-h-12 items-center justify-between gap-3">
                    <span>{t('autoCrop')}</span>
                    <input type="checkbox" className="size-7 accent-amber-500" checked={options.autoCrop}
                        onChange={(e) => setOptions({ ...options, autoCrop: e.target.checked })} />
                </label>
                <Field label={t('minSharpness')}>
                    <input className={inputClass} inputMode="numeric" dir="ltr" value={options.minSharpness}
                        onChange={(e) => setOptions({ ...options, minSharpness: Number(e.target.value.replace(/\D/g, '')) })} />
                </Field>
                <Field label={t('minBrightness')}>
                    <input className={inputClass} inputMode="numeric" dir="ltr" value={options.minBrightness}
                        onChange={(e) => setOptions({ ...options, minBrightness: Math.min(255, Number(e.target.value.replace(/\D/g, ''))) })} />
                </Field>
            </Card>

            <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{t('counter')}</h2>
                <Field label={t('nextSequence')}>
                    <input className={inputClass} inputMode="numeric" dir="ltr" value={next}
                        onChange={(e) => setNext(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                </Field>
                <p className="text-stone-400">→ <Code code={preview} /></p>
                <p className="text-sm text-amber-400">{t('counterWarn')}</p>
            </Card>
        </Screen>
    );
}
