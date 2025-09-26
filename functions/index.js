import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

initializeApp();
const db = getFirestore();
const storage = getStorage();

const APEX = "isso.gay"; // keep in sync with frontend

const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "mail",
  "blog",
  "help",
  "status",
]);

// Shared CORS config for callable functions
const CORS = [
  "https://isso.gay",
  "https://www.isso.gay",
  "https://isso-gay.web.app",
  "https://isso-gay.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://localhost:5500",
];

/**
 * Claim a subdomain. New logic enforces ONLY ONE subdomain per user.
 * Transaction touches two docs:
 *   profiles/{subdomain}
 *   users/{uid}
 * If either exists (profile taken OR user already has one) it aborts.
 */
export const claimSubdomain = onCall(
  { region: "us-central1", cors: CORS },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login first");

    const raw = String(req.data?.subdomain || "").toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw)) {
      throw new HttpsError("invalid-argument", "invalid-subdomain");
    }
    if (RESERVED.has(raw))
      throw new HttpsError("failed-precondition", "reserved");

    const profileRef = db.collection("profiles").doc(raw);
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const [profileSnap, userSnap] = await Promise.all([
        tx.get(profileRef),
        tx.get(userRef),
      ]);

      if (profileSnap.exists) throw new HttpsError("already-exists", "taken");
      if (userSnap.exists)
        throw new HttpsError("failed-precondition", "already-has-subdomain");

      const now = FieldValue.serverTimestamp();
      tx.set(profileRef, {
        owner: uid,
        subdomain: raw,
        handle: raw,
        bio: "",
        links: [],
        createdAt: now,
        updatedAt: now,
      });
      tx.set(userRef, { subdomain: raw, createdAt: now, updatedAt: now });
    });

    return { ok: true, subdomain: raw };
  },
);

// Get the caller's current subdomain (if any)
export const getMySubdomain = onCall(
  { region: "us-central1", cors: CORS },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login first");
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) return { subdomain: null };
    return { subdomain: snap.data().subdomain || null };
  },
);

// Delete (release) the caller's subdomain. This is optional & irreversible.
export const deleteMySubdomain = onCall(
  { region: "us-central1", cors: CORS },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login first");
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists)
        throw new HttpsError("failed-precondition", "no-subdomain");
      const sub = userSnap.data().subdomain;
      if (!sub) throw new HttpsError("failed-precondition", "corrupt-user-doc");
      const profileRef = db.collection("profiles").doc(sub);
      const profileSnap = await tx.get(profileRef);
      if (!profileSnap.exists)
        throw new HttpsError("failed-precondition", "profile-missing");
      if (profileSnap.get("owner") !== uid)
        throw new HttpsError("permission-denied", "not-owner");
      tx.delete(profileRef);
      tx.delete(userRef);
    });
    return { ok: true };
  },
);

