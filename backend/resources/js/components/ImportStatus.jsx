export const IMPORT_STATUS = {
    pending: { label: 'En attente', className: 'bg-stone-100 text-stone-700' },
    processing: { label: 'En cours', className: 'bg-sky-100 text-sky-800' },
    completed: { label: 'Terminé', className: 'bg-green-100 text-green-800' },
    completed_with_issues: { label: 'Terminé avec anomalies', className: 'bg-amber-100 text-amber-800' },
    failed: { label: 'Échec', className: 'bg-red-100 text-red-800' },
    duplicate: { label: 'Déjà importé', className: 'bg-stone-200 text-stone-700' },
};

export const isFinished = (status) => !['pending', 'processing'].includes(status);

export function StatusBadge({ status }) {
    const s = IMPORT_STATUS[status] ?? { label: status, className: 'bg-stone-100' };
    return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export function SummaryLine({ summary }) {
    if (!summary) return null;
    const parts = [
        `${summary.boxes_added} boîte(s) ajoutée(s)`,
        `${summary.photos_added} photo(s)`,
        summary.duplicates_skipped && `${summary.duplicates_skipped} doublon(s) ignoré(s)`,
        summary.conflicts && `${summary.conflicts} conflit(s)`,
        summary.errors && `${summary.errors} erreur(s)`,
    ].filter(Boolean);
    return <span>{parts.join(' · ')}</span>;
}
