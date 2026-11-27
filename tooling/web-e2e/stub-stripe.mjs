// A fake meetdream.com "Connect with Stripe" broker with an in-memory fake
// Stripe API behind it, for stripe-connect.spec.ts. Mounted by
// stub-services.mjs. It follows the contract both sides test against:
// packages/mod-kit/contracts/stripe-connector.json (docs/STRIPE.md §8).
//
// Broker routes (under /registry, after the site-key check):
//   POST /connect/stripe/start                  → { url } of /stripe-onboarding
//   POST /sites/connectors/stripe/status         → the connection (404 until connected)
//   POST /sites/connectors/stripe/webhook-target → { secret }; events go to that url
//   POST /sites/connectors/stripe/disconnect
//   ANY  /sites/connectors/stripe/api/v1/...     → the fake Stripe API
//
// Test controls (no key):
//   GET  /stripe-onboarding         "Stripe onboarding": connects, redirects back
//   POST /__stripe/scenario {ready?, down?}   merge into the scenario
//   POST /__stripe/reset                      forget everything
//   GET  /__stripe/log                        what the site sent (and deliveries)
//   GET  /__stripe/state                      the fake Stripe objects
//   POST /__stripe/pay {subscriptionId | paymentIntentId}
//        stands in for Stripe.js confirming a payment: marks it paid and
//        delivers the events Stripe would, signed for the site
//   POST /__stripe/emit {type, object, id?, created?, secret?}
//        delivers any event (a wrong secret, a replayed id, an old timestamp)
//
// Plain ESM JavaScript so it runs with `node` directly, no build step.
import { createHmac } from "node:crypto";

const ACCOUNT_ID = "acct_stub";
const PUBLISHABLE_KEY = "pk_test_stub";
const API_VERSION = "2026-10-28.endive";

let state;
function reset() {
  state = {
    scenario: { ready: true, down: false },
    connected: false,
    returnTo: null,
    webhook: null, // { url, secret }
    objects: new Map(), // id → Stripe object
    seq: 0,
    lastEventAt: 0,
    log: [],
  };
}
reset();

const nextId = (prefix) => `${prefix}_stub_${++state.seq}`;
const now = () => Math.floor(Date.now() / 1000);

/* ------------------------------------------------------------------------ */
/* Form bodies (stripe-node sends application/x-www-form-urlencoded)        */
/* ------------------------------------------------------------------------ */

/** `a[b][0][c]=v&expand[]=x` → { a: { b: [{ c: "v" }] }, expand: ["x"] } */
export function parseForm(raw) {
  const out = {};
  for (const [key, value] of new URLSearchParams(raw ?? "")) {
    const parts = [
      key.split("[")[0],
      ...[...key.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]),
    ];
    let node = out;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d*$/.test(parts[i + 1]);
      if (Array.isArray(node) && part === "") {
        if (last) node.push(value);
        else {
          const child = nextIsIndex ? [] : {};
          node.push(child);
          node = child;
        }
        return;
      }
      const k = Array.isArray(node) ? Number(part) : part;
      if (last) node[k] = value;
      else {
        node[k] ??= nextIsIndex ? [] : {};
        node = node[k];
      }
    });
  }
  return out;
}

const num = (v) => (v === undefined || v === "" ? undefined : Number(v));
const bool = (v) => (v === undefined ? undefined : v === "true" || v === true);

/* ------------------------------------------------------------------------ */
/* Events: what meetdream.com relays to the site, signed with its secret    */
/* ------------------------------------------------------------------------ */

let queue = Promise.resolve();

