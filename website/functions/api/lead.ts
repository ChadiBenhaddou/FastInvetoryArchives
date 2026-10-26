import { handleLead, type LeadEnv } from '../../server/lead';

// JSON for the page's script; redirect for a browser without JavaScript.
export const onRequestPost: PagesFunction<LeadEnv> = async ({ request, env }) => {
    const outcome = await handleLead(request, env);
    if ((request.headers.get('Accept') ?? '').includes('application/json')) {
        return Response.json(outcome.ok ? { ok: true } : { ok: false, error: outcome.error }, { status: outcome.status });
    }
    const target = outcome.ok ? '/merci/' : `/contact/?erreur=${outcome.status}`;
    return Response.redirect(new URL(target, request.url).href, 303);
};

export const onRequest: PagesFunction = () => new Response('Méthode non autorisée', { status: 405, headers: { Allow: 'POST' } });
