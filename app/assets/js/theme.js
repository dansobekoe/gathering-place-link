/* Which theme to paint with, settled before the stylesheet is applied.
   The choice is this device's alone and never leaves the browser; running here,
   rather than after the scripts load, is what stops a dark-mode phone from
   flashing white on every opening. It is a file rather than an inline <script>
   because the portal answers every request with a Content-Security-Policy that
   allows no inline script at all — the strictest rule that still lets this run. */
(function () {
  var dark = null;
  try { dark = localStorage.getItem("gp_theme"); } catch (e) { /* private mode */ }
  if (dark !== "dark" && dark !== "light") {
    dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", dark);
  window.addEventListener("DOMContentLoaded", function () {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", dark === "dark" ? "#0b1020" : "#085088");
  });
})();
