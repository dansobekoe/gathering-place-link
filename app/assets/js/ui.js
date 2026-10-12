/* UI kit: SVG icons, glass shell, avatar menu, modals, toasts, formatters */
const UI = (() => {
  // ---- icon set (24px stroke icons) ----
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h14"/>',
    check: '<path d="M9 11.5l2.2 2.2L15.5 9"/><rect x="3.5" y="3.5" width="17" height="17" rx="4"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.7-3.1 3-4.7 5.5-4.7s4.8 1.6 5.5 4.7"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.6c1.7.6 2.8 2 3.2 4.4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 19.5 19v-1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/>',
    trash: '<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 8 21l4-2 4 2-1-7.5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    phone: '<path d="M7.4 4.6 9.6 5.2c.7.2 1.1.9 1 1.6l-.4 2.6a1.4 1.4 0 0 0 .5 1.3l1.9 1.9a1.4 1.4 0 0 0 1.3.5l2.6-.4c.7-.1 1.4.3 1.6 1l.6 2.2c.2.8-.4 1.6-1.2 1.7-6.4.5-11.9-5-11.4-11.4.1-.8.9-1.4 1.7-1.2z"/>',
    chat: '<path d="M20 12.4c0 3.8-3.6 6.9-8 6.9-1.1 0-2.2-.2-3.2-.6L4 20l1.4-3.4A6.6 6.6 0 0 1 4 12.4c0-3.8 3.6-6.9 8-6.9s8 3.1 8 6.9z"/><path d="M9 11.6h.01M12 11.6h.01M15 11.6h.01"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2v2h-2zM14 19.5h1.5M19.5 14v1.5"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
    cert: '<path d="M5.5 4.5h10A1.5 1.5 0 0 1 17 6v6"/><path d="M5.5 4.5v14A1.5 1.5 0 0 0 7 20h6"/><path d="M8.5 9h5M8.5 12.5h3"/><circle cx="16.6" cy="16.4" r="3.1"/><path d="m15.1 19.1-.8 2.9 2.3-1.3 2.3 1.3-.8-2.9"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M7 14h10v6H7z"/><path d="M17.5 11.5h.01"/>',
    idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3"/><path d="M14 9.5h4M14 12.5h4M14 15.5h2.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.5" cy="6.5" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="17.5" r="1.2"/>',
    send: '<path d="M20 4 3.5 10.5l6 2.4 2.4 6z"/><path d="M20 4 9.5 13"/>',
    key: '<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H20l-.01 2.6M16.6 12v3.2"/>',
    userplus: '<circle cx="10" cy="8" r="3.4"/><path d="M4 19.5c.7-3.2 3-4.9 6-4.9 1 0 2 .2 2.8.6"/><path d="M17 14v6M14 17h6"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.8 5.8 7.3 7.3M16.7 16.7l1.5 1.5M18.2 5.8 16.7 7.3M7.3 16.7 5.8 18.2"/>',
    moon: '<path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8z"/>',
    globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4c2.4 2.3 3.7 5.2 3.7 8.6S14.4 18.3 12 20.6c-2.4-2.3-3.7-5.2-3.7-8.6S9.6 5.7 12 3.4z"/>',
    file: '<path d="M13.8 3.5H7.4A1.4 1.4 0 0 0 6 4.9v14.2a1.4 1.4 0 0 0 1.4 1.4h9.2a1.4 1.4 0 0 0 1.4-1.4V8.1z"/><path d="M13.8 3.5 18 8.1h-4.2z"/><path d="M9 12.6h6M9 16h4"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 13.6v4.9A1.5 1.5 0 0 1 16.5 20H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h4.9"/>',
    scale: '<path d="M12 4.2v16M7.5 20.2h9"/><path d="M12 6.6 5.6 8.8M12 6.6l6.4 2.2"/><path d="M3 14.2a2.6 2.6 0 0 0 5.2 0L5.6 8.8zM15.8 14.2a2.6 2.6 0 0 0 5.2 0l-2.6-5.4z"/>',
    music: '<path d="M9 18V6.2l10-2.2V16"/><circle cx="6.6" cy="18" r="2.4"/><circle cx="16.6" cy="16" r="2.4"/>',
    eye: '<path d="M2.6 12S6.1 5.8 12 5.8 21.4 12 21.4 12 17.9 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3.1"/>',
    eyeoff: '<path d="M2.6 12S6.1 5.8 12 5.8 21.4 12 21.4 12 17.9 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3.1"/><path d="M4.6 4.2 19.4 19.8"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10.2" r="1.5"/><path d="m5.5 17.5 4-4.2 3 2.9 3.2-3.6 2.8 3.1"/>',
  };
  function icon(name, size = 18, cls = "") {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size); s.setAttribute("height", size);
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.7"); s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    if (cls) s.setAttribute("class", cls);
    s.innerHTML = P[name] || P.alert;
    return s;
  }
  // ---- dom ----
  /* Markup built as a string has to quote its words first.
     `el()` needs no help — a child that is not a node is appended as a text node, so a
     course title containing `<img src=x onerror=…>` arrives as letters on the screen.
     Two helpers still return a string of markup because every page drops it into `html:`
     (statusPill below, and the pills a couple of pages build beside it). Anything the
     portal did not choose itself passes through here before it joins such a string. */
  function esc(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                                   '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style") node.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    // children may be nodes, text, or plain numbers (a count, a day of month);
    // anything that isn't a node becomes text rather than throwing mid-render.
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return node;
  }
  function render(target, node) { target.innerHTML = ""; target.appendChild(node); tagLabels(node); }

  // ---- accessible fields ----
  /* Pages describe a field as a bare <label> beside its control. Wire each pair so
     screen readers announce the field and tapping the caption focuses the input —
     done once here rather than repeating id plumbing at every call site. */
  const FIELD_CTRL = "input:not([type=hidden]), select, textarea";
  let fieldSeq = 0;
  function nearestControl(label) {
    if (label.querySelector(FIELD_CTRL)) return null;        // the label already wraps it
    let node = label.nextElementSibling;
    for (let hops = 0; node && hops < 3; hops++, node = node.nextElementSibling) {
      if (node.matches && node.matches(FIELD_CTRL)) return node;
      const inner = node.querySelector && node.querySelector(FIELD_CTRL);
      if (inner) return inner;
    }
    const before = label.previousElementSibling;             // caption written after a tick box
    if (before && before.matches && before.matches("input[type=checkbox], input[type=radio]")) return before;
    return null;
  }
  function tagLabels(root) {
    if (!root || !root.querySelectorAll) return;
    const bare = [...root.querySelectorAll("label:not([for])")];
    if (root.matches && root.matches("label:not([for])")) bare.unshift(root);
    bare.forEach(lab => {
      const ctrl = nearestControl(lab);
      if (!ctrl) return;
      if (!ctrl.id) ctrl.id = "fld-" + (++fieldSeq);
      lab.setAttribute("for", ctrl.id);
    });
  }
  // pages paint asynchronously, so catch anything appended after the first render
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1) tagLabels(n);
  }))).observe(document.body, { childList: true, subtree: true });

  // ---- toasts ----
  function toast(msg, kind = "ok") {
    const host = document.getElementById("toast-host");
    const t = el("div", { class: "toast " + kind }, [icon(kind === "err" ? "alert" : "check", 17), msg]);
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2800);
    setTimeout(() => t.remove(), 3200);
  }
  /* Words for a screen reader that a sighted person already got from the screen —
     a theme flipping, a panel opening. The live region is in index.html and is
     invisible by design; clearing it first is what makes the same phrase read twice. */
  function announce(msg) {
    const host = document.getElementById("announce");
    if (!host) return;
    host.textContent = "";
    setTimeout(() => { host.textContent = msg; }, 40);
  }

  // ---- day and night ----
  /* One switch, on every screen, for every role. The choice is written to this device
     and nowhere else: a colour preference tells the portal nothing a class record
     needs, so it is not in the profile and not on the server. index.html sets the
     attribute before the first paint, so the portal never flashes white at night. */
  const THEME_KEY = "gp_theme";
  const THEME_TAB = { light: "#085088", dark: "#0b1020" };

  function theme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function setTheme(next) {
    const v = next === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", v);
    try { localStorage.setItem(THEME_KEY, v); } catch (e) { /* private mode: this visit only */ }
    const tab = document.querySelector('meta[name="theme-color"]');
    if (tab) tab.setAttribute("content", THEME_TAB[v]);
    syncThemeButtons();
    // anything that paints its own colours listens for this
    document.dispatchEvent(new CustomEvent("gp:theme", { detail: { theme: v } }));
    return v;
  }
  function toggleTheme() {
    const v = setTheme(theme() === "dark" ? "light" : "dark");
    announce(v === "dark" ? "Night colours on" : "Day colours on");
  }
  function labelThemeButton(btn) {
    const dark = theme() === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to day colours" : "Switch to night colours");
    btn.setAttribute("title", dark ? "Day colours" : "Night colours");
  }
  function syncThemeButtons() {
    document.querySelectorAll(".theme-btn").forEach(labelThemeButton);
  }
  /* Both icons go in; the stylesheet shows the one that fits the current theme. */
  function themeButton(cls) {
    const btn = el("button", { class: "icon-btn theme-btn" + (cls ? " " + cls : ""),
                               type: "button", onclick: toggleTheme },
      [icon("sun", 19, "sun"), icon("moon", 19, "moon")]);
    labelThemeButton(btn);
    return btn;
  }

  // ---- Ghanaian phone numbers ----
  /* One box, taking the number the way a person would write it on a card: the country
     prefix is never shown, asked for, or typed. What is accepted here is deliberately
     loose — leading zero or not, spaced or not — because the server's validator is the
     one that decides, and a field cannot be allowed to promise a shape it refuses. */
  function phoneField(opts = {}) {
    const input = el("input", { type: "tel", class: "phone-input",
                                autocomplete: opts.autocomplete || "tel",
                                placeholder: "024 123 4567", maxlength: "16",
                                id: "ph-" + (++fieldSeq) });
    const note = el("div", { class: "phone-note" },
      opts.note || "A Ghanaian number, with or without the leading 0.");
    const node = el("div", { class: "field" }, [
      el("label", { for: input.id }, opts.label || "Phone"),
      input,
      note,
    ]);

    input.addEventListener("input", () => {
      const t = input.value.replace(/[^\d ]/g, "");
      if (t !== input.value) input.value = t;
    });
    /* Spoken back in the groups a Ghanaian reads it in, as soon as the box loses focus:
       ten digits typed in a hurry become 024 123 4567, which a person can check at a
       glance instead of counting. */
    input.addEventListener("blur", () => show(input.value));

    /* Re-opening a form should show a number, not a wall of digits. The portal files it
       with the country prefix for the gateway's sake, so this is also where a stray
       +233 (or 00233) is dropped before a person ever sees their own number again. */
    function show(value) {
      let d = String(value || "").replace(/\D/g, "");
      if (!d) { input.value = ""; return; }
      if (d.startsWith("00233")) d = d.slice(2);
      if (d.startsWith("233") && d.length > 7) d = d.slice(3);
      if (!d.startsWith("0")) d = "0" + d;
      input.value = d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
    }

    return { node, input,
             get: () => input.value.trim(),
             set: show,
             focus() { input.focus(); } };
  }

  // ---- the ward a person belongs to ----
  /* A ward is a line on its stake's own list, not a note beside a person, so the box that
     asks for one shows those lines instead of a blank to fill in. Two answers come out of
     it: the number of a ward already on the list, or the words of one the list has never
     heard — which is the escape a newcomer needs when nobody has written their branch
     down yet. Whoever runs the place renames or merges what the escape adds, from the
     ward list. With no stake to read a list from (an invite code, or a tenant that is not
     open yet) the same box simply takes the words. */
  function wardField(opts = {}) {
    const OTHER = "__other";
    const caption = opts.label || "Ward or branch";
    const label = el("label", {}, caption);
    const sel = el("select", {});
    const typed = el("input", { type: "text", maxlength: "80", "aria-label": caption,
                                placeholder: opts.placeholder || "e.g. Ofankor Ward" });
    const note = el("div", { class: "hint" }, "");
    const node = el("div", { class: "field" }, [label, sel, typed, note]);

    let list = [], stakeId = null, wantedId = null, wantedName = null, seq = 0;

    sel.addEventListener("change", () => {
      paint();
      if (sel.value === OTHER) typed.focus();
    });

    function paint() {
      const noList = stakeId === null;
      sel.style.display = noList ? "none" : "";
      const typing = noList || sel.value === OTHER;
      typed.style.display = typing ? "" : "none";
      note.textContent = noList
        ? (opts.typeNote || "The ward or branch you attend, as the people there call it.")
        : typing ? "It goes on this stake's list when you save. A leader can rename or "
                   + "merge it afterwards."
        : (opts.note || "");
      note.style.display = note.textContent ? "" : "none";
    }

    function fill() {
      sel.innerHTML = "";
      sel.appendChild(el("option", { value: "" }, "None recorded"));
      list.forEach(w => sel.appendChild(el("option", { value: String(w.id) }, w.name)));
      sel.appendChild(el("option", { value: OTHER }, "Add a ward that is not listed"));
      const held = wantedName
        ? list.find(w => w.name.toLowerCase() === wantedName.toLowerCase())
        : null;
      const byId = wantedId != null ? list.find(w => w.id === wantedId) : null;
      if (held || byId) {
        sel.value = String((held || byId).id);
        typed.value = "";
      } else if (wantedName || wantedId != null) {
        sel.value = OTHER;
        typed.value = wantedName || "";
      } else sel.value = "";
      paint();
    }

    /* Changing stake means asking that stake again. An answer still travelling when the
       person moved on is dropped rather than painted over the list they chose. */
    function load(id, show) {
      stakeId = id || null;
      list = [];
      const my = ++seq;
      if (!stakeId) { fill(); return Promise.resolve(); }
      return API.get(`/api/stakes/${stakeId}/wards`)
        .then(rows => { if (my !== seq) return; list = Array.isArray(rows) ? rows : []; fill(); })
        .catch(() => { if (my !== seq) return; stakeId = null; fill(); });
    }

    return {
      node,
      // the keys the server's ward contract reads: one of the two, never both
      payload() {
        if (stakeId === null || sel.value === OTHER) return { ward_name: typed.value.trim() };
        if (sel.value === "") return { ward_id: null };
        return { ward_id: Number(sel.value) };
      },
      // "not listed" with an empty box is a half-answer; the form says so and stops
      incomplete() { return stakeId !== null && sel.value === OTHER && !typed.value.trim(); },
      set(name, id) {
        wantedName = name || null;
        wantedId = id == null ? null : id;
        fill();
      },
      load,
      focus() { (sel.style.display === "none" ? typed : sel).focus(); },
    };
  }

  // ---- passwords on the screen ----
  /* A mistyped password is only found at the worst moment — the door is shut and the
     person cannot see what they wrote. So every box that takes a password carries its own
     switch, and the switch says which way it is pointing: the label, the pressed state and
     the spoken notice all change together, so what a screen reader reports is what the
     screen shows. */
  function passWrap(input) {
    if (input.type !== "password") input.type = "password";
    if (!input.id) input.id = "pw-" + (++fieldSeq);
    const eye = el("button", { class: "pass-eye", type: "button", "aria-pressed": "false",
                               "aria-controls": input.id, "aria-label": "Show password",
                               title: "Show password" },
                            [icon("eye", 17, "eye"), icon("eyeoff", 17, "eyeoff")]);
    eye.addEventListener("click", () => {
      const shown = input.type !== "password";
      input.type = shown ? "password" : "text";
      eye.classList.toggle("shown", !shown);
      eye.setAttribute("aria-pressed", shown ? "false" : "true");
      eye.setAttribute("aria-label", shown ? "Show password" : "Hide password");
      eye.setAttribute("title", shown ? "Show password" : "Hide password");
      input.focus();
      announce(shown ? "Password hidden" : "Password shown");
    });
    return el("div", { class: "pass-wrap" }, [input, eye]);
  }

  /* Where a person types a new password twice, disagreement is refused in the box's own
     words — "passwords do not match" over a field captioned "Confirm new password" says
     which two, and the caret goes to the one to retype. */
  function passAgree(first, again, noun = "passwords") {
    if (first.value === again.value) return true;
    toast(`The two ${noun} do not match — retype the confirmation.`, "err");
    again.focus();
    announce(`The two ${noun} do not match. The confirmation box is selected.`);
    return false;
  }

  // ---- formatters ----
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const CATEGORIES = { institute: "Institute", englishconnect: "EnglishConnect",
                       self_reliance: "Self-Reliance", skill_course: "Skill Course" };
  const ROLES = { super_admin: "Portal Admin", stake_president: "Stake President",
                  district_president: "District President",
                  service_missionary: "YSA Service Missionary", instructor: "Instructor",
                  student: "Student" };
  function roleLabel(r) { return ROLES[r] || String(r || "").replace(/_/g, " "); }
  function fmtTime(t) {
    if (!t) return "";
    const [h, m] = String(t).split(":");
    const hr = (+h % 12) || 12;
    return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
  }
  function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(String(d).length === 10 ? d + "T00:00:00" : d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  /* A closed check-in window has to say which edge of it the person is standing outside,
     or the instructor assumes the code is broken. A class that has not started yet will
     open; a class that finished more than an hour ago is shut for good, and the hour it
     shut is the answer to "but I was on my way". The timestamps arrive as the class's own
     wall clock — every place here is on Ghana time, which is UTC all year — so they are
     read straight off the string and marked UTC by hand, instead of leaving Date to guess
     the laptop's zone. */
  function opensLabel(live) {
    const stamp = k => String((live && live[k]) || "").replace(" ", "T");
    const at = stamp("opens_at");
    if (at.length < 16) return "";
    if (new Date(at.slice(0, 19) + "Z") > new Date()) {
      const day = at.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      return `Check-in opens ${day === today ? "today" : "on " + fmtDate(day)} at ${fmtTime(at.slice(11, 16))}`;
    }
    const shut = stamp("closes_at");
    if (shut.length < 16) return "This session's check-in window has passed.";
    return `Check-in for this session closed at ${fmtTime(shut.slice(11, 16))}`;
  }

  /* A sitting is placed on the timeline by the hour it starts, not by its date alone: a
     class can meet twice in one day, and "the next one" has to mean the nearer of the two.
     The stamps arrive as the class's own wall clock — every place here is on Ghana time,
     which is UTC all year — so the trailing Z is honest rather than a guess at the
     laptop's zone. */
  function startsAt(s) {
    return Date.parse(`${s.scheduled_date}T${(s.start_time || "00:00:00").slice(0, 8)}Z`)
        || Date.parse(s.scheduled_date + "T00:00:00Z");
  }

  /* A sitting is named by its hour as well as its day — a class can meet twice in one day
     — and the range shows whenever a finishing time is known. */
  function hoursText(s) {
    if (!s.start_time) return "time to be set";
    return s.end_time ? `${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}` : fmtTime(s.start_time);
  }

  /* The activity trail is written for the person reading it, not for the table it came
     from. The server keeps its own vocabulary — "place.deactivated", "status",
     "stake_president" — and the portal already says each of those words differently
     everywhere else, so the trail says them the same way before it reaches the screen. */
  const LOG_KIND = { stake: "Stakes", user: "Accounts", member: "Membership",
    course: "Classes", enrollment: "Enrolments", attendance: "Attendance",
    message: "Messages", session: "Sessions", invite: "Invite codes",
    document: "Documents", auth: "Sign-ins", certificate: "Certificates",
    place: "Gathering places", gathering_place: "Gathering places", room: "Rooms",
    term: "Terms", data_request: "Data requests", ward: "Wards" };
  /* Only the phrases a plain word-split would say badly; the rest read themselves
     once the underscores are gone. */
  const LOG_WORDS = { signup: "Signed up", signup_founder: "Signed up as the first account",
    checkin: "Checked in", role_set: "Role changed", made_admin: "Made a portal admin",
    admin_revoked: "Portal admin removed", active_changed: "Access changed",
    anonymised: "Record removed", consent: "Accepted the terms",
    email_verified: "Address confirmed", password_changed: "Password changed",
    password_reset: "Password reset", updated_by_admin: "Updated by the portal admin",
    created_by_admin: "Created by the portal admin",
    regenerated_by_admin: "Invite code regenerated by the portal admin",
    regenerated: "Invite code regenerated", deletion_note: "Note kept for the removal",
    restored: "Brought back", deletion_requested: "Removal asked for",
    deletion_withdrawn: "Removal withdrawn" };
  /* Both of these say no more than the action beside them already said, so the trail
     keeps the fact to itself rather than trailing a bare column name. */
  const LOG_DETAIL = { status: "", self: "", qr_dynamic: "with a QR code",
    True: "made active", False: "made inactive" };
  function plainWords(s) { return String(s || "").replace(/_/g, " ").trim(); }
  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function logKind(k) { return LOG_KIND[k] || capFirst(plainWords(k)); }
  function logAction(action) {
    const parts = String(action || "").split(".");
    const kind = parts.shift();
    const phrase = parts.join("_");
    const shown = LOG_WORDS[phrase] || capFirst(plainWords(phrase || kind));
    return parts.length ? `${shown} · ${logKind(kind)}` : shown;
  }
  function logDetail(detail) {
    const s = String(detail == null ? "" : detail).trim();
    if (!s) return "";
    if (Object.prototype.hasOwnProperty.call(LOG_DETAIL, s)) return LOG_DETAIL[s];
    /* Details are written for a search box rather than a page: one field name, a list of
       them, or a role next to the address it belongs to. Each part is said on its own. */
    return s.split(",").map(part => {
      const bits = part.trim().split(":");
      const head = bits.shift().trim();
      const shown = ROLES[head] || LOG_DETAIL[head] || capFirst(plainWords(head));
      return bits.length ? `${shown}: ${bits.join(":").trim()}` : shown;
    }).filter(Boolean).join(", ");
  }
  const PILL = { active: "green", enrolled: "green", present: "green", completed: "green",
    pending_approval: "amber", pending: "amber", waitlisted: "amber", late: "amber",
    suspended: "red", absent: "red", rejected: "red", dropped: "grey", cancelled: "grey",
    excused: "blue", scheduled: "blue", in_progress: "blue" };
  function statusPill(s) {
    return `<span class="pill ${PILL[s] || "grey"}">${esc(String(s).replace(/_/g, " "))}</span>`;
  }
  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(w => w && w !== "&");
    if (!parts.length) return "?";
    // first and last word: a couple shares one account, and "Elder & Sister Hansen"
    // is one household, not a name to be folded into "E&"
    const last = parts[parts.length - 1];
    return (parts.length === 1 ? parts[0][0] : parts[0][0] + last[0]).toUpperCase();
  }
  /* One face, one box, everywhere the portal shows a person.
     An uploaded picture is whatever the camera made it — square, tall, wide, huge — so
     the box is fixed and the image is cropped into it on screen: `object-fit: cover`
     fills, `overflow: hidden` clips, and the picture carries the same border radius as
     the initials it replaces. Nothing here resizes the file the person uploaded; the
     file stays whole and every size is the same component at a different `--av-size`.
     Three sizes, no more: a chip, a list row, and the profile page's own picture. */
  function avatar(who, size) {
    const u = who || {};
    // initials come from the one name on the account, never a couple's title,
    // which would fold into "E&"
    const name = typeof u === "string" ? u
      : (u.full_name || u.name || u.display_name || "");
    const url = (typeof u === "string" ? null : u.photo_url) || null;
    const cls = "av " + (size === "sm" || size === "lg" ? size : "md");
    // The name is written beside this face wherever it appears, so the picture itself
    // is decoration to a screen reader rather than a second copy of the same words.
    if (url) return el("span", { class: cls + " has-img" },
      [el("img", { src: API.abs(url), alt: "", loading: "lazy" })]);
    return el("span", { class: cls }, initials(name));
  }
  /* One class picture, drawn the same way in every list that shows one.
     No picture, no box: a class nobody has photographed reads as plain text rather than as
     a broken image, and nothing on the page blames the teacher for a thing they were never
     asked to do. The picture is given an empty alt because the class title always sits
     beside it, exactly as a face does — and because the portal collects no caption, so any
     words written here would be a guess about a photograph I cannot see. */
  function coverTile(url) {
    if (!url) return null;
    return el("img", { class: "ct", src: API.abs(url), alt: "", loading: "lazy", decoding: "async" });
  }
  function personName(u) {
    return (u && (u.display_name || u.full_name || u.name)) || "";
  }
  /* The name that fits a compact chip: an account's own holder, not a couple's title. */
  function shortName(u) {
    const own = (u && (u.full_name || u.name)) || personName(u);
    if (!own) return "Account";
    const parts = String(own).trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
  }
  function empty(msg, ic = "search") {
    return el("div", { class: "empty" }, [icon(ic, 34), el("div", {}, msg)]);
  }
  function loading(n = 2) {
    const w = el("div");
    for (let i = 0; i < n; i++) w.appendChild(el("div", { class: "skel" }));
    return w;
  }

  // ---- modal ----
  /* Every dialog gets a visible dismiss affordance, Escape, a focus trap and a
     return to whatever opened it — the pages only describe title/body/actions. */
  function modal({ title, sub, body, actions = [], wide = false }) {
    const backdrop = el("div", { class: "modal-backdrop" });
    const opener = document.activeElement;
    const panel = el("div", {
      class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true",
      "aria-label": title, tabindex: "-1",
    }, [
      el("div", { class: "mhead" }, [
        el("div", { class: "mt" }, [el("h3", {}, title), sub ? el("div", { class: "msub" }, sub) : null]),
        el("button", { class: "btn ghost icon-only mclose", type: "button",
                       "aria-label": "Close", title: "Close", onclick: () => close() },
          [icon("x", 16)]),
      ]),
      body,
    ]);
    const actRow = el("div", { class: "mactions" });
    actions.forEach(a => actRow.appendChild(el("button", {
      class: "btn " + (a.kind || "secondary"), type: "button",
      onclick: () => a.onClick && a.onClick(close),
    }, a.label)));
    if (actions.length) panel.appendChild(actRow);
    backdrop.appendChild(panel);
    backdrop.addEventListener("mousedown", e => { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKey);
    const field = panel.querySelector("input:not([type=hidden]), select, textarea");
    (field && !field.disabled ? field : panel).focus();

    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key === "Tab") trap(e);
    }
    function trap(e) {
      const f = [...panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const start = f[0], end = f[f.length - 1];
      if (e.shiftKey && document.activeElement === start) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); start.focus(); }
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (opener && document.contains(opener) && typeof opener.focus === "function") opener.focus();
    }
    return { close, panel };
  }
  function confirmDialog(message, { danger = false, title = "Are you sure?", okLabel = "Confirm" } = {}) {
    return new Promise(resolve => {
      const m = modal({
        title, sub: message,
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => { c(); resolve(false); } },
          { label: okLabel, kind: danger ? "danger" : "", onClick: c => { c(); resolve(true); } },
        ],
      });
      // the X and Escape mean "no" exactly as Cancel does
      m.panel.querySelector(".mclose").addEventListener("click", () => resolve(false));
    });
  }

  // ---- app shell: persistent sidebar, off-canvas drawer + bottom dock ----
  /* ctx = { stake, stakes, unread } — stake switcher and the message badge */
  function shell(activeNav, contentNode, navItems, ctx) {
    const user = API.getUser() || {};
    const items = navItems || App.nav();
    // pages that predate the context switcher still get the stake list + badge
    ctx = ctx || (typeof App !== "undefined" ? App.ctx() : null);
    const unread = (ctx && ctx.unread) || 0;
    const root = el("div", { class: "app-frame" });

    function navLink(item, variant) {
      const kids = [icon(item.icon, variant === "dock" ? 20 : 17)];
      kids.push(el("span", { class: "nav-label" }, item.label));
      const count = item.badge || (item.key === "messages" ? unread : 0);
      if (count) kids.push(el("span", { class: "nav-badge" }, String(count)));
      return el("a", {
        href: item.href,
        class: (item.key === activeNav ? "active " : "") + (variant === "dock" ? "dock-item" : "side-item"),
        "aria-current": item.key === activeNav ? "page" : null,
        title: item.label,
      }, kids);
    }

    // ---------- sidebar (wide screens) ----------
    const side = el("aside", { class: "sidebar", "aria-label": "Main navigation" }, [
      el("div", { class: "side-brand" }, [
        el("img", { class: "brand-img", src: "assets/img/logo.png?v=49", alt: "Gathering Place" }),
      ]),
      stakeSwitcher(ctx),
      el("nav", { class: "side-nav" }, sideGroups(items, navLink)),
      el("div", { class: "side-foot" }, [
        el("a", { class: "side-user", href: "#/profile" }, [
          avatar(user),
          el("span", { class: "who" }, [
            el("span", { class: "nm" }, personName(user) || "Account"),
            el("span", { class: "rl" }, primaryRoleLabel(user)),
          ]),
        ]),
        el("button", { class: "side-signout", onclick: signOut }, [icon("logout", 16), "Sign out"]),
      ]),
    ]);
    root.appendChild(side);

    // ---------- topbar ----------
    const burger = el("button", { class: "icon-btn menu-btn", "aria-label": "Open menu",
      onclick: () => toggleDrawer(true) }, [icon("menu", 20)]);
    const avatarBtn = el("button", { class: "avatar-btn", "aria-label": "Account menu" }, [
      avatar(user, "sm"),
      // the compact chip uses the person's own name; a couple's full title, which can
      // read "Elder & Sister Hansen", belongs in the sidebar where there is room
      el("span", { class: "nm" }, shortName(user)),
      icon("chevron", 14),
    ]);
    const topbar = el("header", { class: "topbar" }, [
      burger,
      el("div", { class: "logo" }, [
        el("img", { class: "brand-img brand-mobile", src: "assets/img/logo.png?v=49",
                   alt: "Gathering Place" }),
        ctx && ctx.stake ? el("span", { class: "crumb" }, [
          el("span", { class: "crumb-stake" }, ctx.stake.name),
          el("span", { class: "crumb-role" }, ctx.stake.label || primaryRoleLabel(user)),
        ]) : null,
      ]),
      // Day or night, on every screen, whatever the role: the choice belongs to the
      // person holding the phone, and it stays on their device.
      themeButton(),
      avatarBtn,
    ]);
    root.appendChild(topbar);

    // avatar menu
    let menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    avatarBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (menu) return closeMenu();
      menu = el("div", { class: "menu" }, [
        el("div", { class: "mhead" }, user.email || ""),
        menuItem("user", "My profile", () => { location.hash = "#/profile"; }),
        isStudent(user) ? menuItem("chart", "My attendance", () => { location.hash = "#/record"; }) : null,
        user.is_super_admin ? menuItem("shield", "Portal control", () => { location.hash = "#/admin"; }) : null,
        menuItem("mail", "Messages", () => { location.hash = "#/messages"; }),
        menuItem("globe", "Study", () => { location.hash = "#/study"; }),
        // The documents are reachable from inside the portal, not only from the
        // sign-in screen — a policy you leave to read is a policy nobody reads.
        menuItem("file", "Privacy and terms", () => { location.hash = "#/privacy"; }),
        menuItem("logout", "Sign out", signOut, true),
      ]);
      topbar.appendChild(menu);
    });
    document.addEventListener("click", closeMenu, { once: true });
    function menuItem(ic, label, fn, danger) {
      return el("button", { class: danger ? "danger" : "", onclick: () => { closeMenu(); fn(); } },
        [icon(ic, 17), label]);
    }
    function isStudent(u) {
      return (u.memberships || []).some(m => m.role === "student");
    }

    // ---------- drawer (small screens) ----------
    const drawer = el("aside", { class: "drawer", "aria-label": "Main navigation" }, [
      el("div", { class: "drawer-head" }, [
        el("img", { class: "brand-img", src: "assets/img/logo.png?v=49", alt: "Gathering Place" }),
        el("button", { class: "icon-btn", "aria-label": "Close menu",
          onclick: () => toggleDrawer(false) }, [icon("x", 18)]),
      ]),
      stakeSwitcher(ctx),
      el("nav", { class: "side-nav" }, sideGroups(items, navLink)),
      el("div", { class: "side-foot" }, [
        el("a", { class: "side-user", href: "#/profile" }, [
          avatar(user),
          el("span", { class: "who" }, [
            el("span", { class: "nm" }, personName(user) || "Account"),
            el("span", { class: "rl" }, user.email || ""),
          ]),
        ]),
        el("button", { class: "side-signout", onclick: signOut }, [icon("logout", 16), "Sign out"]),
      ]),
    ]);
    const scrim = el("div", { class: "drawer-scrim", onclick: () => toggleDrawer(false) });
    drawer.addEventListener("click", e => { if (e.target.closest("a")) toggleDrawer(false); });
    root.appendChild(drawer);
    root.appendChild(scrim);

    // ---------- dock (small screens) ----------
    const primary = items.filter(i => !i.secondary).slice(0, 4);
    const hasMore = items.some(i => primary.indexOf(i) === -1);
    const dock = el("nav", { class: "dock", "aria-label": "Quick navigation" },
      primary.map(i => navLink(i, "dock")));
    if (hasMore) {
      dock.appendChild(el("button", { class: "dock-item dock-more", onclick: () => toggleDrawer(true) },
        [icon("menu", 20), el("span", { class: "nav-label" }, "More")]));
    }
    root.appendChild(dock);

    root.appendChild(el("main", { class: "container", id: "main", tabindex: "-1" },
      [contentNode]));

    function toggleDrawer(open) { document.body.classList.toggle("drawer-open", open); }
    // App.signOut is the one way out — it also clears the consent gate flag, so a
    // person who leaves without agreeing is asked again when they come back.
    function signOut() { App.signOut(); }
    return root;
  }

  /* Nav items carry an optional group name; a heading is written once per group. */
  function sideGroups(items, navLink) {
    const out = [];
    let last = null;
    items.forEach(item => {
      if (item.group && item.group !== last) {
        out.push(el("div", { class: "side-sect" }, item.group));
      }
      last = item.group || last;
      out.push(navLink(item, "side"));
    });
    return out;
  }

  function stakeSwitcher(ctx) {
    if (!ctx || !ctx.stake) return el("div");
    const stakes = ctx.stakes || [];
    if (stakes.length < 2) {
      return el("div", { class: "side-stake" }, [
        el("div", { class: "ss-label" }, "Stake"),
        el("div", { class: "ss-name" }, ctx.stake.name),
        el("div", { class: "ss-role" }, ctx.stake.label || ""),
      ]);
    }
    const sel = el("select", { class: "ss-select", "aria-label": "Switch stake",
      onchange: ev => { Ctx.setStake(+ev.target.value); App.route(); } },
      stakes.map(s => el("option", { value: s.id }, s.name)));
    sel.value = String(ctx.stake.id);
    return el("div", { class: "side-stake" }, [
      el("div", { class: "ss-label" },
        stakes.some(s => s.role === "super_admin") ? "Viewing stake" : "My stakes"),
      sel,
      el("div", { class: "ss-role" }, ctx.stake.label || ""),
    ]);
  }

  function primaryRoleLabel(user) {
    const m = (user && user.memberships) || [];
    if (user && user.is_super_admin) return "Portal Admin";
    const order = ["stake_president", "district_president", "service_missionary",
                   "instructor", "student"];
    const hit = order.find(r => m.some(x => x.role === r));
    return hit ? roleLabel(hit) : (m.length ? roleLabel(m[0].role) : "No stake yet");
  }

  // ---- shared tile / chart builders (dashboard + analytics) ----
  function tile(value, label, sub) {
    return el("div", { class: "stat" }, [
      el("div", { class: "n" }, String(value ?? 0)),
      el("div", { class: "l" }, label),
      sub ? el("div", { class: "s" }, sub) : null,
    ]);
  }
  /* items: [{ name, pct 0-100, text }] — rate sections turn the figure red when low */
  function barSection(title, items, opts) {
    const o = opts || {};
    const frag = el("div", { class: "chart-block" });
    if (title) frag.appendChild(el("div", { class: "sec-title" }, title));
    const card = el("div", { class: "card" });
    if (!items.length) card.appendChild(el("div", { class: "muted" }, o.emptyText || "No data yet."));
    items.forEach(i => {
      const pct = Math.max(0, Math.min(100, i.pct || 0));
      const low = o.rate && pct < (o.lowBelow || 60);
      card.appendChild(el("div", { class: "bar-row" }, [
        el("div", { class: "bar-name" }, i.name),
        el("div", { class: "bar-track" }, [el("div", { class: "bar-fill", style: `width:${pct}%` })]),
        el("div", { class: "bar-val" + (low ? " low" : "") }, i.text),
      ]));
    });
    frag.appendChild(card);
    return frag;
  }
  function stackSection(title, segments, total) {
    const sum = (total == null ? segments.reduce((a, s) => a + s.v, 0) : total) || 1;
    const card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "stack-bar" }, segments.map(s =>
      el("div", { class: "stack-seg " + s.cls, style: `width:${(s.v / sum) * 100}%`,
        title: `${s.k}: ${s.v}` }))));
    card.appendChild(el("div", { class: "legend" }, segments.map(s =>
      el("div", { class: "legend-item" }, [
        el("span", { class: "dot " + s.cls }),
        el("span", {}, `${s.k} — ${s.v}`),
        el("span", { class: "muted" }, ` · ${Math.round(s.v / sum * 100)}%`),
      ]))));
    const frag = el("div", { class: "chart-block" });
    if (title) frag.appendChild(el("div", { class: "sec-title" }, title));
    frag.appendChild(card);
    return frag;
  }

  return { el, render, esc, toast, announce, icon, shell, modal, confirm: confirmDialog,
           empty, loading, WEEKDAYS, CATEGORIES, ROLES, roleLabel, fmtTime, fmtDate,
           opensLabel, startsAt, hoursText,
           logAction, logDetail, logKind,
           statusPill, initials, avatar, coverTile, personName, shortName,
           tile, barSection, stackSection, primaryRoleLabel,
           theme, setTheme, toggleTheme, themeButton, phoneField, wardField, passWrap, passAgree };
})();