function sign(payload, secret) {
  const t = now();
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

async function deliver(type, object, opts = {}) {
  if (!state.webhook) {
    state.log.push({ type: "delivery", eventType: type, status: "no_target" });
    return null;
  }
  const created = opts.created ?? Math.max(now(), state.lastEventAt);
  if (opts.created === undefined) state.lastEventAt = created;
  const event = {
    id: opts.id ?? nextId("evt"),
    object: "event",
    api_version: API_VERSION,
    account: ACCOUNT_ID,
    type,
    created,
    livemode: false,
    data: { object: structuredClone(object) },
  };
  const payload = JSON.stringify(event);
  let status;
  let body;
  try {
    const res = await fetch(state.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Stripe-Signature": sign(payload, opts.secret ?? state.webhook.secret),
      },
      body: payload,
      signal: AbortSignal.timeout(60_000),
    });
    status = res.status;
    body = await res.text();
  } catch (err) {
    status = 0;
    body = String(err);
  }
  state.log.push({
    type: "delivery",
    eventType: type,
    eventId: event.id,
    status,
    body,
  });
  return { eventId: event.id, status, body };
}

/** Deliver in order without holding up the API call that caused it. */
function emit(type, object) {
  queue = queue.then(() => deliver(type, object)).catch(() => undefined);
}

/* ------------------------------------------------------------------------ */
/* The fake Stripe API                                                       */
/* ------------------------------------------------------------------------ */

function stripeError(status, message, code) {
  return {
    status,
    body: {
      error: {
        type: "invalid_request_error",
        message,
        ...(code ? { code } : {}),
      },
    },
  };
}
const missing = (id) =>
  stripeError(404, `No such object: '${id}'`, "resource_missing");
const list = (data) => ({
  status: 200,
  body: { object: "list", data, has_more: false, url: "" },
});
const ok = (body) => ({ status: 200, body });

const get = (id, object) => {
  const o = state.objects.get(id);
  return o && (!object || o.object === object) ? o : null;
};
const put = (o) => (state.objects.set(o.id, o), o);
const all = (object) =>
  [...state.objects.values()].filter((o) => o.object === object);

function priceFrom(p) {
  return {
    id: nextId("price"),
    object: "price",
    active: true,
    product: p.product,
    currency: p.currency ?? "usd",
    unit_amount: num(p.unit_amount) ?? 0,
    recurring: p.recurring
      ? {
          interval: p.recurring.interval,
          interval_count: num(p.recurring.interval_count) ?? 1,
        }
      : null,
    type: p.recurring ? "recurring" : "one_time",
    metadata: p.metadata ?? {},
    created: now(),
  };
}

function subscriptionItems(sub, priceId, quantity = 1) {
  const price = get(priceId, "price") ?? {
    id: priceId,
    object: "price",
    metadata: {},
  };
  const start = now();
  const days = price.recurring?.interval === "year" ? 365 : 30;
  sub.items = {
    object: "list",
    data: [
      {
        id: nextId("si"),
        object: "subscription_item",
        price,
        quantity,
        current_period_start: start,
        current_period_end: start + days * 86_400,
      },
    ],
  };
  sub.current_period_end = sub.items.data[0].current_period_end;
}

/**
 * Each route answers like Stripe and is labelled with its contract pattern
 * ("POST /v1/products/:id"); the spec checks every forwarded call against
 * the contract's stripeCalls.
 */
