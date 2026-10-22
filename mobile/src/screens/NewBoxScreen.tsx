import { useEffect, useState } from 'react';
import { back, navigate } from '../app/nav';
import { useApp } from '../app/AppContext';
import { alertDialog } from '../components/dialogs';
import { BigButton, Card, Code, Field, Screen, inputClass } from '../components/ui';
import { useT } from '../i18n';
import { createBox } from '../lib/boxes';
import { getLastLocation, getPresets } from '../lib/settings';
import type { Box, Location, Presets } from '../lib/types';

/** Preset chips + free text for one location field. */
function LocationField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <Field label={label} group>
            {options.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                    {options.map((o) => (
                        <button
                            key={o}
                            onClick={() => onChange(value === o ? '' : o)}
                            className={`min-h-12 rounded-full px-4 text-lg ${value === o ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            )}
            <input className={inputClass} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
        </Field>
    );
}

export default function NewBoxScreen() {
    const t = useT();
    const { profile } = useApp();
    const [presets, setPresets] = useState<Presets | null>(null);
    const [location, setLocation] = useState({ room: '', shelf: '', row: '' });
    const [box, setBox] = useState<Box | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        getPresets().then(setPresets);
        // Agents usually work shelf by shelf: start from the previous box's location.
        getLastLocation().then((l) => setLocation({ room: l.room ?? '', shelf: l.shelf ?? '', row: l.row ?? '' }));
    }, []);

    async function generate() {
        setBusy(true);
        try {
            const clean = (v: string) => v.trim() || null;
            const loc: Location = { room: clean(location.room), shelf: clean(location.shelf), row: clean(location.row) };
            setBox(await createBox(profile, loc));
        } catch (e) {
            const message = (e as Error).message;
            await alertDialog(profile.language, message === 'SEQUENCE_EXHAUSTED' ? t('sequenceExhausted') : message);
        } finally {
            setBusy(false);
        }
    }

    if (box) {
        // The code is shown huge so it can be copied onto the box without mistakes.
        return (
            <Screen
                title={t('newBox')}
                footer={
                    <BigButton className="min-h-24 text-2xl" onClick={() => navigate({ name: 'capture', code: box.code }, { replace: true })}>
                        {t('codeWritten')}
                    </BigButton>
                }
            >
                <Card className="py-8 text-center">
                    <p className="text-2xl font-bold">{t('writeCodeTitle')}</p>
                    <Code code={box.code} className="my-6 block text-[18vw] leading-none text-amber-400" />
                    <p className="text-xl text-stone-300">{t('writeCodeHelp')}</p>
                </Card>
            </Screen>
        );
    }

    return (
        <Screen
            title={t('newBox')}
            onBack={back}
            footer={
                <BigButton disabled={busy || !presets} onClick={generate}>
                    {t('generateCode')}
                </BigButton>
            }
        >
            <p className="text-stone-400">{t('location')}</p>
            {presets && (
                <>
                    <LocationField label={t('room')} options={presets.rooms} value={location.room} onChange={(room) => setLocation({ ...location, room })} />
                    <LocationField label={t('shelf')} options={presets.shelves} value={location.shelf} onChange={(shelf) => setLocation({ ...location, shelf })} />
                    <LocationField label={t('row')} options={presets.rows} value={location.row} onChange={(row) => setLocation({ ...location, row })} />
                </>
            )}
        </Screen>
    );
}
