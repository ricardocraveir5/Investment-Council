import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Anthropic SDK ---
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Mock response' }],
  }),
}));

vi.mock('../api/lib/anthropic.js', () => ({
  createClient: () => ({ messages: { create: mockCreate } }),
}));

// --- Mock fetch for financial APIs ---
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// --- Import handlers ---
const { default: healthHandler } = await import('../api/health.js');
const { default: quoteHandler } = await import('../api/quote.js');
const { default: pricesHandler } = await import('../api/prices.js');
const { default: analyzeHandler } = await import('../api/analyze-portfolio.js');
const { default: askHandler } = await import('../api/ask.js');
const { default: researchHandler } = await import('../api/research.js');

function createReq(method, body) { return { method, body }; }
function createRes() {
  const res = {
    statusCode: null, headers: {}, body: null,
    setHeader(k, v) { res.headers[k] = v; return res; },
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    end() { return res; },
  };
  return res;
}

// ==================== /api/health ====================
describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = createRes();
    await healthHandler(createReq('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('reports key presence', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test');
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', '');
    const res = createRes();
    await healthHandler(createReq('GET'), res);
    expect(res.body.hasAnthropicKey).toBe(true);
    expect(res.body.hasFinancialKey).toBe(false);
  });
});

// ==================== /api/quote ====================
describe('POST /api/quote', () => {
  beforeEach(() => {
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', 'test-fin-key');
    mockFetch.mockReset();
  });

  it('returns 204 for OPTIONS', async () => {
    const res = createRes();
    await quoteHandler(createReq('OPTIONS'), res);
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for GET', async () => {
    const res = createRes();
    await quoteHandler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 for empty tickers', async () => {
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 without API key', async () => {
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', '');
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.statusCode).toBe(500);
  });

  it('returns quotes on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        stock_prices: [
          { close: 150, open: 148, high: 152, low: 147, volume: 1000000, time: '2025-01-01' },
          { close: 145, open: 144, high: 146, low: 143, volume: 900000, time: '2024-12-31' },
        ],
      }),
    });
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.quotes.AAPL.price).toBe(150);
    expect(res.body.quotes.AAPL.change).toBe(5);
  });

  it('handles API error gracefully', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['BAD'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.quotes.BAD).toBeUndefined();
  });

  it('handles fetch exception gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body.quotes)).toHaveLength(0);
  });

  it('handles empty stock_prices array', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ stock_prices: [] }) });
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.body.quotes.AAPL).toBeUndefined();
  });

  it('handles single price (no previous close)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        stock_prices: [{ close: 100, open: 99, high: 101, low: 98, volume: 500 }],
      }),
    });
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: ['X'] }), res);
    expect(res.body.quotes.X.change).toBe(0);
    expect(res.body.quotes.X.changePercent).toBe(0);
  });
});

// ==================== /api/prices ====================
describe('POST /api/prices', () => {
  beforeEach(() => {
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', 'test-fin-key');
    mockFetch.mockReset();
  });

  it('returns 400 for empty tickers', async () => {
    const res = createRes();
    await pricesHandler(createReq('POST', { tickers: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns prices on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        income_statements: [
          { revenue: 400e9, net_income: 100e9, report_period: '2024' },
          { revenue: 350e9, net_income: 90e9, report_period: '2023' },
        ],
      }),
    });
    const res = createRes();
    await pricesHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.prices.AAPL.revenue).toBe(400e9);
    expect(res.body.prices.AAPL.revenueGrowth).toBe('14.3');
  });

  it('handles no previous year (no growth calc)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        income_statements: [{ revenue: 400e9, net_income: 100e9, report_period: '2024' }],
      }),
    });
    const res = createRes();
    await pricesHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    expect(res.body.prices.AAPL.revenueGrowth).toBeNull();
  });

  it('handles zero previous revenue', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        income_statements: [
          { revenue: 100e9, net_income: 10e9, report_period: '2024' },
          { revenue: 0, net_income: 0, report_period: '2023' },
        ],
      }),
    });
    const res = createRes();
    await pricesHandler(createReq('POST', { tickers: ['AAPL'] }), res);
    // prev.revenue is 0 which is falsy, so revenueGrowth should be null
    expect(res.body.prices.AAPL.revenueGrowth).toBeNull();
  });
});

