// Lightweight HTML sanitizer for user-provided profile custom blocks.
// Parses via DOMParser and whitelists a limited set of tags & attributes.
// Disallows: script/style/iframe/audio/video/object/embed, event handlers, inline JS URLs.
// Returns a safe HTML string.

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "img",
  "div",
  "span",
  "br",
  "hr",
]);

// Attribute whitelist per tag ("*" for all tags)
const GLOBAL_ATTRS = new Set(["title", "aria-label", "role"]);
const ATTRS = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  "*": new Set(["class", "id"]),
};

function isSafeURL(url) {
  try {
    const u = new URL(url, location.origin);
    const scheme = u.protocol.toLowerCase();
    if (scheme === "javascript:" || scheme === "data:") return false; // block JS and data URIs
    return true;
  } catch {
    return false; // invalid URLs rejected
  }
}

export function sanitizeHTML(dirty, { maxLength = 5000 } = {}) {
  if (!dirty) return "";
  if (dirty.length > maxLength) dirty = dirty.slice(0, maxLength);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${dirty}</div>`, "text/html");
  const root = doc.body.firstChild; // wrapper div

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  const toRemove = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      toRemove.push(el);
      continue;
    }
    // Remove disallowed attributes
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        // event handler
        el.removeAttribute(name);
        return;
      }
      const allowedForTag = ATTRS[tag] || new Set();
      const allowedStar = ATTRS["*"];
      if (
        !(
          allowedForTag.has(name) ||
          allowedStar.has(name) ||
          GLOBAL_ATTRS.has(name)
        )
      ) {
        el.removeAttribute(name);
        return;
      }
      if (
        (tag === "a" && name === "href") ||
        (tag === "img" && name === "src")
      ) {
        if (!isSafeURL(attr.value)) el.removeAttribute(name);
      }
      if (tag === "a" && name === "target") {
        // enforce safe rel when target=_blank
        if (attr.value === "_blank" && !el.hasAttribute("rel")) {
          el.setAttribute("rel", "noopener");
        }
      }
    });
  }
  toRemove.forEach((n) => n.remove());
  return root.innerHTML.trim();
}
