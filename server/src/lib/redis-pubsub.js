import { createClient } from "redis";

const channelName = process.env.REDIS_PUBSUB_CHANNEL ?? "zaaa:realtime";
const redisUrl = process.env.REDIS_URL;

let publisherPromise = null;
let subscriberPromise = null;

function createRedisClient() {
  if (!redisUrl) {
    return null;
  }

  return createClient({ url: redisUrl });
}

async function connectClient(client) {
  if (!client.isOpen) {
    await client.connect();
  }

  return client;
}

async function getPublisher() {
  if (!redisUrl) {
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
  if (!redisUrl) {
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

