import { api, ApiError } from './api';

const RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads a ZIP in chunks (resumable: a chunk that fails is retried, and the server
 * tells us where to resume if a chunk was already received). Resolves with the queued import.
 */
export async function uploadZip(file, onProgress) {
    const { id, chunk_bytes: chunkBytes } = await api('uploads', {
        method: 'POST',
        body: { file_name: file.name, size: file.size },
    });

    let offset = 0;
    let failures = 0;
    while (offset < file.size) {
        try {
            const res = await api(`uploads/${id}`, {
                method: 'PUT',
                body: file.slice(offset, offset + chunkBytes),
                headers: { 'Upload-Offset': String(offset), 'Content-Type': 'application/octet-stream' },
            });
            offset = res.received;
            failures = 0;
            onProgress(offset / file.size);
        } catch (e) {
            if (e instanceof ApiError && e.status === 409 && e.body?.received !== undefined) {
                offset = e.body.received; // server already has more (or less): resume there
                continue;
            }
            if (e instanceof ApiError && e.status < 500 && e.status !== 409) throw e;
            if (++failures > RETRIES) throw e;
            await sleep(1000 * failures);
        }
    }

    const res = await api(`uploads/${id}/complete`, { method: 'POST' });
    return res.data;
}
