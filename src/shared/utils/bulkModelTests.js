export async function runBulkModelTests(items, { test, signal, concurrency = 2, onProgress = () => {} }) {
  const unique = [...new Map(items.map(item => [item.model, item])).values()];
  let next = 0;
  const progress = { total: unique.length, completed: 0, passed: 0, failed: 0, incomplete: 0, cancelled: false };
  onProgress({ ...progress });
  async function worker() {
    while (!signal?.aborted && next < unique.length) {
      const item = unique[next++];
      try {
        const result = await test(item, signal);
        progress.completed++;
        progress[result.ok ? 'passed' : result.connectionAccepted ? 'incomplete' : 'failed']++;
      } catch (error) {
        if (signal?.aborted) break;
        progress.completed++;
        progress.failed++;
        progress.error = error.message;
      }
      onProgress({ ...progress });
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, Math.floor(concurrency) || 1), unique.length) }, worker));
  progress.cancelled = !!signal?.aborted;
  onProgress({ ...progress });
  return progress;
}
