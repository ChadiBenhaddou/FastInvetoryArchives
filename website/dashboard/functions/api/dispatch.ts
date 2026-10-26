import type { AccessIdentity } from '../../server/access';
import { handleDispatch, type DispatchEnv } from '../../server/dispatch';

export const onRequestPost: PagesFunction<DispatchEnv, string, { user: AccessIdentity }> = async ({ request, env, data }) => {
    const result = await handleDispatch(request, env, data.user);
    return Response.json(result.body, { status: result.status });
};
