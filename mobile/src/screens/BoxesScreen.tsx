import { useEffect, useState } from 'react';
import { back, navigate } from '../app/nav';
import { Code, Screen } from '../components/ui';
import { useT } from '../i18n';
import { listBoxes } from '../lib/db';
import type { Box } from '../lib/types';

const STATUS_COLORS: Record<Box['status'], string> = {
    open: 'bg-amber-500 text-stone-950',
    closed: 'bg-sky-700',
    exported: 'bg-green-800',
    voided: 'bg-stone-700 line-through',
};

export default function BoxesScreen() {
    const t = useT();
    const [boxes, setBoxes] = useState<Box[]>([]);
    useEffect(() => {
        listBoxes().then(setBoxes);
    }, []);

    return (
        <Screen title={t('allBoxes')} onBack={back}>
            <ul className="divide-y divide-stone-800">
                {boxes.map((b) => (
                    <li key={b.code}>
                        <button onClick={() => navigate({ name: 'box', code: b.code })} className="flex min-h-16 w-full items-center gap-3 py-2 active:bg-stone-900">
                            <Code code={b.code} className="text-2xl" />
                            <span className="flex-1 text-start text-stone-400">
                                {b.photoCount} {t('photos')}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-sm ${STATUS_COLORS[b.status]}`}>{t(`boxStatus_${b.status}`)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </Screen>
    );
}
