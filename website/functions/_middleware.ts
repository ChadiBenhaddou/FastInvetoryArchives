// Every response from a host other than the production domain (previews, *.pages.dev, custom test
// domains) gets X-Robots-Tag: noindex — the production build is also served on <project>.pages.dev.
interface Env { PUBLIC_SITE_URL?: string }

export const onRequest: PagesFunction<Env> = async (context) => {
    const response = await context.next();
    const canonicalHost = context.env.PUBLIC_SITE_URL ? new URL(context.env.PUBLIC_SITE_URL).host : null;
    const host = new URL(context.request.url).host;
    if (canonicalHost && host === canonicalHost) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
