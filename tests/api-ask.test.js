import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Mock response' }],
  }),
}));

vi.mock('../api/lib/anthropic.js', () => ({
  createClient: () => ({ messages: { create: mockCreate } }),
}));

const { default: handler } = await import('../api/ask.js');

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

describe('POST /api/ask', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Mock response' }] });
  });

  it('returns 200 for OPTIONS', async () => {
    const res = createRes();
    await handler(createReq('OPTIONS'), res);
    expect(res.statusCode).toBe(200);
  });

  it('returns 405 for GET', async () => {
    const res = createRes();
    await handler(createReq('GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 without question', async () => {
    const res = createRes();
    await handler(createReq('POST', {}), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 without API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = createRes();
    await handler(createReq('POST', { question: 'test' }), res);
    expect(res.statusCode).toBe(500);
  });

  it('returns results for default advisors', async () => {
    const res = createRes();
    await handler(createReq('POST', { question: 'test' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.results.analyst.ok).toBe(true);
    expect(res.body.results.analyst.text).toBe('Mock response');
    expect(res.body.results.buffett).toBeDefined();
    expect(res.body.results.munger).toBeDefined();
  });

  it('accepts custom advisor list', async () => {
    const res = createRes();
    await handler(createReq('POST', { question: 'test', advisors: ['crypto', 'dalio'] }), res);
    expect(res.body.results.crypto).toBeDefined();
    expect(res.body.results.analyst).toBeUndefined();
  });

  it('skips invalid advisor keys', async () => {
    const res = createRes();
    await handler(createReq('POST', { question: 'test', advisors: ['analyst', 'fake'] }), res);
    expect(res.body.results.analyst).toBeDefined();
    expect(res.body.results.fake).toBeUndefined();
  });

  it('calls all 3 default advisors', async () => {
    const res = createRes();
    await handler(createReq('POST', { question: 'test' }), res);
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('passes conversation history', async () => {
    const res = createRes();
    await handler(createReq('POST', {
      question: 'follow up',
      advisors: ['analyst'],
      conversationHistory: {
        analyst: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'a1' },
        ],
      },
    }), res);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'follow up' },
      ],
    }));
  });
});
