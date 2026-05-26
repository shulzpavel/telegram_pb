// Pre-paint theme bootstrap: resolves stored theme preference (or system)
// and writes data-theme onto <html> before React renders. This prevents a
// flash when the user's preference is dark.
(function () {
  try {
    var KEY = "pp_theme";
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      // Ignore storage errors in private mode.
    }

    var mode = raw === "light" || raw === "dark" || raw === "system" ? raw : "dark";
    var resolved = mode;

    if (mode === "system") {
      var mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
      resolved = mql && mql.matches ? "dark" : "light";
    }

    var root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
