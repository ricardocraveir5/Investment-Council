import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate, mockFetch } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Research response' }],
  }),
  mockFetch: vi.fn(),
}));

vi.mock('../api/lib/anthropic.js', () => ({
  createClient: () => ({ messages: { create: mockCreate } }),
}));

vi.stubGlobal('fetch', mockFetch);

const { default: handler } = await import('../api/research.js');

function createReq(method, body) {
  return { method, body };
}

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

function mockFinancialApi() {
  mockFetch.mockImplementation((url) => {
    const urlStr = url.toString();
    if (urlStr.includes('income-statements')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          income_statements: [{
            report_period: '2024-12-31', revenue: 394328000000,
            gross_profit: 180683000000, operating_income: 123216000000, net_income: 93736000000,
          }, { report_period: '2023-12-31', revenue: 383285000000 }],
        }),
      });
    }
    if (urlStr.includes('balance-sheets')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          balance_sheets: [{
            total_debt: 100000000000, shareholders_equity: 62146000000,
            current_assets: 153000000000, current_liabilities: 145000000000,
          }],
        }),
      });
    }
    if (urlStr.includes('cash-flow')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          cash_flow_statements: [
            { report_period: '2024-12-31', free_cash_flow: 110543000000 },
            { report_period: '2023-12-31', free_cash_flow: 99584000000 },
          ],
        }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

describe('POST /api/research', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', 'test-fin-key');
    mockFetch.mockReset();
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Research response' }] });
  });

  it('returns 405 for GET', async () => {
    const res = createRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 without question', async () => {
    const res = createRes();
    await handler(createReq('POST', { ticker: 'AAPL' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('fetches financial data when ticker provided', async () => {
    mockFinancialApi();
    const res = createRes();
    await handler(createReq('POST', { question: 'analyze', ticker: 'AAPL', advisors: ['analyst'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.financialContext).toContain('AAPL');
    expect(res.body.financialContext).toContain('Revenue');
  });

  it('includes key financial metrics', async () => {
    mockFinancialApi();
    const res = createRes();
    await handler(createReq('POST', { question: 'analyze', ticker: 'AAPL', advisors: ['analyst'] }), res);
    const ctx = res.body.financialContext;
    expect(ctx).toContain('Gross Margin');
    expect(ctx).toContain('Debt/Equity');
    expect(ctx).toContain('Free Cash Flow');
    expect(ctx).toContain('REVENUE TREND');
  });

  it('works without FINANCIAL_DATASETS_API_KEY', async () => {
    vi.stubEnv('FINANCIAL_DATASETS_API_KEY', '');
    const res = createRes();
    await handler(createReq('POST', { question: 'test', ticker: 'AAPL', advisors: ['analyst'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.financialContext).toBeNull();
  });

  it('works without ticker', async () => {
    const res = createRes();
    await handler(createReq('POST', { question: 'general', advisors: ['buffett'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.financialContext).toBeNull();
  });

  it('handles financial API errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const res = createRes();
    await handler(createReq('POST', { question: 'test', ticker: 'AAPL', advisors: ['analyst'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.financialContext).toContain('Could not retrieve');
  });
});