const routes = [
  [
    "GET /v1/products",
    (q) => list(all("product").slice(0, num(q.limit) ?? 10)),
  ],
  [
    "POST /v1/products",
    (_q, p) => {
      const product = put({
        id: nextId("prod"),
        object: "product",
        active: bool(p.active) ?? true,
        name: p.name,
        description: p.description || null,
        default_price: null,
        metadata: p.metadata ?? {},
        created: now(),
      });
      emit("product.created", product);
      return ok(product);
    },
  ],
  [
    "POST /v1/products/:id",
    (_q, p, id) => {
      const product = get(id, "product");
      if (!product) return missing(id);
      for (const k of ["name", "description", "default_price"])
        if (p[k] !== undefined) product[k] = p[k];
      if (p.active !== undefined) product.active = bool(p.active);
      if (p.metadata) product.metadata = { ...product.metadata, ...p.metadata };
      emit("product.updated", product);
      return ok(product);
    },
  ],
  [
    "GET /v1/prices/:id",
    (_q, _p, id) => (get(id, "price") ? ok(get(id, "price")) : missing(id)),
  ],
  [
    "POST /v1/prices",
    (_q, p) => {
      const price = put(priceFrom(p));
      emit("price.created", price);
      return ok(price);
    },
  ],
  [
    "POST /v1/prices/:id",
    (_q, p, id) => {
      const price = get(id, "price");
      if (!price) return missing(id);
      if (p.active !== undefined) price.active = bool(p.active);
      if (p.metadata) price.metadata = { ...price.metadata, ...p.metadata };
      emit("price.updated", price);
      return ok(price);
    },
  ],
  [
    "GET /v1/coupons/:id",
    (_q, _p, id) => (get(id, "coupon") ? ok(get(id, "coupon")) : missing(id)),
  ],
  [
    "POST /v1/coupons",
    (_q, p) =>
      ok(
        put({
          id: p.id ?? nextId("coupon"),
          object: "coupon",
          valid: true,
          name: p.name ?? null,
          duration: p.duration ?? "once",
          duration_in_months: num(p.duration_in_months) ?? null,
          percent_off: num(p.percent_off) ?? null,
          amount_off: num(p.amount_off) ?? null,
          currency: p.currency ?? null,
          metadata: p.metadata ?? {},
        }),
      ),
  ],
  [
    "POST /v1/coupons/:id",
    (_q, p, id) => {
      const coupon = get(id, "coupon");
      if (!coupon) return missing(id);
      if (p.name !== undefined) coupon.name = p.name;
      if (p.metadata) coupon.metadata = { ...coupon.metadata, ...p.metadata };
      return ok(coupon);
    },
  ],
  [
    "DELETE /v1/coupons/:id",
    (_q, _p, id) => {
      if (!get(id, "coupon")) return missing(id);
      state.objects.delete(id);
      return ok({ id, object: "coupon", deleted: true });
    },
  ],
  [
    "POST /v1/promotion_codes",
    (_q, p) =>
      ok(
        put({
          id: nextId("promo"),
          object: "promotion_code",
          code: p.code,
          active: true,
          promotion: {
            type: p.promotion?.type ?? "coupon",
            coupon: p.promotion?.coupon ?? null,
          },
          metadata: p.metadata ?? {},
        }),
      ),
  ],
  [
    "GET /v1/customers",
    (q) =>
      list(
        all("customer")
          .filter((c) => !q.email || c.email === q.email)
          .slice(0, num(q.limit) ?? 10),
      ),
  ],
  [
    "GET /v1/customers/:id",
    (_q, _p, id) =>
      get(id, "customer") ? ok(get(id, "customer")) : missing(id),
  ],
  [
    "POST /v1/customers",
    (_q, p) =>
      ok(
        put({
          id: nextId("cus"),
          object: "customer",
          email: p.email ?? null,
          name: p.name ?? null,
          phone: p.phone ?? null,
          address: p.address ?? null,
          metadata: p.metadata ?? {},
          created: now(),
        }),
      ),
  ],
  [
    "POST /v1/customers/:id",
    (_q, p, id) => {
      const customer = get(id, "customer");
      if (!customer) return missing(id);
      for (const k of ["email", "name", "phone", "address"])
        if (p[k] !== undefined) customer[k] = p[k];
      if (p.metadata)
        customer.metadata = { ...customer.metadata, ...p.metadata };
      return ok(customer);
    },
  ],
  [
    "POST /v1/payment_intents",
    (_q, p) => {
      const id = nextId("pi");
      return ok(
        put({
          id,
          object: "payment_intent",
          amount: num(p.amount) ?? 0,
          currency: p.currency ?? "usd",
          customer: p.customer ?? null,
          receipt_email: p.receipt_email ?? null,
          status: "requires_payment_method",
          client_secret: `${id}_secret_stub`,
          metadata: p.metadata ?? {},
          invoice: null,
        }),
      );
    },
  ],
  [
    "POST /v1/setup_intents",
    (_q, p) => {
      const id = nextId("seti");
      return ok(
        put({
          id,
          object: "setup_intent",
          customer: p.customer ?? null,
          client_secret: `${id}_secret_stub`,
          metadata: p.metadata ?? {},
        }),
      );
    },
  ],
  [
    "GET /v1/subscriptions",
    (q) =>
      list(
        all("subscription")
          .filter((s) => !q.customer || s.customer === q.customer)
          .filter(
            (s) => !q.status || q.status === "all" || s.status === q.status,
          )
          .slice(0, num(q.limit) ?? 10),
      ),
  ],
  [
    "GET /v1/subscriptions/:id",
    (_q, _p, id) =>
      get(id, "subscription") ? ok(get(id, "subscription")) : missing(id),
  ],
  [
    "POST /v1/subscriptions",
    (_q, p) => {
      const priceId = p.items?.[0]?.price;
      if (!get(priceId, "price")) return missing(priceId);
      const sub = {
        id: nextId("sub"),
        object: "subscription",
        customer: p.customer,
        status: "incomplete",
        cancel_at_period_end: false,
        canceled_at: null,
        start_date: now(),
        trial_end: null,
        metadata: p.metadata ?? {},
      };
      subscriptionItems(sub, priceId, num(p.items?.[0]?.quantity) ?? 1);
      const invoiceId = nextId("in");
      const pi = put({
        id: nextId("pi"),
        object: "payment_intent",
        amount: sub.items.data[0].price.unit_amount ?? 0,
        currency: sub.items.data[0].price.currency ?? "usd",
        customer: sub.customer,
        status: "requires_payment_method",
        client_secret: "",
        metadata: {},
        invoice: invoiceId,
      });
      pi.client_secret = `${pi.id}_secret_stub`;
      sub.latest_invoice = invoiceId;
      sub.pending_setup_intent = null;
      put(sub);
      const expand = [].concat(p.expand ?? []);
      const body = structuredClone(sub);
      if (expand.includes("latest_invoice.confirmation_secret")) {
        body.latest_invoice = {
          id: invoiceId,
          object: "invoice",
          confirmation_secret: {
            client_secret: pi.client_secret,
            type: "payment_intent",
          },
        };
      }
      return ok(body);
    },
  ],
  [
    "POST /v1/subscriptions/:id",
    (_q, p, id) => {
      const sub = get(id, "subscription");
      if (!sub) return missing(id);
      if (p.items?.[0]?.price) subscriptionItems(sub, p.items[0].price);
      if (p.metadata) sub.metadata = { ...sub.metadata, ...p.metadata };
      if (p.cancel_at_period_end !== undefined)
        sub.cancel_at_period_end = bool(p.cancel_at_period_end);
      emit("customer.subscription.updated", sub);
      return ok(sub);
    },
  ],
  [
    "DELETE /v1/subscriptions/:id",
    (_q, _p, id) => {
      const sub = get(id, "subscription");
      if (!sub) return missing(id);
      sub.status = "canceled";
      sub.canceled_at = now();
      emit("customer.subscription.deleted", sub);
      return ok(sub);
    },
  ],
  [
    "POST /v1/checkout/sessions",
    (_q, p) => {
      const id = nextId("cs");
      return ok(
        put({
          id,
          object: "checkout.session",
          mode: p.mode,
          url: `${state.base}/stripe-checkout/${id}`,
          metadata: p.metadata ?? {},
          line_items_price: p.line_items?.[0]?.price ?? null,
          customer: p.customer ?? null,
        }),
      );
    },
  ],
  [
    "GET /v1/checkout/sessions/:id/line_items",
    (_q, _p, id) => {
      const session = get(id, "checkout.session");
      if (!session) return missing(id);
      const price = get(session.line_items_price, "price");
      return list(
        price ? [{ id: nextId("li"), object: "item", price, quantity: 1 }] : [],
      );
    },
  ],
  [
    "POST /v1/billing_portal/sessions",
    (_q, p) =>
      ok({
        id: nextId("bps"),
        object: "billing_portal.session",
        customer: p.customer,
        url: `${state.base}/stripe-portal?customer=${encodeURIComponent(p.customer ?? "")}`,
      }),
  ],
  [
    "GET /v1/invoices",
    (q) =>
      list(
        all("invoice").filter((i) => !q.customer || i.customer === q.customer),
      ),
  ],
  [
    "GET /v1/charges",
    (q) =>
      list(
        all("charge")
          .filter((c) => !q.customer || c.customer === q.customer)
          .slice(0, num(q.limit) ?? 10),
      ),
  ],
];

