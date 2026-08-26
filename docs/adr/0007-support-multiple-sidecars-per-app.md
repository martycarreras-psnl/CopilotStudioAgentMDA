# Support multiple independently configured sidecars per app

**Status:** accepted

A model-driven app may host up to ten enabled Agent Sidecars, including sidecars with overlapping form bindings. We identify each sidecar by its immutable configuration GUID, derive its stable pane ID from that GUID, and treat app ID only as a grouping key; this avoids mutable pane/order schema while requiring a reference-counted shared form dispatcher and pane-local runtime state.
