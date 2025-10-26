# Custom Page Styling Guide

This guide is for anyone building a public isso.gay page. It focuses on the HTML block and CSS block that you edit in the profile editor—no repo access or build step required. Use it as a quick reference while crafting layouts, buttons, cards, and interactions.

---

## Quick start

1. Write structure/content in the **Custom HTML** panel. Keep it semantic (`<section>`, `<h2>`, `<p>`, `<a>`, etc.).
2. Paste visual rules in the **Custom CSS** panel. You can reuse the built‑in class names below or create your own.
3. Changes are limited to ~5 KB per block. Prefer concise selectors and avoid giant base64 images.
4. All custom HTML is rendered inside the same page as your avatar, bio, and link list. Scope your selectors so you don’t accidentally restyle the editor UI when you view your own page.
5. Publish to see the final result on your public profile URL.

---

## Page anatomy (what you can hook into)

| Selector | Description | When to use it |
| --- | --- | --- |
| `body` | Gray background, system fonts, padding `24px`. | Build full-width hero sections that blend with the native page. |
| `.center` | Max width `720px`, auto margins. | Wrap sections that should align with the default layout width. |
| `.card` | White panel, rounded corners, shadow. | Callouts, timelines, link collections, testimonials. |
| `.btn` | Pill button with hover/focus states. | CTA links, “Buy”, “Email”, “Watch trailer”, etc. |
| `.small` | 0.9 rem text with reduced opacity. | Captions, disclaimers, helper copy. |
| `.avatar` | 96px perfect circle. | Display alternate avatars or team member bubbles. |
| `#links` & `#links a.card` | Grid of default link cards. | Override spacing or colors for the standard link list. |
| `.badge`, `.badge-container` | Gradient capsules next to names. | Highlight achievements or roles in custom sections to match the built-in badges. |
| `.siteFooter` | Thin muted footer. | Helpful when matching spacing at the very bottom of your page. |

You’re not required to stick to these classes—feel free to define your own. They’re listed so you can take advantage of the existing polish without re-creating the same CSS.

---

## Ready-made building blocks

### Layout helpers

| Class | Effect | Tip |
| --- | --- | --- |
| `.center` | Constrains width, centers content. | Combine with your own `padding` to create tidy sections. |
| `.card` | Adds padding, radius, drop shadow. | Nest cards for alternating backgrounds by adding your own `background`. |
| `.cardStack` *(custom)* | Create by targeting `.card + .card` in your CSS to shrink the gap between sequential cards. |
| `.grid-2`, `.grid-3` *(write your own)* | Define quick CSS grids: `.grid-2 { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }`. |

### Text & media

| Class/element | Effect |
| --- | --- |
| `.small` | Lower-contrast helper text. |
| `h1`–`h3` | Inherit system font; safe to restyle with custom CSS to set brand fonts or colors. |
| `.avatar` | Ensures circular mask—drop any image in. |
| `.badge` modifiers (`.owner`, `.contributor`, `.supporter`) | Pre-made gradients; you can invent your own modifier (e.g., `.badge.artist`) by adding CSS that targets `.badge.artist`. |

### Buttons & chips

| Class | Details |
| --- | --- |
| `.btn` | Base button with transitions and focus ring. Works on `<a>` or `<button>`. |
| `.btnStack` | Vertical layout for a button with title + description. Add `.btnTitle` and `.btnDesc` spans inside for the typography tweaks. |
| `.smallBtn` | Shrunken button for inline actions or tag-like controls. |

### Responsive behaviors baked in

- `@media (max-width: 860px)` automatically stacks `.customEditorLayout` columns. You can piggyback on that breakpoint by adding your own rules inside the same query.
- `@media (max-width: 480px)` increases `.btn` tap targets and tightens link cards. Use the same breakpoint for mobile adjustments to keep everything consistent.

---

## Writing custom CSS safely

1. **Scope aggressively.** Prefix selectors with an ID or wrapper you control:
   ```css
   #my-showcase .card { background: #121212; color: #fff; }
   ```
   This keeps the editor UI and other people’s pages untouched.
2. **Respect the stacking context.** Avoid `position: fixed` unless it’s intended to overlap the whole page.
3. **Mind accessibility.** Keep body text ≥ 16 px, ensure contrast ratios of 4.5:1, and preserve `.btn:focus-visible` outlines or replace them with your own.
4. **Animate lightly.** Small `transition` values (<300 ms) feel best on the existing design. Avoid `animation: infinite spin` unless that’s the goal.
5. **Use CSS variables if you repeat colors.** Example:
   ```css
   :root {
     --brand: #6c63ff;
     --brand-dark: #4039a4;
   }
   #hero button { background: var(--brand); }
   #hero button:hover { background: var(--brand-dark); }
   ```

---

## Sample layout

```html
<section id="hero" class="center">
  <div class="card heroCard">
    <img class="avatar" src="https://example.com/me.png" alt="Avatar">
    <h1>Hi, I’m Juno</h1>
    <p>I build cozy web tools and stream speedruns.</p>
    <a class="btn" href="https://twitch.tv/juno">Watch live</a>
  </div>
</section>

<section id="projects" class="center">
  <article class="card project">
    <span class="badge supporter">New</span>
    <h2>Garden Notes</h2>
    <p>Plant tracker focused on vibes, not spreadsheets.</p>
    <a class="btn smallBtn" href="https://garden.example">Try it</a>
  </article>
  <article class="card project">
    <span class="badge artist">Art</span>
    <h2>Orbit Stickers</h2>
    <p>Hand-cut holographic sets, ships worldwide.</p>
  </article>
</section>
```

```css
#hero {
  margin-top: 32px;
}

.heroCard {
  text-align: center;
  background: radial-gradient(circle at top, #ffffff, #f0f0ff);
}

#projects {
  display: grid;
  gap: 16px;
}

.project .badge {
  margin-bottom: 8px;
}

.badge.artist {
  background: linear-gradient(90deg, #ff8fc7, #ffbe76);
}

@media (max-width: 600px) {
  #projects {
    grid-template-columns: 1fr;
  }
}
```

Use the example as a template—swap copy, colors, and layout pieces as needed.

---

## Checklist before publishing

- Content looks good on both desktop and mobile widths.
- Buttons and links have visible focus states.
- Text remains legible against your chosen background.
- No part of the layout hides the default footer or link list unless you intentionally replaced them.
- The custom CSS size stays under the editor limit (watch for giant gradients or imported fonts).

Happy styling! Share screenshots or snippets in the community if you come up with patterns others might reuse.
