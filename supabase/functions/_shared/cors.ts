// Allowlist of origins permitted to call our Edge Functions.
// - tauri://localhost      → macOS / Linux Tauri webview
// - https://tauri.localhost → Windows WebView2
// - http://localhost:1420  → Vite dev server (pnpm dev)
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "tauri://localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
]);

// Baseline allow-headers used when the browser does not advertise its
// requested headers (non-CORS clients, curl, server-to-server). Real
// browsers send `Access-Control-Request-Headers` in the preflight, which
// we mirror in `corsHeaders` below — that handles supabase-js sending
// extras like `x-supabase-api-version` without us needing to maintain
// an exhaustive list.
const BASELINE_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": requestedHeaders ?? BASELINE_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: requestedHeaders ? "Origin, Access-Control-Request-Headers" : "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function preflight(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}
