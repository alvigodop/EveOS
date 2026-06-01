// --- DASHBOARD FACADE ---
// Dashboard runtime is split into:
// - dashboard.shared.js: render entrypoint, state helpers, and visible-link matching
// - dashboard.effects.js: favicon refresh, library surface restore, and indexed link helpers
// - dashboard.render.js: immediate/core render pipeline
// Keep this facade as the stable manifest anchor for legacy load order.
