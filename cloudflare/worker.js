// Cloudflare Worker that serves the Firebase Hosting app for every subdomain.
export default {
  async fetch(request, env, ctx) {
    // Use Wrangler var ORIGIN if set; fallback to deployed Firebase Hosting site (replace with your custom domain if preferred)
    const ORIGIN = env.ORIGIN || "https://isso.gay";
    const url = new URL(request.url);
    const path = url.pathname;
    const isAsset = /\.(js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(path);
    // Include query string for assets so we can version-bust (e.g., /app.js?v=2)
    const assetPathWithQuery = `${path}${url.search}`;
    const originURL = isAsset
      ? `${ORIGIN}${assetPathWithQuery}`
      : `${ORIGIN}/index.html`;

    const cache = caches.default;
    // Cache key must also distinguish query versions
    const cacheKey = new Request(originURL, request);
    let res = await cache.match(cacheKey);
    if (!res) {
      res = await fetch(originURL, { cf: { cacheEverything: true } });
      const baseHeaders = new Headers();
      baseHeaders.set(
        "content-type",
        isAsset
          ? res.headers.get("content-type") || "application/octet-stream"
          : "text/html; charset=utf-8",
      );
      baseHeaders.set(
        "cache-control",
        isAsset ? "public, max-age=31536000" : "no-store",
      );
      // Security & misc hardening
      baseHeaders.set("x-content-type-options", "nosniff");
      baseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
      baseHeaders.set(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=()",
      );
      baseHeaders.set("x-frame-options", "DENY");
      baseHeaders.set("cross-origin-opener-policy", "same-origin");
      baseHeaders.set("cross-origin-resource-policy", "same-site");
      // You could add a CSP if desired – kept minimal to avoid blocking inline firebase scripts.
      res = new Response(res.body, {
        headers: baseHeaders,
        status: res.status,
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }
    return res;
  },
};
