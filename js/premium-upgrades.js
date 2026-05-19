(function () {
  'use strict';

  if (window._CAREERPK_PREMIUM_UPGRADES_LOADED) return;
  window._CAREERPK_PREMIUM_UPGRADES_LOADED = true;

  window.renderSkeleton = function renderSkeleton(selector, count) {
    var el = document.querySelector(selector);
    if (!el) return;
    var total = Number(count) || 6;
    el.innerHTML = Array.from({ length: total }, function () {
      return '<div class="skeleton-card"></div>';
    }).join('');
  };

  function initPremiumUpgrades() {
    document.documentElement.classList.add('premium-ready');
    if (window._CAREERPK_ESC_LISTENER_BOUND) return;
    window._CAREERPK_ESC_LISTENER_BOUND = true;

    document.body.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && typeof window.closeMenu === 'function') {
        window.closeMenu();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPremiumUpgrades, { once: true });
  } else {
    initPremiumUpgrades();
  }
})();
