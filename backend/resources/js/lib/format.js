const UNITS = ['o', 'Ko', 'Mo', 'Go', 'To'];

export function formatBytes(bytes) {
    if (!bytes) return '0 o';
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
    return `${(bytes / 1024 ** i).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${UNITS[i]}`;
}

export function formatDateTime(iso) {
    return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export function formatDate(isoDay) {
    if (!isoDay) return '—';
    const [y, m, d] = isoDay.split('-');
    return `${d}/${m}/${y}`;
}

export const percent = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)} %`);

export const location = (box) => [box.room, box.shelf, box.row].filter(Boolean).join(' · ') || '—';
