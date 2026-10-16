/* The bell: what the portal has told you that you have not looked at yet.

   Nothing here writes a notice. Each one is filed at the moment the thing it describes
   happens — by the route that sent the message, moved the class, opened the seat or marked
   the record (backend/app/notify.py) — and the reminders for a class that is simply coming
   up are worked out from the calendar when the bell is asked, because this portal has no
   background job to wake.

   Three decisions worth stating, since they are the ones a later reader is tempted to undo:

   * **The bell is asked, it is not told.** The portal runs on a laptop in Accra behind a
     tunnel whose address changes when it restarts, and a push channel needs an address that
     never moves. So the count is read while the app is open, and the panel says as much
     rather than promising an alert a switched-off phone will never receive. What it reads is
     a feed of notices each carrying its own `link`, which is exactly what a real push
     channel would deliver — so adding one later changes how a notice arrives, not what a
     notice is.
   * **Marking a notice seen is the only thing there is to do to it.** There is no delete on
     the screen because there is none on the server: a reminder is rebuilt from the calendar,
     so a waved-away one would come back as though nothing had been decided.
   * **Alerts are asked for, never assumed.** The switch belongs to the device and is kept on
     the device, beside the theme, because a phone lighting up in a meeting is not the
     portal's decision to make. */
const Notify = (() => {
  const FEED = "/api/notifications";
  const ALERT_KEY = "gp_alerts";
  // A page change must not cost another request, and a phone in a pocket must not cost one
  // every minute. Together these decide how often the bell asks — and one request per person
  // per minute is what a laptop in Accra can answer for a whole gathering place.
  const FRESH_MS = 20000;
  const POLL_MS = 60000;
  /* Which mark sits beside which kind of news. The server's words for these are the names in
     backend/app/notify.py, and they are what a notice carries. */
  const ICON_FOR = { message: "mail", class: "calendar", reminder: "clock",
                     seat: "book", result: "award", account: "check" };

  const { el, icon, ago, announce, toast } = UI;

  let feed = { items: [], unread: 0 };
  let fetchedAt = 0;        // when the feed above was the portal's answer
  let pending = null;       // the request in flight, so parallel mounts share one
  let timer = null;
  let listening = false;    // the page's own listeners, bound once, for as long as it lives
  let known = null;         // the ids this device has already had on screen
  /* Whose news the module is currently holding. It moves when a person signs out, and an
     answer that reaches the page after it has moved is thrown away: a request that takes two
     seconds out of a slow tunnel would otherwise paint the last person's unread count on the
     next person's bell, and a bell is only worth having while its number is true. */
  let epoch = 0;
  let panel = null;         // { node, button, all, detach } while the panel is open
  let shown = "";           // what the open panel already lists
  let alertNote = null;     // the line under the switch, which changes with its state

  // ---- the button on the bar ----
  /* Built fresh by every shell, like the theme button: the bar is thrown away each time the
     page changes, so the count is kept here and whatever bells are on screen are painted
     from it. The button is handed over inside its own wrapper because the panel is hung from
     it — a drop that belongs under the mark that opened it, not under the bar's corner. */
  function button() {
    const btn = el("button", { class: "icon-btn bell-btn", type: "button",
      "aria-haspopup": "true", "aria-expanded": "false",
      onclick: ev => {
        // the bell's own click must not reach the listener that closes its panel
        ev.stopPropagation();
        if (panel) close(true); else open(btn);
      } },
      [icon("bell", 19), el("span", { class: "bell-dot", "aria-hidden": "true" })]);
    paint(btn);
    return el("div", { class: "bell-wrap" }, [btn]);
  }
  function paint(btn) {
    const n = feed.unread;
    const dot = btn.querySelector(".bell-dot");
    btn.classList.toggle("has-news", n > 0);
    if (dot) dot.textContent = n > 99 ? "99+" : (n ? String(n) : "");
    btn.setAttribute("aria-label", n ? `Notices, ${n} unread` : "Notices");
    btn.setAttribute("title", n ? `${n} unread ${n === 1 ? "notice" : "notices"}` : "Notices");
    btn.setAttribute("aria-expanded", panel ? "true" : "false");
  }
  function sync() {
    document.querySelectorAll(".bell-btn").forEach(paint);
    if (!panel || signature() === shown) return;
    /* A row that has just been answered stops existing, and focus does not move on its own
       when the element holding it is taken away — it lands back on the page body, where a
       keyboard person has to find their place again. So it is handed to the next notice in
       line, and only when it was the panel that held it: a poll must never pull focus out of
       a form somebody in the middle of filling in. */
    const held = panel.node.contains(document.activeElement);
    drawList();
    if (held) {
      const next = panel.node.querySelector(".bell-open");
      (next || panel.node).focus();
    }
  }
  function signature() { return feed.items.map(i => i.id).join(","); }

  // ---- the panel ----
  /* It follows the account menu's convention exactly: one panel for the whole portal, it
     binds its own dismissers as it opens and unbinds them as it closes, and Escape, a tap
     outside, or turning to another page all put it away. */
  function open(btn) {
    const all = el("button", { class: "bell-all", type: "button", onclick: readAll },
                  "Mark all seen");
    const node = el("div", { class: "bell-panel", role: "region", "aria-label": "Notices",
                             tabindex: "-1" }, [
      el("div", { class: "bell-head" }, [el("div", { class: "mhead" }, "Notices"), all]),
      el("div", { class: "bell-list", role: "list" }),
      footer(),
    ]);
    /* A tap outside the panel puts it away; a tap inside it does not, even when that tap
       landed on something that is not one of the panel's own buttons. The alerts switch is
       the case that matters: ticking it is a person deciding how their phone behaves, and a
       panel that vanished under that tick would take its own answer — "Alerts go out while
       the app is open" — away before they could read it, and would drop the keyboard out of
       the box they just pressed. */
    const onOutside = ev => { if (!panel || panel.node.contains(ev.target)) return; close(false); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(true); } };
    const onPage = () => close(false);
    document.addEventListener("click", onOutside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onPage);
    // hung from the bell's own wrapper, so it lands under the mark that opened it on a wide
    // screen and spreads to the bar's full width on a phone (see .bell-panel)
    (btn.parentElement || document.body).appendChild(node);
    panel = { node, button: btn, all, detach: () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onPage);
    } };
    drawList();
    const first = node.querySelector(".bell-open");
    (first || node).focus();
    sync();
  }
  function close(restore) {
    if (!panel) return;
    const m = panel;
    panel = null;
    alertNote = null;
    m.detach();
    m.node.remove();
    if (!m.button || !document.contains(m.button)) return;
    m.button.setAttribute("aria-expanded", "false");
    // an unused panel gives its focus back; one whose notice was followed has already
    // moved the screen, and the bell may not even be on it any more
    if (restore) m.button.focus();
  }
  function drawList() {
    if (!panel) return;
    const list = panel.node.querySelector(".bell-list");
    list.innerHTML = "";
    // an offer with nothing behind it is a button that does nothing when it is pressed
    panel.all.hidden = !feed.items.length;
    // ... and a button taken out from under somebody's keyboard must hand that focus on,
    // or the next Tab starts over at the top of the page without saying so.
    if (panel.all.hidden && document.activeElement === panel.all) panel.node.focus();
    if (!feed.items.length) {
      list.appendChild(el("div", { class: "bell-none" }, pending
        ? "Asking the portal what is new…"
        : "Nothing to catch up on. A new message, a moved class, a seat opened or a mark on "
          + "your record will appear here."));
      shown = signature();
      return;
    }
    feed.items.forEach(n => list.appendChild(row(n)));
    // the server sends the fifty newest and the honest total; if the two disagree, say so
    // rather than letting the number on the bell look like a mistake.
    const older = feed.unread - feed.items.length;
    if (older > 0) list.appendChild(el("div", { class: "bell-older" },
      `${older} older ${older === 1 ? "notice is" : "notices are"} not listed here — `
      + "“Mark all seen” covers them too."));
    shown = signature();
  }
  function row(n) {
    return el("div", { class: "bell-row", role: "listitem" }, [
      el("button", { class: "bell-open", type: "button", onclick: () => follow(n) }, [
        el("span", { class: "bell-ic " + (n.kind || "") },
              [icon(ICON_FOR[n.kind] || "alert", 16)]),
        el("span", { class: "bell-words" }, [
          el("span", { class: "bell-title" }, n.title || "A notice"),
          n.body ? el("span", { class: "bell-body" }, n.body) : null,
          el("span", { class: "bell-when" }, ago(n.created_at)),
        ]),
      ]),
      el("button", { class: "bell-seen", type: "button", title: "Mark seen",
        "aria-label": `Mark seen: ${n.title || "this notice"}`,
        /* Held back from the document, because a person clearing the list one row at a time
           is not asking for the panel to shut after every one of those taps. */
        onclick: ev => { ev.stopPropagation(); read(n); } }, [icon("x", 14)]),
    ]);
  }

  /* Reading a notice is following it: one tap marks it seen and opens the screen it speaks
     of, because a person who has just opened their news should not have to act twice.
     The link is the portal's own — every notice is filed with the route that describes the
     thing that changed — but a class, a record or a message lives inside a gathering place,
     so the place in view is moved to the one the notice belongs to first. */
  function follow(n) {
    read(n);
    close(false);
    if (!n.link) return;
    if (n.stake_id) {
      const here = (typeof App !== "undefined" ? App.ctx() : null) || {};
      if (!here.stake || here.stake.id !== n.stake_id) Ctx.setStake(n.stake_id);
    }
    if (location.hash === n.link) App.route();
    else location.hash = n.link;
  }

  // ---- saying the portal has heard ----
  async function drop(ids) {
    /* The number falls as soon as the person says they have seen it, not when the answer
       comes back. If nothing comes back, the next poll restores the truth: a notice the
       portal never heard about reappears, which is better than a bell that lies. */
    const mine = epoch;
    feed = { items: feed.items.filter(i => !ids.includes(i.id)),
             unread: Math.max(0, feed.unread - ids.length) };
    if (known) ids.forEach(id => known.delete(id));
    sync();
    try {
      for (const id of ids) {
        const r = await API.post(`${FEED}/${id}/read`);
        // cleared one row then signed out: the remaining answers are not this person's count
        if (mine !== epoch) return;
        feed.unread = r.unread;
      }
    } catch (e) {
      if (mine !== epoch) return;
      toast(e.message || "The portal could not mark that notice seen.");
      fetchedAt = 0;
    }
    sync();
  }
  function read(n) { drop([n.id]); }
  async function readAll() {
    const mine = epoch;
    const count = feed.items.length;
    if (!count) return;
    feed = { items: [], unread: 0 };
    if (known) known = new Set();
    sync();
    try {
      await API.post(FEED + "/read-all");
      if (mine !== epoch) return;
      announce(`All ${count} ${count === 1 ? "notice" : "notices"} marked seen.`);
    } catch (e) {
      if (mine !== epoch) return;
      toast(e.message || "The portal could not mark the notices seen.");
      poll(true);
    }
  }

  // ---- the alerts switch ----
  /* Kept on the device, with the theme and the stake in view. Nothing about it is sent
     anywhere, and it does not follow the person to another phone. */
  function alertsOn() {
    try { return localStorage.getItem(ALERT_KEY) === "on"; } catch (e) { return false; }
  }
  function setAlerts(on) {
    try { localStorage.setItem(ALERT_KEY, on ? "on" : "off"); } catch (e) { /* private mode */ }
  }
  function footer() {
    const box = el("input", { type: "checkbox", class: "bell-check" });
    box.checked = alertsOn();
    alertNote = el("div", { class: "bell-note" }, alertWording());
    box.addEventListener("change", () => switchAlerts(box));
    const node = el("div", { class: "bell-foot" }, [
      el("label", { class: "bell-alerts" }, [box, el("span", {}, "Alert me on this phone")]),
      alertNote,
    ]);
    return node;
  }
  function alertWording() {
    if (!window.isSecureContext)
      return "This address is not secure, so the phone will not allow alerts. Open the "
           + "portal through its https address, or from the icon on your home screen.";
    if (alertsOn())
      return "Alerts go out while the app is open on this phone. The portal cannot wake a "
           + "phone that is switched off — the bell will be waiting with whatever came in.";
    return "Off: new notices still count on the bell, and nothing lights up this phone.";
  }
  function noteAlertWording() {
    if (alertNote) alertNote.textContent = alertWording();
  }
  async function switchAlerts(box) {
    if (!box.checked) { setAlerts(false); noteAlertWording(); return; }
    if (typeof Notification === "undefined") {
      box.checked = false;
      setAlerts(false);
      if (alertNote) alertNote.textContent = "This browser cannot show alerts. The bell "
        + "still counts whatever is new.";
      return;
    }
    let p = Notification.permission;
    if (p !== "granted") p = await Notification.requestPermission();
    if (p === "granted") { setAlerts(true); noteAlertWording(); return; }
    box.checked = false;
    setAlerts(false);
    // The phone, not the portal, is the one that refused — so say who to go and see.
    if (alertNote) alertNote.textContent = p === "denied"
      ? "This phone has alerts blocked for the portal. Turn them on in the browser's site "
        + "settings, then switch this back on."
      : "The phone did not allow alerts, so the bell will keep counting here.";
  }

  /* Raised through the service worker rather than `new Notification`: an alert made by the
     page cannot answer a tap, and an alert that cannot be tapped is a message with no way
     to the place it speaks about. The worker hands the link back (see `taps` below) and the
     page moves itself there. */
  function raise(news) {
    if (!news.length || !alertsOn() || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") { setAlerts(false); return; }
    const first = news[0];
    const many = news.length > 1;
    const title = many ? `${news.length} new notices` : (first.title || "A new notice");
    const body = many ? news.slice(0, 3).map(n => n.title).join(" · ") : (first.body || "");
    const opts = {
      body, tag: "gathering-place-" + first.id,
      data: { link: first.link || "" },
      icon: asset("assets/img/icons/icon-192.png"),
      badge: asset("assets/img/icons/icon-192.png"),
    };
    (async () => {
      const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);      // no worker yet: still an alert, just not a tappable one
    })().catch(() => { /* a phone that refuses an alert has not broken the portal */ });
  }
  function asset(rel) { return new URL(rel, document.baseURI).href; }

  /* A tapped alert arrives as a message, because the worker is not the page's own code and
   * cannot change the screen. Someone signed out on the way is sent to the door with
   * everything else, so the link is only followed while a session is held. */
  function taps() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message", ev => {
      const d = ev.data || {};
      if (d.type !== "gp:open") return;
      const link = String(d.link || "");
      if (!link.startsWith("#/") || !API.getToken()) return;
      if (location.hash === link) App.route(); else location.hash = link;
    });
  }

  // ---- asking the portal ----
  function poll(force) {
    if (!API.getToken()) return Promise.resolve(feed);
    if (pending) return pending;
    if (!force && Date.now() - fetchedAt < FRESH_MS) return Promise.resolve(feed);
    const mine = epoch;
    pending = (async () => {
      try {
        const r = await API.get(FEED);
        /* Everything below belongs to whoever was signed in when the request left. If that
           person has gone, the answer describes a bell nobody is looking at, and it would
           light up their phone with notices the next person never asked about. */
        if (mine !== epoch) return feed;
        const items = (r && r.items) || [];
        const before = known;
        feed = { items, unread: (r && r.unread) || 0 };
        fetchedAt = Date.now();
        known = new Set(items.map(i => i.id));
        /* `before` is nothing at all until the first answer of this session, which is what
           stops the app greeting a person with a stack of alerts for news they are about to
           read the moment they open it. */
        if (before) {
          const news = items.filter(i => !before.has(i.id));
          if (news.length) {
            raise(news);
            announce(`${news.length} new ${news.length === 1 ? "notice" : "notices"}`);
          }
        }
        sync();
        return feed;
      } catch (e) {
        /* A bell that could not be filled is not a fault to announce on every screen: the
           number already showing is the last one the portal gave, and the next poll asks
           again. */
        return feed;
      } finally {
        // a stale answer must not cancel the request the next session has just started
        if (mine === epoch) pending = null;
      }
    })();
    return pending;
  }

  function watch() {
    /* The listeners below are for the life of the page, not of a session: a phone that
       signs out and back in is the same device, and it must not end up asking the portal
       once per sign-in because every cycle added another pair of ears. */
    if (!listening) {
      listening = true;
      /* A phone in a pocket asks for nothing, and the first thing it does when it is in
         front of somebody again is catch up. */
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poll(true);
      });
      taps();
    }
    if (timer) return;
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible") poll(true);
    }, POLL_MS);
  }

  /* Sign out is the one moment the bell is certain it is no longer anybody's news. */
  function stop() {
    close(false);
    if (timer) { window.clearInterval(timer); timer = null; }
    epoch++;
    feed = { items: [], unread: 0 };
    fetchedAt = 0;
    pending = null;
    known = null;
    shown = "";
  }

  return { button, open, close, sync, poll, watch, stop };
})();
