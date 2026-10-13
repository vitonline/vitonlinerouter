// Shared by the HTTP wrapper and bundled application modules.
const state = globalThis.__vitonlineShutdown ??= { tasks: new Map(), installed: false, running: null };
function registerShutdown(key, run, priority = 0) {
  state.tasks.set(key, { run, priority });
  if (!state.installed) {
    state.installed = true;
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown(signal));
  }
  return () => state.tasks.delete(key);
}
function shutdown(signal) {
  if (state.running) return state.running;
  state.running = (async () => {
    const deadline = setTimeout(() => process.exit(1), 10_000);
    for (const task of [...state.tasks.values()].sort((a, b) => a.priority - b.priority)) {
      try { await task.run(signal); } catch (error) { console.error("Shutdown task failed:", error.message); }
    }
    clearTimeout(deadline);
    process.exit(0);
  })();
  return state.running;
}
module.exports = { registerShutdown, shutdown };
