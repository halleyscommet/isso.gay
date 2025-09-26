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
      // Fetch from origin
      let originRes = await fetch(originURL, { cf: { cacheEverything: true } });
      // For assets, return as-is with long cache
      if (isAsset) {
        const baseHeaders = new Headers();
        baseHeaders.set(
          "content-type",
          originRes.headers.get("content-type") || "application/octet-stream",
        );
        baseHeaders.set("cache-control", "public, max-age=31536000");
        baseHeaders.set("x-content-type-options", "nosniff");
        baseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
        baseHeaders.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
        baseHeaders.set("x-frame-options", "DENY");
        baseHeaders.set("cross-origin-opener-policy", "same-origin");
        baseHeaders.set("cross-origin-resource-policy", "same-site");
        res = new Response(originRes.body, { headers: baseHeaders, status: originRes.status });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      }

      // HTML: inject per-subdomain OG tags if host is a subdomain
      const host = url.hostname;
      const apex = new URL(ORIGIN).hostname;
      const isSub = host !== apex && host !== `www.${apex}` && host.endsWith(`.${apex}`);
      let html = await originRes.text();
      if (isSub && originRes.ok && html.includes("</head>")) {
        try {
          const sub = host.slice(0, -1 * (`.${apex}`.length));
          const metaUrl = `${ORIGIN}/og-meta?subdomain=${encodeURIComponent(sub)}`;
          const metaRes = await fetch(metaUrl, { cf: { cacheTtl: 0, cacheEverything: false } });
          if (metaRes.ok) {
            const meta = await metaRes.json();
            const pieces = [];
            const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            const title = esc(meta.title || "");
            const desc = esc(meta.description || "");
            const img = esc(meta.image || "");
            const fav = esc(meta.favicon || "");
            pieces.push(`<title>${title}</title>`);
            pieces.push(`<meta property="og:title" content="${title}">`);
            pieces.push(`<meta property="og:description" content="${desc}">`);
            if (img) pieces.push(`<meta property="og:image" content="${img}">`);
            pieces.push(`<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`);
            pieces.push(`<meta name="twitter:title" content="${title}">`);
            pieces.push(`<meta name="twitter:description" content="${desc}">`);
            if (img) pieces.push(`<meta name="twitter:image" content="${img}">`);
            if (fav) {
              // Replace or add favicon link
              html = html.replace(/<link[^>]+rel=["']icon["'][^>]*>/gi, "");
              pieces.push(`<link rel="icon" type="${fav.endsWith('.ico') ? 'image/x-icon' : 'image/png'}" href="${fav}">`);
            }
            // Remove any existing OG/Twitter meta to avoid duplicates
            html = html.replace(/<meta[^>]+property=["']og:[^>]+>/gi, "");
            html = html.replace(/<meta[^>]+name=["']twitter:[^>]+>/gi, "");
            // Replace <title> if exists; otherwise inject before </head>
            if (/<title>.*<\/title>/i.test(html)) {
              html = html.replace(/<title>[\s\S]*?<\/title>/i, pieces.shift());
            }
            html = html.replace("</head>", pieces.join("\n") + "\n</head>");
          }
        } catch (e) {
          // Non-fatal: log and serve original
          console.error("OG inject failed", e);
        }
      }

      const baseHeaders = new Headers();
      baseHeaders.set("content-type", "text/html; charset=utf-8");
      baseHeaders.set("cache-control", "no-store");
      baseHeaders.set("x-content-type-options", "nosniff");
      baseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
      baseHeaders.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
      baseHeaders.set("x-frame-options", "DENY");
      baseHeaders.set("cross-origin-opener-policy", "same-origin");
      baseHeaders.set("cross-origin-resource-policy", "same-site");

      res = new Response(html, { headers: baseHeaders, status: originRes.status });
      // Do not cache HTML to ensure fresh meta per request
    }
    return res;
  },
};
