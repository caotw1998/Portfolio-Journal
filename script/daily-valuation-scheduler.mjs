const BEIJING_TIME_ZONE = "Asia/Shanghai";
const RETRY_INTERVAL_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;

function beijingClock(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function shouldRunDailyValuationSync({ now, lastSuccessDate, lastAttemptAt }) {
  const clock = beijingClock(now);
  if (["Sat", "Sun"].includes(clock.weekday)) return false;
  if (clock.hour < 20 || (clock.hour === 20 && clock.minute < 30)) return false;
  if (lastSuccessDate === clock.date) return false;
  if (lastAttemptAt && now.getTime() - lastAttemptAt.getTime() < RETRY_INTERVAL_MS) return false;
  return true;
}

export async function runDailyValuationScheduler({ endpoint, token, fetchImpl = fetch, delayImpl }) {
  let lastSuccessDate = null;
  let lastAttemptAt = null;
  for (;;) {
    const now = new Date();
    if (shouldRunDailyValuationSync({ now, lastSuccessDate, lastAttemptAt })) {
      lastAttemptAt = now;
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "x-sync-worker-token": token },
          signal: AbortSignal.timeout(2 * 60 * 1000),
        });
        if (!response.ok) throw new Error(`Daily valuation sync failed (${response.status}).`);
        lastSuccessDate = beijingClock(now).date;
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Daily valuation sync failed.");
      }
    }
    await delayImpl(POLL_INTERVAL_MS);
  }
}
