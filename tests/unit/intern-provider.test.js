import { describe, it, expect } from 'vitest';
import provider from '../../open-sse/providers/registry/intern.js';
import registry from '../../open-sse/providers/registry/index.js';
import { isProviderAllowed } from '../../open-sse/providers/policy.js';
import { modelTestKey } from '../../src/shared/utils/modelTestResult.js';

describe('Intern Discovery provider', () => {
 it('registers an allowed provider with canonical alias routing', () => {
  expect(registry.filter(p=>p.id==='intern')).toHaveLength(1);
  expect(isProviderAllowed('intern')).toBe(true);
  expect(modelTestKey('intern/intern-s2')).toBe('intern/intern-s2');
 });
 it('uses versioned Discovery endpoints and preserves upstream IDs', () => {
  expect(provider.transport.baseUrl).toBe('https://discovery-api.intern-ai.org.cn/v1/chat/completions');
  expect(provider.transport.modelsFetcher.url).toBe('https://discovery-api.intern-ai.org.cn/v1/models');
  expect(provider.passthroughModels).toBe(true);
  expect(provider.models.map(m=>m.id)).toContain('Agents-A1');
  expect(provider.models.map(m=>m.id)).toContain('intern-s2');
 });
});
