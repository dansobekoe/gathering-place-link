// API client + auth token storage
const API = (() => {
  const TOKEN_KEY = "gp_token";
  const USER_KEY = "gp_user";

  /* Where the portal answers from.

     Served by the portal itself, that is this same origin and there is nothing to look
     up. But the app is also published to a page on GitHub, so that the address people
     put on their home screen is one that never dies — and from there the portal is
     somewhere else entirely, on a laptop in Accra behind a tunnel whose name changes
     every time it starts. That page keeps today's name in latest.js, one folder up.

     So the address is read rather than assumed, and read again whenever the last answer
     was "nothing". A good answer is kept for the life of the page: the tunnel does not
     move while someone is using it. */
  const TUNNEL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;
  const PUBLISHED = /\.github\.io$/.test(location.hostname);
  const NO_ADDRESS = "The portal is closed. The computer that runs it is switched off, "
    + "or it has not published its address yet. Ask your leader when it next opens, "
    + "then tap Try again.";
  const NO_ANSWER = "The portal did not answer. It may have just been restarted and be "
    + "settling — wait a minute, then tap Try again.";

  /* The address a published copy worked out last time. Asking for it costs a file
     read and a health question before the app can even draw its first screen; keeping
     it for the life of the tab means a reload goes straight to the door. A name that
     no longer answers is forgotten in `ready`, which asks the page again. */
  const BASE_KEY = "gp_portal_base";
  function savedBase() {
    try { return PUBLISHED ? localStorage.getItem(BASE_KEY) : ""; } catch { return ""; }
  }
  let base = savedBase() || (PUBLISHED ? null : "");
  let looking = null;

  function readAddressFile() {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      let settled = false;
      const done = (found) => {
        if (settled) return;
        settled = true;
        s.remove();
        resolve(found);
      };
      // latest.js assigns window.GATHERING_PLACE and is a script, not JSON, so it is
      // read by loading it. The query string is new every time: the published page is
      // held by GitHub's own cache for ten minutes, which is long enough to miss a
      // restart, and a fresh address is a fresh request.
      s.src = "../latest.js?at=" + Date.now();
      s.onload = () => {
        const got = window.GATHERING_PLACE;
        const url = typeof (got && got.url) === "string" ? got.url.trim() : "";
        // The trailing slash comes off before the shape is judged, not after: an address
        // written as "...trycloudflare.com/" is today's tunnel, and comparing it to the
        // rule as it stands would throw away a portal that is wide open.
        const clean = url.replace(/\/+$/, "");
        done(TUNNEL.test(clean) ? clean : null);
      };
      s.onerror = () => done(null);
      // A page that never answers is the same as one that says nothing, and without
      // this the app would sit on its splash screen for as long as the browser liked.
      window.setTimeout(() => done(null), 8000);
      document.head.appendChild(s);
    });
  }

  function portalBase() {
    if (base !== null) return Promise.resolve(base);
    if (!looking) {
      looking = readAddressFile().then((found) => {
        looking = null;
        if (found) {
          base = found;
          try { localStorage.setItem(BASE_KEY, found); } catch { /* a full tab is not a failure */ }
        }
        return found;
      });
    }
    return looking;
  }

  function down(message) {
    const err = new Error(message);
    err.status = 0;
    err.portalDown = true;
    return err;
  }

  /* When an answer carries no words of its own — a proxy's error page, a blank 502 — the
     portal still says what happened and what to do next. The status is read as a
     situation, never printed as a number; the server's own sentence always wins when
     there is one. */
  function failure(status) {
    if (status === 401)
      return "Your sign-in has expired. Sign in again, then try once more.";
    if (status === 403)
      return "The portal did not allow that. If it should be allowed, ask the person who runs the portal.";
    if (status === 404)
      return "That is no longer in the portal. Refresh the page and check the list.";
    if (status === 409)
      return "Something changed while you were working on it. Refresh the page, check it, then try again.";
    if (status === 413)
      return "That file is bigger than the portal accepts. Choose a smaller copy.";
    if (status === 422)
      return "Some of those details need checking. Correct the marked fields and try again.";
    if (status === 429)
      return "Too many tries in a short time. Wait a minute, then try again.";
    if (status >= 500)
      return "The portal could not finish that. Wait a moment and try again; if it keeps "
        + "happening, tell the person who runs the portal.";
    return "The portal could not finish that. Refresh the page and try again.";
  }

  /* Whether the portal can be reached at all, for the one screen that has to ask before
     the app is worth showing. On the portal's own address the answer is yes by
     definition — the page being read came from it. */
  async function ready() {
    if (!PUBLISHED) {
      const found = await portalBase();
      return found === null ? { open: false, base: "", why: NO_ADDRESS }
                            : { open: true, base: found, why: "" };
    }
    /* Published: the address may already be known from earlier in this tab, and a
       remembered name costs one small question instead of a file read as well. */
    let found = await portalBase();
    if (found && await answers(found)) return { open: true, base: found, why: "" };
    if (found) {
      // That name is yesterday's tunnel. Forget it and ask the page where today's is.
      base = null;
      try { localStorage.removeItem(BASE_KEY); } catch { /* nothing to forget */ }
      found = await portalBase();
    }
    if (found && await answers(found)) return { open: true, base: found, why: "" };
    return { open: false, base: found || "", why: found ? NO_ANSWER : NO_ADDRESS };
  }

  async function answers(root) {
    try { return (await fetch(root + "/api/health", { cache: "no-store" })).ok; }
    catch (networkError) { return false; }
  }

  /* ---- what a click costs ----

     Through the public address every question to the portal takes about half a second,
     whatever it asks, because the answer travels out to Cloudflare and back to this
     laptop. The laptop itself answers in single-digit milliseconds. So the cost of a
     screen is the number of trips, and the cure is to stop paying for an answer this tab
     already has.

     A read is kept here for ten minutes and served the instant a screen asks for it; the
     same question is put to the portal behind the screen and the newer answer replaces
     the kept one, so the next visit carries the correction. Any successful write throws
     the whole store away — the screen after a change must not be the screen from before
     it. A handful of answers are never kept at all, because being a minute out of date
     would make them wrong rather than merely old: a rotating code, a sitting's marks, the
     unread count, the badge, messages, and the admin's shelves. */
  const READ_FOR = 10 * 60 * 1000;
  const READ_KEEP = 40;
  const reads = new Map();
  const refreshing = new Set();
  const NEVER_KEEP = [
    /^\/api\/auth\//,
    /^\/api\/attendance\/sessions\/\d+\/live/,
    /^\/api\/attendance\/my-badge/,
    /^\/api\/stakes\/\d+\/sessions\/\d+\/attendance/,
    /* The join link is built from today's tunnel address. A page left open across a
       restart would otherwise draw yesterday's code from a kept answer. */
    /^\/api\/stakes\/\d+\/join-link/,
    /^\/api\/messages/,
    /^\/api\/notifications/,
    /^\/api\/admin\//,
    /^\/api\/health/,
  ];
  /* The doors where a 401 is somebody's typo, not an ended session. */
  const AUTH_DOORS = /^\/api\/auth\/(login|signup|forgot-password|reset-password|verify-email|resend-code)/;
  function keepsRead(path) {
    if (!getToken()) return false;
    const asking = path.split("?")[0];
    return !NEVER_KEEP.some(rule => rule.test(asking));
  }
  function remember(path, data) {
    if (!keepsRead(path)) return;
    // Re-inserting moves the entry to the young end, so the cap drops the coldest read.
    reads.delete(path);
    reads.set(path, { data, at: Date.now() });
    while (reads.size > READ_KEEP) reads.delete(reads.keys().next().value);
  }
  function revalidate(path, opts) {
    if (refreshing.has(path)) return;
    refreshing.add(path);
    send("GET", path, undefined, opts)
      .then(data => remember(path, data))
      .catch(err => { if (err && err.status === 401) authLost(); })
      .finally(() => refreshing.delete(path));
  }

  /* Work in progress, for the thin line across the top of the screen. Counted rather than
     flagged, because two screens can be loading at once and the line must stay up until
     the last of them is done. */
  let working = 0;
  function busy(delta) {
    working = Math.max(0, working + delta);
    document.dispatchEvent(new CustomEvent("gp:busy", { detail: working }));
  }

  /* Whether the portal is answering at all, said once per outage rather than once per
     request, and said again when it comes back. */
  let linkDown = false;
  function linkState(up, at) {
    if (up === !linkDown) return;
    linkDown = !up;
    document.dispatchEvent(new CustomEvent("gp:link", { detail: { up, at } }));
  }
  function authLost() {
    if (!getToken()) return;
    document.dispatchEvent(new CustomEvent("gp:auth-lost"));
  }

  /* A picture the portal keeps is named by a path from its own root (/media/...), which
     is the right address on the portal and a missing file anywhere else. Putting the
     portal's address in front makes the one stored path work from both. Anything else —
     an outside link, a data URL, one of this app's own files — is left exactly as it is. */
  function abs(path) {
    if (typeof path !== "string" || !path.startsWith("/")) return path;
    return (base || "") + path;
  }

  /* Two lifetimes, and the person signing in picks which one applies. A remembered
     device keeps the session in localStorage, which outlives the browser. An
     unremembered one keeps it in sessionStorage, which the browser throws away when
     the last tab closes — so a portal left open on a shared computer cannot be read
     by the next person who sits down. Whichever holds the token holds the profile. */
  function place(remember) { return remember ? localStorage : sessionStorage; }
  function current() { return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage; }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }
  function getUser() {
    try { return JSON.parse(current().getItem(USER_KEY) || "null"); }
    catch { return null; }
  }
  function setSession(token, user, remember) {
    clear();
    const store = place(remember);
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  }
  function setUser(user) { current().setItem(USER_KEY, JSON.stringify(user)); }

  /* The profile is filed beside the token. Sometimes the token is there and the profile
     is not — a store that was half cleared, a session the browser restored, an older copy
     of the app that filed the token under a different name. A screen asked to draw a
     person it has never been told about greets "there", and a screen asked for that
     person's id stops with a blank page. So the portal is asked once and the answer is
     filed: one request on the rare occasion, none on every other. */
  let askingUser = null;
  function ensureUser() {
    const cached = getUser();
    if (cached && cached.id) return Promise.resolve(cached);
    if (!getToken()) return Promise.resolve(null);
    if (!askingUser) {
      askingUser = request("GET", "/api/auth/me")
        .then(u => { if (u && u.id) setUser(u); return u; })
        .catch(() => null)
        .finally(() => { askingUser = null; });
    }
    return askingUser;
  }
  /* The storage the session itself is in: a remembered device keeps the token on disk,
     an unremembered one keeps everything in the tab. Anything worked out from the
     session — the stakes, the unread count — belongs in the same place, so it lasts
     exactly as long as the sign-in it describes. */
  function sessionStore() {
    try { return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage; }
    catch { return sessionStorage; }
  }
  function clear() {
    [localStorage, sessionStorage].forEach(store => {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    });
    /* Kept answers are the signed-in person's answers. Once the session is gone they
       must go with it — a shared phone in a ward is not closed between people. */
    reads.clear();
  }

  /* Two taps on one button issue the same write twice: the row, the letter, the move.
     The second caller joins the answer already on its way instead of starting another.
     Only writes are shared, and only ordinary answers — a raw response can be read once,
     so a download or a printed sample must keep its own body. The key is cleared as soon
     as the answer lands, which is what lets an intentional repeat go through once the
     first attempt is over. */
  const inFlight = new Map();
  function request(method, path, body, opts = {}) {
    if (method === "GET" || opts.raw) return read(method, path, body, opts);
    let key;
    try {
      key = method + " " + path + " " + (body instanceof FormData ? "[form]"
        : body === undefined ? "" : JSON.stringify(body));
    } catch { return send(method, path, body, opts); }
    const already = inFlight.get(key);
    if (already) return already;
    const shared = send(method, path, body, opts).finally(() => {
      if (inFlight.get(key) === shared) inFlight.delete(key);
    });
    inFlight.set(key, shared);
    return shared;
  }

  /* A read is answered from the kept copy the moment it is asked for; the portal is asked
     behind it so the next visit is current. A copy older than ten minutes is not trusted
     blind — the call goes out first, and the kept copy is only used if nothing answers. */
  function read(method, path, body, opts) {
    const ask = () => send(method, path, body, opts)
      .then(data => { remember(path, data); return data; });
    if (method !== "GET" || opts.raw || opts.fresh) return ask();
    const kept = reads.get(path);
    if (!kept) return ask();
    if (Date.now() - kept.at < READ_FOR) {
      revalidate(path, opts);
      return Promise.resolve(kept.data);
    }
    return ask().catch(err => {
      if (err && err.status === 0) {
        linkState(false, kept.at);
        return kept.data;
      }
      throw err;
    });
  }

  /* Every question to the portal is counted while it is out, and the port of entry is
     one function so that the count cannot drift. `sendNow` is the work; this wrapper is
     what the thin line at the top of the screen is told about. */
  function send(method, path, body, opts = {}) {
    busy(1);
    return sendNow(method, path, body, opts).finally(() => busy(-1));
  }

  async function sendNow(method, path, body, opts = {}) {
    const root = await portalBase();
    if (root === null) throw down(NO_ADDRESS);

    const headers = {};
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const tok = getToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;

    let res;
    try {
      res = await fetch(root + path, {
        method, headers,
        body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
      });
      // An answer of any kind — even a refusal — proves the portal is reachable.
      linkState(true);
    } catch (networkError) {
      // Nothing answered at all: the laptop is asleep, the tunnel has gone, or the
      // connection dropped. A raw TypeError from fetch would read as a fault in the app.
      linkState(false);
      throw down(NO_ANSWER);
    }

    if (opts.raw) return res; // for CSV downloads

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }

    if (!res.ok) {
      /* A token the portal no longer accepts is the end of this session, wherever it
         was discovered. Signing in again is the only way forward, so the shell is told
         once and every screen stops waiting to be the one that noticed. The sign-in
         doors are the exception: there a 401 means "those details are wrong", not
         "your session has ended". */
      if (res.status === 401 && tok && !AUTH_DOORS.test(path)) authLost();
      const msg = (data && (data.detail || data.message)) || failure(res.status);
      const err = new Error(typeof msg === "string" ? msg : readable(msg));
      err.status = res.status;
      throw err;
    }
    /* A change landed, so every kept answer describes a world that has moved on. One
       clear is cheaper than working out which screens the change touched, and the next
       visit then pays for exactly one fresh answer instead of carrying a stale one. */
    if (method !== "GET") reads.clear();
    return data;
  }

  /* A validation failure arrives as a list of field complaints. Naming the fields and
     the reason reads as advice; printing the array reads as a stack trace. */
  function readable(list) {
    if (!Array.isArray(list)) return JSON.stringify(list);
    const parts = list.map(e => {
      const field = (e.loc || []).filter(x => x !== "body" && x !== "query")
        .map(x => String(x).replace(/_/g, " ")).join(" › ");
      const why = String(e.msg || "").replace(/^Value error,\s*/i, "");
      return field ? `${field}: ${why}` : why;
    }).filter(Boolean);
    return parts.length ? parts.join(" · ") : "Some of those fields need attention.";
  }

  return {
    getToken, getUser, setSession, setUser, ensureUser, sessionStore, clear, ready, abs,
    get: (p, o) => request("GET", p, undefined, o),
    post: (p, b, o) => request("POST", p, b, o),
    patch: (p, b, o) => request("PATCH", p, b, o),
    del: (p, o) => request("DELETE", p, undefined, o),
    // Binary download helper (CSV / PDF). A failed request throws with the
    // API's error detail instead of saving an empty or bogus file.
    async download(path, filename) {
      const res = await request("GET", path, undefined, { raw: true });
      if (!res.ok) {
        let msg = failure(res.status);
        try {
          const j = await res.json();
          const raw = j.detail || j.message || msg;
          msg = typeof raw === "string" ? raw : readable(raw);
        } catch { /* non-JSON body */ }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const fromHeader = (res.headers.get("Content-Disposition") || "")
        .match(/filename="?([^";]+)/);
      const name = filename
        || (fromHeader && fromHeader[1])
        || path.split("/").pop().replace(/[?#].*$/, "") || "download";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    },
  };
})();
