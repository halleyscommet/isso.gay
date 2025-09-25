import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

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
// { bio: string, links: [{title, url, desc?}], avatarPath: string, customCSS: string }
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

    // Bio
    if (data.bio !== undefined) {
      let bio = String(data.bio || "").trim();
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

    // Custom CSS (scoped & size-limited). Stored raw; injected client side inside <style>
    if (data.customCSS !== undefined) {
      let css = String(data.customCSS || "");
      if (css.length > 5000) css = css.slice(0, 5000); // 5KB cap
      // Light sanitization: strip <script> tags just in case someone pastes HTML.
      css = css.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      update.customCSS = css;
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
