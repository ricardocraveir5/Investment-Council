import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DOM and storage
const dismissed = {};
vi.mock('../public/js/storage.js', () => ({
  getDismissedAlerts: () => ({ ...dismissed }),
  dismissAlert: vi.fn((key) => { dismissed[key] = Date.now(); }),
}));

// Mock DOM elements and Notification API
const toasts = [];
vi.stubGlobal('document', {
  getElementById: (id) => id === 'toast-container' ? {
    appendChild: (el) => toasts.push(el),
  } : null,
  createElement: (tag) => ({
    className: '',
    innerHTML: '',
    classList: { add: vi.fn() },
    querySelector: () => ({ addEventListener: vi.fn() }),
    parentNode: true,
    remove: vi.fn(),
  }),
});
vi.stubGlobal('setTimeout', (fn) => fn());
vi.stubGlobal('Notification', class {
  constructor(title, opts) { this.title = title; this.body = opts?.body; }
  static permission = 'granted';
});
vi.stubGlobal('window', { Notification: globalThis.Notification });

const { initAlerts, checkAlerts } = await import('../public/js/alerts.js');

describe('checkAlerts() fuzz', () => {
  beforeEach(() => {
    for (const k of Object.keys(dismissed)) delete dismissed[k];
    toasts.length = 0;
    initAlerts();
  });

  it('handles empty positions array', () => {
    expect(() => checkAlerts([])).not.toThrow();
  });

  it('handles positions with no alerts set', () => {
    expect(() => checkAlerts([
      { ticker: 'AAPL', currentPrice: 150, avgCost: 100, alerts: null },
    ])).not.toThrow();
  });

  it('handles positions with no currentPrice', () => {
    expect(() => checkAlerts([
      { ticker: 'AAPL', currentPrice: null, avgCost: 100, alerts: { stopLoss: 10 } },
    ])).not.toThrow();
  });

  it('triggers stop-loss alert when P&L exceeds threshold', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 100, alerts: { stopLoss: 10 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('triggers take-profit alert when P&L exceeds threshold', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 130, avgCost: 100, alerts: { takeProfit: 20 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('does NOT trigger when P&L is within thresholds', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 95, avgCost: 100, alerts: { stopLoss: 10, takeProfit: 20 } },
    ]);
    expect(toasts.length).toBe(0);
  });

  it('handles exactly-at-threshold stop-loss', () => {
    // -10% exactly should trigger stopLoss of 10
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 90, avgCost: 100, alerts: { stopLoss: 10 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('handles exactly-at-threshold take-profit', () => {
    // +20% exactly should trigger takeProfit of 20
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 120, avgCost: 100, alerts: { takeProfit: 20 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('does not re-trigger dismissed alerts within cooldown', () => {
    dismissed['sl_AAPL'] = Date.now(); // just dismissed
    dismissed['wn_sl_AAPL'] = Date.now();
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 100, alerts: { stopLoss: 10 } },
    ]);
    expect(toasts.length).toBe(0);
  });

  it('re-triggers alerts after cooldown expires', () => {
    dismissed['sl_AAPL'] = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago (cooldown is 4h)
    dismissed['wn_sl_AAPL'] = Date.now() - 5 * 60 * 60 * 1000;
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 100, alerts: { stopLoss: 10 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('handles zero avgCost (division by zero)', () => {
    // pnlPct = (80 - 0) / 0 * 100 = Infinity
    // Infinity >= takeProfit should trigger
    expect(() => checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 0, alerts: { stopLoss: 10, takeProfit: 20 } },
    ])).not.toThrow();
  });

  it('handles negative currentPrice', () => {
    expect(() => checkAlerts([
      { ticker: 'AAPL', currentPrice: -50, avgCost: 100, alerts: { stopLoss: 10 } },
    ])).not.toThrow();
  });

  it('handles very large P&L percentages', () => {
    expect(() => checkAlerts([
      { ticker: 'AAPL', currentPrice: 10000, avgCost: 1, alerts: { takeProfit: 50 } },
    ])).not.toThrow();
  });

  it('handles position with only stopLoss (no takeProfit)', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 100, alerts: { stopLoss: 10 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('handles position with only takeProfit (no stopLoss)', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 150, avgCost: 100, alerts: { takeProfit: 30 } },
    ]);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('handles multiple positions with mixed alerts', () => {
    checkAlerts([
      { ticker: 'AAPL', currentPrice: 80, avgCost: 100, alerts: { stopLoss: 10 } },
      { ticker: 'MSFT', currentPrice: 400, avgCost: 300, alerts: { takeProfit: 20 } },
      { ticker: 'NVDA', currentPrice: 500, avgCost: 500, alerts: null },
    ]);
    expect(toasts.length).toBe(2);
  });
});
