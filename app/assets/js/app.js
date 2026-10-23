/* App router + role-based navigation.

   Every route is resolved through the stake context (Ctx) first, so a page always
   knows which stake is in view and what the signed-in person may do there. A portal
   admin sees every active stake without joining any of them.

   The three policy pages are the exception to the sign-in rule: a document you have to
   log in to read is not a policy, and someone asked to accept one at sign-up has to be
   able to open it before they have an account. */
const App = (() => {
  const routes = {
    "": () => DashboardPage.mount(root()),
    home: () => DashboardPage.mount(root()),
    stake: p => StakePage.mount(root(), p[0] ? +p[0] : null),
    courses: () => CoursesPage.mount(root()),
    course: p => AttendancePage.mount(root(), +p[0], +p[1]),
    attendance: p => AttendancePage.mount(root(), +p[0], +p[1]),
    classes: () => ClassesPage.mount(root()),
    checkin: () => CheckinPage.mount(root()),
    messages: p => MessagesPage.mount(root(), p[0]),
    certificates: p => CertificatesPage.mount(root(), p[0] ? +p[0] : null),
    analytics: p => AnalyticsPage.mount(root(), p[0]),
    admin: () => AdminPage.mount(root()),
    profile: () => ProfilePage.mount(root()),
    record: () => RecordPage.mount(root()),
    study: () => StudyPage.mount(root()),
  };
  const DOCS = ["privacy", "terms", "cookies"];

  let shellCtx = { user: {}, stake: null, stakes: [], unread: 0 };
  let gateUp = false;

  function root() { return document.getElementById("app"); }

  function ctx() { return shellCtx; }

  /* The shell can be described from a state already in hand, without waiting for a
     promise: every navigation starts with this, so the page it names is drawn in the
     same beat as the tap. `prepare` is for the case where there is nothing to describe. */
  function adopt(st) {
    shellCtx = { user: st.user, stake: Ctx.stakeOf(st), stakes: st.stakes,
                 joined: st.joined, unread: Ctx.unreadNow().total };
    return shellCtx;
  }

  async function prepare(force) {
    /* The two questions are asked together. Each one costs about half a second on the
       public address, and asking them one after the other made the second start only
       after the first had finished. */
    const [st, unread] = await Promise.all([Ctx.load(force), Ctx.unread(force)]);
    adopt(st);
    /* The bell is asked here rather than by each page: every navigation lands on this
       function, so one call covers the app, and its own throttle means a person who moves
       about quickly still asks the portal once in a while rather than once per screen.
       Not awaited — a notice nobody has read yet must never hold up a page. */
    if (typeof Notify !== "undefined") { Notify.watch(); Notify.poll(); }
    return shellCtx;
  }

  /* One navigation list per role. `group` headings organise the sidebar; the first
     four entries are what the phone dock shows, so they carry the everyday actions. */
  function nav() {
    const s = shellCtx.stake || {};
    const isAdmin = !!shellCtx.user.is_super_admin;
    /* The two tiers the server enforces. `monitor` is what a president holds — he watches
       the place over and may open it and its analytics, but every edit in these pages is
       keyed to `manage`, which he does not have. */
    const monitor = isAdmin || !!s.monitor;
    const tenantWord = s.label || (s.kind === "district" ? "District" : "Stake");
    const items = [{ key: "home", href: "#/", icon: "grid", label: "Dashboard", group: "Overview" }];
    if (s.student) {
      items.push({ key: "checkin", href: "#/checkin", icon: "qr", label: "Check in", group: "Overview" });
    }
    if (s.id || isAdmin) {
      items.push({ key: "classes", href: "#/classes", icon: "list", label: "Classes", group: "Overview" });
    }
    items.push({ key: "messages", href: "#/messages", icon: "mail", label: "Messages", group: "Overview" });
    /* Certificates come straight after Messages, because that is where a leader looks once
       an awards night is being planned: the sheet each place prints on, and where the
       member's name, class and date land on it. It is offered to the people whose certificate
       paperwork it is — a member never places a line — and it stays out of the phone dock so
       the four everyday buttons are the four that were there before. */
    if (monitor && s.id) {
      items.push({ key: "certificates", href: "#/certificates", icon: "award",
                   label: "Certificates", group: "Overview", secondary: true });
    }
    /* Everyone in a gathering place reads the catalogue: a student to search it and enrol,
       an instructor to claim what is open, a leader to see what is on offer. */
    if (s.id || isAdmin) {
      items.push({ key: "courses", href: "#/courses", icon: "book", label: "Courses", group: "Academics" });
    }
    if (s.student) {
      items.push({ key: "record", href: "#/record", icon: "chart", label: "My record", group: "Academics",
                   secondary: true });
    }
    if (monitor && s.id) {
      items.push({ key: "stake", href: "#/stake", icon: "home", label: tenantWord, group: tenantWord });
      items.push({ key: "analytics", href: "#/analytics", icon: "chart", label: "Analytics",
                   group: tenantWord, secondary: true });
    }
    if (isAdmin) {
      items.push({ key: "admin", href: "#/admin", icon: "shield", label: "Portal control",
                   group: "Portal" });
    }
    /* The Library is the same reading for a student and a president, and it belongs to
       nobody's paperwork — so it is offered to every account, with no stake in view. */
    items.push({ key: "study", href: "#/study", icon: "globe", label: "Study", group: "Account" });
    items.push({ key: "profile", href: "#/profile", icon: "user", label: "My profile",
                 group: "Account", secondary: true });
    return items;
  }

  function navFor(user) { return nav(user); }   // legacy call shape

  /* The shell's copy of the profile and the stakes is only as good as the last load, and
     on this path nothing has loaded yet with the new session. Ask first, or every person
     who signs in is sent to the stake page as though they belonged to nowhere. */
  async function afterLogin() {
    Ctx.clear();
    /* A signed-in person has no business looking at the form somebody else left half-written
       on this phone a minute ago — the registration that came back as a token is finished, and
       anything still on disk belongs to the attempt that just succeeded. */
    UI.draftClear();
    try { await prepare(true); } catch (e) { /* a cold shell still shows the login page */ }
    location.hash = homeHash();
    route();
  }

  /* Landing page: admins go to portal control, everyone else to their dashboard. */
  function homeHash() {
    const user = shellCtx.user && shellCtx.user.id ? shellCtx.user : (API.getUser() || {});
    if (user.is_super_admin) return "#/admin";
    if (!(shellCtx.stakes || []).length) return "#/stake";   // join / waiting for approval
    return "#/";
  }
  function homeFor(user) { location.hash = homeHash(user); }

  /* One way out, from the shell, the account menu and the consent gate. */
  function signOut(why) {
    gateUp = false;
    // the account menu is the thing a person was last holding when the session ended
    UI.closeAccountMenu();
    /* The bell goes quiet first: it holds a timer, a panel of the last person's news, and
       the ids already shown to this device. Left running, the next person to open the phone
       would be handed the previous one's notices. */
    if (typeof Notify !== "undefined") Notify.stop();
    /* A half-finished registration, an un sent message and a reset dialog are the last
       person's business and nobody else's. sessionStorage would already go when this tab
       closed, but a shared phone in a ward does not always get closed. */
    UI.draftClear();
    API.clear();
    Ctx.clear();
    document.body.classList.remove("drawer-open");
    shellCtx = { user: {}, stake: null, stakes: [], unread: 0 };
    if (location.hash === "#/login") route(); else location.hash = "#/login";
    if (why) UI.toast(why);
  }
  /* Called when a gate is answered. The flag that raised it is cleared on the copy of
     the profile the shell is holding, or the next navigation would raise it again. */
  function consentSettled() {
    gateUp = false;
    shellCtx.user.consent_required = false;
  }

  /* Every navigation is a new screen, and a screen has a name.
     A single-page app swaps the page under a person without a page load, so nothing tells
     them the screen changed: the tab keeps the old name, the keyboard is left on the link
     that has just been replaced, and the window is still halfway down the last page.
     This settles all three once the new page's heading exists — pages draw their heading
     after their data arrives, so it waits a few frames — and leaves focus alone if the
     page has already put it somewhere of its own. */
  function newScreen(previous) {
    /* `previous` is the screen that was on the page when the route began — captured by
       the router before it mounted the new one, because a page may draw its shell in the
       same tick. Comparing against what is there now would compare the new screen with
       itself and never settle. */
    let tries = 0;
    const settle = () => {
      const main = document.getElementById("main");
      const h = main && main !== previous ? main.querySelector("h1") : null;
      if (!h) {
        if (++tries < 200) setTimeout(settle, 60);
        return;
      }
      const name = (h.textContent || "").replace(/\s+/g, " ").trim();
      document.title = name ? `${name} · Gathering Place` : "Gathering Place";
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    };
    requestAnimationFrame(settle);
  }

  async function route() {
    // Top-level `const` pages live in the global lexical scope, not on window,
    // so they must be probed with typeof. Any page with a background timer has
    // to be told to stop before we swap the view, or it keeps polling.
    if (typeof CheckinPage !== "undefined") CheckinPage.stop();
    if (typeof AttendancePage !== "undefined") AttendancePage.stop();
    if (typeof ClassesPage !== "undefined") ClassesPage.stop();
    if (typeof StudyPage !== "undefined") StudyPage.stop();
    /* The certificate sheet keeps a save timer and a watcher on its own width, and holds any
       placement made in the last moment. Leaving the page must not lose that work or leave it
       running behind whatever comes next. */
    if (typeof CertDesign !== "undefined") CertDesign.stop();

    /* The screen being left, read before anything mounts over it. */
    const previous = document.getElementById("main");
    const hash = location.hash.replace(/^#\/?/, "");
    const [first, ...params] = hash.split("/");
    const name = first || "home";

    if (DOCS.includes(name)) {
      document.body.classList.remove("drawer-open");
      LegalPage.mount(root(), name);
      newScreen(previous);
      return;
    }
    if (!API.getToken()) {
      document.body.classList.remove("drawer-open");
      /* A join link is the one address that gets past the front door — that is the whole
         point of the QR a leader prints. It opens the registration form with the place it
         names already found; every other address still goes to sign-in. */
      if (first === "join") {
        AuthPage.mount(root(), { joinStake: Number(params[0]) || null, signup: true });
        newScreen(previous);
        return;
      }
      if (location.hash !== "#/login") location.hash = "#/login";
      AuthPage.mount(root());
      newScreen(previous);
      return;
    }
    /* A click is painted from what this tab already worked out, and the context is
       asked again behind the screen. Waiting here for that answer was the difference
       between a screen that appears on the tap and one that appears after the tunnel
       had finished talking — and on a first open it could be three questions in a row.
       A session the portal has ended is handled where it is discovered: the auth-lost
       event below signs out whichever screen found it. */
    const known = Ctx.current();
    if (known) {
      adopt(known);
      prepare().catch(() => { /* keep the shell that is already on screen */ });
    } else {
      try {
        await prepare();
      } catch (err) {
        /* The device still holds a token, but the portal no longer recognises it — it aged
           out, or the account behind it has since been removed. Either way this person is
           not signed in, and rendering a page over an empty context would show them a
           dashboard with nothing in it. Say plainly what happened and start again. */
        if (err.status === 401) { signOut("Your session has ended. Please sign in again."); return; }
        UI.toast(err.message || "The portal could not load your details.");
        UI.render(root(), UI.el("div", { class: "auth-wrap" }, [
          UI.el("div", { class: "auth-card down-card" }, [
            UI.el("h1", { class: "down-title" }, ["Nothing loaded"]),
            UI.el("p", { class: "down-why" },
                  [err.message || "The portal could not reach the server."]),
            UI.el("button", { class: "btn", type: "button", onclick: () => route() },
                  ["Try again"]),
          ]),
        ]));
        newScreen(previous);
        return;
      }
    }
    document.body.classList.remove("drawer-open");

    /* An account the portal opened for someone has never been shown the wording. Until
       they accept it the rest of the portal is not theirs to walk through — the dialog
       only goes up once per session, and leaving it means signing out. */
    if (shellCtx.user.consent_required && !gateUp) {
      gateUp = true;
      Legal.consentGate(shellCtx.user);
    }

    if (name === "login") { homeFor(); return; }

    // pages that need a stake in view fall back to the onboarding hub
    if (["home", "courses", "course", "attendance", "classes", "stake", "analytics",
         "messages", "certificates"]
        .includes(name) && !shellCtx.stake && !shellCtx.user.is_super_admin) {
      if (name !== "stake") { location.hash = "#/stake"; return; }
    }
    if (name === "admin" && !shellCtx.user.is_super_admin) { homeFor(); return; }

    const handler = routes[name];
    if (handler) { handler(params); newScreen(previous); }
    else homeFor();
  }

  async function refreshUser() {
    try { API.setUser(await API.get("/api/auth/me")); } catch { /* token invalid */ }
  }

  /* ---- the door ----

     This app is published in two places. Served by the portal, the portal is right here
     and there is nothing to wait for. Published to the fixed page on GitHub — the copy
     people install, whose address never dies — the portal is a laptop in Accra whose own
     address changes every time it starts. Until today's address is known there is
     nothing to show, and when it cannot be found the honest screen is one that says the
     portal is closed: not a sign-in form that fails after someone has typed their
     password into it. */
  let downTimer = null;

  function downScreen(why) {
    // Asked again on a timer as well as on a tap. The laptop may be switched on while
    // somebody is still holding the phone, and the screen should open by itself.
    if (!downTimer) downTimer = window.setInterval(boot, 30000);
    UI.render(root(), UI.el("div", { class: "auth-wrap" }, [
      UI.el("div", { class: "auth-card down-card" }, [
        UI.el("div", { class: "logo" }, [
          UI.el("img", { class: "brand-img", src: UI.logoUrl(), alt: "" }),
        ]),
        UI.el("h1", { class: "down-title" }, ["The portal is closed"]),
        UI.el("p", { class: "down-why" }, [why]),
        UI.el("button", { class: "btn", type: "button", onclick: boot }, ["Try again"]),
        UI.el("p", { class: "down-note" },
              ["This screen asks again by itself every 30 seconds, so it opens on its own "
               + "as soon as the portal does."]),
      ]),
    ]));
  }

  async function boot() {
    const state = await API.ready();
    if (!state.open) { downScreen(state.why); return; }
    if (downTimer) { window.clearInterval(downTimer); downTimer = null; }
    Legal.load().catch(() => { /* the sign-up links retry when they are clicked */ });
    if (API.getToken()) {
      if (Ctx.current()) {
        /* The profile we already hold is good until the portal says otherwise. Asking for
           it in front of the first screen puts half a second of tunnel between the tap on
           the icon and anything on the page — and a body that expires signs out through
           the auth-lost event below. */
        API.get("/api/auth/me").then(u => API.setUser(u)).catch(() => { /* the next call says */ });
      } else {
        await refreshUser();
      }
    }
    route();
  }

  /* ---- the thin line, the end of a session, and a road that has gone ----

     A click on the public address travels out to Cloudflare and back to this laptop, so
     a screen can take half a second to fill. The line appears only if a request is still
     out after a moment, which keeps a local answer — five milliseconds — from flashing
     the screen. It is a horizon, not a spinner: no text for a screen reader to trip over,
     and it never takes a tap. */
  let waiting = 0;
  let railTimer = null;
  function rail(n) {
    waiting = n;
    const bar = document.getElementById("progress");
    if (!bar) return;
    if (n > 0) {
      if (!railTimer && !bar.classList.contains("on")) {
        railTimer = window.setTimeout(() => { bar.classList.add("on"); railTimer = null; }, 140);
      }
      return;
    }
    if (railTimer) { window.clearTimeout(railTimer); railTimer = null; }
    bar.classList.remove("on");
  }
  document.addEventListener("gp:busy", e => rail(e.detail || 0));

  document.addEventListener("gp:auth-lost", () => {
    if (!API.getToken()) return;
    signOut("Your session has ended. Please sign in again.");
  });

  /* The portal answering or not answering is a fact about the whole app, not one screen.
     It is said once when the road goes and once when it comes back, so a tunnel hiccup
     reads as an explanation rather than five identical errors. */
  document.addEventListener("gp:link", e => {
    const detail = e.detail || {};
    if (detail.up) { UI.toast("Back online."); return; }
    const when = detail.at ? new Date(detail.at) : new Date();
    const clock = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    UI.toast(`No connection — showing what was on this phone at ${clock}.`, "err");
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", boot);

  return { navFor, nav, ctx, afterLogin, route, prepare, root, signOut, consentSettled,
           homeHash };
})();

