'use client';

import Image from 'next/image';
import ParallaxImage from './motion/ParallaxImage';
import Reveal from './motion/Reveal';
import LineReveal from './motion/LineReveal';
import {readClinicBag, writeClinicBag, clinicBagKey} from '@/lib/clinic-cart';
import {useEffect, useRef, useState} from 'react';

type Product = {id: string; name: string; description: string; image: string | null; amount: number; currency: string};
type Item = {price: string; quantity: number};

const button = 'inline-flex items-center justify-between gap-6 rounded bg-[#a8bd6a] px-6 py-4 text-sm font-bold text-[#08080a] transition hover:bg-[#bfd483] disabled:cursor-not-allowed disabled:opacity-40';
const money = (amount: number, currency: string) => {
  const format = new Intl.NumberFormat(undefined, {style: 'currency', currency});
  return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
};
function validImage(src: string | null) {
  try { return src && new URL(src).protocol === 'https:' ? src : '/images/logo.png'; } catch { return '/images/logo.png'; }
}
function cleanBag(value: unknown, products: Product[]): Item[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(); let currency = '';
  return value.filter(item => {
    const p = products.find(p => p.id === item?.price);
    if (!p || seen.has(p.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10 || (currency && currency !== p.currency)) return false;
    seen.add(p.id); currency = p.currency; return true;
  }).slice(0,20).map(({price, quantity}) => ({price, quantity}));
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/clinic/${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Please try again.';
    throw new Error(message);
  }
  return data as T;
}
export default function ClinicShop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const key = useRef<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api<{products: Product[]}>('catalog');
        const stored = readClinicBag();
        if (!active) return;
        setProducts(data.products); setCart(cleanBag(stored, data.products)); setReady(true);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load the collection.'); }
      const params = new URLSearchParams(window.location.search);
      if (params.has('canceled') && active) setNotice('Checkout canceled. Your bag is here whenever you’re ready.');
      if (!params.has('session_id')) return;
      try {
        const data = await api<{paymentStatus: string; status: string}>(`session?id=${encodeURIComponent(params.get('session_id')!)}`);
        if (!active) return;
        if (['paid','no_payment_required'].includes(data.paymentStatus)) {
          setNotice('Payment confirmed—thanks for keeping it RAD!'); setCart([]);
          window.history.replaceState(null, '', '/clinics');
        } else setNotice(data.status === 'expired' ? 'This checkout has expired. Please start a new checkout.' : 'Your payment is processing. Please don’t pay again. Refresh this page to check its status.');
      } catch { if (active) setNotice('We couldn’t confirm your payment yet. Refresh before paying again, or contact bobby@radtrails.org.'); }
    }
    void load(); return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ready) writeClinicBag(cart);
  }, [cart, ready]);
  useEffect(() => {
    if (!ready) return;
    const sync = (event: StorageEvent) => {
      if ((event.key === clinicBagKey || event.key === null) && !submitting.current) {
        key.current = null;
        setCart(cleanBag(readClinicBag(), products));
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [ready, products]);
  function update(items: Item[]) { if (submitting.current) return; key.current = null; setCart(items); setError(''); }
  function add(product: Product) {
    if (submitting.current) return;
    const currency = products.find(p => p.id === cart[0]?.price)?.currency;
    if (currency && currency !== product.currency) { setError('Check out your current bag before adding a different currency.'); return; }
    const existing = cart.find(i => i.price === product.id);
    if (existing?.quantity === 10 || (!existing && cart.length >= 20)) { setError('Maximum 10 per item and 20 different items per checkout.'); return; }
    update(existing ? cart.map(i => i === existing ? {...i, quantity: i.quantity + 1} : i) : [...cart, {price: product.id, quantity: 1}]);
    setNotice(`${product.name} added to your bag.`);
  }
  async function checkout() {
    if (submitting.current || !cart.length) return;
    submitting.current = true; setBusy(true); setError(''); key.current ||= crypto.randomUUID();
    try {
      const data = await api<{url: string}>('checkout', {method: 'POST', headers: {'Content-Type':'application/json', 'Idempotency-Key':key.current}, body: JSON.stringify({items:cart})});
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Checkout could not be opened.');
      window.location.assign(url.href);
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); setBusy(false); submitting.current = false; }
  }
  const currency = products.find(p => p.id === cart[0]?.price)?.currency;
  const total = cart.reduce((sum, item) => sum + (products.find(p => p.id === item.price)?.amount || 0) * item.quantity, 0);
  return <div className="grain relative bg-[#08080a] text-white">
      <div className="pointer-events-none relative z-[2] mx-auto w-full max-w-7xl px-5 pt-6 md:px-10 lg:absolute lg:inset-x-0 lg:top-0 lg:bottom-0 lg:max-w-none lg:px-5 lg:pb-10">
      <aside aria-labelledby="clinic-bag" className="pointer-events-auto ml-auto w-full rounded-2xl border border-white/15 bg-[#101013]/95 p-6 shadow-xl backdrop-blur-xl lg:sticky lg:top-36 lg:max-h-[calc(100vh-164px)] lg:w-[330px] lg:overflow-y-auto">
        <p className="eyebrow mb-3 text-xs uppercase tracking-widest text-[#a8bd6a]">Ready when you are</p>
        <h2 id="clinic-bag" className="scroll-mt-40 display mb-6 text-3xl font-bold">Your bag <span className="text-[#a8bd6a]">↗</span></h2>
        {!cart.length && <p className="mb-6 text-sm leading-relaxed text-white/60">Add a clinic or rental to get started.</p>}
        {cart.map(item => { const p = products.find(p => p.id === item.price)!; return <div key={item.price} className="border-t border-white/15 py-5">
          <h3 className="font-bold">{p.name}</h3><div className="mt-4 flex items-center gap-3">
            <input type="number" min={1} max={10} value={item.quantity} disabled={busy} aria-label={`Quantity for ${p.name}`} className="w-16 border border-white/20 bg-black p-2" onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 10) update(cart.map(i => i.price === item.price ? {...i, quantity:n} : i)); }} />
            <span className="text-sm">{money(p.amount * item.quantity,p.currency)}</span><button disabled={busy} aria-label={`Remove ${p.name}`} onClick={() => update(cart.filter(i => i.price !== item.price))} className="ml-auto text-xs text-white/60 underline">Remove</button>
          </div></div>; })}
        <div className="flex justify-between border-t border-white/15 pt-5"><span>Subtotal</span><strong>{currency ? money(total,currency) : '—'}</strong></div>
        <p className="my-4 text-xs text-white/50">Your final total is shown at checkout.</p>
        <button className={`${button} w-full`} disabled={!cart.length || busy} onClick={checkout}>{busy ? 'Opening checkout…' : 'Continue to checkout →'}</button>
        <p className="mt-4 text-center text-xs text-white/50">Secure checkout with Stripe</p>
      </aside>
      </div>
    <section className="relative min-h-[70vh] overflow-hidden">
      <ParallaxImage src="/images/clinics/clinics.jpeg" alt="Rider practicing cornering around a cone with Ride and Develop" priority sizes="100vw" strength={50} className="absolute inset-0" imgClassName="opacity-[0.55]" objectPosition="65% center" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080a]/50 via-[#08080a]/25 to-[#08080a]" />
      <div className="relative z-[1] mx-auto w-full max-w-7xl px-5 py-20 lg:py-32 lg:pr-[410px] md:px-10">
        <Reveal className="eyebrow flex items-center gap-2.5 text-xs uppercase tracking-[0.3em] text-white/55">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a8bd6a]" /> Clinics · rentals · riding
        </Reveal>
        <LineReveal className="display mt-7 text-[clamp(2.4rem,7vw,5.5rem)] font-extrabold leading-[0.95]" delay={0.1} lines={["More miles.", <span key="rad" className="serif-italic font-light">More RAD.</span>]} />
        <Reveal delay={0.4} className="mt-7 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
          Build your skills. Find your next ride. Explore riding clinics and e-bike rentals with Ride and Develop.
        </Reveal>
        <Reveal delay={0.5} className="mt-9">
          <a className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-[#08080a] transition-transform hover:-translate-y-0.5" href="#clinic-collection">Explore clinics & rentals <span aria-hidden>→</span></a>
        </Reveal>
      </div>
    </section>
    <section id="clinic-collection" className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28 lg:pr-[410px]">

      <div className="min-w-0">
        <p className="eyebrow mb-4 text-xs uppercase tracking-widest text-[#a8bd6a]">Build skills. Find your next ride.</p>
        <h2 className="display mb-8 text-4xl font-bold md:text-5xl">Clinics <em className="serif-italic">& rentals.</em></h2>
        <p role="status" aria-live="polite" className={notice ? 'mb-6 border border-[#a8bd6a]/60 p-4 text-sm leading-relaxed' : ''}>{notice}</p>
        <p role="alert" className={error ? 'mb-6 text-sm text-red-200' : ''}>{error}</p>
        {!ready && !error && <p className="text-white/60">Loading the collection…</p>}
        {ready && !products.length && <p className="border-y border-white/15 py-10 text-white/60">Good things are on the way. Our clinics and rentals will be available here soon.</p>}
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3" aria-busy={!ready}>
          {products.map(p => <article key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="relative mb-5 aspect-square overflow-hidden bg-white/5"><Image src={validImage(p.image)} alt={p.name} fill unoptimized sizes="(max-width: 640px) 100vw, 40vw" className={`object-contain ${p.image ? '' : 'p-12 invert'}`} /></div>
            <h3 className="display text-2xl font-bold">{p.name}</h3><p className="my-4 text-sm leading-relaxed text-white/60">{p.description}</p>
            <div className="flex flex-wrap items-center justify-between gap-4"><strong>{money(p.amount,p.currency)}</strong><button disabled={busy} onClick={() => add(p)} className="rounded border border-white/20 px-4 py-3 text-sm hover:border-[#a8bd6a] disabled:opacity-40">Add to bag +</button></div>
          </article>)}
        </div>
      </div>

    </section>
  </div>;
}
