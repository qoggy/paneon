---
name: ui-default-styling
description: The initial iteration uses shadcn default themes and component styles without a separate Paneon visual system
type: tech
---

# Default UI styling

For the initial iteration, use shadcn's official default theme and component styles. Do not define a separate Paneon visual system or replace upstream defaults with custom global typography, colors, corner radii, control sizes, or spacing rules.

Page, Section, and Stack provide necessary page layout using the same theme variables and spacing utilities. They do not introduce a competing visual style. Panel authors may explicitly customize their own content.

**Why:** Existing community defaults are sufficient for the initial product, and maintaining another visual specification would add unnecessary work.
**How to apply:** Keep the selected upstream source/configuration consistent and recorded. Load theme assets inside the panel iframe as well as the host. Treat the earlier discussion of custom pixel values as suggestions that were not adopted.
