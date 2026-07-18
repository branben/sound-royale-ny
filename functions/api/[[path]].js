// Pages Function: proxy /api/* to the Django backend.
// The real backend host (Django + Postgres + Redis + Channels) is set via the
// API_ORIGIN environment variable in the Pages project settings (or .dev.vars).
// This keeps the frontend on a custom domain while the backend lives on
// Railway/Render/Fly. WebSocket (/ws/game/*) is handled by the browser
// directly against VITE_WS_URL — Pages Functions cannot proxy raw WebSockets.
//
// Set API_ORIGIN in:
//   Cloudflare Dashboard > Pages > sound-royale-ny > Settings > Environment variables
//   (e.g. https://soundroyale-backend.up.railway.app)

export async function onRequest(context) {
  const { request, env } = context;
  const apiOrigin = env.API_ORIGIN;
  if (!apiOrigin) {
    return new Response(
      "API_ORIGIN not configured. Set it in Pages project environment variables.",
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  // Strip the /api prefix and forward the rest to the backend.
  const backendPath = url.pathname.replace(/^\/api/, "") || "/";
  const target = new URL(backendPath + url.search, apiOrigin);

  // Forward the original method, headers (except host), and body.
  const init = {
    method: request.method,
    headers: {},
    redirect: "follow",
  };
  const skip = new Set(["host", "content-length"]);
  for (const [k, v] of request.headers.entries()) {
    if (!skip.has(k.toLowerCase())) init.headers[k] = v;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const resp = await fetch(target.toString(), init);

  // Strip hop-by-hop headers; allow CORS to be same-origin from the frontend.
  const outHeaders = new Headers(resp.headers);
  for (const h of ["content-encoding", "content-length", "transfer-encoding"]) {
    outHeaders.delete(h);
  }
  return new Response(resp.body, {
    status: resp.status,
    headers: outHeaders,
  });
}
