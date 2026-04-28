// Allowlist of origins permitted to call our Edge Functions.
// - tauri://localhost      → macOS / Linux Tauri webview
// - https://tauri.localhost → Windows WebView2
// - http://localhost:1420  → Vite dev server (pnpm dev)
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "tauri://localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
]);

const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return { ...BASE_HEADERS };
  }
  return { ...BASE_HEADERS, "Access-Control-Allow-Origin": origin };
}

export function preflight(req: Request): Response {
  return new Response("ok", { headers: corsHeaders(req) });
}

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}
