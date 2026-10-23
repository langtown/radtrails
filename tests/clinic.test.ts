import {beforeEach, describe, expect, it, vi} from 'vitest';
import {env} from 'cloudflare:test';
import Stripe from 'stripe';
import {clinicConfigFromEnv, createClinicCheckout, HttpError, recordEvent, validateCart} from '@/lib/clinic';
import {handleClinicRequest, handleClinicWebhook} from '@/lib/clinic-http';
import {secureApiResponse} from '@/lib/api-security';
const config = clinicConfigFromEnv({CLINIC_ORIGIN:'https://radtrails.org', STRIPE_SECRET_KEY:'sk_test_fake', STRIPE_WEBHOOK_SECRET:'whsec_test', STRIPE_PRICE_IDS:'price_a'});
function event(id: string, type: string, status: string) {
  return {id, type, data: {object: {id:'cs_test_1234567890', metadata:{shop:'radtrails-shop'},payment_status:status,amount_total:2500,currency:'usd'}}} as unknown as Stripe.Event;
}
beforeEach(async () => { await env.DB.batch([env.DB.prepare('DELETE FROM clinic_orders'), env.DB.prepare('DELETE FROM clinic_stripe_events')]); });
describe('clinic configuration', () => {
  it('has an honest empty state without credentials',async () => {
    const response = await handleClinicRequest(new Request('https://radtrails.org/api/clinic/catalog'),'catalog',clinicConfigFromEnv({}));
    expect(await response.json()).toEqual({products:[],configured:false});
  });
});
describe('checkout', () => {
  it.each([null,{}, {items:[]}, {items:[{price:'other',quantity:1}]}, {items:[{price:'price_a',quantity:0}]}, {items:[{price:'price_a',quantity:11}]}, {items:[{price:'price_a',quantity:1.5}]}, {items:[{price:'price_a',quantity:1,amount:1}]}, {items:[{price:'price_a',quantity:1},{price:'price_a',quantity:1}]}])('rejects malformed or tampered carts %j', input => {
    expect(() => validateCart(input,['price_a'])).toThrow(HttpError);
  });
  it('passes only server-controlled prices and adjustable limits to Stripe',async () => {
    const stripe = new Stripe('sk_test_fake');
    vi.spyOn(stripe.prices,'retrieve').mockResolvedValue({id:'price_a',active:true,type:'one_time',unit_amount:2500,currency:'usd',product:{id:'prod_a',active:true,name:'Clinic',images:[],metadata:{}}} as unknown as Stripe.Response<Stripe.Price>);
    const create = vi.spyOn(stripe.checkout.sessions,'create').mockResolvedValue({url:'https://checkout.stripe.com/test'} as Stripe.Response<Stripe.Checkout.Session>);
    await createClinicCheckout(config,{items:[{price:'price_a',quantity:2}]},'checkout-request-123',stripe);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({line_items:[{price:'price_a',quantity:2,adjustable_quantity:{enabled:true,minimum:0,maximum:10}}],success_url:'https://radtrails.org/clinics?session_id={CHECKOUT_SESSION_ID}',cancel_url:'https://radtrails.org/clinics?canceled=1'}),{idempotencyKey:'radtrails-checkout-request-123'});
  });
  it('rejects cross-origin checkout before any Stripe call',async () => {
    const request = new Request('https://radtrails.org/api/clinic/checkout',{method:'POST',headers:{Origin:'https://evil.example'}});
    const response = await secureApiResponse(request,() => handleClinicRequest(request,'checkout',config));
    expect(response.status).toBe(403);
  });
});
describe('payment ledger', () => {
  it('deduplicates delivery and handles out-of-order events against real D1', async () => {
    const paid = event('evt_paid','checkout.session.async_payment_succeeded','paid');
    await recordEvent(env.DB,paid); await recordEvent(env.DB,paid);
    await recordEvent(env.DB,event('evt_pending','checkout.session.completed','unpaid'));
    await recordEvent(env.DB,event('evt_failed','checkout.session.async_payment_failed','unpaid'));
    expect(await env.DB.prepare('SELECT payment_status FROM clinic_orders').first('payment_status')).toBe('paid');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM clinic_stripe_events').first('n')).toBe(3);
  });
  it('verifies real webhook signatures',async () => {
    const stripe = new Stripe('sk_test_fake');
    const payload = JSON.stringify(event('evt_signed','checkout.session.completed','paid'));
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({payload,secret:'whsec_test',cryptoProvider:Stripe.createSubtleCryptoProvider()});
    const request = new Request('https://radtrails.org/clinic/webhook',{method:'POST',body:payload,headers:{'stripe-signature':signature}});
    expect((await handleClinicWebhook(env.DB,request,config)).status).toBe(200);
    expect(await env.DB.prepare('SELECT payment_status FROM clinic_orders').first('payment_status')).toBe('paid');
  });
  it('rejects invalid signatures without recording orders',async () => {
    const response = await handleClinicWebhook(env.DB,new Request('https://radtrails.org/clinic/webhook',{method:'POST',body:'{}'}),config);
    expect(response.status).toBe(400);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM clinic_orders').first('n')).toBe(0);
  });
});
