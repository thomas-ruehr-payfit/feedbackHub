(function () {
  function send() {
    window.parent.postMessage(
      { type: 'routeChange', path: location.pathname + location.hash },
      '*'
    );
  }

  // Intercept History API — used by React Router, Next.js, Vue Router, etc.
  var _push = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);

  history.pushState = function () {
    _push.apply(history, arguments);
    send();
  };

  history.replaceState = function () {
    _replace.apply(history, arguments);
    send();
  };

  window.addEventListener('load', send);
  window.addEventListener('popstate', send);
  window.addEventListener('hashchange', send);
})();
