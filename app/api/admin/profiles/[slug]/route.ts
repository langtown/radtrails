import { handleApiOptions, secureApiResponse } from '@/lib/api-security';
import { getAppRuntime } from '@/lib/db';
import { requireAdminUser } from '@/lib/persona-admin';
import { adminGetProfileBySlug, adminUpdateProfile } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return secureApiResponse(request, async () => {
    const { db } = await getAppRuntime();
    await requireAdminUser(db, request);
    const { slug } = await ctx.params;
    const profile = await adminGetProfileBySlug(db, slug);
    if (!profile) return Response.json({ error: 'profile not found' }, { status: 404 });
    return Response.json({ profile });
  });
}

export async function PUT(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return secureApiResponse(request, async () => {
    const { db } = await getAppRuntime();
    const actorId = await requireAdminUser(db, request);
    const { slug } = await ctx.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    // Need to find profile user id by slug
    const existing = await adminGetProfileBySlug(db, slug);
    if (!existing) return Response.json({ error: 'profile not found' }, { status: 404 });

    try {
      await adminUpdateProfile(db, actorId, existing.userId, body as any);
      return Response.json({ ok: true });
    } catch (err: any) {
      return Response.json({ error: err?.message ?? 'failed' }, { status: 400 });
    }
  });
}

export { handleApiOptions as OPTIONS };
