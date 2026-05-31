/**
 * Career Pakistan — cms-auto-refresh-listener.js
 * ------------------------------------------------------------
 * Dedicated, idempotent CMS auto-refresh coordinator.
 *
 * Responsibilities:
 *  - Centralize section-level refresh callback registration.
 *  - Prevent duplicate listener/callback bindings.
 *  - Support both tab-specific refresh and multi-tab rerender callbacks.
 */
(function () {
  'use strict';

  if (window._CMS_AUTO_REFRESH_MODULE_READY) return;
  window._CMS_AUTO_REFRESH_MODULE_READY = true;

  var sectionRegistry = new Map(); // sectionName -> Set<callback>
  var multiTabCallbacks = new Set();

  function normalizeChangedTabs(changedTabs) {
    return Array.isArray(changedTabs)
      ? changedTabs.filter(function (tab) { return typeof tab === 'string' && tab.trim(); })
      : [];
  }

  function registerAutoRefreshSection(sectionName, callback) {
    if (typeof sectionName !== 'string' || !sectionName.trim()) return;
    if (typeof callback !== 'function') return;

    var key = sectionName.trim();
    if (!sectionRegistry.has(key)) sectionRegistry.set(key, new Set());
    sectionRegistry.get(key).add(callback); // Set ensures idempotent registration
  }

  function registerMultiTabRefresh(callback) {
    if (typeof callback !== 'function') return;
    multiTabCallbacks.add(callback); // Set ensures idempotent registration
  }

  function dispatchRefresh(data, changedTabsRaw) {
    var changedTabs = normalizeChangedTabs(changedTabsRaw);

    // 1) Tab-specific callbacks
    sectionRegistry.forEach(function (callbacks, sectionName) {
      var isAffected = changedTabs.length === 0 || changedTabs.indexOf(sectionName) !== -1;
      if (!isAffected) return;
      callbacks.forEach(function (callback) {
        try {
          callback(data, changedTabs);
        } catch (error) {
          console.error('[CMS Auto Refresh] Section callback error (' + sectionName + '):', error);
        }
      });
    });

    // 2) Multi-tab callbacks (always called)
    multiTabCallbacks.forEach(function (callback) {
      try {
        callback(data, changedTabs);
      } catch (error) {
        console.error('[CMS Auto Refresh] Multi-tab callback error:', error);
      }
    });
  }

  // Prefer official CMS event to avoid duplicate subscriptions to lower-level APIs.
  // Guarded by module singleton flag, so binding remains idempotent.
  document.addEventListener('cmsRefresh', function (event) {
    var detail = event && event.detail ? event.detail : {};
    var data = detail.data || window.CMS_DATA || {};
    dispatchRefresh(data, detail.changed || []);
  });

  // Public API exposure (single source of truth).
  window.registerAutoRefreshSection = registerAutoRefreshSection;
  window.registerMultiTabRefresh = registerMultiTabRefresh;
  window.initializeAutoRefreshListeners = function () {
    // No-op: CMS auto-refresh is handled automatically via the cmsRefresh event.
    // This stub exists so pages can call initializeAutoRefreshListeners() safely.
    return;
  };

  // Optional introspection helpers for debugging/maintenance.
  window._CMS_AUTO_REFRESH_DEBUG = {
    getRegisteredSections: function () { return Array.from(sectionRegistry.keys()); },
    getMultiTabListenerCount: function () { return multiTabCallbacks.size; }
  };
})();
