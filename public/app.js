import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { sanitizeHTML } from "./sanitize.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  getStorage,
  ref as sref,
  getDownloadURL,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAK_lpEcyuHso4oTZM1U-EfHKypP6YvA08",
  authDomain: "isso-gay.firebaseapp.com",
  projectId: "isso-gay",
  storageBucket: "isso-gay.firebasestorage.app",
  messagingSenderId: "800933783311",
  appId: "1:800933783311:web:0e546191c66879ff18c07a",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "us-central1");

const APEX = "isso.gay"; // change if needed

function getSubdomain(host) {
  host = host.split(":")[0].toLowerCase();
  if (host === APEX || host === `www.${APEX}`) return null;
  const parts = host.split(".");
  const apexParts = APEX.split(".");
  if (parts.length <= apexParts.length) return null;
  return parts.slice(0, parts.length - apexParts.length).join(".");
}
const sub = getSubdomain(location.hostname);

async function renderProfile(subdomain) {
  const el = document.getElementById("app");
  if (!subdomain) {
    // Root (apex) landing page logic
    const user = auth.currentUser;
    if (!user) {
      el.innerHTML = `
        <div class="center">
          <h1>isso.gay</h1>
          <p><strong>Grab your username as a subdomain.</strong><br/>One per account. Totally free.</p>
          <div class="card" style="text-align:center">
            <button class="btn" id="g">Sign in with Google</button>
            <p class="small" style="margin-top:8px">Sign in to reserve your subdomain.</p>
          </div>
          <p class="small">Your profile will live at https://&lt;name&gt;.${APEX}</p>
        </div>`;
      hookAuthUI();
      return;
    }

    // User signed in: determine if they already have a subdomain
    el.innerHTML = `<div class="center"><p>Loading your subdomain…</p></div>`;
    let existing;
    try {
      const getMy = httpsCallable(functions, "getMySubdomain");
      const r = await getMy();
      existing = r.data?.subdomain || null;
    } catch (e) {
      console.error("Failed to load user subdomain", e);
    }

    if (existing) {
      // Load existing profile to populate editing form
      let profileSnap;
      try {
        profileSnap = await getDoc(doc(db, "profiles", existing));
      } catch {}
      const profile = profileSnap?.exists()
        ? profileSnap.data()
        : { bio: "", links: [], avatarPath: "", customCSS: "", customHTML: "" };
      const avatarURL = profile.avatarPath
        ? await getDownloadURL(sref(storage, profile.avatarPath)).catch(
            () => "",
          )
        : "";
      el.innerHTML = `
        <div class="center">
          <h1>Manage your profile</h1>
          <div class="card" style="text-align:center">
            <p style="margin:0 0 12px"><strong>${existing}.${APEX}</strong></p>
            <a class="btn" href="https://${existing}.${APEX}" target="_blank">View</a>
            <button class="btn" id="deleteSub" style="margin-left:6px">Delete</button>
          </div>
          <form id="editForm" class="card" style="display:block">
            <h3 style="margin-top:0">Profile</h3>
            <div class="avatarRow" style="margin-bottom:12px;text-align:center">
              <img id="avatarPreview" class="avatar" src="${avatarURL}" style="${avatarURL ? "" : "display:none"}" alt="">
              <div style="margin-top:8px">
                <input type="file" id="avatarInput" accept="image/*" />
              </div>
            </div>
            <label>Bio (500 chars max)</label>
            <textarea id="bio" rows="3" placeholder="Write something">${escapeHTML(profile.bio || "")}</textarea>
            <div style="margin-top:16px">
              <label style="display:block">Links (Title, URL, optional desc)</label>
              <div id="linksEditor"></div>
              <button type="button" class="btn smallBtn" id="addLinkBtn" style="margin-top:8px">Add link</button>
            </div>
            <div style="margin-top:16px">
              <label>Custom CSS (optional, max 5KB)</label>
              <textarea id="customCSS" rows="6" placeholder="/* e.g. */\nbody{background:#222;color:#eee}\n.avatar{border:3px solid hotpink}">${escapeHTML(profile.customCSS || "")}</textarea>
              <p class="small" style="margin-top:4px">Applied only on your subdomain page. No &lt;script&gt; tags.</p>
            </div>
            <div style="margin-top:16px">
              <label>Custom HTML block (optional, safe tags only)</label>
              <textarea id="customHTML" rows="6" placeholder="<h2>Hello</h2>\n<p>This is my space.</p>">${escapeHTML(profile.customHTML || "")}</textarea>
              <p class="small" style="margin-top:4px">Allowed tags: h1–h6, p, a, ul, ol, li, strong, em, b, i, u, s, code, pre, blockquote, img, div, span, br, hr. Links must start with http/https. No scripts.</p>
              <p class="small" id="customHTMLStatus" style="margin-top:4px"></p>
            </div>
            <div style="margin-top:16px;text-align:right">
              <button type="submit" class="btn" id="saveBtn">Save</button>
            </div>
            <p id="saveStatus" class="small" style="min-height:1em"></p>
          </form>
          <button class="btn" id="signOutBtn">Sign out</button>
        </div>`;
      document
        .getElementById("signOutBtn")
        .addEventListener("click", () => signOut(auth));
      document
        .getElementById("deleteSub")
        .addEventListener("click", async () => {
          if (!confirm("Really delete your subdomain? This cannot be undone."))
            return;
          try {
            const del = httpsCallable(functions, "deleteMySubdomain");
            await del();
            alert("Deleted. You can now claim a new one.");
            renderProfile(null);
          } catch (e) {
            alert("Failed to delete: " + (e.message || e));
          }
        });
      setupLinksEditor(profile.links || []);
      hookAvatarUpload(existing, profile.avatarPath || "");
      hookSave(existing);
      return;
    }

    // No existing subdomain: show claim form
    el.innerHTML = `
      <div class="center">
        <h1>Claim your subdomain</h1>
        <div class="card">
          <label style="display:block;margin-bottom:6px">Choose a name</label>
          <input id="sub" type="text" placeholder="your-name" />
          <div style="margin-top:12px">
            <button class="btn" id="claim">Claim</button>
            <button class="btn" id="signOutBtn" style="margin-left:6px">Sign out</button>
          </div>
          <p class="small" style="margin-top:8px">Allowed: letters, numbers, dashes. 1–63 chars. One per account.</p>
        </div>
      </div>`;
    document
      .getElementById("signOutBtn")
      .addEventListener("click", () => signOut(auth));
    hookClaim();
    return;
  }

  let snap;
  try {
    snap = await getDoc(doc(db, "profiles", subdomain));
  } catch (e) {
    console.error("Failed to load profile", e);
    if (e?.code === "permission-denied") {
      el.innerHTML = `<h2>Profile currently unavailable (permissions)</h2>`;
      return;
    }
    el.innerHTML = `<h2>Error loading profile</h2>`;
    return;
  }
  if (!snap.exists()) {
    el.innerHTML = `<h2>${subdomain}.${APEX} not found</h2>`;
    return;
  }
  const p = snap.data();
  document.title = `@${p.handle} — ${APEX}`;

  let avatarURL = "";
  if (p.avatarPath) {
    try {
      avatarURL = await getDownloadURL(sref(storage, p.avatarPath));
    } catch {}
  }

  // Inject custom CSS if present
  if (p.customCSS) {
    const styleTag = document.createElement("style");
    styleTag.id = "customProfileCSS";
    styleTag.textContent = p.customCSS;
    document.head.appendChild(styleTag);
  }

  el.innerHTML = `
    <div class="center">
      <div class="card" style="text-align:center">
        ${avatarURL ? `<img class="avatar" src="${avatarURL}" alt="">` : ""}
        <h1>@${p.handle}</h1>
        ${p.bio ? `<p>${escapeHTML(p.bio)}</p>` : ""}
      </div>
      <div id="links"></div>
      ${p.customHTML ? `<div class="customHTML">${sanitizeHTML(p.customHTML)}</div>` : ""}
    </div>
  `;

  const linksEl = document.getElementById("links");
  (p.links || []).forEach((l) => {
    const a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "card";
    a.innerHTML = `<strong>${l.title}</strong>${l.desc ? `<div>${l.desc}</div>` : ""}`;
    linksEl.appendChild(a);
  });
}