// Update profile fields (bio, links, avatarPath, customCSS). Owner only.
// Input shape (all optional):
// { bio: string, links: [{title, url, desc?}], avatarPath: string, faviconPath: string, customCSS: string, customHTML: string }
// Validation limits to keep things small & safe.
export const updateProfile = onCall(
  { region: "us-central1", cors: CORS },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login first");

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists)
      throw new HttpsError("failed-precondition", "no-subdomain");
    const sub = userSnap.data().subdomain;
    if (!sub) throw new HttpsError("failed-precondition", "corrupt-user-doc");
    const profileRef = db.collection("profiles").doc(sub);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists)
      throw new HttpsError("failed-precondition", "profile-missing");
    if (profileSnap.get("owner") !== uid)
      throw new HttpsError("permission-denied", "not-owner");

    const data = req.data || {};

    const update = {};

    // Bio - preserve internal newlines but trim surrounding whitespace
    if (data.bio !== undefined) {
      // Keep line breaks but remove leading/trailing whitespace
      let bio = String(data.bio || "").replace(/^\s+|\s+$/g, "");
      if (bio.length > 500) bio = bio.slice(0, 500);
      update.bio = bio;
    }

    // Links
    if (data.links !== undefined) {
      if (!Array.isArray(data.links))
        throw new HttpsError("invalid-argument", "links-must-array");
      const links = [];
      for (const raw of data.links.slice(0, 20)) {
        // max 20 links
        if (!raw || typeof raw !== "object") continue;
        let title = String(raw.title || "").trim();
        let url = String(raw.url || "").trim();
        let desc =
          raw.desc !== undefined ? String(raw.desc || "").trim() : undefined;
        if (!title || !url) continue;
        if (title.length > 80) title = title.slice(0, 80);
        if (desc && desc.length > 160) desc = desc.slice(0, 160);
        // Basic URL validation & normalization
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        try {
          new URL(url);
        } catch {
          continue;
        }
        links.push({ title, url, ...(desc ? { desc } : {}) });
      }
      update.links = links;
    }

    // Avatar path - must be in avatars/{uid}/
    if (data.avatarPath !== undefined) {
      let ap = String(data.avatarPath || "").trim();
      if (ap && !ap.startsWith(`avatars/${uid}/`)) {
        throw new HttpsError("invalid-argument", "invalid-avatarPath");
      }
      if (ap.length > 256) ap = ap.slice(0, 256);
      update.avatarPath = ap;
    }

    // Favicon path - must be in favicons/{uid}/ and should be tiny (enforced client side);
    // kept separate from avatar so user can have distinct square icon.
    if (data.faviconPath !== undefined) {
      let fp = String(data.faviconPath || "").trim();
      if (fp && !fp.startsWith(`favicons/${uid}/`)) {
        throw new HttpsError("invalid-argument", "invalid-faviconPath");
      }
      if (fp.length > 256) fp = fp.slice(0, 256);
      update.faviconPath = fp;
    }

    // Custom CSS (scoped & size-limited). Stored raw; injected client side inside <style>
    if (data.customCSS !== undefined) {
      let css = String(data.customCSS || "");
      if (css.length > 5000) css = css.slice(0, 5000); // 5KB cap
      // Light sanitization: strip <script> tags just in case someone pastes HTML.
      css = css.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      update.customCSS = css;
    }

    // Open Graph fields: allow per-profile overrides (title, description, image path)
    if (data.ogTitle !== undefined) {
      let t = String(data.ogTitle || "").trim();
      if (t.length > 100) t = t.slice(0, 100);
      update.ogTitle = t;
    }
    if (data.ogDescription !== undefined) {
      let d = String(data.ogDescription || "").trim();
      if (d.length > 300) d = d.slice(0, 300);
      update.ogDescription = d;
    }
    if (data.ogImagePath !== undefined) {
      let op = String(data.ogImagePath || "").trim();
      // Only allow storage paths under ogimages/{uid}/
      if (op && !op.startsWith(`ogimages/${uid}/`)) {
        throw new HttpsError("invalid-argument", "invalid-ogImagePath");
      }
      if (op.length > 256) op = op.slice(0, 256);
      update.ogImagePath = op;
    }

    // Custom HTML block: allow a subset of tags & attributes. Server-side defensive sanitize.
    if (data.customHTML !== undefined) {
      let html = String(data.customHTML || "");
      if (html.length > 5000) html = html.slice(0, 5000);
      // Strip script/style/iframe and on* attributes + javascript: or data: URLs
      // Remove blocked tags entirely
      html = html.replace(/<\/(?:script|style)[^>]*>/gi, ""); // closing tags simplified
      html = html.replace(
        /<(script|style|iframe|object|embed|audio|video)[^>]*>[\s\S]*?<\/\1>/gi,
        "",
      );
      // Remove event handler attributes
      html = html
        .replace(/ on[a-z]+="[^"]*"/gi, "")
        .replace(/ on[a-z]+='[^']*'/gi, "");
      // Neutralize javascript: and data: in href/src
      html = html.replace(/(href|src)=("|')(javascript:|data:)/gi, "$1=$2");
      update.customHTML = html;
    }

    if (Object.keys(update).length === 0) return { ok: true, noop: true };
    update.updatedAt = FieldValue.serverTimestamp();
    await profileRef.update(update);
    return { ok: true };
  },
);

// Public endpoint to get OG meta for a given subdomain (used by Cloudflare Worker)
// GET /og-meta?subdomain=<name> OR /og-meta?host=<hostname>
export const ogMeta = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  try {
    const host = String(req.query.host || req.headers.host || "").toLowerCase();
    let sub = String(req.query.subdomain || "").toLowerCase();
    if (!sub && host) {
      // derive subdomain from host
      const h = host.split(":")[0];
      if (h !== APEX && h !== `www.${APEX}` && h.endsWith(`.${APEX}`)) {
        sub = h.slice(0, -1 * (`.${APEX}`.length));
      }
    }

    // Default site-wide meta
    const defaults = {
      title: "isso.gay",
      description:
        "Claim a personal subdomain on isso.gay and build a simple profile page.",
      image: "https://isso.gay/default-favicon.svg",
      favicon: "https://isso.gay/default-favicon.svg",
    };

    if (!sub) {
      res.set("cache-control", "no-store");
      res.json(defaults);
      return;
    }

    const snap = await db.collection("profiles").doc(sub).get();
    if (!snap.exists) {
      res.set("cache-control", "no-store");
      res.json(defaults);
      return;
    }
    const p = snap.data() || {};

    async function fileUrlFromPath(path) {
      if (!path) return "";
      try {
        const bucket = storage.bucket();
        const file = bucket.file(path);
        const [md] = await file.getMetadata();
        const token = md?.metadata?.firebaseStorageDownloadTokens;
        if (token) {
          const firstToken = String(token).split(",")[0];
          const enc = encodeURIComponent(path);
          return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${enc}?alt=media&token=${firstToken}`;
        }
        // Fallback signed URL (1 day)
        const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 24 * 60 * 60 * 1000 });
        return url;
      } catch (e) {
        console.error("ogMeta: failed to build URL for", path, e);
        return "";
      }
    }

    const avatarURL = await fileUrlFromPath(p.avatarPath);
    const faviconURL = await fileUrlFromPath(p.faviconPath);
    const ogImageURL = await fileUrlFromPath(p.ogImagePath) || avatarURL || "";

    const title = p.ogTitle || `@${p.handle || sub} — ${APEX}`;
    const description =
      p.ogDescription || (p.bio ? String(p.bio).split("\n")[0] : `Profile on ${APEX}`);

    res.set("cache-control", "no-store");
    res.json({
      title,
      description,
      image: ogImageURL || defaults.image,
      favicon: faviconURL || defaults.favicon,
      handle: p.handle || sub,
      subdomain: sub,
      url: `https://${sub}.${APEX}`,
    });
  } catch (e) {
    console.error("ogMeta error", e);
    res.status(500).json({ error: "internal" });
  }
});
