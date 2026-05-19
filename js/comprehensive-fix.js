/**
 * ============================================================
 * Career Pakistan — comprehensive-fix.js
 * Legacy compatibility bridge
 * ============================================================
 *
 * This file previously contained duplicate CMS auto-refresh logic.
 * Canonical implementations now live in:
 *  - js/cms-auto-refresh-listener.js
 *  - js/chatbot-loader.js
 */
(function () {
  'use strict';

  if (window._CAREERPK_COMPREHENSIVE_FIX_LOADED) return;
  window._CAREERPK_COMPREHENSIVE_FIX_LOADED = true;

  // Keep file intentionally lightweight to avoid duplicate listeners,
  // repeated rendering callbacks, and conflicting global registrations.
  console.info('[Career Pakistan] comprehensive-fix bridge loaded');
})();