/** The Stripe calls this fake answers (checked against the contract). */
export const STRIPE_ROUTES = routes.map(([label]) => label);

function matchRoute(method, path) {
  for (const [label, handler] of routes) {
    const [m, pattern] = label.split(" ");
    if (m !== method) continue;
    const re = new RegExp(`^${pattern.replace(/:id/g, "([^/]+)")}$`);
    const hit = path.match(re);
    if (hit)
      return {
        label,
        handler,
        id: hit[1] ? decodeURIComponent(hit[1]) : undefined,
      };
  }
  return null;
}

function stripeApi(req, res, send, apiPath, search, raw) {
  const method = req.method ?? "GET";
  const route = matchRoute(method, apiPath);
  state.log.push({
    type: "stripe",
    method,
    path: apiPath,
    route: route?.label ?? null,
    idempotencyKey: req.headers["idempotency-key"] ?? null,
    authorization: Boolean(req.headers.authorization),
    stripeAccount: req.headers["stripe-account"] ?? null,
  });
  if (state.scenario.down) {
    return send(res, 503, {
      code: "unavailable",
      message: "Meet Dream is unavailable",
    });
  }
  if (!state.connected) {
    return send(res, 404, {
      code: "not_connected",
      message: "This site isn't connected to Stripe",
    });
  }
  if (!route) {
    const err = stripeError(
      404,
      `Unrecognized request URL (${method}: ${apiPath})`,
    );
    return send(res, err.status, err.body);
  }
  const query = Object.fromEntries(new URLSearchParams(search));
  const result = route.handler(
    query,
    method === "GET" ? {} : parseForm(raw),
    route.id,
  );
  return send(res, result.status, result.body);
}

