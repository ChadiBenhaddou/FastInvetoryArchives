// Every request to the dashboard (pages, data.json, API) must carry a valid Cloudflare Access token.
import { verifyAccess, type AccessEnv } from '../server/access';

export const onRequest: PagesFunction<AccessEnv> = async (context) => {
    try {
        const user = await verifyAccess(context.request, context.env);
        context.data.user = user;
    } catch (error) {
        return new Response(`Accès refusé : ${(error as Error).message}`, { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
    }
    return context.next();
};
