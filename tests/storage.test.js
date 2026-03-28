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
} = await import('../public/js/storage.js');

describe('Conversation storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
    localStorageMock.removeItem.mockImplementation((key) => { delete store[key]; });
  });

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

  it('saveConversation auto-generates title from first user message', () => {
    const conv = { id: 'test-2', messages: [{ role: 'user', content: 'What is the best stock to buy?' }] };
    saveConversation(conv);
    const retrieved = getConversation('test-2');
    expect(retrieved.title).toBe('What is the best stock to buy?');
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
    // Most recent should be first (third was saved last)
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
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
  });

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
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockImplementation((key) => store[key] || null);
    localStorageMock.setItem.mockImplementation((key, value) => { store[key] = value; });
  });

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
});