function hookAuthUI() {
  const handleAuthError = (e) => {
    console.error("Auth error:", e);
    const code = e?.code || "";
    if (code === "auth/unauthorized-domain") {
      alert(
        "Sign-in is not allowed from this domain yet. Please add this domain to Firebase Authentication > Settings > Authorized domains.",
      );
      return;
    }
    if (code === "auth/popup-blocked") {
      alert(
        "Your browser blocked the sign-in popup. Please allow popups for this site and try again.",
      );
      return;
    }
    if (code === "auth/popup-closed-by-user") {
      // Silently ignore; user closed the popup.
      return;
    }
    alert("Failed to sign in: " + (e?.message || e));
  };

  document.getElementById("g")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      handleAuthError(e);
    }
  });
}

function hookClaim() {
  const btn = document.getElementById("claim");
  const input = document.getElementById("sub");
  if (!btn || !input) return;
  const claim = httpsCallable(functions, "claimSubdomain");
  btn.addEventListener("click", async () => {
    const name = (input.value || "").trim().toLowerCase();
    if (!name) {
      alert("Enter a name");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Claiming…";
    try {
      const res = await claim({ subdomain: name });
      const finalName = res.data?.subdomain || name;
      location.href = `https://${finalName}.${APEX}`;
    } catch (e) {
      const code = e?.message || "";
      if (code.includes("already-has-subdomain"))
        alert("You already have a subdomain.");
      else if (code.includes("taken")) alert("That name is taken.");
      else if (code.includes("reserved")) alert("That name is reserved.");
      else if (code.includes("invalid-subdomain"))
        alert("Invalid name. Letters, numbers, dashes.");
      else alert("Failed: " + (e.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = "Claim";
    }
  });
}

onAuthStateChanged(auth, () => renderProfile(sub));

// Helpers
function escapeHTML(str) {
  return (str || "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function setupLinksEditor(existing) {
  const container = document.getElementById("linksEditor");
  if (!container) return;
  function addRow(link = { title: "", url: "", desc: "" }) {
    const div = document.createElement("div");
    div.className = "linkRow";
    div.innerHTML = `
      <input type="text" class="linkTitle" placeholder="Title" value="${escapeHTML(link.title)}" />
      <input type="text" class="linkURL" placeholder="https://..." value="${escapeHTML(link.url)}" />
      <input type="text" class="linkDesc" placeholder="Description (optional)" value="${escapeHTML(link.desc || "")}" />
      <button type="button" class="btn removeBtn">×</button>
    `;
    div.querySelector(".removeBtn").addEventListener("click", () => {
      div.remove();
    });
    container.appendChild(div);
  }
  existing.forEach((l) => addRow(l));
  document
    .getElementById("addLinkBtn")
    ?.addEventListener("click", () => addRow());
}

function hookAvatarUpload(subdomain, currentPath) {
  const input = document.getElementById("avatarInput");
  const preview = document.getElementById("avatarPreview");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Not an image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Image too large (max 2MB).");
      return;
    }
    try {
      const cropped = await showImageCropper(file);
      if (!cropped) return; // user cancelled
      if (cropped.size > 2 * 1024 * 1024) {
        alert(
          "Cropped image too large (max 2MB). Try a smaller original or more zoom out.",
        );
        return;
      }
      const path =
        `avatars/${auth.currentUser.uid}/${Date.now()}_${(cropped.name || "avatar.jpg").replace(/[^a-zA-Z0-9._-]/g, "")}`.slice(
          0,
          200,
        );
      const ref = sref(storage, path);
      await uploadBytes(ref, cropped, { contentType: cropped.type });
      preview.src = URL.createObjectURL(cropped);
      preview.style.display = "";
      input.dataset.uploadedPath = path;
    } catch (e) {
      if (e && e.__cropCancelled) return; // silent cancel
      console.error(e);
      alert("Upload failed: " + (e.message || e));
    }
  });
}

function hookSave(subdomain) {
  const form = document.getElementById("editForm");
  if (!form) return;
  const saveStatus = document.getElementById("saveStatus");
  const saveFn = httpsCallable(functions, "updateProfile");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bio = document.getElementById("bio").value;
    const customCSS = document.getElementById("customCSS").value;
    const rawCustomHTML = document.getElementById("customHTML")?.value || "";
    const safeCustomHTML = sanitizeHTML(rawCustomHTML, { maxLength: 5000 });
    // Show a quick diff warning if content was altered
    if (
      rawCustomHTML &&
      rawCustomHTML.trim() &&
      rawCustomHTML.trim() !== safeCustomHTML.trim()
    ) {
      const st = document.getElementById("customHTMLStatus");
      if (st)
        st.textContent =
          "Some disallowed tags/attributes were removed for safety.";
    }
    const avatarInput = document.getElementById("avatarInput");
    const avatarPath = avatarInput?.dataset.uploadedPath || undefined;
    const links = [...document.querySelectorAll("#linksEditor .linkRow")]
      .map((row) => ({
        title: row.querySelector(".linkTitle").value.trim(),
        url: row.querySelector(".linkURL").value.trim(),
        desc: row.querySelector(".linkDesc").value.trim(),
      }))
      .filter((l) => l.title && l.url);
    const payload = { bio, links, customCSS, customHTML: safeCustomHTML };
    if (avatarPath) payload.avatarPath = avatarPath;
    form.querySelector("#saveBtn").disabled = true;
    saveStatus.textContent = "Saving…";
    try {
      await saveFn(payload);
      saveStatus.textContent = "Saved!";
      setTimeout(() => (saveStatus.textContent = ""), 2000);
    } catch (e) {
      saveStatus.textContent = "Error: " + (e.message || e);
    } finally {
      form.querySelector("#saveBtn").disabled = false;
    }
  });
}

