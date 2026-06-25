// CORS for the PUBLIC share page (different origin set than the Tauri app helper).
const ALLOWED: ReadonlySet<string> = new Set([
  "https://lexena.app",
  "https://www.lexena.app",
  "http://localhost:5173",
  "http://localhost:1420",
]);

export function publicCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function publicPreflight(req: Request): Response {
  return new Response("ok", { headers: publicCorsHeaders(req) });
}
