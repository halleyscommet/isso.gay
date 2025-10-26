# HTML & CSS Reference

This document covers the stock markup in `public/index.html` and the shared stylesheet in `public/styles.css`. The HTML delivers a minimal shell (`#app` and the footer) while the CSS file defines reusable hooks that the JavaScript app (`public/app.js`) applies when it injects dynamic content. Keep your custom HTML snippets and custom CSS snippets separate—the HTML controls structure/content, and the CSS controls visual styling.

## HTML overview

| Element / ID / Class | File | Purpose |
| --- | --- | --- |
| `<div id="app">` | `public/index.html` | Empty root where `app.js` renders either the landing page, the profile editor, or a public profile. |
| `<footer class="siteFooter">` | `public/index.html` | Static footer shown on every page with a GitHub link. Styled via the `.siteFooter` rules described later. |
| `<link rel="stylesheet" href="/styles.css">` | `public/index.html` | Loads the standalone CSS file. Custom user CSS is injected separately at runtime and never lives in this file. |
| `<script type="module" src="/app.js">` | `public/index.html` | Loads the JavaScript that builds the rest of the page at runtime, wiring IDs/classes to behavior. |

### Runtime-generated HTML blocks

`app.js` builds several chunks of markup and assigns classes so that the shared CSS can style them:

- Landing view: wraps everything in `.center`, `.card`, `.btn`, and `.small` to keep content centered and readable.
- Profile editor: builds form controls (`textarea`, `input[type="text"]`, `.linkRow`, `.avatarRow`, etc.), the custom HTML/CSS editors (`.customEditorLayout` family), and the saved configuration sidebar (`.savedConfigPanel`, `.savedConfigSlot`, and related classes).
- Public profile page: renders user bio, avatar (`.avatar`), and user links list (`#links` with `.card` anchors).
- Utility overlays: the avatar cropper uses `#cropModalOverlay`, `.cropModal`, and `#cropCanvas`.
- Trust indicators: contributor badges rely on `.badge` and its modifier classes.

## CSS hooks

Each selector below can be reused within your custom HTML as long as you keep markup and styling separate (structure in HTML, look-and-feel via class/id attributes).

### Global tags and utilities

| Selector | What it does |
| --- | --- |
| `body` | Sets system font stack, removes default margins, and establishes the light gray background. |
| `a`, `a:hover` | Keeps links inheriting text color with no underline by default, restores underline on hover for contrast. |
| `input[type="text"]`, `textarea` | Gives text inputs rounded borders, padding, and consistent font/resizing behavior. |
| `.center` | Constrains content width to 720px and centers it with automatic margins. |
| `.small` | Applies 0.9 rem text size and reduced opacity for helper text. |
| `.avatar` | Forces avatar images into 96 px circles with `object-fit: cover`. |

### Cards and buttons

| Selector | Description |
| --- | --- |
| `.card` | White panel with rounded corners, padding, and drop shadow used for grouped content (forms, info blocks). |
| `.btn` | Pill-shaped button with padding, subtle transitions, hover/active/focus-visible states, and disabled styling. |
| `.btnStack` | Variant that stacks button label/description vertically and left-aligns text for richer CTA buttons. |
| `.btnStack .btnTitle`, `.btnStack .btnDesc` | Typography tweaks for the two-line stacked button labels. |
| `.smallBtn` | Reduces `.btn` padding/font size for inline controls (e.g., link editor buttons). |

### Form & link builder helpers

| Selector | Description |
| --- | --- |
| `.linkRow` | Four-column grid (title, URL, description, remove button) used inside the link editor. |
| `.linkRow input` | Ensures the inputs stretch to fill their grid cell. |
| `.linkRow .removeBtn`, `.linkRow button` | Tightens padding and neutral border for the remove button. |
| `.avatarRow input[type="file"]` | Shrinks the file-input text to fit under the avatar preview. |

### Custom HTML/CSS editor layout

| Selector | Description |
| --- | --- |
| `.customEditorLayout` | Flex container that positions the main editors next to the saved-config panel, with a gap. |
| `.customEditorMain` | Vertical flex stack that houses the CSS and HTML textareas. |
| `.customEditorSection` | Generic column layout for each textarea + helper text block. |

### Saved configuration sidebar

| Selector | Description |
| --- | --- |
| `.savedConfigPanel` | Fixed-width card with subtle gradient/background used for the local save slots. |
| `.savedConfigList` | Column layout spacing each config slot. |
| `.savedConfigPanelStatus` | Muted status text area that can announce save/load feedback. |
| `.savedConfigSlot` | Individual slot wrapper with border, padding, and shadow. |
| `.savedConfigSlotHeader` | Flex header aligning the slot title and name input. |
| `.savedConfigSlotHeader .slotTitle` | Bolds the slot label (“Slot 1”, etc.). |
| `.savedConfigName` | Styles the optional label input. |
| `.savedConfigSlotButtons` | Wraps the trio of buttons for Save/Load/Clear and keeps spacing consistent. |
| `.savedConfigSlotButtons .btn` | Forces each button to share space evenly and stay centered. |
| `.savedConfigMeta` | Small text row that shows when a slot was last updated. |

### User link list

| Selector | Description |
| --- | --- |
| `#links` | Grid container for the public-facing link cards. |
| `#links a.card` | Overrides `.card` for links: adds border, padding, hover/active/focus effects, and ensures long text wraps. |
| `#links a.card strong` | Styles the link title inside each card. |
| `#links a.card div` | Styles the optional description. |

### Avatar crop modal

| Selector | Description |
| --- | --- |
| `#cropModalOverlay` | Full-screen blurred overlay shown while cropping. |
| `.cropModal` | Centered modal card with padding, rounded corners, and the pop-in animation. |
| `.cropStageWrapper` | Positions the crop hint relative to the canvas. |
| `#cropCanvas` | Responsive canvas with rounded corners and grab cursor; `:active` switches to “grabbing.” |
| `.cropHint` | Pill-shaped overlay text reminding users how to zoom/drag. |
| `.cropSliderLabel` & `input[type="range"]` inside it | Provides label spacing and ensures the zoom slider spans the modal width. |
| `@keyframes popIn` | Simple scale/opacity animation used when the modal appears. |

### Badge system

| Selector | Description |
| --- | --- |
| `.badge-container` | Inline flex wrapper that keeps badge chips aligned and spaced next to usernames. |
| `.badge` | Base capsule style for badges, disabling pointer events to avoid spoofing. |
| `.badge.owner`, `.badge.contributor`, `.badge.supporter` | Three gradient colorways for owner, contributor, and supporter roles respectively. |

### Footer

| Selector | Description |
| --- | --- |
| `.siteFooter` | Centers the persistent footer text, shrinks the font, and adds a top border and generous spacing. |
| `.siteFooter a` | Makes footer links bold with an underline for accessibility. |

### Responsive tweaks

Two media queries tune spacing at smaller viewports:

- `@media (max-width: 480px)`: increases `.btn` padding for easier tapping, tightens link-card padding, and shrinks badges plus their gaps.
- `@media (max-width: 860px)`: stacks `.customEditorLayout` vertically, expands `.savedConfigPanel` to full width, and allows `.savedConfigSlotButtons .btn` to wrap to two rows.

By keeping structural HTML and visual CSS hooks separate, you can safely compose new sections inside your custom HTML textarea and then target them with either the stock classes above or your own custom CSS (subject to the 5 KB limit).
