import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function loadEnvFiles(rootDir) {
  const env = process.env.NODE_ENV === "production" ? "production" : "development";
  const files = [".env", ".env.local", `.env.${env}`, `.env.${env}.local`];

  for (const fileName of files) {
    const filePath = path.join(rootDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles(process.cwd());

const [{ default: next }, { PrismaClient }, { jwtVerify }, { WebSocketServer }, realtime, redisPubSub] =
  await Promise.all([
    import("next"),
    import("@prisma/client"),
    import("jose"),
    import("ws"),
    import("./src/lib/realtime.js"),
    import("./src/lib/redis-pubsub.js")
  ]);

const { broadcastEvent, registerRealtimeSocket, shouldIgnoreRealtimePayload, unregisterRealtimeSocket } = realtime;
const { closeRedisPubSub, subscribeRealtimeMessages } = redisPubSub;

const requestedDev = process.argv.includes("--dev");
const requestedProd = process.argv.includes("--prod");
const hasProductionBuild = existsSync(path.join(process.cwd(), ".next"));
const dev = requestedProd ? false : requestedDev || process.env.NODE_ENV !== "production" || !hasProductionBuild;
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();
const encoder = new TextEncoder();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return encoder.encode(secret);
}

function parseCookies(header = "") {
  return header.split(";").reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return acc;
    const key = trimmed.slice(0, separator).trim();
    const value = decodeURIComponent(trimmed.slice(separator + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return {
    sub: String(payload.sub ?? ""),
    sid: String(payload.sid ?? "")
  };
}

function rejectUpgrade(socket) {
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

function createHeartbeat(wss) {
  return setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
}

await app.prepare();

const server = http.createServer((req, res) => {
  handle(req, res);
});

const wss = new WebSocketServer({ noServer: true });
const heartbeat = createHeartbeat(wss);

await subscribeRealtimeMessages((payload) => {
  if (shouldIgnoreRealtimePayload(payload)) {
    return;
  }

  broadcastEvent(payload);
});

wss.on("connection", (socket, req, user) => {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  registerRealtimeSocket(socket, user);

  socket.send(
    JSON.stringify({
      type: "connected",
      data: {
        user
      },
      at: new Date().toISOString()
    })
  );

  socket.on("close", () => {
    unregisterRealtimeSocket(socket);
  });
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (requestUrl.pathname !== "/ws") {
      rejectUpgrade(socket);
      return;
    }

    const cookies = parseCookies(req.headers.cookie ?? "");
    const accessToken = cookies.zaaa_token;
    if (!accessToken) {
      rejectUpgrade(socket);
      return;
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload.sid) {
      rejectUpgrade(socket);
      return;
    }

    const session = await prisma.session.findFirst({
      where: {
        id: payload.sid,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            isApproved: true
          }
        }
      }
    });

    if (!session?.user || !session.user.isApproved) {
      rejectUpgrade(socket);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, session.user);
    });
  } catch (error) {
    rejectUpgrade(socket);
  }
});

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
  console.log(`> WebSocket endpoint ws://${hostname}:${port}/ws`);
});

process.on("SIGINT", async () => {
  clearInterval(heartbeat);
  await closeRedisPubSub();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  clearInterval(heartbeat);
  await closeRedisPubSub();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
