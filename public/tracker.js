(function () {
  function send() {
    window.parent.postMessage(
      { type: 'routeChange', path: location.pathname + location.hash },
      '*'
    );
  }
  window.addEventListener('load', send);
  window.addEventListener('popstate', send);
  window.addEventListener('hashchange', send);
})();
