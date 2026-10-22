// Thin fetch wrapper for the same-origin Laravel API (session cookie + CSRF).

export class ApiError extends Error {
    constructor(status, body) {
        super(body?.message || `Erreur ${status}`);
        this.status = status;
        this.errors = body?.errors || {};
    }

    /** First validation message for a field, if any. */
    field(name) {
        return this.errors[name]?.[0];
    }
}

function xsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    const token = xsrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const response = await fetch(`/api/${path.replace(/^\//, '')}`, {
        method,
        headers,
        body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
        credentials: 'same-origin',
        signal,
    });

    const data = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        if (response.status === 401 && path !== 'auth/me') onUnauthorized();
        throw new ApiError(response.status, data);
    }
    return data;
}
