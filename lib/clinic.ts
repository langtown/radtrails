import Stripe from 'stripe';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function priceIds(value = '') {
  return [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
}
export function validateCart(input: unknown, allowed: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'items')) throw new HttpError(400, 'Only items may be supplied.');
  const items = (input as {items?: unknown}).items;
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new HttpError(400, 'Choose between 1 and 20 items.');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(k => !['price', 'quantity'].includes(k)) || typeof item.price !== 'string' || !allowed.includes(item.price) || seen.has(item.price) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new HttpError(400, 'An item or quantity is invalid. Please refresh your bag.');
    }
    seen.add(item.price);
    return {price: item.price as string, quantity: item.quantity as number};
  });
}
export async function catalog(stripe: Stripe, ids: string[]) {
  return (await Promise.all(ids.map(id => stripe.prices.retrieve(id, {expand: ['product']}))))
    .filter(price => price.active && price.type === 'one_time' && price.unit_amount !== null && typeof price.product !== 'string' && !price.product.deleted && price.product.active)
    .map(price => {
      const product = price.product as Stripe.Product;
      return {id: price.id, name: product.name, description: product.description || '', image: product.images[0] || null, amount: price.unit_amount!, currency: price.currency, physical: product.metadata.shipping === 'required'};
    });
}
// A transaction records the delivery and updates the order together. Paid is terminal:
// late completion/failure events cannot undo an already-confirmed payment.
export async function recordEvent(db: D1Database, event: Stripe.Event) {
  const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'];
  if (!supported.includes(event.type)) return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.shop !== 'radtrails-shop') return;
  const status = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
    ? 'paid' : event.type === 'checkout.session.async_payment_failed' ? 'failed' : 'pending';
  await db.batch([
    db.prepare(`INSERT INTO clinic_orders (session_id, payment_status, amount_total, currency)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM clinic_stripe_events WHERE event_id = ?)
      ON CONFLICT(session_id) DO UPDATE SET
      payment_status = CASE WHEN clinic_orders.payment_status = 'paid' THEN 'paid' WHEN excluded.payment_status = 'paid' THEN 'paid' WHEN clinic_orders.payment_status = 'failed' THEN 'failed' ELSE excluded.payment_status END,
      amount_total = excluded.amount_total, currency = excluded.currency, updated_at = CURRENT_TIMESTAMP`)
      .bind(session.id, status, session.amount_total, session.currency, event.id),
    db.prepare('INSERT OR IGNORE INTO clinic_stripe_events (event_id) VALUES (?)').bind(event.id),
  ]);
}

export type ClinicConfig = {
  secretKey?: string;
  webhookSecret?: string;
  prices: string[];
  origin: string;
};
type ClinicEnv = {CLINIC_ORIGIN?: unknown; STRIPE_SECRET_KEY?: unknown; STRIPE_WEBHOOK_SECRET?: unknown; STRIPE_PRICE_IDS?: unknown};
export function clinicConfigFromEnv(env: ClinicEnv): ClinicConfig {
  const text = (key: keyof ClinicEnv) => typeof env[key] === 'string' ? env[key] as string : undefined;
  return {
    secretKey: text('STRIPE_SECRET_KEY'), webhookSecret: text('STRIPE_WEBHOOK_SECRET'),
    prices: priceIds(text('STRIPE_PRICE_IDS')), origin: text('CLINIC_ORIGIN') || 'https://radtrails.org',
  };
}
export function clinicStripe(config: ClinicConfig) {
  if (!config.secretKey) throw new HttpError(503, 'Checkout is not available yet.');
  return new Stripe(config.secretKey, {httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 15000});
}
export async function createClinicCheckout(config: ClinicConfig, input: unknown, key: string | null, client?: Stripe) {
  const stripe = client ?? clinicStripe(config);
  const items = validateCart(input, config.prices);
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) throw new HttpError(400, 'A valid checkout request ID is required.');
  const products = await catalog(stripe, items.map(item => item.price));
  if (products.length !== items.length || new Set(products.map(p => p.currency)).size !== 1) throw new HttpError(400, 'These items cannot be purchased together. Please refresh your bag.');
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin) throw new Error('CLINIC_ORIGIN must be an origin without a path');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: items.map(item => ({...item, adjustable_quantity: {enabled: true, minimum: 0, maximum: 10}})),
    metadata: {shop: 'radtrails-shop'},
    success_url: `${origin.origin}/clinics?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin.origin}/clinics?canceled=1`,
    ...(products.some(p => p.physical) ? {shipping_address_collection: {allowed_countries: ['US'] as ['US']}} : {}),
  }, {idempotencyKey: `radtrails-${key}`});
  return {url: session.url};
}
