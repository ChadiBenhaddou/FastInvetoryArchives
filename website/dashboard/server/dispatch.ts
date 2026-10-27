// Publishing actions from the dashboard: start a GitHub Actions workflow. Only for the e-mails in
// DASHBOARD_ADMINS, validated server-side, rate-limited (KV, optional), never exposing the GitHub token.
import type { AccessIdentity } from './access';

export interface DispatchEnv {
    DASHBOARD_ADMINS?: string; // comma-separated e-mails
    GITHUB_DISPATCH_TOKEN?: string; // fine-grained token: Actions read/write on this repository only
    GITHUB_REPOSITORY?: string; // "owner/repo"
    GITHUB_REF?: string; // branch, default "main"
    DASHBOARD_KV?: KVNamespace; // optional: rate limit
    DISPATCH_PER_HOUR?: string;
}

const WORKFLOWS = { 'run-daily': 'website-daily-article.yml', unpublish: 'website-unpublish.yml', research: 'website-research.yml' } as const;

export interface DispatchResult { status: number; body: Record<string, unknown> }

export async function handleDispatch(request: Request, env: DispatchEnv, user: AccessIdentity, fetchImpl: typeof fetch = fetch): Promise<DispatchResult> {
    const admins = (env.DASHBOARD_ADMINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(user.email)) return { status: 403, body: { error: 'action réservée aux administrateurs du tableau de bord' } };
    if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) return { status: 503, body: { error: 'GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY non configurés' } };

    const input = (await request.json().catch(() => null)) as { action?: string; slug?: string; reason?: string } | null;
    const action = input?.action as keyof typeof WORKFLOWS | undefined;
    if (!action || !(action in WORKFLOWS)) return { status: 400, body: { error: 'action inconnue' } };
    const inputs: Record<string, string> = {};
    if (action === 'unpublish') {
        if (!input?.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) return { status: 400, body: { error: 'slug invalide' } };
        inputs.slug = input.slug;
        inputs.reason = String(input.reason ?? '').slice(0, 200) || `dépublié par ${user.email}`;
    }

    if (env.DASHBOARD_KV) {
        const key = `rate:${user.email}:${new Date().toISOString().slice(0, 13)}`;
        const count = Number((await env.DASHBOARD_KV.get(key)) ?? 0);
        if (count >= Number(env.DISPATCH_PER_HOUR ?? 10)) return { status: 429, body: { error: 'trop d’actions cette heure-ci' } };
        await env.DASHBOARD_KV.put(key, String(count + 1), { expirationTtl: 7200 });
    }

    const res = await fetchImpl(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${WORKFLOWS[action]}/dispatches`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'inventaire-archives-dashboard',
        },
        body: JSON.stringify({ ref: env.GITHUB_REF ?? 'main', inputs }),
    });
    if (res.status !== 204) return { status: 502, body: { error: `GitHub a refusé (${res.status})` } };
    return { status: 202, body: { ok: true, action, by: user.email } };
}