// -------------- Avatar cropping modal ---------------
// Provides a lightweight square crop & position UI without external deps.
function showImageCropper(originalFile) {
  return new Promise((resolve, reject) => {
    // Create modal lazily
    const existing = document.getElementById("cropModalOverlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = "cropModalOverlay";
    overlay.innerHTML = `
      <div class="cropModal" role="dialog" aria-label="Crop avatar">
        <h3 style="margin-top:0">Adjust your avatar</h3>
        <div class="cropStageWrapper">
          <canvas id="cropCanvas" width="300" height="300" aria-label="Image crop area"></canvas>
          <div class="cropHint">Drag to position. Use slider or wheel to zoom.</div>
        </div>
        <label class="cropSliderLabel">Zoom <input id="cropZoom" type="range" min="0.5" max="3" step="0.01" value="1" /></label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button type="button" class="btn" id="cropCancel">Cancel</button>
          <button type="button" class="btn" id="cropConfirm">Crop & Upload</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector("#cropCanvas");
    const ctx = canvas.getContext("2d");
    const zoomInput = overlay.querySelector("#cropZoom");
    const btnCancel = overlay.querySelector("#cropCancel");
    const btnConfirm = overlay.querySelector("#cropConfirm");

    let img = new Image();
    let scale = 1; // current zoom
    let baseScale = 1; // scale needed to fill the square initially
    let offsetX = 0; // top-left draw offset
    let offsetY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOrigX = 0;
    let dragOrigY = 0;

    const cleanUp = () => overlay.remove();

    function clampOffsets() {
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      // Ensure image fully covers canvas; if image smaller (shouldn't) center it.
      if (drawW <= canvas.width) offsetX = (canvas.width - drawW) / 2;
      else {
        if (offsetX > 0) offsetX = 0;
        if (offsetX + drawW < canvas.width) offsetX = canvas.width - drawW;
      }
      if (drawH <= canvas.height) offsetY = (canvas.height - drawH) / 2;
      else {
        if (offsetY > 0) offsetY = 0;
        if (offsetY + drawH < canvas.height) offsetY = canvas.height - drawH;
      }
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height); // background for transparency
      ctx.drawImage(
        img,
        offsetX,
        offsetY,
        img.width * scale,
        img.height * scale,
      );
      ctx.restore();
    }

    function setScale(s, focalX, focalY) {
      const prevScale = scale;
      scale = Math.min(
        Math.max(s, parseFloat(zoomInput.min)),
        parseFloat(zoomInput.max),
      );
      // Zoom relative to focal point: adjust offsets so focal stays in place
      if (focalX !== undefined && focalY !== undefined) {
        const ratio = scale / prevScale;
        offsetX = focalX - (focalX - offsetX) * ratio;
        offsetY = focalY - (focalY - offsetY) * ratio;
      }
      clampOffsets();
      render();
    }

    canvas.addEventListener("mousedown", (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOrigX = offsetX;
      dragOrigY = offsetY;
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      offsetX = dragOrigX + (e.clientX - dragStartX);
      offsetY = dragOrigY + (e.clientY - dragStartY);
      clampOffsets();
      render();
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001; // trackpad friendly
        const rect = canvas.getBoundingClientRect();
        const focalX = e.clientX - rect.left;
        const focalY = e.clientY - rect.top;
        setScale(scale * (1 + delta), focalX, focalY);
        zoomInput.value = scale.toFixed(2);
      },
      { passive: false },
    );

    zoomInput.addEventListener("input", () => {
      setScale(parseFloat(zoomInput.value));
    });

    btnCancel.addEventListener("click", () => {
      cleanUp();
      const err = new Error("cancelled");
      err.__cropCancelled = true;
      reject(err);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        btnCancel.click();
      }
    });
    window.addEventListener(
      "keydown",
      function esc(e) {
        if (e.key === "Escape") {
          btnCancel.click();
        }
      },
      { once: true },
    );

    btnConfirm.addEventListener("click", () => {
      // Export 512x512 JPEG (or PNG if original had transparency & type is png)
      const outSize = 512; // consistent resolution
      const out = document.createElement("canvas");
      out.width = outSize;
      out.height = outSize;
      const octx = out.getContext("2d");
      octx.fillStyle = "#222";
      octx.fillRect(0, 0, outSize, outSize);
      const ratio = outSize / canvas.width;
      octx.drawImage(
        img,
        offsetX * ratio,
        offsetY * ratio,
        img.width * scale * ratio,
        img.height * scale * ratio,
      );
      const wantsPNG = /png$/i.test(originalFile.type);
      out.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create image blob"));
            cleanUp();
            return;
          }
          const file = new File(
            [blob],
            `avatar_${Date.now()}.${wantsPNG ? "png" : "jpg"}`,
            { type: blob.type },
          );
          cleanUp();
          resolve(file);
        },
        wantsPNG ? "image/png" : "image/jpeg",
        wantsPNG ? undefined : 0.9,
      );
    });

    // Load image
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        // Compute base scale to fill square
        const scaleX = canvas.width / img.width;
        const scaleY = canvas.height / img.height;
        baseScale = Math.max(scaleX, scaleY);
        scale = baseScale;
        zoomInput.value = scale.toFixed(2);
        // Center
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        offsetX = (canvas.width - drawW) / 2;
        offsetY = (canvas.height - drawH) / 2;
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(originalFile);
  });
}
