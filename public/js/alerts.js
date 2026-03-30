import { getDismissedAlerts, dismissAlert } from './storage.js';

const DISMISS_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours before re-alerting
let toastContainer = null;

export function initAlerts() {
  toastContainer = document.getElementById("toast-container");
}

function getTriggeredAlerts(positions) {
  const dismissed = getDismissedAlerts();
  const triggered = [];

  for (const p of positions) {
    if (!p.currentPrice || !p.alerts) continue;
    const pnlPct = ((p.currentPrice - p.avgCost) / p.avgCost) * 100;

    if (p.alerts.stopLoss != null && pnlPct <= -Math.abs(p.alerts.stopLoss)) {
      const msg = `${p.ticker} hit stop-loss (${pnlPct.toFixed(1)}%)`;
      triggered.push({ ticker: p.ticker, type: "down", msg, toastKey: `sl_${p.ticker}`, notifKey: `wn_sl_${p.ticker}` });
    }

    if (p.alerts.takeProfit != null && pnlPct >= p.alerts.takeProfit) {
      const msg = `${p.ticker} hit target (+${pnlPct.toFixed(1)}%)`;
      triggered.push({ ticker: p.ticker, type: "up", msg, toastKey: `tp_${p.ticker}`, notifKey: `wn_tp_${p.ticker}` });
    }
  }

  return triggered.filter(a => {
    // At least one channel (toast or notification) should not be dismissed
    const toastOk = !dismissed[a.toastKey] || Date.now() - dismissed[a.toastKey] > DISMISS_COOLDOWN;
    const notifOk = !dismissed[a.notifKey] || Date.now() - dismissed[a.notifKey] > DISMISS_COOLDOWN;
    return toastOk || notifOk;
  });
}

export function checkAlerts(positions) {
  const alerts = getTriggeredAlerts(positions);
  const dismissed = getDismissedAlerts();

  for (const a of alerts) {
    if (toastContainer && (!dismissed[a.toastKey] || Date.now() - dismissed[a.toastKey] > DISMISS_COOLDOWN)) {
      showToast(a.msg, a.type, a.toastKey);
    }

    if ("Notification" in window && Notification.permission === "granted" &&
        (!dismissed[a.notifKey] || Date.now() - dismissed[a.notifKey] > DISMISS_COOLDOWN)) {
      new Notification("Investment Council", { body: a.msg, icon: "/icon-192.png" });
      dismissAlert(a.notifKey);
    }
  }
}

function showToast(message, type, alertKey) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "up" ? "\u{1F4C8}" : "\u{1F4C9}"}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close">\u{2715}</button>
  `;
  toast.querySelector(".toast-close").addEventListener("click", () => {
    dismissAlert(alertKey);
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 300);
  });
  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
