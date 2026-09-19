# Loading and motion optimization — 20 September 2026

Images use responsive, content-hashed WebP variants. Animated artwork uses a still
preview in the hero and plays when opened in the gallery. Original files and
existing Capture IDs remain available. WOFF2 fonts and hashed media have a
one-year immutable browser cache. Walkthrough images load as the section approaches.

The entrance lasts about two seconds, runs once per tab session, and yields
immediately to scrolling. Scroll geometry is cached until resize, font loading, or
image changes. Image expansion uses transforms and a rounded crop instead of
changing layout dimensions every frame. Gallery image decoding is cached for up
to five entries. Background thumbnails are small, Capture only rebuilds when its
contents change, and the footer animation pauses offscreen.

## Measurements

A controlled Lighthouse 12.8.2 mobile audit used the same shuffled opening on both
versions: landscape, wireform animation, Elsewhere Space (test-only random seed 86).
Both were served locally with Lighthouse's default mobile throttling.

| Metric | Before | After |
| --- | ---: | ---: |
| Performance score | 73 | 95 |
| Largest contentful paint | 23.1 s | 2.9 s |
| First contentful paint | 2.1 s | 1.6 s |
| Initial transfer | 4,445 KiB | 297 KiB |
| Total blocking time | 0 ms | 0 ms |

These are lab measurements, not field data. Actual results vary with the shuffled
artwork, device, network, and cache. Reports are saved under the parent project's
`output/performance/controlled-{before,after}-mobile.json`. A separate randomized
optimized run scored 94, with 332 KiB transferred and 3.0 s largest contentful paint.

## Asset generation

Run `python tools/optimize_assets.py` from the website directory with Pillow,
`fonttools[woff]`, and `gif2webp` installed. The script retains originals,
writes the image manifest, and updates font references in HTML and CSS.

## Verification

Verified desktop and 390px mobile rendering, hero expansion, gallery arrows,
reverse scroll, walkthrough handoff, Capture add/remove, and animated WebP loading.
Both converted animations preserve their frame counts and playback durations.
JavaScript syntax checks and media-reference validation pass. Browser checks
reported no JavaScript errors.
