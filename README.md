# isso.gay

A minimal profile subdomain project. Users can claim exactly one subdomain (e.g. `yourname.isso.gay`) and customize their page (avatar, bio, links, optional custom CSS, optional safe custom HTML block).

## Features

- Firebase Auth (Google) required to claim a subdomain
- Exactly one subdomain per account (enforced server-side in a transaction)
- Profile editing UI (avatar upload, bio, links, custom CSS, optional custom HTML)
- Optional custom CSS injected only on the user's page (5KB cap, scripts stripped)
- Optional custom HTML block (5KB cap) with strict allow‑list sanitation (headings, paragraphs, inline formatting, lists, links, code, blockquote, img, simple structural tags). No script/style/iframe/event handlers or `javascript:` / `data:` URLs.
- Optional custom favicon per subdomain (user‑uploaded 32x32 PNG/ICO <50KB)
- Public profile documents stored in Firestore under `profiles/{subdomain}`
- Internal user ownership doc at `users/{uid}` (not publicly readable)
- Deletion endpoint to release a subdomain (optional UI button)
- Cloudflare Worker acts as a caching reverse proxy in front of Firebase Hosting

## Data Model

```
profiles/{subdomain} {
  owner: <uid>,
  subdomain: <string>,
  handle: <string>,
  bio: <string>,            // up to 500 chars
  links: [ { title, url, desc? } ], // up to 20 links
  avatarPath: <string>,     // path in Storage (avatars/<uid>/...)
  faviconPath: <string>,    // path in Storage (favicons/<uid>/...)
  customCSS: <string>,      // up to ~5KB, sanitized (no <script>)
  customHTML: <string>,     // up to ~5KB, sanitized allow‑list (see below)
  createdAt, updatedAt
}
users/{uid} {
  subdomain: <string>,
  createdAt, updatedAt
}
```

## Callable Functions

- `claimSubdomain({ subdomain })` – claims new subdomain if user has none.
- `getMySubdomain()` – returns `{ subdomain }` or null.
- `deleteMySubdomain()` – deletes both the user doc and profile (irreversible).
- `updateProfile({ bio?, links?, avatarPath?, faviconPath?, customCSS?, customHTML? })` – partial update of owned profile (validation + size limits).

## Firestore Security

Profiles readable individually by anyone (no collection list). User docs only readable by the owner. All writes funnel through Cloud Functions.

### Custom HTML Sanitization

Client & server both sanitize `customHTML` defensively. Allowed tags:

```
h1 h2 h3 h4 h5 h6 p a ul ol li strong em b i u s code pre blockquote img div span br hr
```

Allowed attributes:

```
Global: class id title aria-label role
<a>: href target rel (href must be http/https; target=_blank forces rel=noopener)
<img>: src alt width height (src must be http/https)
```

Removed automatically: any other tags, inline event handlers (on\*), iframe/object/embed/audio/video/style/script tags, `javascript:` / `data:` URLs, unknown attributes. If user input is changed by sanitation a note is shown in the editor.

## Local Development

1. `firebase emulators:start` (if you have emulators configured) or deploy functions.
2. Serve the `public/` folder or rely on Firebase Hosting.
3. Update Cloudflare Worker `ORIGIN` env var if using a custom preview origin.

## Deploy

- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Deploy functions: `firebase deploy --only functions`
- Deploy hosting: `firebase deploy --only hosting`
- Publish Cloudflare worker with Wrangler.

### Asset Versioning (Cache Busting)

Static assets (`app.js`, `styles.css`) are long‑cached via the Cloudflare Worker. To avoid manual cache purges we use a small script that injects a content hash as a `?v=` query param.

Workflow:

1. Edit `public/app.js` or `public/styles.css`.
2. Run `npm run version-assets` (generates hashes, rewrites `public/index.html`).
3. Deploy hosting: `firebase deploy --only hosting`.
4. (Only if the worker code changed) `wrangler deploy`.

Source template: `public/index.template.html` (never gains `?v=` params). The script re-renders `index.html` from this template each run. If you add new static assets that need versioning, add them to the `assets` array inside `scripts/version-assets.mjs`.

Optional: Add a Firebase predeploy hook in `firebase.json` to run `npm run version-assets` automatically before hosting deploys.

## Custom Favicon

Each profile can set a custom favicon which appears only on their subdomain pages.

Implementation notes:

- Stored at `favicons/{uid}/<timestamp>_<name>.png|ico` in Firebase Storage
- Upload UI accepts PNG or ICO. PNGs are normalized client‑side to 32×32 (cover) and re‑encoded as PNG.
- Size limit enforced client side: 50KB
- Path stored in Firestore as `faviconPath`
- When rendering a profile page the client injects a `<link rel="icon">` tag dynamically with a cache‑busting query param derived from `updatedAt` (or current time if absent)
- Apex domain uses a static `default-favicon.svg`

Security:

- Storage rules restrict writes to `favicons/{uid}/` for the authenticated owner (mirrors avatar path logic)
- Cloud Functions validate that any provided `faviconPath` begins with `favicons/{uid}/`

## TODO / Ideas

- Rate limiting & abuse detection (to add)
- Reserved / premium names workflow
- Moderation / reporting tools
- Allow per‑user tweaking of allowed tags (admin moderated)
- Image proxying / resizing for external `img` sources
- Pre-render static HTML for profiles and cache aggressively at edge

MIT License.
