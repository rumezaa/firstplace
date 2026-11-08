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

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        var id = idOf(tab);
        select(id);
        history.replaceState(null, '', '#' + id);
      });
      tab.addEventListener('keydown', function (e) {
        var next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        select(idOf(tabs[next]), true);
      });
    });

    var first = tabFromHash(location.hash);
    select(first || 'people');
    if (first) root.scrollIntoView();

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
