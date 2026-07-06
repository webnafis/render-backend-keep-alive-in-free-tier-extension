const PING_URL = "https://ecom-backend-nest-prisma-postgres-nsa.onrender.com/api/docs";
const ALARM_NAME = "renderKeepAlive";
const INTERVAL_MIN = 0.5; // 30 seconds (requires Chrome 120+; clamps to 1min on older)

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    active: true,
    pingCount: 0,
    lastPing: null,
    lastStatus: null,
    lastError: null,
  });
  setupAlarm();
  pingServer(); // immediate first ping
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("active", ({ active }) => {
    if (active) setupAlarm();
  });
});

// ── Alarm ─────────────────────────────────────────────────────────────────────

function setupAlarm() {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: INTERVAL_MIN,
      periodInMinutes: INTERVAL_MIN,
    });
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const { active } = await chrome.storage.local.get("active");
  if (!active) return;
  await pingServer();
});

// ── Ping ──────────────────────────────────────────────────────────────────────

async function pingServer() {
  const now = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(PING_URL, {
      method: "GET",
      cache: "no-cache",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const { pingCount = 0 } = await chrome.storage.local.get("pingCount");
    await chrome.storage.local.set({
      lastPing: now,
      lastStatus: res.status,
      pingCount: pingCount + 1,
      lastError: null,
    });
    console.log(`[Keep-Alive] Ping OK — ${res.status} at ${new Date(now).toLocaleTimeString()}`);
  } catch (err) {
    const { pingCount = 0 } = await chrome.storage.local.get("pingCount");
    await chrome.storage.local.set({
      lastPing: now,
      lastStatus: 0,
      pingCount: pingCount + 1,
      lastError: err.name === "AbortError" ? "Timeout (10s)" : err.message,
    });
    console.warn(`[Keep-Alive] Ping failed — ${err.message}`);
  }
}

// ── Messages from Popup ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "toggle") {
    chrome.storage.local.get("active", async ({ active }) => {
      const next = !active;
      await chrome.storage.local.set({ active: next });
      if (next) {
        setupAlarm();
        await pingServer();
      } else {
        await chrome.alarms.clear(ALARM_NAME);
      }
      sendResponse({ active: next });
    });
    return true; // async response
  }

  if (msg.action === "pingNow") {
    pingServer().then(() => sendResponse({ done: true }));
    return true;
  }

  if (msg.action === "getNextAlarm") {
    chrome.alarms.get(ALARM_NAME, (alarm) => {
      sendResponse({ scheduledTime: alarm ? alarm.scheduledTime : null });
    });
    return true;
  }
});
