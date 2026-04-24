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

  if (Array.isArray(audience.userIds) && audience.userIds.length > 0) {
    return audience.userIds.includes(user.id);
  }

  if (Array.isArray(audience.roles) && audience.roles.length > 0) {
    return audience.roles.includes(user.role);
  }

  return true;
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
