export const TEST_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export function summarizeTestHistory(attempts, now = Date.now()) {
  const latest = attempts[attempts.length - 1];
  const latencies = attempts.filter(a => Number.isFinite(a.latencyMs) && a.latencyMs >= 0).map(a => a.latencyMs);
  const midpoint = Math.floor(latencies.length / 2);
  const mean = values => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const before = mean(latencies.slice(0, midpoint));
  const after = mean(latencies.slice(midpoint));
  return {
    attempts: attempts.length,
    successRate: attempts.length ? Math.round(attempts.filter(a => a.ok).length / attempts.length * 100) : null,
    averageLatencyMs: mean(latencies),
    latencyTrend: before === null || after === null ? 'insufficient data' : after > before * 1.1 ? 'slower' : after < before * 0.9 ? 'faster' : 'steady',
    stale: !latest?.testedAt || !Number.isFinite(Date.parse(latest.testedAt)) || now - Date.parse(latest.testedAt) > TEST_FRESHNESS_MS,
  };
}
