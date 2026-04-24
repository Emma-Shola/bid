import { useEffect, useState } from "react";
import type { NotificationItem } from "@/lib/types";

export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

export type RealtimeEvent<T = unknown> = {
  id: string;
  type: string;
  data: T;
  audience?: unknown;
  originId?: string;
  at: string;
};

type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
const statusListeners = new Set<(s: WsStatus) => void>();
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/$/, "") ?? "";

let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let currentStatus: WsStatus = "connecting";
let started = false;

function getSocketUrl() {
  const url = new URL(BACKEND_URL || window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

function setStatus(status: WsStatus) {
  currentStatus = status;
  statusListeners.forEach((listener) => listener(status));
}

function emit(type: string, payload: unknown) {
  const set = listeners.get(type);
  if (!set) return;
  set.forEach((listener) => listener(payload));
}

function scheduleReconnect() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
  }
  reconnectAttempts += 1;
  const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 4), 10_000);
  setStatus("reconnecting");
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (typeof window === "undefined") return;

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    setStatus(reconnectAttempts === 0 ? "connecting" : "reconnecting");
    socket = new WebSocket(getSocketUrl());

    socket.addEventListener("open", () => {
      reconnectAttempts = 0;
      setStatus("open");
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as RealtimeEvent;
        emit(payload.type, payload);
        emit("message", payload);
      } catch {
        // Ignore malformed payloads.
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  } catch {
    scheduleReconnect();
  }
}

function start() {
  if (started) return;
  started = true;
  connect();
}

export function stop() {
  started = false;
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.removeEventListener("close", scheduleReconnect);
    socket.close();
    socket = null;
  }
  reconnectAttempts = 0;
  setStatus("closed");
}

export function useWsStatus(): WsStatus {
  const [status, setStatusState] = useState<WsStatus>(currentStatus);

  useEffect(() => {
    start();
    const listener = (value: WsStatus) => setStatusState(value);
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  return status;
}

export function useChannel<T = unknown>(type: string, onMessage: (data: T) => void) {
  useEffect(() => {
    start();
    const set = listeners.get(type) ?? new Set();
    const wrapped: Listener = (payload) => onMessage(payload as T);
    set.add(wrapped);
    listeners.set(type, set);

    return () => {
      set.delete(wrapped);
      if (set.size === 0) listeners.delete(type);
    };
  }, [type, onMessage]);
}

export function emitNotification(notification: NotificationItem) {
  emit("notification.created", {
    id: notification.id,
    type: "notification.created",
    data: notification,
    at: notification.createdAt,
  });
}
