import { prisma } from "./src/lib/prisma";
import { closeBackgroundQueue } from "./src/lib/background-queue";
import { createBackgroundWorker } from "./src/lib/background-worker";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required to run the background worker");
  process.exit(1);
}

const worker = createBackgroundWorker();

worker.on("ready", () => {
  console.log("Background worker ready");
});

worker.on("completed", (job) => {
  console.log(`Completed job ${job.id} (${job.name})`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id ?? "unknown"} failed`, error);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down background worker`);
  await worker.close();
  await closeBackgroundQueue();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
