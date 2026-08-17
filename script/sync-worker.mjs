const endpoint = process.env.SYNC_WORKER_ENDPOINT;
const token = process.env.SYNC_WORKER_TOKEN;

if (!endpoint || !token) {
  throw new Error("SYNC_WORKER_ENDPOINT and SYNC_WORKER_TOKEN are required.");
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function run() {
  for (;;) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "x-sync-worker-token": token },
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!response.ok) throw new Error(`Sync worker request failed (${response.status}).`);
      const body = await response.json();
      await delay(body?.data?.processed > 0 ? 100 : 1_000);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Sync worker request failed.");
      await delay(5_000);
    }
  }
}

void run();
