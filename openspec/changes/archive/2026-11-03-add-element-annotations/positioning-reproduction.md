# Floating tab bar: positioning and overlap reproduction

This report records the original failure before automatic avoidance was implemented. The height-aware follow-up below now addresses the reproduced case; baseline screenshots and measurements are retained for comparison.

## Scope

Reproduce requested items 2 and 3 with current product scrolling, marker geometry and editor positioning. Do not implement their fixes. This is a constructed minimal page, not a claim to have reproduced the original user's particular page.

## Setup and steps

- Source preview: `http://127.0.0.1:4317/positioning.html`.
- Desktop viewport: 1100×800 CSS pixels.
- A full-width, fixed tab bar occupies y=0–72. It uses the existing Tabs components.
- One existing generated-element annotation targets a 1400px-high card. Content above and below permits native centered scrolling without reaching document limits.
- Open the annotation directory and choose Locate annotation 1.
- Open the directory again and choose Edit annotation 1.

The replay script uses ordinary button actions, records actual element rectangles, asserts marker/editor intersection with the tab-bar rectangle, and captures both states.

## Observed results

| Element                     | Measured bounds                     |
| --------------------------- | ----------------------------------- |
| Fixed tab bar               | x=0–1100, y=0–72                    |
| Target block after location | x=166–934, y=−300–1100; height=1400 |
| Annotation marker           | x=924–948, y=0–24                   |
| Annotation editor           | x=732–1092, y=32–130                |

The block's top is 300px above the viewport. Its marker overlaps the tab bar, and the editor's top 40px overlap that bar. Browser errors: none.

## Cause confirmed in the source

1. `AnnotationStore.locate` calls native `scrollIntoView({block:'center',behavior:'smooth'})`, without reserving the floating tab bar's height. Centering a 1400px block in an 800px viewport places its top at −300px.
2. `createRectClipper` clips ordinary element geometry to the viewport/scroll containers, whose top remains zero. Diff has an explicit header-clip hook; this page has no equivalent automatic fixed-bar detection.
3. `markerPosition` clamps this clipped target's marker to y=0.
4. The editor opens below the 24px marker with an 8px offset, placing its top at y=32. Collision handling uses the viewport rather than the tab-free content region.

## Evidence

The task's `block-preview/` visualization directory contains:

- `positioning.html` and `positioning.tsx`: replayable source page using actual product components.
- `reproduce-positioning.mjs`: deterministic replay and rectangle-intersection checks.
- `positioning-evidence.json`: complete viewport, target, tab-bar, marker and editor measurements.
- `positioning-locate.png`: located target and marker.
- `positioning-edit.png`: original annotation editor overlapping the floating tab bar.

The original reproduction-only iteration included no fix. The subsequent authorized height-aware implementation now centers the opening half-screen portion of tall generated-element targets, centers short targets, and automatically reserves common fixed/sticky top bars for markers and the existing editor.

At the same 1100×800 viewport with the same 72px tab bar, the updated preview measured:

| Target           | Target top | Marker top | Editor top |
| ---------------- | ---------- | ---------- | ---------- |
| 1400px tall card | 260        | 242        | 274        |
| 180px short card | 346        | 328        | 360        |

The tall card's title and opening content are now visible. The short card's center is at y=436, centered in the usable region y=84–788. Both marker/editor pairs remain below the tab bar, without page attributes or configuration.

The preview now provides height-switching buttons and the `verify-positioning.mjs` replay. Follow-up evidence is stored as `positioning-after-evidence.json`, `positioning-tall-after.png` and `positioning-short-after.png` in the same visualization directory. Ordinary/hidden headers, narrow floating actions, resized bars, sticky pinning, manual scrolling and restored authored margins are covered by the focused browser regression.
