// Classic script. Nothing touches the DOM until initTabs is called.
(function () {
  var IDS = ['people', 'venues', 'built'];

  function tabFromHash(hash) {
    if (typeof hash !== 'string') return null;
    var id = hash.replace(/^#/, '').toLowerCase();
    return IDS.indexOf(id) > -1 ? id : null;
  }

  function initTabs(root) {
    if (!root) return;
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    function idOf(tab) { return tab.id.replace(/^tab-/, ''); }

    function select(id, focus) {
      tabs.forEach(function (tab) {
        var on = idOf(tab) === id;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
        if (on && focus) tab.focus();
      });
    }

    function go(id) {
      select(id);
      history.replaceState(null, '', '#' + id);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { go(idOf(tab)); });
      tab.addEventListener('keydown', function (e) {
        var next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        go(idOf(tabs[next]));
        tabs[next].focus();
      });
    });

    var first = tabFromHash(location.hash);
    select(first || 'people');
    if (first) root.scrollIntoView();

    // Panels have their own ids (panel-*), so the browser never jumps to the hash itself:
    // in-page links to a tab are handled here and scroll to the whole tab block.
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = tabFromHash(a.getAttribute('href'));
      if (!id) return;
      e.preventDefault();
      go(id);
      root.scrollIntoView();
    });

    window.addEventListener('hashchange', function () {
      var id = tabFromHash(location.hash);
      if (!id) return;
      select(id);
      root.scrollIntoView();
    });
  }

  var api = { tabFromHash: tabFromHash, initTabs: initTabs };
  if (typeof window !== 'undefined') window.ChatterTabs = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
