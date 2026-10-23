# Clinic and rentals

The clinic is a native page at `/clinics` in the main Next.js app. It shares navigation, fonts, images, and the existing D1 binding. There is no proxy, extra dev server, service binding, or separate clinic deployment. Checkout remains guest checkout; sharing the site layout does not attach a payment to a signed-in account.

## Visibility

The shop is available directly at `/clinics`; links from Services and the main navigation are
currently hidden. This is not access control: anyone with the URL can view the shop.
The legacy `/clinic` page redirects to `/clinics`, preserving query parameters.
The signed payment webhook remains at `/clinic/webhook` and authenticates using Stripe signatures.

## Local development

Add these settings to the main repo's gitignored `.dev.vars`:

```dotenv
CLINIC_ORIGIN=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_IDS=price_...,price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

`CLINIC_ORIGIN` must match the address in your browser exactly, without a trailing slash or path. If Next picks another port, update it or free port 3000. Never share secret keys in source control.

```sh
nvm use
npm ci
npm run db:migrate:local
npm run dev
```

Visit `http://localhost:3000/clinics`. Restart Next after changing `.dev.vars`. Forward Stripe events with:

```sh
stripe listen --forward-to localhost:3000/clinic/webhook
```

Use the listener's signing secret locally. Use Stripe sandbox prices and the `4242 4242 4242 4242` test card. Production is unaffected by `.dev.vars`.

## Production

Apply migration `0024_clinic_payments.sql` using the normal D1 deployment workflow; store `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the comma-separated `STRIPE_PRICE_IDS` as Cloudflare Worker secrets. Set `CLINIC_ORIGIN=https://radtrails.org`. Register `/clinic/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. The deployed test setup uses a Stripe sandbox key, prices, and webhook; no real payments are collected. Price IDs are not sensitive, but storing the allowlist as a Worker secret keeps it persistent across deployments; do not add an empty `STRIPE_PRICE_IDS` override to Wrangler vars. Deploy once the Stripe configuration is complete. To stop new sales, clear the allowed `STRIPE_PRICE_IDS`; retain webhook secrets for outstanding sessions.

Do not deploy the old standalone clinic's `/clinic*` Cloudflare routes: they would intercept this page before the main app. Remove those routes if they were installed elsewhere. No standalone routes have been deployed in this implementation.

## Payment behavior and limits

The server retrieves active one-time fixed prices from an explicit Stripe Price ID allowlist. Each checkout supports one currency, 20 distinct products and 10 units per product. Customers can adjust quantity or remove items in Stripe Checkout (one item must remain). Final Stripe line items, not the browser's saved bag, govern fulfillment.

Signed events atomically record event IDs and payment statuses in `clinic_stripe_events` and `clinic_orders`. Replays are idempotent and late failure/pending events cannot downgrade a paid order. These are separate tables from main-site coaching bookings. No bookings, dates, inventory holds, taxes, shipping fees, or automatic fulfillment are implemented. Product metadata `shipping=required` collects a US shipping address only. Fulfill manually through Stripe until booking/inventory features are added.

The original standalone D1 data is not migrated automatically. If that app processed orders, preserve its data and webhook until those orders are reconciled.
