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

  let base = PUBLISHED ? null : "";
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
        if (found) base = found;
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

  /* Whether the portal can be reached at all, for the one screen that has to ask before
     the app is worth showing. On the portal's own address the answer is yes by
     definition — the page being read came from it. */
  async function ready() {
    const found = await portalBase();
    if (found === null) return { open: false, base: "", why: NO_ADDRESS };
    if (!PUBLISHED) return { open: true, base: found, why: "" };
    // An address was published, but the laptop may have gone to sleep since. Asking one
    // small question first is what lets the app say the portal did not answer, instead of
    // showing a sign-in form that fails after someone has typed their password into it.
    try {
      if ((await fetch(found + "/api/health", { cache: "no-store" })).ok) {
        return { open: true, base: found, why: "" };
      }
    } catch (networkError) { /* answered by nothing at all */ }
    return { open: false, base: found, why: NO_ANSWER };
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
  function clear() {
    [localStorage, sessionStorage].forEach(store => {
      store.removeItem(TOKEN_KEY);
      store.removeItem(USER_KEY);
    });
  }

  async function request(method, path, body, opts = {}) {
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
    } catch (networkError) {
      // Nothing answered at all: the laptop is asleep, the tunnel has gone, or the
      // connection dropped. A raw TypeError from fetch would read as a fault in the app.
      throw down(NO_ANSWER);
    }

    if (opts.raw) return res; // for CSV downloads

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }

    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || ("Request failed (" + res.status + ")");
      const err = new Error(typeof msg === "string" ? msg : readable(msg));
      err.status = res.status;
      throw err;
    }
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
    getToken, getUser, setSession, setUser, clear, ready, abs,
    get: (p, o) => request("GET", p, undefined, o),
    post: (p, b, o) => request("POST", p, b, o),
    patch: (p, b, o) => request("PATCH", p, b, o),
    del: (p, o) => request("DELETE", p, undefined, o),
    // Binary download helper (CSV / PDF). A failed request throws with the
    // API's error detail instead of saving an empty or bogus file.
    async download(path, filename) {
      const res = await request("GET", path, undefined, { raw: true });
      if (!res.ok) {
        let msg = "Request failed (" + res.status + ")";
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