/* ------------------------------------------------------------------------ */
/* Broker routes + test controls                                             */
/* ------------------------------------------------------------------------ */

function statusBody() {
  return {
    accountId: ACCOUNT_ID,
    accountName: "Stub Co",
    livemode: false,
    publishableKey: PUBLISHABLE_KEY,
    ready: state.scenario.ready,
    onboardingUrl: state.scenario.ready
      ? null
      : `${state.base}/stripe-onboarding?resume=1`,
  };
}

/** /registry routes for the Stripe connector; false when not ours. */
export function stripeBroker(req, res, send, path, search, raw, body) {
  if (path === "/connect/stripe/start" && req.method === "POST") {
    state.returnTo = body?.returnTo ?? null;
    state.log.push({ type: "broker", call: "start", body });
    return (
      send(res, 200, {
        url: `${state.base}/stripe-onboarding?mode=${encodeURIComponent(body?.mode ?? "live")}`,
      }),
      true
    );
  }
  if (path === "/sites/connectors/stripe/status" && req.method === "POST") {
    if (state.scenario.down)
      return (
        send(res, 503, {
          code: "unavailable",
          message: "Meet Dream is unavailable",
        }),
        true
      );
    if (!state.connected) {
      return (
        send(res, 404, {
          code: "not_connected",
          message: "This site isn't connected to Stripe",
        }),
        true
      );
    }
    return (send(res, 200, statusBody()), true);
  }
  if (
    path === "/sites/connectors/stripe/webhook-target" &&
    req.method === "POST"
  ) {
    if (!state.connected) {
      return (
        send(res, 404, {
          code: "not_connected",
          message: "This site isn't connected to Stripe",
        }),
        true
      );
    }
    const url = body?.url;
    if (!url)
      return (
        send(res, 400, { code: "invalid", message: "url required" }),
        true
      );
    if (state.webhook?.url !== url)
      state.webhook = { url, secret: `whsec_stub_${state.seq + 1}` };
    state.log.push({ type: "broker", call: "webhook-target", body });
    return (send(res, 200, { secret: state.webhook.secret }), true);
  }
  if (path === "/sites/connectors/stripe/disconnect" && req.method === "POST") {
    state.connected = false;
    state.webhook = null;
    state.log.push({ type: "broker", call: "disconnect" });
    return (send(res, 200, {}), true);
  }
  const API = "/sites/connectors/stripe/api";
  if (path.startsWith(`${API}/`)) {
    stripeApi(req, res, send, path.slice(API.length), search, raw);
    return true;
  }
  return false;
}

