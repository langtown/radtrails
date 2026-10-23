import Stripe from 'stripe';
import {catalog, clinicStripe, createClinicCheckout, HttpError, recordEvent, type ClinicConfig} from './clinic';
import {rateLimitResponse, type RateLimitBinding} from './api-security';
export const clinicJson = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
export async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Request body required.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function respond(handler: () => Promise<Response>) {
  try { return await handler(); }
  catch (error) {
    if (error instanceof HttpError) return clinicJson({error: error.message}, error.status);
    console.error('Clinic request failed', {type: error instanceof Error ? error.name : 'UnknownError'});
    return clinicJson({error: 'Something went wrong. Please try again shortly.'}, 500);
  }
}
export async function handleClinicRequest(request: Request, action: 'catalog' | 'checkout' | 'session', config: ClinicConfig, limiter?: RateLimitBinding) {
  return respond(async () => {
    if (action === 'checkout') {
      const limited = await rateLimitResponse(request, limiter, 'clinic-checkout', 60);
      if (limited) return limited;
      if (!request.headers.get('Content-Type')?.includes('application/json')) throw new HttpError(415, 'JSON required.');
      let input: unknown;
      try { input = JSON.parse(await boundedBody(request, 8192)); }
      catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Invalid JSON.'); }
      return clinicJson(await createClinicCheckout(config, input, request.headers.get('Idempotency-Key')));
    }
    if (action === 'catalog' && (!config.secretKey || !config.prices.length)) return clinicJson({products: [], configured: false});
    const stripe = clinicStripe(config);
    if (action === 'catalog') return clinicJson({products: await catalog(stripe, config.prices), configured: true});
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^cs_(test_|live_)?[a-zA-Z0-9]{10,200}$/.test(id)) throw new HttpError(400, 'Invalid session.');
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.metadata?.shop !== 'radtrails-shop') throw new HttpError(404, 'Session not found.');
    return clinicJson({status: session.status, paymentStatus: session.payment_status});
  });
}
// Deliberately outside /api: Stripe authenticates with its signature, not browser Origin.
// Keep processing in-flight payments even after new clinic sales are switched off.
export async function handleClinicWebhook(db: D1Database, request: Request, config: ClinicConfig) {
  return respond(async () => {
    if (!config.webhookSecret) throw new HttpError(503, 'Webhook is not configured.');
    const raw = await boundedBody(request, 1024 * 1024);
    let event: Stripe.Event;
    try { event = await clinicStripe(config).webhooks.constructEventAsync(raw, request.headers.get('stripe-signature') || '', config.webhookSecret, undefined, Stripe.createSubtleCryptoProvider()); }
    catch { throw new HttpError(400, 'Invalid webhook signature.'); }
    await recordEvent(db, event);
    return clinicJson({received: true});
  });
}
