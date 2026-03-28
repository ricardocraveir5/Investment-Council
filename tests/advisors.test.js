import { describe, it, expect } from 'vitest';
import { ADVISORS, ADVISOR_KEYS, getAdvisor } from '../api/lib/advisors.js';

describe('Advisor definitions', () => {
  it('should have exactly 10 advisors', () => {
    expect(ADVISOR_KEYS).toHaveLength(10);
    expect(Object.keys(ADVISORS)).toHaveLength(10);
  });

  it('should include all expected advisor keys', () => {
    const expected = ['analyst', 'buffett', 'munger', 'technical', 'crypto', 'esg', 'dalio', 'lynch', 'income', 'contrarian'];
    for (const key of expected) {
      expect(ADVISOR_KEYS).toContain(key);
    }
  });

  it('each advisor should have required fields', () => {
    for (const key of ADVISOR_KEYS) {
      const a = ADVISORS[key];
      expect(a.name).toBeTruthy();
      expect(a.shortName).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(a.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(a.gradient).toContain('linear-gradient');
      expect(a.description).toBeTruthy();
      expect(a.system).toBeTruthy();
      expect(a.system.length).toBeGreaterThan(100);
    }
  });

  it('each advisor should have a unique name and icon', () => {
    const names = ADVISOR_KEYS.map(k => ADVISORS[k].name);
    const icons = ADVISOR_KEYS.map(k => ADVISORS[k].icon);
    expect(new Set(names).size).toBe(10);
    expect(new Set(icons).size).toBe(10);
  });

  it('getAdvisor should return the correct advisor', () => {
    const buffett = getAdvisor('buffett');
    expect(buffett.name).toBe('Warren Buffett');
    expect(buffett.icon).toBe('🎩');
  });

  it('getAdvisor should return null for invalid keys', () => {
    expect(getAdvisor('invalid')).toBeNull();
    expect(getAdvisor('')).toBeNull();
    expect(getAdvisor(undefined)).toBeNull();
  });

  it('all system prompts should include response length guidance', () => {
    for (const key of ADVISOR_KEYS) {
      expect(ADVISORS[key].system).toContain('200-350 words');
    }
  });
});
