/** ISO 8601 with the phone's local offset, e.g. "2026-10-22T14:03:05+01:00". */
export function isoLocal(date: Date = new Date()): string {
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
    );
}

/** "20261022_1403" */
export function stamp(date: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}
