(function () {
  var host = (window.location && window.location.hostname) || '';
  var isVercelHost = host.endsWith('.vercel.app') || host === 'careerpk.online' || host === 'www.careerpk.online';
  if (!isVercelHost) return;

  var scripts = [
    '/_vercel/speed-insights/script.js',
    '/_vercel/insights/script.js'
  ];

  scripts.forEach(function (src) {
    var s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onerror = function () {
      // Non-blocking analytics script: fail silently on unsupported hosts.
    };
    document.head.appendChild(s);
  });
})();
