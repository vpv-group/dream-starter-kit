import type { ConnectorBroker, ConnectorStatus } from "@acme/mod-kit/server";
import { registerConnectorBroker } from "@acme/mod-kit/server";

/**
 * Registers the host's Meet Dream connector broker with @acme/mod-kit so
 * modules (e.g. the Stripe billing adapter) can use a "Connect with …"
 * connection without ever seeing the site license key: Meet Dream performs
 * the provider calls for this site (`forward`). Imported for its side effect
 * by the module API dispatcher and payload.config.ts.
 *
 * Everything that touches the site key is imported lazily, inside the
 * methods: payload.config.ts is also loaded by the Payload CLI in plain Node,
 * where the `server-only` app wiring must not be evaluated.
 */

/** Connection status is read on most billing requests: keep it 60 s. */
const STATUS_TTL_MS = 60_000;
const statusCache = new Map<string, { at: number; value: ConnectorStatus }>();

async function opts() {
  const { connectorCallOpts } = await import("./connectors");
  return connectorCallOpts();
}

const NO_KEY = {
  status: "no_key",
  message:
    "This site hasn't registered with Meet Dream yet (it does after the first setup on a public domain).",
} as const;

export const connectorBroker: ConnectorBroker = {
  async startConnect(target, returnTo, o) {
    statusCache.delete(target);
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorStartUrl } = await import("./connectors-core");
    return connectorStartUrl(call, target, returnTo, o?.mode);
  },
  async status(target) {
    const hit = statusCache.get(target);
    if (hit && Date.now() - hit.at < STATUS_TTL_MS) {
      return { status: "ok", connection: hit.value };
    }
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorStatus } = await import("./connectors-core");
    const res = await connectorStatus(call, target);
    // Only a ready connection is cached: onboarding progress shows at once.
    if (res.status === "ok" && res.connection.ready !== false) {
      statusCache.set(target, { at: Date.now(), value: res.connection });
    } else {
      statusCache.delete(target);
    }
    return res;
  },
  async forward(target, path, init) {
    const call = await opts();
    if (!call) throw new Error(NO_KEY.message);
    const { connectorForward } = await import("./connectors-core");
    return connectorForward(call, target, path, init);
  },
  async setWebhookTarget(target, url) {
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorWebhookTarget } = await import("./connectors-core");
    return connectorWebhookTarget(call, target, url);
  },
  async disconnect(target) {
    statusCache.delete(target);
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorDisconnect } = await import("./connectors-core");
    return connectorDisconnect(call, target);
  },
};

registerConnectorBroker(connectorBroker);
