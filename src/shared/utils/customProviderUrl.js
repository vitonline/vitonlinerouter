export function normalizeCustomProviderUrl(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error("Enter a valid API base URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTP or HTTPS URL without credentials, query parameters, or a fragment.");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/(?:chat\/completions|responses|messages|embeddings)$/, "");
  if (!url.pathname || url.pathname === "/") url.pathname = "/v1";
  return url.toString().replace(/\/$/, "");
}
