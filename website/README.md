# Elsewhere website

An image-first website for PinGlide’s proposed Elsewhere identity, by Serif. Manrope handles interface text; Instrument Serif is reserved for the wordmark. The dark hero enlarges its central image into a working gallery. Scroll up to reverse; scroll down to carry its controls into a three-part sticky explanation: Browse, Capture, Open. The same level triptych and 22px corners (17px on mobile) continue throughout. Arrow buttons and keys browse, M saves locally, and Enter opens the original artwork. A Chrome extension link remains available below the controls. The cobalt footer uses an oversized wordmark and a slowly turning lime asterisk.

Capture stores image references in this browser; no external service is connected. A saved image’s M control becomes a checkmark that opens Capture. The demonstration opens original artwork sources; the installed extension opens actual Pinterest Pins. No live Pinterest embed or simulated Pinterest account is used. Reduced-motion preferences bypass entrance and control-travel animations.

## Preview

Production: https://elswhere-website.vercel.app

Deploy updates from this directory with `npx vercel deploy --prod`.
The Vercel project is `elswhere-website` in `cosimoradler-icloudcoms-projects`;
`vercel.json` serves `dist` without a build step. Deployments currently use the
local files and are not connected to a GitHub repository.

From this directory:

    python3 -m http.server 4173 --bind 127.0.0.1 --directory dist

Open http://127.0.0.1:4173. No dependency installation or build step is needed.

## Files

- `dist/index.html`: content, semantic structure, gallery, installation dialog.
- `dist/style.css`: responsive identity and motion.
- `dist/app.js`: cinematic entrance, skip, keyboard, pointer, and swipe interactions.
- `dist/gallery-template.js`: extension-based gallery, with website-specific simplified controls.
- `dist/collection.js`: 26 images, shuffled on every page load; source credits are in `brand/IMAGE-CREDITS.md`.
- `dist/assets`: self-hosted fonts, original generated photography, favicon.
- `brand/BRAND.md`: name, voice, palette, typography, imagery, behavior.
- `.openai/hosting.json`: existing Sites identity; reuse it on updates.

The interactive gallery uses original artwork rather than Pinterest content. Its masonry backdrop uses the same collection and does not connect to Pinterest. Enter opens the original artwork; the installed extension opens the actual Pin. Website-only controls replace mymind with local Capture and remove the preview label and progress bar; keyboard hints span the footer. The installation dialog explains that the current Chrome extension still appears as PinGlide.

## Validation

See [PERFORMANCE.md](PERFORMANCE.md) for loading optimizations, measurements, and
the media regeneration command.

Checked desktop and 390px mobile layouts, image loading, horizontal overflow, arrow navigation and boundaries, preview-original opening, skip, Escape behavior, and installation instructions in a real browser. Gallery uses native dialog focus containment and restores focus to its opener. Reduced-motion preferences are supported.

A separate full-width black keyboard reference follows the image walkthrough, with large arrow / Enter / Esc keys and Browse / Open / Return labels underneath.
