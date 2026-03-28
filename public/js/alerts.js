import { getDismissedAlerts, dismissAlert } from './storage.js';

const DISMISS_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours before re-alerting
let toastContainer = null;

export function initAlerts() {
  toastContainer = document.getElementById("toast-container");
}

export function checkAlerts(positions) {
  if (!toastContainer) return;
  const dismissed = getDismissedAlerts();

  for (const p of positions) {
    if (!p.currentPrice || !p.alerts) continue;
    const pnlPct = ((p.currentPrice - p.avgCost) / p.avgCost) * 100;

    // Stop-loss alert
    if (p.alerts.stopLoss != null && pnlPct <= -Math.abs(p.alerts.stopLoss)) {
      const key = `sl_${p.ticker}`;
      if (!dismissed[key] || Date.now() - dismissed[key] > DISMISS_COOLDOWN) {
        showToast(`${p.ticker} hit stop-loss (${pnlPct.toFixed(1)}%)`, "down", key);
      }
    }

    // Take-profit alert
    if (p.alerts.takeProfit != null && pnlPct >= p.alerts.takeProfit) {
      const key = `tp_${p.ticker}`;
      if (!dismissed[key] || Date.now() - dismissed[key] > DISMISS_COOLDOWN) {
        showToast(`${p.ticker} hit target (+${pnlPct.toFixed(1)}%)`, "up", key);
      }
    }
  }

  // Try Web Notification API if available and permitted
  tryWebNotifications(positions, dismissed);
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

  // Auto-remove after 8 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

function tryWebNotifications(positions, dismissed) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  for (const p of positions) {
    if (!p.currentPrice || !p.alerts) continue;
    const pnlPct = ((p.currentPrice - p.avgCost) / p.avgCost) * 100;

    if (p.alerts.stopLoss != null && pnlPct <= -Math.abs(p.alerts.stopLoss)) {
      const key = `wn_sl_${p.ticker}`;
      if (!dismissed[key] || Date.now() - dismissed[key] > DISMISS_COOLDOWN) {
        new Notification("Investment Council", {
          body: `${p.ticker} hit stop-loss (${pnlPct.toFixed(1)}%)`,
          icon: "/icon-192.png",
        });
        dismissAlert(key);
      }
    }

    if (p.alerts.takeProfit != null && pnlPct >= p.alerts.takeProfit) {
      const key = `wn_tp_${p.ticker}`;
      if (!dismissed[key] || Date.now() - dismissed[key] > DISMISS_COOLDOWN) {
        new Notification("Investment Council", {
          body: `${p.ticker} hit target (+${pnlPct.toFixed(1)}%)`,
          icon: "/icon-192.png",
        });
        dismissAlert(key);
      }
    }
  }
}

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
