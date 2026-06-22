import crypto from "node:crypto";
import { publishRealtimeMessage } from "./redis-pubsub.js";

const globalState = globalThis.__zaaaRealtimeState ?? {
  sockets: new Set()
};

if (!globalThis.__zaaaRealtimeState) {
  globalThis.__zaaaRealtimeState = globalState;
}

export const REALTIME_CHANNEL = process.env.REDIS_PUBSUB_CHANNEL ?? "zaaa:realtime";
export const REALTIME_INSTANCE_ID =
  globalThis.__zaaaRealtimeInstanceId ?? crypto.randomUUID();

if (!globalThis.__zaaaRealtimeInstanceId) {
  globalThis.__zaaaRealtimeInstanceId = REALTIME_INSTANCE_ID;
}

function matchesAudience(user, audience) {
  if (!audience) {
    return true;
  }

  if (Array.isArray(audience.excludeUserIds) && audience.excludeUserIds.includes(user.id)) {
    return false;
  }

  const hasUserIds = Array.isArray(audience.userIds) && audience.userIds.length > 0;
  const hasRoles = Array.isArray(audience.roles) && audience.roles.length > 0;

  // No targeting filters at all means "everyone". Otherwise a socket matches
  // if it satisfies EITHER filter (union), not just the first one present —
  // callers rely on combining "the owning user" with "admin/manager roles"
  // in a single audience (see applications/route.ts), so these must not be
  // mutually exclusive.
  if (!hasUserIds && !hasRoles) {
    return true;
  }

  return (hasUserIds && audience.userIds.includes(user.id)) || (hasRoles && audience.roles.includes(user.role));
}

function safeSend(socket, payload) {
  try {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(payload));
    }
  } catch {
    // Ignore best-effort delivery failures.
  }
}

export function registerRealtimeSocket(socket, user) {
  socket.__zaaaUser = user;
  globalState.sockets.add(socket);
}

export function unregisterRealtimeSocket(socket) {
  globalState.sockets.delete(socket);
}

export async function publishEvent(type, data = {}, audience) {
  const payload = {
    id: crypto.randomUUID(),
    type,
    data,
    audience,
    originId: REALTIME_INSTANCE_ID,
    at: new Date().toISOString()
  };

  broadcastEvent(payload);
  void publishRealtimeMessage(payload).catch((error) => {
    console.error("Failed to publish realtime message", error);
  });
}

export function broadcastEvent(payload) {
  for (const socket of globalState.sockets) {
    const user = socket.__zaaaUser;
    if (user && matchesAudience(user, payload.audience)) {
      safeSend(socket, payload);
    }
  }
}

export function shouldIgnoreRealtimePayload(payload) {
  return payload?.originId && payload.originId === REALTIME_INSTANCE_ID;
}
