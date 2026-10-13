import http from 'node:http';
import assert from 'node:assert/strict';

// Runs only inside the disposable profile created by verify-isolated-profile.mjs.
// The upstream is a loopback fixture: no customer credentials or paid inference.
export async function verifyIsolatedAccounting(api, base) {
  const submittedCaps = [];
  const upstream = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    submittedCaps.push(body.max_tokens);
    const interrupted = body.messages.some(m => m.content === 'interrupt fixture');
    const result = { id: 'fixture', object: 'chat.completion', model: 'known', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
    if (!body.stream) { setTimeout(() => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result)); }, 700); return; }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = data => response.write(`data: ${JSON.stringify(data)}\n\n`);
    chunk({ id: 'fixture', object: 'chat.completion.chunk', model: 'known', choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] });
    if (interrupted) {
      const timer = setInterval(() => chunk({ id: 'fixture', choices: [{ index: 0, delta: { content: '.' }, finish_reason: null }] }), 100);
      response.once('close', () => clearInterval(timer)); return;
    }
    const timer = setTimeout(() => {
      chunk({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: result.usage });
      response.end('data: [DONE]\n\n');
    }, 700);
    response.once('close', () => clearTimeout(timer));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  try {
    const { node } = await api('provider-nodes', 'POST', { name: 'Accounting fixture', prefix: 'pilotaccounting', apiType: 'chat', baseUrl: `http://127.0.0.1:${upstream.address().port}/v1` });
    await api('providers', 'POST', { provider: node.id, name: 'Accounting fixture', apiKey: 'fixture-only-not-a-real-key' });
    const key = await api('keys', 'POST', { name: 'Disposable accounting fixture' });
    await api('pricing', 'PATCH', { [node.id]: { known: { input: 1, output: 1 } } });
    await api('settings/spend-control', 'PUT', { enabled: true, dailyLimitUsd: 0.02, maxOutputTokens: 16 });
    const request = (model, stream, content = 'fixture', signal) => fetch(`${base}/v1/chat/completions`, { method: 'POST', signal, headers: { Authorization: `Bearer ${key.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: `pilotaccounting/${model}`, stream, max_tokens: 9999, messages: [{ role: 'user', content }] }) });
    const concurrent = await Promise.all(Array.from({ length: 10 }, async (_, i) => { const r = await request('known', i % 2 === 0); await r.text(); return r.status; }));
    const passed = concurrent.filter(status => status === 200).length;
    assert.ok(passed > 0 && concurrent.includes(402), 'Concurrent admission must accept and reject requests');
    assert.ok(concurrent.every(status => [200, 402].includes(status)), 'Unexpected request failure');
    for (let i = 0; i < 30; i++) { if ((await api('settings/spend-control')).state.pendingReservations === 0) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    const settled = (await api('settings/spend-control')).state;
    assert.equal(settled.pendingReservations, 0, 'Completed streams must settle reservations');
    assert.ok(Math.abs(settled.reservedOrSettledUsd - passed * 12 / 1e6) < 1e-9, 'Completed usage must settle exactly once');
    const history = await api('usage/history');
    assert.equal(history.totalRequests, passed, 'Concurrent identical completions must all be counted');
    const callsBeforeUnknown = submittedCaps.length;
    const unknown = await request('unknown', false); await unknown.text();
    assert.equal(unknown.status, 402); assert.equal(submittedCaps.length, callsBeforeUnknown);
    const controller = new AbortController();
    const interrupted = await request('known', true, 'interrupt fixture', controller.signal);
    assert.equal(interrupted.status, 200); await interrupted.body.getReader().read(); controller.abort();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal((await api('settings/spend-control')).state.pendingReservations, 1, 'Interrupted stream must retain reservation');
    assert.ok(submittedCaps.every(cap => cap === 16), 'Output cap must reach actual upstream');
    const traces = (await api('usage/routing')).traces;
    assert.ok(traces.some(t => t.combo === 'pilotaccounting/known' && t.streamStatus === 'completed'), 'Completed stream routing metadata missing');
    assert.ok(traces.some(t => t.combo === 'pilotaccounting/known' && t.streamStatus === 'cancelled'), 'Cancelled stream routing metadata missing');
    assert.ok(traces.some(t => t.combo === 'pilotaccounting/unknown' && t.status === 402), 'Admission rejection routing metadata missing');
    return { concurrentRequests: 10, completed: passed, budgetRejections: concurrent.filter(s => s === 402).length, completedStreamingAndNonstreamUsageSettled: true, concurrentUsageCounted: true, unknownPricingBlockedBeforeUpstream: true, interruptedStreamReservationRetained: true, outputCapReachedUpstream: true };
  } finally { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
}
