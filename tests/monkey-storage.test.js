import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
});
vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) });

function resetStore() {
  for (const k in store) delete store[k];
}

const {
  getPortfolio, savePortfolio, updatePrices, addTransaction,
  setAlert, getAlerts, getDismissedAlerts, dismissAlert,
  listConversations, saveConversation, getConversation, newConversation,
} = await import('../public/js/storage.js');

describe('Storage monkey tests: corrupted data', () => {
  beforeEach(resetStore);

  it('getPortfolio handles corrupted JSON', () => {
    store['ic_portfolio'] = 'NOT_JSON{{{';
    const result = getPortfolio();
    expect(result).toEqual({ positions: [], watchlist: [] });
  });

  it('listConversations handles corrupted JSON', () => {
    store['ic_conversations'] = '{broken';
    const result = listConversations();
    expect(result).toEqual([]);
  });

  it('getDismissedAlerts handles corrupted JSON', () => {
    store['ic_dismissed_alerts'] = '<<<invalid>>>';
    const result = getDismissedAlerts();
    expect(result).toEqual({});
  });

  it('getConversation handles corrupted conversation data', () => {
    store['ic_conversations'] = JSON.stringify([{ id: 'test1', title: 'Test', messages: [], updatedAt: Date.now() }]);
    store['ic_conv_test1'] = '{corrupt';
    const result = getConversation('test1');
    // Should either return null or a default - not crash
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('Storage monkey tests: portfolio edge cases', () => {
  beforeEach(resetStore);

  it('handles 100+ positions', () => {
    const portfolio = { positions: [], watchlist: [] };
    for (let i = 0; i < 100; i++) {
      portfolio.positions.push({ ticker: `T${i}`, shares: 10, avgCost: 100 + i });
    }
    savePortfolio(portfolio);
    const loaded = getPortfolio();
    expect(loaded.positions).toHaveLength(100);
  });

  it('updatePrices with tickers not in portfolio', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }], watchlist: [] });
    const result = updatePrices({ MSFT: { price: 400, change: 5 }, AAPL: { price: 155, change: 2 } });
    // MSFT should be ignored, AAPL updated
    const aapl = result.positions.find(p => p.ticker === 'AAPL');
    expect(aapl.currentPrice).toBe(155);
    expect(result.positions.find(p => p.ticker === 'MSFT')).toBeUndefined();
  });

  it('updatePrices with empty price map', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }], watchlist: [] });
    const result = updatePrices({});
    expect(result.positions[0].currentPrice).toBeUndefined();
  });

  it('addTransaction ignores non-existent ticker (no auto-create)', () => {
    savePortfolio({ positions: [], watchlist: [] });
    addTransaction('AAPL', 10, 150, Date.now());
    const p = getPortfolio();
    expect(p.positions).toHaveLength(0);
  });

  it('addTransaction records transaction on existing position', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, transactions: [] }], watchlist: [] });
    addTransaction('AAPL', 5, 160, Date.now());
    const p = getPortfolio();
    expect(p.positions[0].transactions).toHaveLength(1);
    expect(p.positions[0].transactions[0].shares).toBe(5);
    expect(p.positions[0].transactions[0].price).toBe(160);
  });

  it('addTransaction with zero shares', () => {
    savePortfolio({ positions: [], watchlist: [] });
    expect(() => addTransaction('AAPL', 0, 150, Date.now())).not.toThrow();
  });

  it('addTransaction with negative shares', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, transactions: [] }], watchlist: [] });
    expect(() => addTransaction('AAPL', -5, 150, Date.now())).not.toThrow();
  });

  it('addTransaction with zero price', () => {
    savePortfolio({ positions: [], watchlist: [] });
    expect(() => addTransaction('AAPL', 10, 0, Date.now())).not.toThrow();
  });
});

describe('Storage monkey tests: alerts edge cases', () => {
  beforeEach(resetStore);

  it('setAlert with zero threshold', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }], watchlist: [] });
    setAlert('AAPL', 'stopLoss', 0);
    const alerts = getAlerts('AAPL');
    expect(alerts.stopLoss).toBe(0);
  });

  it('setAlert with negative threshold', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }], watchlist: [] });
    setAlert('AAPL', 'stopLoss', -5);
    const alerts = getAlerts('AAPL');
    expect(alerts.stopLoss).toBe(-5);
  });

  it('setAlert with very large threshold', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }], watchlist: [] });
    setAlert('AAPL', 'takeProfit', 99999);
    const alerts = getAlerts('AAPL');
    expect(alerts.takeProfit).toBe(99999);
  });

  it('setAlert clears with null', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, alerts: { stopLoss: 10 } }], watchlist: [] });
    setAlert('AAPL', 'stopLoss', null);
    const alerts = getAlerts('AAPL');
    expect(alerts.stopLoss).toBeNull();
  });

  it('getAlerts for non-existent ticker', () => {
    savePortfolio({ positions: [], watchlist: [] });
    const alerts = getAlerts('NOPE');
    expect(alerts).toEqual({ stopLoss: null, takeProfit: null });
  });

  it('dismissAlert stores timestamp', () => {
    const before = Date.now();
    dismissAlert('test_key');
    const dismissed = getDismissedAlerts();
    expect(dismissed.test_key).toBeGreaterThanOrEqual(before);
  });

  it('multiple dismissals overwrite timestamp', () => {
    dismissAlert('key1');
    const first = getDismissedAlerts().key1;
    dismissAlert('key1');
    const second = getDismissedAlerts().key1;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

describe('Storage monkey tests: conversations edge cases', () => {
  beforeEach(resetStore);

  it('newConversation creates unique IDs', () => {
    const c1 = newConversation();
    const c2 = newConversation();
    expect(c1.id).not.toBe(c2.id);
  });

  it('saveConversation with empty messages', () => {
    const c = newConversation();
    c.messages = [];
    saveConversation(c);
    const loaded = getConversation(c.id);
    expect(loaded.title).toBe(''); // title stays empty when no messages
  });

  it('saveConversation generates title from first user message', () => {
    const c = newConversation();
    c.messages = [{ t: 'u', x: 'What is the best stock to buy right now?' }];
    saveConversation(c);
    const loaded = getConversation(c.id);
    expect(loaded.title).not.toBe('New chat');
    expect(loaded.title.length).toBeLessThanOrEqual(53); // 50 + "..."
  });

  it('getConversation returns null for unknown id', () => {
    expect(getConversation('nonexistent')).toBeNull();
  });

  it('handles rapid sequential saves', () => {
    const c = newConversation();
    for (let i = 0; i < 50; i++) {
      c.messages.push({ t: 'u', x: `Message ${i}` });
      saveConversation(c);
    }
    const loaded = getConversation(c.id);
    expect(loaded.messages).toHaveLength(50);
  });
});
