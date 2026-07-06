const INTERVAL_MS = 30_000; // mirrors background.js

const dot       = document.getElementById("dot");
const statusTxt = document.getElementById("status-text");
const toggleBtn = document.getElementById("toggle-btn");
const lastPing  = document.getElementById("last-ping");
const lastStat  = document.getElementById("last-status");
const pingCount = document.getElementById("ping-count");
const countdown = document.getElementById("countdown-val");
const progress  = document.getElementById("progress-fill");
const pingNowBtn= document.getElementById("ping-now-btn");

let nextAlarmTime = null;
let countdownInterval = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ms) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function applyActive(active) {
  dot.className     = "dot" + (active ? "" : " inactive");
  statusTxt.textContent = active ? "ACTIVE" : "PAUSED";
  toggleBtn.textContent = active ? "Disable" : "Enable";
  toggleBtn.className   = "toggle-btn" + (active ? "" : " off");
  countdown.textContent = active ? "—" : "paused";
  progress.style.width  = active ? "100%" : "0%";
}

function applyStorage({ active, pingCount: pc, lastPing: lp, lastStatus: ls, lastError: le }) {
  applyActive(active ?? true);
  pingCount.textContent = pc ?? 0;
  lastPing.textContent  = timeAgo(lp);

  if (ls === null) {
    lastStat.textContent = "—";
    lastStat.className   = "info-val";
  } else if (ls >= 200 && ls < 300) {
    lastStat.textContent = `${ls} OK ✓`;
    lastStat.className   = "info-val ok";
  } else if (ls === 0) {
    lastStat.textContent = le || "Connection error";
    lastStat.className   = "info-val err";
  } else {
    lastStat.textContent = `${ls}`;
    lastStat.className   = "info-val err";
  }
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    if (!nextAlarmTime) return;

    chrome.storage.local.get("active", ({ active }) => {
      if (!active) {
        countdown.textContent = "paused";
        progress.style.width  = "0%";
        return;
      }

      const remaining = Math.max(0, nextAlarmTime - Date.now());
      const secs = Math.ceil(remaining / 1000);
      countdown.textContent = `${secs}s`;
      progress.style.width  = `${(remaining / INTERVAL_MS) * 100}%`;

      if (secs <= 1) {
        dot.classList.add("pinging");
        setTimeout(() => dot.classList.remove("pinging"), 800);
      }
    });

    // Also refresh the "last ping" relative time
    chrome.storage.local.get(["lastPing"], ({ lastPing: lp }) => {
      lastPing.textContent = timeAgo(lp);
    });
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function fetchNextAlarm() {
  chrome.runtime.sendMessage({ action: "getNextAlarm" }, ({ scheduledTime }) => {
    nextAlarmTime = scheduledTime;
    startCountdown();
  });
}

// ── Buttons ───────────────────────────────────────────────────────────────────

toggleBtn.addEventListener("click", () => {
  toggleBtn.disabled = true;
  chrome.runtime.sendMessage({ action: "toggle" }, ({ active }) => {
    applyActive(active);
    toggleBtn.disabled = false;
    if (active) fetchNextAlarm();
    else { clearInterval(countdownInterval); countdown.textContent = "paused"; }
  });
});

pingNowBtn.addEventListener("click", () => {
  pingNowBtn.disabled = true;
  pingNowBtn.textContent = "Pinging…";
  dot.classList.add("pinging");

  chrome.runtime.sendMessage({ action: "pingNow" }, () => {
    chrome.storage.local.get(
      ["active", "pingCount", "lastPing", "lastStatus", "lastError"],
      (data) => {
        applyStorage(data);
        fetchNextAlarm();
        pingNowBtn.disabled = false;
        pingNowBtn.textContent = "⚡ Ping Now";
        dot.classList.remove("pinging");
      }
    );
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.storage.local.get(
  ["active", "pingCount", "lastPing", "lastStatus", "lastError"],
  (data) => {
    applyStorage(data);
    if (data.active !== false) fetchNextAlarm();
  }
);
