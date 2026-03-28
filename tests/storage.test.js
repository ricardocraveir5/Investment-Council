import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] || null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) });

// Dynamic import after mocking
const {
  saveConversation,
  getConversation,
  listConversations,
  deleteConversation,
  newConversation,
  getSelectedAdvisors,
  setSelectedAdvisors,
  getPortfolio,
  savePortfolio,
  updatePrices,
  setAlert,
  getAlerts,
  dismissAlert,
  getDismissedAlerts,
  addTransaction,
} = await import('../public/js/storage.js');

function resetStore() {
  localStorageMock.clear();
  localStorageMock.getItem.mockImplementation((key) => store[key] || null);
  localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
  localStorageMock.removeItem.mockImplementation((key) => { delete store[key]; });
}

describe('Conversation storage', () => {
  beforeEach(resetStore);

  it('newConversation creates a conversation with id', () => {
    const conv = newConversation();
    expect(conv.id).toBeTruthy();
    expect(conv.messages).toEqual([]);
    expect(conv.createdAt).toBeGreaterThan(0);
  });

  it('saveConversation creates and retrieves', () => {
    const conv = { id: 'test-1', messages: [{ role: 'user', content: 'hello' }], title: '' };
    saveConversation(conv);
    const retrieved = getConversation('test-1');
    expect(retrieved).toBeTruthy();
    expect(retrieved.id).toBe('test-1');
    expect(retrieved.messages).toHaveLength(1);
  });

  it('saveConversation auto-generates title from role/content format', () => {
    const conv = { id: 'test-2', messages: [{ role: 'user', content: 'What is the best stock to buy?' }] };
    saveConversation(conv);
    const retrieved = getConversation('test-2');
    expect(retrieved.title).toBe('What is the best stock to buy?');
  });

  it('saveConversation auto-generates title from t/x format', () => {
    const conv = { id: 'test-tx', messages: [{ t: 'u', x: 'Analyze AAPL please' }] };
    saveConversation(conv);
    const retrieved = getConversation('test-tx');
    expect(retrieved.title).toBe('Analyze AAPL please');
  });

  it('saveConversation truncates title to 50 chars', () => {
    const longMsg = 'A'.repeat(100);
    const conv = { id: 'test-3', messages: [{ role: 'user', content: longMsg }] };
    saveConversation(conv);
    const retrieved = getConversation('test-3');
    expect(retrieved.title).toHaveLength(50);
  });

  it('listConversations returns sorted by updatedAt desc', () => {
    let now = 1000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    now = 1000;
    saveConversation({ id: 'first', messages: [{ role: 'user', content: 'first' }] });
    now = 2000;
    saveConversation({ id: 'second', messages: [{ role: 'user', content: 'second' }] });
    now = 3000;
    saveConversation({ id: 'third', messages: [{ role: 'user', content: 'third' }] });

    spy.mockRestore();

    const list = listConversations();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe('third');
    expect(list[2].id).toBe('first');
  });

  it('deleteConversation removes from index and storage', () => {
    saveConversation({ id: 'del-me', messages: [{ role: 'user', content: 'bye' }] });
    expect(getConversation('del-me')).toBeTruthy();

    deleteConversation('del-me');
    expect(getConversation('del-me')).toBeNull();
    expect(listConversations().find(c => c.id === 'del-me')).toBeUndefined();
  });

  it('getConversation returns null for nonexistent id', () => {
    expect(getConversation('nonexistent')).toBeNull();
  });
});

describe('Advisor selection storage', () => {
  beforeEach(resetStore);

  it('getSelectedAdvisors returns defaults when empty', () => {
    const selected = getSelectedAdvisors();
    expect(selected).toEqual(['analyst', 'buffett', 'munger']);
  });

  it('setSelectedAdvisors persists and retrieves', () => {
    setSelectedAdvisors(['crypto', 'dalio', 'technical']);
    const selected = getSelectedAdvisors();
    expect(selected).toEqual(['crypto', 'dalio', 'technical']);
  });
});

describe('Portfolio storage', () => {
  beforeEach(resetStore);

  it('getPortfolio returns empty structure when no data', () => {
    const portfolio = getPortfolio();
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.watchlist).toEqual([]);
  });

  it('savePortfolio persists and retrieves', () => {
    const portfolio = {
      positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }],
      watchlist: ['MSFT'],
    };
    savePortfolio(portfolio);
    const retrieved = getPortfolio();
    expect(retrieved.positions).toHaveLength(1);
    expect(retrieved.positions[0].ticker).toBe('AAPL');
    expect(retrieved.watchlist).toContain('MSFT');
  });

  it('updatePrices updates currentPrice and lastPriceUpdate', () => {
    savePortfolio({
      positions: [
        { ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: null },
        { ticker: 'MSFT', shares: 5, avgCost: 300, currentPrice: null },
      ],
    });
    const updated = updatePrices({
      AAPL: { price: 178.50, change: 2.3, changePercent: 1.3 },
      MSFT: { price: 410.20, change: -1.5, changePercent: -0.36 },
    });
    expect(updated.positions[0].currentPrice).toBe(178.50);
    expect(updated.positions[0].priceChange).toBe(2.3);
    expect(updated.positions[0].lastPriceUpdate).toBeGreaterThan(0);
    expect(updated.positions[1].currentPrice).toBe(410.20);
  });

  it('updatePrices skips tickers not in priceMap', () => {
    savePortfolio({
      positions: [
        { ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: null },
        { ticker: 'TSLA', shares: 2, avgCost: 200, currentPrice: null },
      ],
    });
    const updated = updatePrices({ AAPL: { price: 180, change: 1, changePercent: 0.5 } });
    expect(updated.positions[0].currentPrice).toBe(180);
    expect(updated.positions[1].currentPrice).toBeNull();
  });

  it('addTransaction appends to position transactions', () => {
    savePortfolio({
      positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, transactions: [] }],
    });
    addTransaction('AAPL', 5, 160, 1711234567890);
    const portfolio = getPortfolio();
    expect(portfolio.positions[0].transactions).toHaveLength(1);
    expect(portfolio.positions[0].transactions[0]).toEqual({ shares: 5, price: 160, date: 1711234567890 });
  });
});

describe('Alert storage', () => {
  beforeEach(resetStore);

  it('getAlerts returns defaults for position without alerts', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }] });
    const alerts = getAlerts('AAPL');
    expect(alerts).toEqual({ stopLoss: null, takeProfit: null });
  });

  it('setAlert persists stop-loss and take-profit', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150 }] });
    setAlert('AAPL', 'stopLoss', 10);
    setAlert('AAPL', 'takeProfit', 25);
    const alerts = getAlerts('AAPL');
    expect(alerts.stopLoss).toBe(10);
    expect(alerts.takeProfit).toBe(25);
  });

  it('setAlert can clear an alert by setting null', () => {
    savePortfolio({ positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, alerts: { stopLoss: 10, takeProfit: 25 } }] });
    setAlert('AAPL', 'stopLoss', null);
    const alerts = getAlerts('AAPL');
    expect(alerts.stopLoss).toBeNull();
    expect(alerts.takeProfit).toBe(25);
  });

  it('dismissAlert records timestamp and getDismissedAlerts retrieves', () => {
    dismissAlert('sl_AAPL');
    const dismissed = getDismissedAlerts();
    expect(dismissed.sl_AAPL).toBeGreaterThan(0);
  });
});
