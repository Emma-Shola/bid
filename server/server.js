if (!process.argv.includes("--dev")) {
  process.argv.push("--dev");
}

await import("./server.mjs");