// ==================== /api/analyze-portfolio ====================
describe('POST /api/analyze-portfolio', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Analysis result' }] });
  });

  it('returns 400 for empty positions', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', { positions: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid advisor', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', { positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: 160 }], advisor: 'nonexistent' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns analysis on success', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', {
      positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: 160 }],
      advisor: 'analyst',
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.text).toBe('Analysis result');
  });

  it('handles missing currentPrice gracefully (uses avgCost)', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', {
      positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: null }],
      advisor: 'analyst',
    }), res);
    expect(res.statusCode).toBe(200);
    // Should not crash with NaN
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('AAPL');
    expect(prompt).not.toContain('NaN');
  });

  it('handles all positions missing prices', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', {
      positions: [
        { ticker: 'AAPL', shares: 0, avgCost: 0, currentPrice: null },
        { ticker: 'MSFT', shares: 0, avgCost: 0, currentPrice: null },
      ],
      advisor: 'analyst',
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Portfolio has no value');
  });

  it('handles negative shares without crashing', async () => {
    const res = createRes();
    await analyzeHandler(createReq('POST', {
      positions: [{ ticker: 'AAPL', shares: -5, avgCost: 150, currentPrice: 160 }],
      advisor: 'analyst',
    }), res);
    // Should still process - the advisor will see negative values
    expect(res.statusCode).toBe(200);
  });

  it('sanitizes error messages', async () => {
    mockCreate.mockRejectedValue(new Error('Secret internal error with API key sk-xxx'));
    const res = createRes();
    await analyzeHandler(createReq('POST', {
      positions: [{ ticker: 'AAPL', shares: 10, avgCost: 150, currentPrice: 160 }],
      advisor: 'analyst',
    }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.text).toBe('Unable to generate response');
    expect(res.body.text).not.toContain('sk-');
  });
});

// ==================== Fuzz: malformed bodies across endpoints ====================
describe('Fuzz: malformed request bodies', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', 'test-fin-key');
    mockCreate.mockClear();
    mockFetch.mockReset();
  });

  const fuzzBodies = [
    { label: 'null body', body: null },
    { label: 'undefined body', body: undefined },
    { label: 'empty object', body: {} },
    { label: 'string body', body: 'hello' },
    { label: 'number body', body: 42 },
    { label: 'array body', body: [1, 2, 3] },
    { label: 'boolean body', body: true },
  ];

  for (const { label, body } of fuzzBodies) {
    it(`/api/ask handles ${label}`, async () => {
      const res = createRes();
      await askHandler(createReq('POST', body), res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it(`/api/quote handles ${label}`, async () => {
      const res = createRes();
      await quoteHandler(createReq('POST', body), res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it(`/api/prices handles ${label}`, async () => {
      const res = createRes();
      await pricesHandler(createReq('POST', body), res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it(`/api/analyze-portfolio handles ${label}`, async () => {
      const res = createRes();
      await analyzeHandler(createReq('POST', body), res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  }

  it('/api/ask handles extremely long question', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const res = createRes();
    await askHandler(createReq('POST', { question: 'a'.repeat(10000) }), res);
    expect(res.statusCode).toBe(200);
  });

  it('/api/ask handles unicode/emoji in question', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const res = createRes();
    await askHandler(createReq('POST', { question: '¿Qué pasa con 🚀 $NVDA 中文?' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('/api/ask handles HTML/script injection in question', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const res = createRes();
    await askHandler(createReq('POST', { question: '<script>alert("xss")</script>' }), res);
    expect(res.statusCode).toBe(200);
    // The question is passed to Claude, not rendered - so it should just work
  });

  it('/api/ask sanitizes error messages', async () => {
    mockCreate.mockRejectedValue(new Error('Internal: API key is invalid sk-abc123'));
    const res = createRes();
    await askHandler(createReq('POST', { question: 'test', advisors: ['analyst'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results.analyst.text).toBe('Unable to generate response');
    expect(res.body.results.analyst.text).not.toContain('sk-');
  });

  it('/api/research sanitizes error messages', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ income_statements: [], balance_sheets: [], cash_flow_statements: [] }) });
    mockCreate.mockRejectedValue(new Error('Secret error'));
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const res = createRes();
    await researchHandler(createReq('POST', { question: 'test', advisors: ['analyst'] }), res);
    expect(res.body.results.analyst.text).toBe('Unable to generate response');
  });

  it('/api/quote handles non-string ticker in array', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ stock_prices: [] }) });
    const res = createRes();
    await quoteHandler(createReq('POST', { tickers: [123, null, undefined, true] }), res);
    // Should not crash
    expect(res.statusCode).toBe(200);
  });
});
