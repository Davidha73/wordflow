## [2026-11-22 / v0.2.0]

- **Status:**
  - Integrated with **FlowDash** (`/Users/davidharries/Projects/FlowDash`): removed WordFlow's duplicate Start Page, wired `return_to_flowdash` on closing the last tab/document, added `#btn-switch-flowdash` (`square-arrow-down-left-enter`) in `.brand`, and handled `new-document` / `new-template` / `open-file` handoffs.
  - Shared `FlowDash/src/styles/theme.css` via `@import` + `vite.config.js` `fs.allow`.
  - Moved `custom_dictionary.txt` in `spellcheck.rs` to shared `FlowSuite/custom_dictionary.txt` (used by both spellcheck and `harper-core` grammar checker).
  - Auto-mirrored `recentDocuments` and `customTemplates` to `FlowSuite/` in `write_settings_file`.
- **Next Objectives:**
  - Verify full FlowDash ↔ WordFlow ↔ BoardFlow flows, then `/push` when ready.
