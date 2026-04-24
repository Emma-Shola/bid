import { createClient } from "redis";

const channelName = process.env.REDIS_PUBSUB_CHANNEL ?? "zaaa:realtime";
const redisUrl = process.env.REDIS_URL;

let publisherPromise = null;
let subscriberPromise = null;

function getValidRedisUrl() {
  if (!redisUrl) {
    return null;
  }

  try {
    const parsed = new URL(redisUrl);
    const isRedisProtocol = parsed.protocol === "redis:" || parsed.protocol === "rediss:";
    const isPlaceholderHost = parsed.hostname.toUpperCase() === "HOST";

    if (!isRedisProtocol || !parsed.hostname || isPlaceholderHost) {
      return null;
    }

    return redisUrl;
  } catch {
    return null;
  }
}

const validRedisUrl = getValidRedisUrl();

function createRedisClient() {
  if (!validRedisUrl) {
    return null;
  }

  return createClient({ url: validRedisUrl });
}

async function connectClient(client) {
  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}

async function getPublisher() {
  if (!validRedisUrl) {
    return null;
  }

  if (!publisherPromise) {
    const client = createRedisClient();
    if (!client) return null;
    client.on("error", (error) => {
      console.error("Redis publisher error", error);
    });
    publisherPromise = connectClient(client);
  }

  return publisherPromise;
}

async function getSubscriber() {
  if (!validRedisUrl) {
    return null;
  }

  if (!subscriberPromise) {
    const client = createRedisClient();
    if (!client) return null;
    client.on("error", (error) => {
      console.error("Redis subscriber error", error);
    });
    subscriberPromise = connectClient(client);
  }

  return subscriberPromise;
}

export async function publishRealtimeMessage(message) {
  const client = await getPublisher();
  if (!client) {
    return false;
  }

  await client.publish(channelName, JSON.stringify(message));
  return true;
}

export async function subscribeRealtimeMessages(handler) {
  const client = await getSubscriber();
  if (!client) {
    return null;
  }

  await client.subscribe(channelName, (message) => {
    try {
      handler(JSON.parse(message));
    } catch (error) {
      console.error("Failed to parse realtime message", error);
    }
  });

  return client;
}

export async function closeRedisPubSub() {
  const clients = await Promise.all([publisherPromise, subscriberPromise]);
  await Promise.all(
    clients
      .filter(Boolean)
      .map(async (client) => {
        try {
          if (client.isOpen) {
            await client.quit();
          }
        } catch (error) {
          console.error("Failed to close Redis client", error);
        }
      })
  );
  publisherPromise = null;
  subscriberPromise = null;
}

