import type { ConnectorBroker } from "@acme/mod-kit/server";
import { registerConnectorBroker } from "@acme/mod-kit/server";

import { connectorTokenCache } from "./connectors-core";

/**
 * Registers the host's Meet Dream connector broker with @acme/mod-kit so
 * modules (e.g. the Stripe billing adapter) can use a "Connect with …"
 * connection without ever seeing the site license key. Imported for its side
 * effect by the module API dispatcher and payload.config.ts.
 *
 * Everything that touches the site key is imported lazily, inside the
 * methods: payload.config.ts is also loaded by the Payload CLI in plain Node,
 * where the `server-only` app wiring must not be evaluated.
 */
const cache = connectorTokenCache();

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
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorStartUrl } = await import("./connectors-core");
    return connectorStartUrl(call, target, returnTo, o?.mode);
  },
  async token(target) {
    const hit = cache.get(target);
    if (hit) return { status: "ok", token: hit };
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorToken } = await import("./connectors-core");
    const res = await connectorToken(call, target);
    if (res.status === "ok") cache.set(target, res.token);
    return res;
  },
  async disconnect(target) {
    cache.clear(target);
    const call = await opts();
    if (!call) return NO_KEY;
    const { connectorDisconnect } = await import("./connectors-core");
    return connectorDisconnect(call, target);
  },
};

registerConnectorBroker(connectorBroker);
