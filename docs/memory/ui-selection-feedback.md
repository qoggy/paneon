---
name: ui-selection-feedback
description: Annotations use selected content without a page-level comment entry; saving and submission are separate
type: tech
---

# Shared selection and annotations

Use **批注** in Chinese and **annotation** in English. Annotation capabilities are opt-in and do not impose a page layout. Saving an annotation updates the page-local draft; only explicit submission sends it to the agent. Standard panels allow corrections to be resubmitted while preserving earlier event records.

The separate whole-document/page-level comment entry has been canceled. To express an opinion about a whole document, select its heading text and annotate it through the existing text-annotation flow. Do not treat the absence of a comment-without-selection entry as a missing feature. This UI decision does not remove the SDK's optional text range for page-defined whole-object targets.

**Why:** Authors retain layout control, and people retain control over what is sent to the agent. Annotating heading text already covers document-wide opinions without another comment workflow.
**How to apply:** Keep draft saving separate from submission and preserve submission history when standard panels accept corrections. Use text selection for document-wide opinions; do not restore a separate page-level comment entry.
