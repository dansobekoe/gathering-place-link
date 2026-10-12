/* PWA: registers the service worker and offers the home-screen icon.
   The banner appears only where an icon makes sense — a phone, the app not already
   installed, not waved away in the last two weeks — and says plainly what installing
   does and does not do: it puts the portal one tap away; it does not keep the portal
   alive while the computer that hosts it is off. */
(function () {
  "use strict";

  const DISMISS_KEY = "pwa-install-dismissed-at";
  const DISMISS_DAYS = 14;

  // A service worker only works where the browser trusts the connection: the https
  // tunnel, or this machine's own addresses. Plain http over the room's Wi-Fi does
  // not qualify, and there the portal simply runs as a normal website.
  function secureEnough() {
    return location.protocol === "https:" ||
           location.hostname === "127.0.0.1" ||
           location.hostname === "localhost";
  }
  if (!secureEnough() || !("serviceWorker" in navigator)) return;

  function inStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.navigator.standalone === true;
  }
  function onPhone() {
    return window.matchMedia("(pointer: coarse)").matches;
  }
  function onIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function dismissedRecently() {
    let at = 0;
    try { at = Number(localStorage.getItem(DISMISS_KEY) || "0"); } catch (err) { at = 0; }
    return at > 0 && (Date.now() - at) < DISMISS_DAYS * 86400000;
  }
  function rememberDismissal() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (err) { /* private browsing keeps nothing */ }
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {
      // Offline support is an extra layer, not a gate: the portal works without it.
    });
  });

  let deferred = null;

  function closeBanner() {
    const banner = document.getElementById("pwa-banner");
    if (banner) banner.remove();
  }

  function buildBanner(body, ios) {
    closeBanner();
    const close = UI.el("button", { class: "pwa-close", type: "button", "aria-label": "Close" }, [UI.icon("x", 16)]);
    close.addEventListener("click", function () { rememberDismissal(); closeBanner(); });
    const top = UI.el("div", { class: "pwa-top" }, [
      UI.el("img", { class: "pwa-logo", src: "assets/img/icons/icon-192.png", alt: "" }),
      UI.el("div", { class: "pwa-words" }, [
        UI.el("strong", {}, ["Install Gathering Place"]),
        UI.el("p", {}, [body]),
      ]),
      close,
    ]);
    const actions = UI.el("div", { class: "pwa-actions" }, []);
    if (ios) {
      const got = UI.el("button", { class: "btn", type: "button" }, ["Got it"]);
      got.addEventListener("click", function () { rememberDismissal(); closeBanner(); });
      actions.appendChild(got);
    } else {
      const yes = UI.el("button", { class: "btn", type: "button" }, ["Install"]);
      const no = UI.el("button", { class: "btn secondary", type: "button" }, ["Not now"]);
      yes.addEventListener("click", function () {
        if (!deferred) { closeBanner(); return; }
        deferred.prompt();
        deferred.userChoice.then(function (choice) {
          if (choice && choice.outcome === "dismissed") rememberDismissal();
          deferred = null;
          closeBanner();
        });
      });
      no.addEventListener("click", function () { rememberDismissal(); closeBanner(); });
      actions.appendChild(yes);
      actions.appendChild(no);
    }
    const banner = UI.el("div", { id: "pwa-banner", role: "region", "aria-label": "Install the Gathering Place app" }, [top, actions]);
    document.body.appendChild(banner);
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferred = event;
    if (inStandalone() || dismissedRecently() || !onPhone()) return;
    buildBanner("Puts the portal on your home screen like an app. It still needs the internet — it cannot run while the computer hosting it is off.", false);
  });

  // Safari on iPhone never fires beforeinstallprompt; there the honest offer is the
  // two taps themselves. Held back a few seconds so it does not land on top of the
  // sign-in screen someone is reading.
  if (onIos() && !inStandalone() && !dismissedRecently() && onPhone()) {
    window.setTimeout(function () {
      if (inStandalone() || dismissedRecently()) return;
      buildBanner("On iPhone: tap the Share button at the bottom of Safari, then choose “Add to Home Screen”.", true);
    }, 6000);
  }

  window.addEventListener("appinstalled", function () {
    deferred = null;
    closeBanner();
    try { localStorage.removeItem(DISMISS_KEY); } catch (err) { /* private browsing keeps nothing */ }
    UI.toast("Gathering Place was installed. Find it on your home screen.", "ok");
  });
})();
