import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Code, ImageViewer, inputClass } from './common';

/**
 * The photo of the handwritten code next to the code recorded by the phone, so that a
 * miswritten box is caught. Admins can correct the code (audited, photos moved).
 */
export default function CodeCheck({ box, onCorrected }) {
    const { user } = useAuth();
    const codePhoto = box.images.find((i) => i.type === 'code_photo');
    const [editing, setEditing] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState(null);

    async function save(e) {
        e.preventDefault();
        setError(null);
        try {
            const res = await api(`boxes/${box.id}/code`, { method: 'PUT', body: { code } });
            setEditing(false);
            onCorrected(res.data);
        } catch (err) {
            setError(err.field?.('code') || err.message);
        }
    }

    return (
        <div className="flex items-stretch gap-4">
            {codePhoto ? (
                <ImageViewer src={codePhoto.url} alt="Photo du code" className="h-36 w-56 shrink-0" />
            ) : (
                <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-red-50 text-sm text-red-700">Pas de photo du code</div>
            )}
            <div className="flex flex-col justify-center gap-2">
                <span className="text-xs uppercase tracking-wide text-stone-500">Code enregistré</span>
                <Code className="text-4xl">{box.code}</Code>
                <span className="text-sm text-stone-500">Le code écrit sur la boîte (photo) est-il identique ?</span>
                {user.role === 'admin' && !editing && (
                    <button onClick={() => { setEditing(true); setCode(box.code); }} className="flex w-fit items-center gap-1 text-sm text-amber-700 hover:underline">
                        <Pencil className="size-3.5" /> Corriger le code
                    </button>
                )}
                {editing && (
                    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
                        <input autoFocus className={`${inputClass} w-36 font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} />
                        <button className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700">Enregistrer</button>
                        <button type="button" onClick={() => setEditing(false)} className="text-sm text-stone-500 hover:underline">Annuler</button>
                        {error && <p className="w-full text-sm text-red-700">{error}</p>}
                    </form>
                )}
            </div>
        </div>
    );
}
