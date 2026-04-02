import { describe, it, expect } from 'vitest';
import { esc, formatText, timeAgo, fmtMoney, fmtPct, pnlPct } from '../public/js/ui.js';
import { detectTicker } from '../public/js/api.js';

// ==================== esc() ====================
describe('esc() fuzz', () => {
  it('escapes HTML entities', () => {
    expect(esc('<div>')).toBe('&lt;div&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });

  it('handles XSS payloads', () => {
    const xss = '<script>alert("xss")</script>';
    const result = esc(xss);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('handles double escaping', () => {
    expect(esc('&amp;')).toBe('&amp;amp;');
  });

  it('handles strings with only special chars', () => {
    expect(esc('<<<>>>&&&')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;');
  });
});

// ==================== formatText() ====================
describe('formatText() fuzz', () => {
  it('formats bold text', () => {
    expect(formatText('**bold**')).toContain('<strong');
    expect(formatText('**bold**')).toContain('bold');
  });

  it('handles empty string', () => {
    expect(formatText('')).toBe('');
  });

  it('handles unclosed bold markers', () => {
    const result = formatText('**unclosed');
    expect(result).toContain('**unclosed');
  });

  it('handles newlines', () => {
    expect(formatText('line1\nline2')).toContain('<br>');
  });

  it('escapes HTML inside bold', () => {
    const result = formatText('**<script>**');
    expect(result).not.toContain('<script>');
  });

  it('handles nested bold markers', () => {
    // Should not crash
    const result = formatText('**a **b** c**');
    expect(typeof result).toBe('string');
  });
});

// ==================== timeAgo() ====================
describe('timeAgo() fuzz', () => {
  it('returns "now" for recent timestamps', () => {
    expect(timeAgo(Date.now())).toBe('now');
  });

  it('returns minutes ago', () => {
    expect(timeAgo(Date.now() - 5 * 60000)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    expect(timeAgo(Date.now() - 3 * 3600000)).toBe('3h ago');
  });

  it('returns days ago', () => {
    expect(timeAgo(Date.now() - 2 * 86400000)).toBe('2d ago');
  });

  it('returns date for old timestamps', () => {
    const result = timeAgo(Date.now() - 30 * 86400000);
    expect(result).toMatch(/\d/); // Should contain a date
  });

  it('handles zero timestamp', () => {
    const result = timeAgo(0);
    expect(typeof result).toBe('string');
  });

  it('handles future timestamp', () => {
    // Future = negative diff, mins < 1
    expect(timeAgo(Date.now() + 60000)).toBe('now');
  });
});

// ==================== fmtMoney() ====================
describe('fmtMoney() fuzz', () => {
  it('formats zero', () => {
    expect(fmtMoney(0)).toBe('$0.00');
  });

  it('formats positive value', () => {
    expect(fmtMoney(1234.56)).toBe('$1,234.56');
  });

  it('formats negative value (uses absolute)', () => {
    const result = fmtMoney(-500);
    expect(result).toBe('$500.00');
    expect(result).not.toContain('-');
  });

  it('formats very large value', () => {
    const result = fmtMoney(1e12);
    expect(result).toContain('$');
    expect(result).toContain('00');
  });

  it('formats tiny value', () => {
    expect(fmtMoney(0.001)).toBe('$0.00');
  });

  it('handles NaN', () => {
    const result = fmtMoney(NaN);
    expect(result).toBe('$NaN');
  });

  it('handles Infinity', () => {
    const result = fmtMoney(Infinity);
    expect(result).toContain('$');
  });
});

// ==================== fmtPct() ====================
describe('fmtPct() fuzz', () => {
  it('formats zero', () => {
    expect(fmtPct(0)).toBe('+0.00%');
  });

  it('formats positive', () => {
    expect(fmtPct(12.345)).toBe('+12.35%');
  });

  it('formats negative', () => {
    expect(fmtPct(-5.5)).toBe('-5.50%');
  });

  it('formats very large', () => {
    expect(fmtPct(999.99)).toBe('+999.99%');
  });

  it('handles NaN', () => {
    expect(fmtPct(NaN)).toBe('NaN%');
  });
});

// ==================== pnlPct() ====================
describe('pnlPct() fuzz', () => {
  it('calculates normal gain', () => {
    expect(pnlPct(110, 100)).toBeCloseTo(10);
  });

  it('calculates normal loss', () => {
    expect(pnlPct(90, 100)).toBeCloseTo(-10);
  });

  it('returns 0 when prices are equal', () => {
    expect(pnlPct(100, 100)).toBe(0);
  });

  it('handles zero avgCost (division by zero)', () => {
    const result = pnlPct(100, 0);
    expect(result).toBe(Infinity);
  });

  it('handles negative prices', () => {
    // Mathematically valid even if nonsensical
    const result = pnlPct(-50, 100);
    expect(result).toBeCloseTo(-150);
  });

  it('handles both zero', () => {
    expect(pnlPct(0, 0)).toBeNaN();
  });
});

// ==================== detectTicker() ====================
describe('detectTicker() fuzz', () => {
  it('detects $AAPL', () => {
    expect(detectTicker('What about $AAPL?')).toBe('AAPL');
  });

  it('detects bare AAPL from known list', () => {
    expect(detectTicker('Tell me about AAPL')).toBe('AAPL');
  });

  it('returns empty for no ticker', () => {
    expect(detectTicker('hello world')).toBe('');
  });

  it('detects first $ ticker when multiple', () => {
    expect(detectTicker('$AAPL vs $MSFT')).toBe('AAPL');
  });

  it('handles $123 (not a valid ticker)', () => {
    expect(detectTicker('price is $123')).toBe('');
  });

  it('handles $TOOLONGXX (too many chars)', () => {
    expect(detectTicker('$TOOLONGXX')).toBe('');
  });

  it('handles empty string', () => {
    expect(detectTicker('')).toBe('');
  });

  it('handles lowercase known ticker', () => {
    // TICKERS has AAPL, regex is case-insensitive
    expect(detectTicker('what about aapl?')).toBe('AAPL');
  });

  it('detects $ ticker with exactly 1 char', () => {
    expect(detectTicker('$A stock')).toBe('A');
  });

  it('detects $ ticker with exactly 5 chars', () => {
    expect(detectTicker('$GOOGL looks good')).toBe('GOOGL');
  });

  it('handles unicode/emoji in text', () => {
    expect(detectTicker('🚀 $NVDA 🌙')).toBe('NVDA');
  });
});