/** Root-level test controls; false when not ours. */
export async function stripeControls(req, res, send, url, body) {
  state.base ??= `http://localhost:${url.port || 4010}`;
  const path = url.pathname;
  if (path === "/stripe-onboarding" && req.method === "GET") {
    state.connected = true;
    const back = state.returnTo ?? "http://localhost:3000/admin";
    const sep = back.includes("?") ? "&" : "?";
    res.writeHead(302, { Location: `${back}${sep}stripe=connected` });
    res.end();
    return true;
  }
  if (path === "/__stripe/scenario" && req.method === "POST") {
    state.scenario = { ...state.scenario, ...(body ?? {}) };
    return (send(res, 200, state.scenario), true);
  }
  if (path === "/__stripe/reset" && req.method === "POST") {
    const base = state.base;
    reset();
    state.base = base;
    return (send(res, 200, { ok: true }), true);
  }
  if (path === "/__stripe/log" && req.method === "GET")
    return (send(res, 200, state.log), true);
  if (path === "/__stripe/state" && req.method === "GET") {
    return (
      send(res, 200, {
        connected: state.connected,
        webhook: state.webhook,
        scenario: state.scenario,
        objects: [...state.objects.values()],
      }),
      true
    );
  }
  if (path === "/__stripe/pay" && req.method === "POST") {
    await queue; // catalog events first, like Stripe's own ordering
    const results = [];
    if (body?.subscriptionId) {
      const sub = get(body.subscriptionId, "subscription");
      if (!sub)
        return (send(res, 404, { error: "no such subscription" }), true);
      sub.status = "active";
      const price = sub.items.data[0].price;
      put({
        id: nextId("ch"),
        object: "charge",
        customer: sub.customer,
        amount: price.unit_amount ?? 0,
        billing_details: {
          name: "Stub Buyer",
          email: null,
          phone: null,
          address: null,
        },
      });
      put({
        id: sub.latest_invoice,
        object: "invoice",
        customer: sub.customer,
        number: `STUB-${state.seq}`,
        amount_paid: price.unit_amount ?? 0,
        currency: price.currency ?? "usd",
        status: "paid",
        created: now(),
        hosted_invoice_url: `${state.base}/stripe-invoice/${sub.latest_invoice}`,
        invoice_pdf: null,
      });
      results.push(await deliver("customer.subscription.created", sub));
      results.push(await deliver("customer.subscription.updated", sub));
    } else if (body?.paymentIntentId) {
      const pi = get(body.paymentIntentId, "payment_intent");
      if (!pi)
        return (send(res, 404, { error: "no such payment intent" }), true);
      pi.status = "succeeded";
      results.push(await deliver("payment_intent.succeeded", pi));
    }
    return (send(res, 200, { results }), true);
  }
  if (path === "/__stripe/emit" && req.method === "POST") {
    await queue;
    const result = await deliver(body?.type, body?.object ?? {}, {
      id: body?.id,
      created: body?.created,
      secret: body?.secret,
    });
    return (send(res, 200, result ?? { status: "no_target" }), true);
  }
  if (path === "/__stripe/drain" && req.method === "POST") {
    await queue;
    return (send(res, 200, { ok: true }), true);
  }
  return false;
}
