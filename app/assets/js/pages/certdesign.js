/* Gathering Place — placing a certificate's lines on a gathering place's own artwork.

   A place's designer draws the whole sheet; the portal only stamps the lines that change —
   whose name, which class, which date, who signed. So this screen is a picture with handles
   on it: each line is dragged by eye onto the artwork and its position is kept as a fraction
   of the designer's page, measured from the top-left, which is exactly what the printer reads
   back. A chip is drawn at `size × (stage width ÷ page width in points)`, which is the whole
   reason what you see is what comes out. */
const CertDesign = (() => {
  "use strict";
  const { el, toast, icon } = UI;

  const ROUTE = (stakeId, placeId) => `/api/stakes/${stakeId}/places/${placeId}/certificate`;
  const API_PATHS = {
    setting: ROUTE,
    design: (s, p) => `${ROUTE(s, p)}/design`,
    layout: (s, p) => `${ROUTE(s, p)}/layout`,
    sample: (s, p) => `${ROUTE(s, p)}/sample`,
    font: (s, p) => `${ROUTE(s, p)}/font`,
    members: (s, p) => `${ROUTE(s, p)}/members`,
  };

  // The sheet for a place with no artwork on file: A4 landscape, the printer's own answer.
  const A4 = [841.89, 595.28];
  const MAX_DESIGN_BYTES = 25 * 1024 * 1024;
  const DESIGN_KINDS = { pdf: 1, png: 1, jpg: 1, jpeg: 1, webp: 1 };
  const PAGE_INK = "#0f172a";            // the colour the printer uses when none is saved
  const WORDS_FONT = { design: "The design's own lettering", serif: "Serif",
    "serif-bold": "Serif, bold", "serif-italic": "Serif, leaning", sans: "Plain",
    "sans-bold": "Plain, bold", "sans-oblique": "Plain, leaning" };
  const WORDS_ALIGN = { left: "Held from the left", center: "Held in the middle",
                        right: "Held from the right" };
  const CSS_FONT = {
    serif: ["Georgia, 'Times New Roman', serif", 400, "normal"],
    "serif-bold": ["Georgia, 'Times New Roman', serif", 700, "normal"],
    "serif-italic": ["Georgia, 'Times New Roman', serif", 400, "italic"],
    sans: ["var(--font)", 400, "normal"],
    "sans-bold": ["var(--font)", 700, "normal"],
    "sans-oblique": ["var(--font)", 400, "italic"],
    design: ["var(--font)", 400, "normal"],
  };
  // Arrow keys move a line; PageUp/PageDown are the middle step for a small trackpad.
  const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1],
                  ArrowDown: [0, 1], PageUp: [0, -1], PageDown: [0, 1] };

  /* Where every line starts on a sheet with nothing but a frame on it — the same places the
     printer ships, so a leader who has just uploaded artwork finds the portal's own words
     where the portal used to put them and only has to nudge. */
  /* The twelve names the printer calls its lines by, kept for a screen that could not ask.
     Only the names are repeated here — every number still comes from the portal. */
  const FALLBACK_LABELS = { name: "The member's name", course: "The class",
    grade: "Final grade", category: "Kind of class", skills: "Skills developed",
    body: "A line of your own", date: "Date", instructor: "Teacher's name",
    leader: "President's name", stake: "Stake or district", place: "Gathering place",
    code: "Verification code" };

  const ON_BY_DEFAULT = ["name", "course", "date", "instructor", "leader", "code"];
  const DEFAULT_POSITIONS = {
    name: [0.50, 0.42], course: [0.50, 0.56], grade: [0.50, 0.65], category: [0.50, 0.70],
    skills: [0.50, 0.76], body: [0.50, 0.33], date: [0.50, 0.86], instructor: [0.27, 0.85],
    leader: [0.73, 0.85], stake: [0.50, 0.14], place: [0.50, 0.19], code: [0.045, 0.80],
  };
  // The words a preview stands in when no real member has been chosen.
  const STANDING = { name: "A member's own name", course: "The class they finished",
    grade: "A", category: "Kind of class", skills: "A skill they learned · Another one",
    body: "A line of your own", date: "12 December 2026", instructor: "The teacher's name",
    leader: "The president's name", stake: "The stake or district", place: "The gathering place" };

  const round = (v, dp) => { const k = Math.pow(10, dp); return Math.round(v * k) / k; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clamp01 = v => clamp(v, 0, 1);
  const isHex = v => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));

  /* The one piece of geometry the screen and the printer must never disagree about, kept as
     a plain function of two boxes so it can be checked without dragging anything. */
  function stageToLayout(stageRect, chipRect, hold) {
    const s = asRect(stageRect), c = asRect(chipRect);
    if (!s || !c || !(s.width > 0) || !(s.height > 0)) return { x: 0.5, y: 0.5 };
    const edge = hold === "left" ? c.left : hold === "right" ? c.right : c.left + c.width / 2;
    return { x: round(clamp01((edge - s.left) / s.width), 4),
             y: round(clamp01((c.top + c.height / 2 - s.top) / s.height), 4) };
  }
  function asRect(value) {
    let v = value;
    if (v && typeof v.getBoundingClientRect === "function") v = v.getBoundingClientRect();
    if (!v) return null;
    const n = x => (Number.isFinite(+x) ? +x : NaN);
    const out = { left: n(v.left), top: n(v.top), width: n(v.width), height: n(v.height) };
    if (!Number.isFinite(out.left + out.top + out.width + out.height)) return null;
    out.right = out.left + out.width;
    out.bottom = out.top + out.height;
    return out;
  }

  // ---------- the layout, shaped so the screen always has something to draw ----------
  function defaultLayout(pageW, pageH) {
    const fields = {};
    Object.keys(DEFAULT_POSITIONS).forEach(key => {
      const [x, y] = DEFAULT_POSITIONS[key];
      const code = key === "code";
      const on = ON_BY_DEFAULT.includes(key);
      fields[key] = { on, x, y, size: code ? 48 : 12,
                      max_w: code ? null : 0.5, font: null, align: code ? "left" : "center",
                      color: null };
    });
    return { page_w_pt: round(pageW, 2), page_h_pt: round(pageH, 2), color: PAGE_INK,
             body_text: "", fields };
  }

  /* A layout off the wire is merged over the defaults rather than trusted outright: a line
     the server left out still has a place on the screen, and one carrying a word instead of
     a number cannot stop the whole sheet painting. */
  function withDefaults(raw, specs, page) {
    const base = defaultLayout(page[0], page[1]);
    const given = raw && typeof raw === "object" ? raw : {};
    const number = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
    const out = {
      page_w_pt: number(given.page_w_pt, base.page_w_pt),
      page_h_pt: number(given.page_h_pt, base.page_h_pt),
      color: isHex(given.color) ? String(given.color).toLowerCase() : PAGE_INK,
      body_text: typeof given.body_text === "string" ? given.body_text : "",
      fields: {},
    };
    specs.forEach(spec => {
      const key = spec.key;
      const item = (given.fields || {})[key] && typeof given.fields[key] === "object"
        ? given.fields[key] : {};
      const code = key === "code";
      const [dx, dy] = DEFAULT_POSITIONS[key] || [0.5, 0.5];
      const lo = code ? 24 : 6, hi = code ? 200 : 96;
      const size = Number.isFinite(+item.size) ? +item.size
        : (Number.isFinite(+spec.default_size) ? +spec.default_size : (code ? 48 : 12));
      let width = item.max_w === undefined || item.max_w === null
        ? +spec.default_max_w : +item.max_w;
      width = code ? null : (Number.isFinite(width) && width >= 0.05 && width <= 1
        ? round(width, 4) : 0.5);
      const align = !code && ["left", "center", "right"].includes(item.align)
        ? item.align : (code ? "left" : (spec.default_align || "center"));
      out.fields[key] = {
        on: item.on === undefined ? !!spec.default_on : !!item.on,
        x: number01(item.x, dx), y: number01(item.y, dy), size: round(clamp(size, lo, hi), 1),
        max_w: width, font: item.font || spec.default_font || null, align,
        color: isHex(item.color) ? String(item.color).toLowerCase() : null,
      };
    });
    return out;
  }
  function number01(value, d) {
    const n = +value;
    return Number.isFinite(n) ? round(clamp01(n), 4) : d;
  }

  /* The ten words the printer swaps into a line of your own — the same list, so a preview
     shows what the certificate will say instead of showing braces. */
  function fillBody(text, values) {
    let out = String(text || "");
    Object.keys(values).forEach(key => { out = out.split("{" + key + "}").join(values[key]); });
    return out;
  }

  // ---------- the one PUT this screen needs ----------
  /* The API client speaks GET, POST, PATCH and DELETE; keeping a layout is a PUT, so this is
     the same request with the same token on it rather than a second way of signing in. */
  async function putJSON(path, payload) {
    const headers = { "Content-Type": "application/json" };
    const tok = API.getToken();
    if (tok) headers.Authorization = "Bearer " + tok;
    let res;
    try {
      res = await fetch(API.abs(path), { method: "PUT", headers, body: JSON.stringify(payload) });
    } catch (networkError) {
      throw new Error("The portal did not answer. It may have just been restarted — wait a " +
                      "minute and try again.");
    }
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    if (!res.ok) {
      const raw = (data && (data.detail || data.message)) ||
        `The portal could not keep this (${res.status}).`;
      const err = new Error(typeof raw === "string" ? raw : JSON.stringify(raw));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchSetting(ctx) {
    const placeId = ctx.place && ctx.place.id;
    try {
      return await API.get(ROUTE(ctx.stakeId, placeId));
    } catch (e) {
      toast(e.message, "err");
      return null;
    }
  }
  // A setting that failed to arrive still has to show something rather than a blank card.
  function fallbackSetting(ctx) {
    const placeId = ctx.place && ctx.place.id;
    return { stake_id: ctx.stakeId, place_id: placeId, place_name: (ctx.place || {}).name || "",
      cert_style: "builtin", design: null, font: null, layout: defaultLayout(A4[0], A4[1]),
      fields: Object.keys(DEFAULT_POSITIONS).map(key => ({ key, label: FALLBACK_LABELS[key] || key,
        default_on: ON_BY_DEFAULT.includes(key),
        default_size: key === "code" ? 48 : 12, default_font: null, default_align: "center",
        default_max_w: key === "code" ? null : 0.5, draggable: key !== "code" })),
      fonts: ["design"], aligns: ["left", "center", "right"], placeholders: [],
      max_body_text: 600, usable: false, can_edit: false };
  }

  // ---------- the screen ----------
  function designer(ctx, setting, host) {
    const canEdit = !!setting.can_edit && ctx.canEdit !== false;
    let data = setting;
    const specs = () => (data.fields && data.fields.length)
      ? data.fields : fallbackSetting(ctx).fields;
    const fieldOrder = () => specs().map(s => s.key);
    const pageOf = d => [
      (d.design && d.design.page_w_pt) || (d.layout && d.layout.page_w_pt) || A4[0],
      (d.design && d.design.page_h_pt) || (d.layout && d.layout.page_h_pt) || A4[1],
    ];

    const S = {
      style: data.cert_style === "custom" ? "custom" : "builtin",
      layout: withDefaults(data.layout, specs(), pageOf(data)),
      selected: null, pick: null, members: [], saved: "", objectUrl: null, values: {},
    };
    const chips = new Map();
    const rows = new Map();
    let stage, art, img, frame, guideV, guideH, readout, statusLine, noticeBox, headLine,
        styleCheck, bodyBox, countLine, trayBox, memberSelect, tryButton, resizeStop,
        timer = null, pendingBefore = null, saving = false, queued = false;

    const id = () => ctx.stakeId;
    const placeId = () => (ctx.place || {}).id;
    const f = key => S.layout.fields[key];
    const holdOf = key => (key === "code" ? "center" : f(key).align);
    const live = () => fieldOrder().filter(k => f(k).on);
    const specOf = key => specs().find(s => s.key === key) || { key, label: key };

    function plain() {
      const fields = {};
      Object.keys(S.layout.fields).forEach(k => { fields[k] = Object.assign({}, S.layout.fields[k]); });
      return { page_w_pt: S.layout.page_w_pt, page_h_pt: S.layout.page_h_pt,
               color: S.layout.color, body_text: S.layout.body_text, fields };
    }
    /* A snapshot holds the layout and the style together, because that is the pair a refused
       save has to wind back: the numbers the chips stand on, and which design gets printed. */
    const snapshot = () => JSON.stringify({ l: plain(), s: S.style });
    // the body of a layout save is the layout plus which design this place prints
    const payload = () => Object.assign({}, plain(), { style: S.style });

    // ---------- the stage: the artwork, and every live line sitting on it ----------
    function buildStage() {
      img = el("img", { class: "cert-stage-art", alt: "", decoding: "async", draggable: "false" });
      frame = el("div", { class: "cert-frame" }, [
        icon("image", 32),
        el("div", { class: "cert-frame-t" }, "No artwork yet"),
        el("div", { class: "cert-frame-s" }, "The place's own certificate will go here. The lines " +
          "are already in their places — put the artwork up and they will sit on it."),
      ]);
      art = el("div", { class: "cert-art" }, [img, frame]);
      guideV = el("div", { class: "cert-guide cert-guide-v" });
      guideH = el("div", { class: "cert-guide cert-guide-h" });
      readout = el("span", { class: "cert-readout" });
      stage = el("div", { class: "cert-stage", id: "cert-stage", "data-fields": "",
                          "aria-label": "The certificate, with each line where it will print" },
                  [art, guideV, guideH]);
      return el("div", { class: "cert-paper" }, [
        stage,
        el("div", { class: "cert-stage-foot" }, [
          el("span", { class: "cert-hint" }, canEdit
            ? "Tap a line to choose it, then drag it or use the arrow keys to nudge it."
            : "These are the lines that print today, where they will print."),
          readout,
        ]),
      ]);
    }

    function makeChip(key) {
      const spec = specOf(key);
      const node = el("div", { class: "cert-chip cert-chip-" + key, "data-key": key, title: spec.label },
        key === "code" ? [el("span", { class: "cert-qr" }, "QR")] : [""]);
      // a reader is handed a picture of the placement, not a handle on it
      if (!canEdit || spec.draggable === false) return node;
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.addEventListener("pointerdown", ev => grab(ev, key));
      node.addEventListener("keydown", ev => nudgeKey(ev, key));
      node.addEventListener("focus", () => choose(key));
      node.addEventListener("click", () => choose(key));
      return node;
    }

    /* The point under the finger is kept while dragging, which is what makes a line land
       where it was picked up rather than where its edge happens to fall. */
    function grab(ev, key) {
      if (ev.button !== undefined && ev.button > 0) return;
      const box = asRect(stage);
      if (!box) return;
      const spot = f(key), before = snapshot();
      choose(key);
      ev.preventDefault();
      const node = ev.currentTarget;
      const start = { px: ev.clientX, py: ev.clientY, x: spot.x, y: spot.y };
      let moved = false;
      try { node.setPointerCapture(ev.pointerId); } catch (e) { /* the pointer is already gone */ }
      stage.classList.add("is-dragging");

      function onMove(me) {
        if (me.pointerId !== ev.pointerId) return;
        moved = true;
        spot.x = round(clamp01(start.x + (me.clientX - start.px) / box.width), 4);
        spot.y = round(clamp01(start.y + (me.clientY - start.py) / box.height), 4);
        showSpot(node, key);
      }
      function onUp(mu) {
        if (mu.pointerId !== ev.pointerId) return;
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerup", onUp);
        node.removeEventListener("pointercancel", onUp);
        stage.classList.remove("is-dragging");
        if (!moved) return;
        const at = stageToLayout(stage, node, holdOf(key));
        spot.x = at.x;
        spot.y = at.y;
        showSpot(node, key);
        schedule(before);          // one save when the finger lifts, not one for every move
      }
      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerup", onUp);
      node.addEventListener("pointercancel", onUp);
    }

    function nudgeKey(ev, key) {
      const step = NUDGE[ev.key];
      if (!step || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      ev.preventDefault();
      const spot = f(key), before = snapshot();
      const by = ev.shiftKey ? 0.02 : (ev.key === "PageUp" || ev.key === "PageDown" ? 0.01 : 0.002);
      spot.x = round(clamp01(spot.x + step[0] * by), 4);
      spot.y = round(clamp01(spot.y + step[1] * by), 4);
      showSpot(chips.get(key), key);
      schedule(before, 250);
    }

    // the cheap path: a line has moved, so redraw it, its guide and its two numbers
    function showSpot(node, key) {
      layoutChip(node, key);
      paintGuides();
      syncRow(key);
    }

    function choose(key) {
      if (S.selected === key) { paintGuides(); return; }
      S.selected = key;
      chips.forEach((node, k) => node.classList.toggle("is-selected", k === key));
      rows.forEach((row, k) => row.node.classList.toggle("is-selected", k === key));
      paintGuides();
    }

    /* A hairline down and across from the point a line is held by, so a placement can be
       judged against the artwork's own rules, and the numbers read where they are set. */
    function paintGuides() {
      const key = S.selected;
      const spot = key && f(key);
      const on = !!(spot && spot.on);
      guideV.classList.toggle("is-on", on);
      guideH.classList.toggle("is-on", on);
      if (!on) { readout.textContent = ""; return; }
      guideV.style.left = (spot.x * 100).toFixed(4) + "%";
      guideH.style.top = (spot.y * 100).toFixed(4) + "%";
      readout.textContent = `${round(spot.x * 100, 2)}% across · ${round(spot.y * 100, 2)}% down` +
        ` · ${Math.round(spot.x * S.layout.page_w_pt)} pt by ` +
        `${Math.round(spot.y * S.layout.page_h_pt)} pt`;
    }

    // screen pixels per PDF point — the one factor that makes the preview tell the truth
    function scaleNow() {
      const box = asRect(stage);
      return box && box.width ? box.width / S.layout.page_w_pt : 1;
    }

    function layoutChip(node, key) {
      if (!node) return;
      const spot = f(key), box = asRect(stage);
      const W = box ? box.width : 0, H = box ? box.height : 0;
      node.style.color = spot.color || S.layout.color || PAGE_INK;
      if (key === "code") {
        const side = clamp(spot.size, 24, 200) * scaleNow();
        node.style.width = side + "px";
        node.style.height = side + "px";
        node.style.lineHeight = side + "px";
      } else {
        const face = CSS_FONT[spot.font] || CSS_FONT.serif;
        node.style.fontSize = (spot.size * scaleNow()) + "px";
        node.style.fontFamily = face[0];
        node.style.fontWeight = String(face[1]);
        node.style.fontStyle = face[2];
        // a line is no wider than the admin allowed, which is how the printer wraps it too
        node.style.maxWidth = Math.max(16, (spot.max_w || 1) * W) + "px";
      }
      const hold = holdOf(key);
      let x = spot.x * W, y = spot.y * H;
      x -= hold === "left" ? 0 : hold === "right" ? node.offsetWidth : node.offsetWidth / 2;
      y -= node.offsetHeight / 2;
      /* Held where it was put, then pushed back onto the sheet if it overhangs. The printer
         does the same, so a name whose first letter is off the page never reaches one. */
      x = clamp(x, 0, Math.max(0, W - node.offsetWidth));
      y = clamp(y, 0, Math.max(0, H - node.offsetHeight));
      node.style.transform = `translate(${round(x, 2)}px, ${round(y, 2)}px)`;
      const words = S.values[key] || "";
      if (key !== "code" && node.textContent !== words) node.textContent = words;
      node.setAttribute("aria-label", `${specOf(key).label} — ${round(spot.x * 100, 1)} per cent ` +
        `across, ${round(spot.y * 100, 1)} per cent down from the top.` +
        (canEdit ? " Arrow keys move it." : ""));
    }

    function paintArt() {
      const url = S.objectUrl || (data.design && data.design.url) || "";
      stage.setAttribute("data-style", S.style);
      stage.setAttribute("data-art-src", url ? API.abs(url) : "");
      stage.setAttribute("data-fields", live().join(","));
      if (url) {
        const full = API.abs(url);
        if (img.getAttribute("src") !== full) img.setAttribute("src", full);
        img.style.display = "";
        frame.style.display = "none";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
        frame.style.display = "";
      }
    }

    /* A preview needs words in it. They are a real member's when one has been chosen, and
       the standing words otherwise — never braces, which is what the printer swaps too. */
    function paintWords() {
      const picked = S.pick || {};
      S.values = {};
      fieldOrder().forEach(key => {
        S.values[key] = key === "body"
          ? fillBody(S.layout.body_text, Object.assign({}, STANDING, picked))
          : String(picked[key] || STANDING[key] || "");
      });
    }

    function repaint() {
      stage.style.aspectRatio = `${S.layout.page_w_pt} / ${S.layout.page_h_pt}`;
      const wanted = live();
      [...chips.keys()].filter(k => !wanted.includes(k)).forEach(k => {
        chips.get(k).remove();
        chips.delete(k);
      });
      wanted.forEach(key => {
        if (!chips.has(key)) {
          const node = makeChip(key);
          chips.set(key, node);
          stage.appendChild(node);
        }
        chips.get(key).classList.toggle("is-selected", S.selected === key);
      });
      paintWords();
      chips.forEach((node, key) => layoutChip(node, key));
      paintArt();
      paintGuides();
      renderTray();
      if (countLine) countLine.textContent = `${(S.layout.body_text || "").length} of ${data.max_body_text || 600} characters used`;
    }

    // ---------- the ladder: one row per line the certificate can carry ----------
    function buildLadder() {
      const box = el("div", { class: "cert-ladder" });
      specs().forEach(spec => {
        const row = canEdit ? editRow(spec) : readRow(spec);
        rows.set(spec.key, row);
        box.appendChild(row.node);
      });
      rows.forEach((row, key) => row.sync(f(key), key === S.selected));
      return box;
    }

    // a leader who only watches is shown the same lines as words, not as boxes to type in
    function readRow(spec) {
      const node = el("div", { class: "cert-row is-read", "data-key": spec.key }, [
        el("div", { class: "cert-row-top" }, [
          el("span", { class: "cert-row-name" }, spec.label),
          el("span", { class: "cert-state" }, "on / off"),
        ]),
      ]);
      return { node, sync(spot) {
        // written fresh each time, so a row never carries a second copy of its own numbers
        node.replaceChildren(el("div", { class: "cert-row-top" }, [
          el("span", { class: "cert-row-name" }, spec.label),
          el("span", { class: "cert-state" + (spot.on ? " is-on" : "") },
            spot.on ? "On the certificate" : "Not on this certificate"),
        ]), spot.on ? el("div", { class: "cert-row-plain" },
          `${round(spot.x * 100, 2)}% across, ${round(spot.y * 100, 2)}% down · ${spot.size} pt` +
          (spot.max_w ? ` · a line ${round(spot.max_w * 100, 0)}% of the page wide` : "")) : null);
      } };
    }

    function editRow(spec) {
      const key = spec.key;
      const code = key === "code";
      const on = el("input", { type: "checkbox" });
      // the caption is the label's own text, so the box is named for screen readers
      const name = el("label", { class: "cert-row-name" }, [on, el("span", {}, spec.label)]);
      on.addEventListener("change", () => {
        const before = snapshot();
        f(key).on = on.checked;
        if (on.checked && !S.selected) S.selected = key;
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        schedule(before);
      });

      const size = numBox(`${spec.label} size in points`, code ? 24 : 6, code ? 200 : 96, 0.1);
      size.addEventListener("change", () => writeNum(key, "size", size, 1, code ? 24 : 6, code ? 200 : 96));

      const width = numBox(`${spec.label} width, as a part of the page`, 0.05, 1, 0.01);
      width.addEventListener("change", () => writeNum(key, "max_w", width, 4, 0.05, 1));

      const face = el("select", { "aria-label": `${spec.label} lettering` });
      (data.fonts && data.fonts.length ? data.fonts : ["design"]).forEach(name2 =>
        face.appendChild(el("option", { value: name2 }, WORDS_FONT[name2] || name2)));
      face.addEventListener("change", () => {
        const before = snapshot();
        f(key).font = face.value;
        repaint();
        schedule(before);
      });

      const align = el("select", { "aria-label": `${spec.label} held from` });
      (data.aligns || ["left", "center", "right"]).forEach(a =>
        align.appendChild(el("option", { value: a }, WORDS_ALIGN[a] || a)));
      align.addEventListener("change", () => {
        const before = snapshot();
        f(key).align = align.value;
        repaint();
        schedule(before);
      });

      const ink = el("input", { type: "color", class: "cert-swatch", "aria-label": `${spec.label} colour` });
      const asRest = el("button", { class: "btn ghost sm", type: "button" }, "As the rest");
      ink.addEventListener("input", () => {
        const before = snapshot();
        f(key).color = isHex(ink.value) ? ink.value.toLowerCase() : null;
        repaint();
        schedule(before);
      });
      asRest.addEventListener("click", () => {
        const before = snapshot();
        f(key).color = null;            // null is the answer "print it like everything else"
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        schedule(before);
      });

      const fx = numBox(`${spec.label} across the page, 0 to 1`, 0, 1, 0.001);
      const fy = numBox(`${spec.label} down the page, 0 to 1`, 0, 1, 0.001);
      fx.addEventListener("change", () => writeNum(key, "x", fx, 4, 0, 1));
      fy.addEventListener("change", () => writeNum(key, "y", fy, 4, 0, 1));

      const detail = el("div", { class: "cert-row-detail" }, [
        el("div", { class: "cert-ctl" }, [el("label", {}, code ? "Size of the square (points)" : "Size (points)"), size]),
        code ? null : el("div", { class: "cert-ctl" }, [el("label", {}, "How wide the line may be"), width]),
        code ? null : el("div", { class: "cert-ctl" }, [el("label", {}, "Lettering"), face]),
        code ? null : el("div", { class: "cert-ctl" }, [el("label", {}, "Held from"), align]),
        code ? null : el("div", { class: "cert-ctl" }, [el("label", {}, "Colour"),
          el("div", { class: "cert-ink" }, [ink, asRest])]),
        el("div", { class: "cert-ctl cert-ctl-where" }, [el("label", {}, "Where it sits"),
          el("div", { class: "cert-pair" }, [fx, fy])]),
      ]);
      const pick = el("button", { class: "btn ghost sm cert-pick", type: "button",
                                  "aria-label": `Show the controls for ${spec.label}` }, "Place");
      pick.addEventListener("click", () => {
        choose(key);
        const chip = chips.get(key);
        if (chip) chip.focus({ preventScroll: true });
      });
      const node = el("div", { class: "cert-row", "data-key": key }, [
        el("div", { class: "cert-row-top" }, [name, pick]), detail,
      ]);

      return {
        node,
        sync(spot, isOn) {
          on.checked = spot.on;
          size.value = spot.size;
          width.value = spot.max_w == null ? "" : spot.max_w;
          if (spot.font && face.querySelector(`option[value="${spot.font}"]`)) face.value = spot.font;
          align.value = spot.align;
          ink.value = isHex(spot.color) ? spot.color : S.layout.color;
          asRest.style.display = spot.color ? "" : "none";
          fx.value = spot.x;
          fy.value = spot.y;
          face.disabled = align.disabled = width.disabled = code;
          node.classList.toggle("is-selected", isOn);
        },
      };
    }

    function numBox(label, min, max, step) {
      return el("input", { type: "number", class: "cert-num", "aria-label": label,
                           min: String(min), max: String(max), step: String(step) });
    }

    /* A box with nothing sensible in it is not an instruction to print NaN: the number that
       was there is put back, and the person sees the box agree with the page again. */
    function writeNum(key, axis, input, dp, lo, hi) {
      const raw = Number(input.value);
      if (input.value.trim() === "" || !Number.isFinite(raw)) {
        input.value = round(f(key)[axis], dp);      // the number that was there, put back
        return;
      }
      const before = snapshot();
      f(key)[axis] = round(clamp(raw, lo, hi), dp);
      input.value = f(key)[axis];
      repaint();
      schedule(before);
    }
    function syncRow(key) {
      const row = rows.get(key);
      if (row) row.sync(f(key), key === S.selected);
    }

    // ---------- the lines that are off, where they can be put back on ----------
    function buildTray() {
      trayBox = el("div", { class: "cert-tray" }, [
        el("div", { class: "cert-sec" }, "Not on this certificate"),
        el("div", { class: "cert-tray-list" }),
      ]);
      return trayBox;
    }
    function renderTray() {
      if (!trayBox) return;
      const list = trayBox.querySelector(".cert-tray-list");
      list.innerHTML = "";
      const off = specs().filter(spec => !f(spec.key).on);
      if (!off.length) {
        list.appendChild(el("div", { class: "cert-hint" }, "Every line is on this certificate."));
        return;
      }
      off.forEach(spec => {
        const cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", () => {
          const before = snapshot();
          f(spec.key).on = cb.checked;
          if (cb.checked && !S.selected) S.selected = spec.key;
          repaint();
          rows.forEach((row, k) => row.sync(f(k), k === S.selected));
          schedule(before);
        });
        list.appendChild(el("div", { class: "cert-tray-item" }, [
          el("label", { class: "cert-row-name" }, [cb, el("span", {}, spec.label)]),
          el("button", { class: "btn ghost sm", type: "button",
            onclick: () => { f(spec.key).on = true; repaint(); rows.forEach((r, k) => r.sync(f(k), k === S.selected)); } },
            "Put it on"),
        ]));
      });
    }

    // ---------- a line of your own ----------
    function buildBody() {
      bodyBox = el("textarea", { rows: "3", maxlength: String(data.max_body_text || 600),
        "aria-label": "A line of your own",
        placeholder: "e.g. For completing {course} with the grade of {grade}." });
      bodyBox.value = S.layout.body_text || "";
      let bodyTimer = null;
      bodyBox.addEventListener("input", () => {
        const before = snapshot();
        S.layout.body_text = bodyBox.value;
        /* The line prints when there are words in it and not otherwise — the printer decides
           the same way, so the screen must not show a line the file will not keep. */
        f("body").on = !!S.layout.body_text.trim();
        paintWords();
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        clearTimeout(bodyTimer);
        bodyTimer = setTimeout(() => schedule(before), 700);   // typing is one edit, not forty
      });
      const words = el("div", { class: "cert-words" }, (data.placeholders || []).map(ph =>
        el("button", { class: "cert-word", type: "button", title: `Put ${ph} into the line`,
          onclick: () => insertWord(ph) }, ph)));
      countLine = el("span", { class: "cert-count" }, "");
      return el("div", { class: "cert-body" }, [
        el("div", { class: "cert-body-head" }, [
          el("label", { for: bodyId() }, "A line of your own"),
          countLine,
        ]),
        bodyBox,
        el("div", { class: "cert-hint" }, "Tap a word to put it in the line wherever the caret " +
          "stands. The portal swaps in the real name, class or date when it prints."),
        words,
      ]);
    }
    const bodyId = () => "cert-body-" + (id()) + "-" + (placeId());

    function insertWord(ph) {
      const at = bodyBox.selectionStart == null ? bodyBox.value.length : bodyBox.selectionStart;
      const end = bodyBox.selectionEnd == null ? at : bodyBox.selectionEnd;
      bodyBox.value = bodyBox.value.slice(0, at) + ph + bodyBox.value.slice(end);
      bodyBox.focus();
      bodyBox.setSelectionRange(at + ph.length, at + ph.length);
      bodyBox.dispatchEvent(new Event("input"));   // one path for a change, however it got there
    }

    // ---------- which design this place prints, and the colour of the words ----------
    function buildStyle() {
      styleCheck = el("input", { type: "checkbox", id: "cert-style-" + id() + "-" + placeId() });
      styleCheck.checked = S.style === "custom";
      styleCheck.addEventListener("change", () => {
        if (styleCheck.checked && !data.design) {
          /* Nothing to switch to, so it is said here in one place: a save would only be
             refused, and a refusal coming back from a checkbox reads as a fault. */
          styleCheck.checked = false;
          notice("Upload the artwork first. Until it is on the portal this place's own design " +
                 "cannot be switched on — the lines you placed are kept, so nothing is lost.");
          return;
        }
        notice("");
        const before = snapshot();
        S.style = styleCheck.checked ? "custom" : "builtin";
        paintHead();
        repaint();
        save(before);
      });
      return el("div", { class: "cert-style" }, [
        el("label", { class: "cert-style-row", for: styleCheck.id }, [
          styleCheck,
          el("span", { class: "cert-style-t" }, "Print on this place's artwork"),
        ]),
        el("div", { class: "cert-hint" }, "Left off, certificates for this place print on the " +
          "portal's own design."),
      ]);
    }

    function buildPageColor() {
      const ink = el("input", { type: "color", class: "cert-swatch",
                                "aria-label": "Colour of the printed words" });
      ink.value = isHex(S.layout.color) ? S.layout.color : PAGE_INK;
      ink.addEventListener("input", () => {
        const before = snapshot();
        S.layout.color = isHex(ink.value) ? ink.value.toLowerCase() : PAGE_INK;
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        schedule(before);
      });
      return el("div", { class: "cert-pagecolor" }, [
        el("label", {}, "Colour of the printed words"), ink,
      ]);
    }

    // ---------- the artwork, and the one face the design was lettered in ----------
    function buildArt() {
      const file = el("input", { type: "file", style: "display:none",
        accept: "application/pdf,image/png,image/jpeg,image/webp",
        "aria-label": "Choose the certificate artwork" });
      const pick = el("button", { class: "btn sm", type: "button", onclick: () => file.click() },
        [icon("upload", 15), el("span", {},
          data.design ? "Replace the artwork" : "Choose a PDF or picture")]);
      const drop = el("button", { class: "btn ghost sm", type: "button",
                                  style: data.design ? "" : "display:none",
                                  onclick: removeArt }, [icon("x", 15), "Remove this artwork"]);
      file.addEventListener("change", () => {
        const chosen = file.files && file.files[0];
        file.value = "";                      // the same file may be picked again
        if (!chosen) return;
        const trouble = checkDesign(chosen);
        if (trouble) return toast(trouble, "err");
        const preview = URL.createObjectURL(chosen);
        S.objectUrl = preview;                // shown at once, while the server redraws it
        repaint();
        sendArt(chosen, preview);
      });
      const font = el("input", { type: "file", style: "display:none", accept: ".ttf,font/ttf",
                                 "aria-label": "Choose the lettering the design uses" });
      const fontPick = el("button", { class: "btn secondary sm", type: "button",
                                      onclick: () => font.click() },
        [icon("edit", 15), el("span", {},
          data.font ? "Replace the lettering" : "Add the design's lettering")]);
      const fontDrop = el("button", { class: "btn ghost sm", type: "button",
                                      style: data.font ? "" : "display:none",
                                      onclick: removeFont }, [icon("x", 15), "Remove"]);
      font.addEventListener("change", () => {
        const chosen = font.files && font.files[0];
        font.value = "";
        if (!chosen) return;
        const name = String(chosen.name || "").toLowerCase();
        if (!name.endsWith(".ttf") && String(chosen.type) !== "font/ttf")
          return toast("The portal takes the lettering as a TTF file.", "err");
        const form = new FormData();
        form.append("file", chosen);
        busyButton(fontPick, true, "Saving…");
        API.post(API_PATHS.font(id(), placeId()), form)
          .then(() => { toast("Lettering saved"); return reload(); })
          .catch(e => { busyButton(fontPick, false); toast(e.message, "err"); });
      });
      return el("div", { class: "cert-art-card" }, [
        el("div", { class: "cert-row-buttons" }, [pick, drop, file]),
        el("div", { class: "cert-hint" }, "One page of the finished certificate, as a PDF or a " +
          "picture, up to 25 MB. The portal draws it at print size and keeps it beside the " +
          "lines you placed."),
        el("div", { class: "hr" }),
        el("div", { class: "cert-row-buttons" }, [fontPick, fontDrop, font]),
        el("div", { class: "cert-hint" }, "Optional. The one face the design was lettered in, so a " +
          "name the portal prints matches the name printed around it."),
      ]);
    }

    /* The browser only knows what a file says it is; the server reads the bytes. This is the
       friendly half of that rule — an obvious mistake named in words, not a rejected upload. */
    function checkDesign(chosen) {
      const ext = String(chosen.name || "").split(".").pop().toLowerCase();
      const mime = String(chosen.type || "").split("/").pop().toLowerCase();
      if (!DESIGN_KINDS[ext] && !DESIGN_KINDS[mime])
        return "That is not something the portal can print on. Choose a PDF, or a PNG, JPG or WEBP picture.";
      if (!chosen.size) return "That file arrived empty. Pick it again.";
      if (chosen.size > MAX_DESIGN_BYTES)
        return `That file is ${(chosen.size / 1048576).toFixed(1)} MB and the limit is 25 MB. ` +
               "Most design apps can save a much smaller copy.";
      return null;
    }

    async function sendArt(chosen, preview) {
      const form = new FormData();
      form.append("file", chosen);            // the field the route asks for is called "file"
      try {
        const res = await API.post(API_PATHS.design(id(), placeId()), form);
        if (res && res.notice) notice(res.notice);
        toast("Artwork saved");
        await reload();
      } catch (e) {
        toast(e.message, "err");
      } finally {
        S.objectUrl = null;
        URL.revokeObjectURL(preview);
      }
    }

    async function removeArt() {
      const go = await UI.confirm("The lines you placed are kept, so new artwork put up later " +
        "finds them exactly where they are. Certificates print on the portal's own design " +
        "until then.", { danger: true, title: "Remove this artwork?", okLabel: "Remove" });
      if (!go) return;
      try {
        await API.del(API_PATHS.design(id(), placeId()));
        S.style = "builtin";
        notice("");
        toast("Artwork removed");
        await reload();
      } catch (e) { toast(e.message, "err"); }
    }

    async function removeFont() {
      try {
        await API.del(API_PATHS.font(id(), placeId()));
        toast("Lettering removed");
        await reload();
      } catch (e) { toast(e.message, "err"); }
    }

    // ---------- try one: the placement printed now, for a member who has finished ----------
    function buildTry() {
      memberSelect = el("select", { "aria-label": "A member who has finished a class here" },
        [el("option", { value: "" }, "Try the standing words")]);
      const load = el("button", { class: "btn ghost sm", type: "button" },
        [el("span", {}, "Load the members")]);
      tryButton = el("button", { class: "btn sm", type: "button" },
        [icon("file", 15), el("span", {}, "Try one now")]);
      load.addEventListener("click", () => fetchMembers(load));
      tryButton.addEventListener("click", () => makeSample());
      memberSelect.addEventListener("change", () => {
        S.pick = S.members.find(m => String(m.enrollment_id) === memberSelect.value) || null;
        repaint();
      });
      return el("div", { class: "cert-try" }, [
        el("div", { class: "cert-sec" }, "See one before anyone is handed it"),
        el("div", { class: "cert-try-row" }, [memberSelect, load, tryButton]),
        el("div", { class: "cert-hint" }, "A sample prints now with the lines as they stand and " +
          "issues nothing. Its square does not scan as a real certificate, on purpose."),
      ]);
    }

    async function fetchMembers(btn) {
      busyButton(btn, true, "Loading…");
      try {
        const found = await API.get(API_PATHS.members(id(), placeId()));
        S.members = Array.isArray(found) ? found : [];
        memberSelect.innerHTML = "";
        memberSelect.appendChild(el("option", { value: "" }, "Try the standing words"));
        S.members.forEach(m => memberSelect.appendChild(
          el("option", { value: String(m.enrollment_id) },
            m.course ? `${m.name} — ${m.course}` : (m.name || "A member"))));
        memberSelect.value = "";
        S.pick = null;
        repaint();
        toast(S.members.length ? `${S.members.length} member(s) finished here — choose one to try.`
                               : "Nobody has finished a class at this place yet.");
      } catch (e) {
        toast(e.message, "err");
      } finally {
        busyButton(btn, false, "Load the members");
      }
    }

    /* The layout goes along whether or not a member was chosen: what you see is what prints.
       A member is only named when one was picked, so the key is left out rather than blank. */
    async function makeSample() {
      busyButton(tryButton, true, "Printing…");
      try {
        const body = { layout: plain() };
        if (S.pick) body.enrollment_id = S.pick.enrollment_id;
        const res = await API.post(API_PATHS.sample(id(), placeId()), body, { raw: true });
        if (!res.ok) {
          let message = `The portal would not print a sample (${res.status}).`;
          try {
            const j = await res.json();
            if (typeof j.detail === "string") message = j.detail;
          } catch (e) { /* an answer that is not words */ }
          toast(message, "err");
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        // asking the browser for a fresh tab is the whole point: the PDF is the preview
        const win = window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (!win) toast("The browser stopped the sample from opening. Allow pop-ups to see it.", "err");
      } catch (e) {
        toast(e.message, "err");
      } finally {
        busyButton(tryButton, false, "Try one now");
      }
    }

    // the words inside a button are the only part that changes; its icon stays where it is
    function busyButton(btn, on, label) {
      if (!btn) return;
      btn.disabled = !!on;
      const text = btn.querySelector("span");
      if (text && label !== undefined) text.textContent = label;
    }

    // ---------- autosave ----------
    /* There is no Save button on purpose: a leader who placed six lines and closed the laptop
       has six placements on file. A drag is one edit, so the saves are bunched and the last
       word wins; the value from before the edit is kept so a refusal can be wound back. */
    function schedule(before, delay) {
      if (before != null && pendingBefore === null) pendingBefore = before;
      setStatus("Saving…", "");
      clearTimeout(timer);
      timer = setTimeout(() => {
        /* One request at a time. A tunnel can answer the earlier one last, and a sheet of
           words typed after it would then be written over by an answer about the sheet as it
           was before the typing. The edit is kept and sent again when the door is free. */
        if (saving) { queued = true; return; }
        const held = pendingBefore;
        pendingBefore = null;
        save(held);
      }, delay === undefined ? 350 : delay);
    }

    async function save(before) {
      clearTimeout(timer);
      const rollback = before === undefined ? snapshot() : before;
      const sent = snapshot();
      pendingBefore = null;
      if (sent === S.saved) { setStatus("", ""); return; }   // nothing actually moved
      setStatus("Saving…", "");
      saving = true;
      try {
        const res = await putJSON(API_PATHS.layout(id(), placeId()), payload());
        S.saved = sent;
        /* The answer describes the sheet as it was sent, so it is only taken for the truth
           while the screen still holds that same sheet. If a line moved while the request was
           away, that movement is the newer word and stays on the screen to be sent next. */
        const still = snapshot() === sent;
        if (still && res) {
          if (res.cert_style) S.style = res.cert_style;
          data.cert_style = S.style;
          if (res.layout) S.layout = withDefaults(res.layout, specs(), pageOf(data));
        }
        setStatus("Saved", "ok");
        notice("");
        paintHead();
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        if (styleCheck) styleCheck.checked = S.style === "custom";
        // the card that holds this screen prints a line about where certificates go
        if (typeof ctx.onChange === "function") ctx.onChange();
      } catch (e) {
        if (snapshot() !== sent) {
          /* The portal refused the sheet that was sent, but the screen has moved on since.
             Winding back would throw the newer work away with the rejected one, so the newer
             sheet is sent instead and only that answer is reported — the finally block below
             is what runs it, so the door stays single-file. */
          queued = true;
          return;
        }
        /* The database said no, so the screen says no too and puts back what it held before
           the edit. A chip standing where nothing is stored is the one fault worth avoiding. */
        const back = JSON.parse(rollback);
        S.style = back.s;
        S.layout = withDefaults(back.l, specs(), pageOf(data));
        if (styleCheck) styleCheck.checked = S.style === "custom";
        repaint();
        rows.forEach((row, k) => row.sync(f(k), k === S.selected));
        setStatus(e.message, "err");
        toast(e.message, "err");
        if (/Upload the artwork first/i.test(e.message)) {
          S.style = "builtin";
          if (styleCheck) styleCheck.checked = false;
          notice("The lines you placed are kept. Put the artwork up, then switch this " +
                 "place's own design on.");
          paintHead();
        }
      } finally {
        saving = false;
        if (queued) {
          queued = false;
          const held = pendingBefore;
          pendingBefore = null;
          save(held);
        }
      }
    }

    function setStatus(msg, kind) {
      if (!statusLine) return;
      statusLine.textContent = msg;
      statusLine.className = "cert-status" + (kind ? " is-" + kind : "");
    }
    function notice(msg) {
      if (!noticeBox) return;
      noticeBox.textContent = msg || "";
      noticeBox.classList.toggle("is-on", !!msg);
    }

    function paintHead() {
      if (!headLine) return;
      const [pw, ph] = [S.layout.page_w_pt, S.layout.page_h_pt];
      headLine.replaceChildren(
        el("div", { class: "cert-head-name" }, data.place_name || (ctx.place || {}).name || "This place"),
        el("div", { class: "cert-head-meta" }, [
          el("span", {}, S.style === "custom" && data.design
            ? "Certificates for this place print on its own artwork."
            : "Certificates for this place print on the portal's own design."),
          el("span", { class: "cert-sep" }, "·"),
          el("span", {}, data.design
            ? `The sheet is ${round(pw, 1)} by ${round(ph, 1)} points, ${pw >= ph ? "wide" : "upright"}`
            : "No artwork on file yet — the page is A4 landscape, 841.9 by 595.3 points"),
        ]));
    }

    // ---------- putting the screen together ----------
    function assemble() {
      // the old chips and rows go with the old tree, so both maps start empty
      chips.clear();
      rows.clear();
      const root = el("div", { class: "cert" + (canEdit ? " cert-edit" : " cert-read") });
      root.appendChild(el("div", { class: "cert-head" }, [headLine = el("div", { class: "cert-head-line" })]));
      root.appendChild(noticeBox = el("div", { class: "cert-notice", role: "status" }, ""));
      if (canEdit) {
        root.appendChild(el("div", { class: "cert-card" }, [
          el("div", { class: "cert-sec" }, "Which design this place prints"),
          buildStyle(), buildPageColor(),
        ]));
        root.appendChild(el("div", { class: "cert-card" }, [
          el("div", { class: "cert-sec" }, "The artwork"), buildArt(),
        ]));
      }
      const ladderCol = el("div", { class: "cert-col-ladder" }, [
        el("div", { class: "cert-sec" }, "Every line"),
        buildLadder(),
      ]);
      if (canEdit) {
        ladderCol.appendChild(buildTray());
        ladderCol.appendChild(el("div", { class: "cert-card cert-card-body" }, [
          el("div", { class: "cert-sec" }, "A line of your own"), buildBody(),
        ]));
        ladderCol.appendChild(buildTry());
      } else if (S.layout.body_text) {
        ladderCol.appendChild(el("div", { class: "cert-card" }, [
          el("div", { class: "cert-sec" }, "A line of your own"),
          el("div", { class: "cert-plain" }, S.layout.body_text),
          /* A leader reading this sees the braces the portal fills in, so it is said: the
             certificate itself never prints a brace. */
          el("div", { class: "cert-hint" },
            "Where a word stands between braces the portal puts in that member's own — " +
            "the certificate never shows a brace."),
        ]));
      }
      root.appendChild(el("div", { class: "cert-work" }, [
        el("div", { class: "cert-col-stage" }, [
          el("div", { class: "cert-sec" }, "Where each line lands"),
          buildStage(),
        ]),
        ladderCol,
      ]));
      if (canEdit) {
        root.appendChild(el("div", { class: "cert-foot" }, [
          el("span", { class: "cert-hint" }, "Each change goes straight to the portal — there is " +
            "nothing to press at the end."),
          statusLine = el("span", { class: "cert-status", role: "status" }, ""),
        ]));
      }
      const chosen = specs().find(spec => f(spec.key).on) || specs()[0];
      if (chosen) S.selected = chosen.key;
      repaint();
      paintHead();
      S.saved = snapshot();
      rows.forEach((row, k) => row.sync(f(k), k === S.selected));
      if (bodyBox) bodyBox.id = bodyId();

      // the page is judged by eye, so a narrower window has to redraw the lines at their new size
      if (typeof ResizeObserver === "function") {
        resizeStop = new ResizeObserver(() => { paintGuides(); chips.forEach((node, key) => layoutChip(node, key)); });
        resizeStop.observe(stage);
      }
      return root;
    }

    /* New artwork means a new sheet and possibly new numbers, so the screen is built again
       from what the portal actually holds rather than patched — nothing from the old sheet
       can then be shown as though it were the new one. */
    async function reload() {
      const fresh = (await fetchSetting(ctx)) || data;
      data = fresh;
      S.layout = withDefaults(fresh.layout, specs(), pageOf(fresh));
      S.style = fresh.cert_style === "custom" ? "custom" : "builtin";
      if (S.objectUrl) URL.revokeObjectURL(S.objectUrl);
      S.objectUrl = null;
      S.saved = "";
      setStatus("", "");
      notice("");
      if (host) { host.replaceChildren(assemble()); api.relayout(); }
      if (typeof ctx.onChange === "function") ctx.onChange();
    }

    const api = {
      node: assemble(),
      /* The screen is built in a loose fragment, where the sheet has no width to measure a
         line against, and is put in the page only afterwards. Every line therefore lands in
         the top-left corner until the numbers are taken again — and a resize watcher cannot
         be the one to do it, because it reports a sheet that changes size, not a sheet that
         has just appeared. Whoever inserts the screen calls this straight after. */
      relayout() {
        if (!stage || !stage.isConnected) return;
        chips.forEach((node, key) => layoutChip(node, key));
        paintGuides();
      },
      destroy() {
        clearTimeout(timer);
        if (resizeStop) resizeStop.disconnect();
        if (S.objectUrl) URL.revokeObjectURL(S.objectUrl);
      },
    };
    return api;
  }

  // ---------- what the outside of this file may ask for ----------
  /* The setting is asked for here rather than handed in, so a card can hold this screen
     without knowing anything about the routes behind it. */
  async function renderInto(host, ctx) {
    if (!host || !ctx) return null;
    const setting = (await fetchSetting(ctx)) || fallbackSetting(ctx);
    const work = designer(ctx, setting, host);
    host.replaceChildren(work.node);
    work.relayout();
    return work;
  }

  const alive = new WeakMap();     // which screen stands in which host, so a re-mount tidies up

  function mount(host, ctx) {
    if (!host) return Promise.resolve(null);
    const previous = alive.get(host);
    if (previous) previous.destroy();
    host.innerHTML = "";
    host.appendChild(el("div", { class: "cert-loading" }, "Getting the certificate ready…"));
    return renderInto(host, ctx).then(work => {
      if (!work) { host.innerHTML = ""; return null; }
      alive.set(host, work);
      return work;
    });
  }

  /* The designer opened full screen, for a leader who wants the whole page for themselves:
     its own scroll column, one close button, and Escape doing what the button says.

     Whoever opened it is told when it shuts, and whether anything was actually placed while
     it was open — a list line that says "Own design" is only worth redrawing after a change,
     and a screen merely looked around in should not send the page fetching again. */
  function openOverlay(ctx) {
    const bar = el("div", { class: "cert-overlay-bar" });
    const inner = el("div", { class: "cert-overlay-body" });
    const holder = el("div", { class: "cert-overlay", role: "dialog", "aria-modal": "true",
                               "aria-label": "Certificate for " + ((ctx.place || {}).name || "this place"),
                               tabindex: "-1" },
                      [bar, inner]);
    const close = el("button", { class: "btn ghost icon-only", type: "button",
                                 "aria-label": "Close the certificate designer",
                                 title: "Close", onclick: () => shut() }, [icon("x", 18)]);
    bar.appendChild(el("div", { class: "cert-overlay-t" },
      "Certificate for " + ((ctx.place || {}).name || "this place")));
    bar.appendChild(close);
    document.body.appendChild(holder);
    document.body.classList.add("cert-is-open");
    document.addEventListener("keydown", onKey);
    const opener = document.activeElement;
    holder.focus();

    let work = null;
    let closed = false;
    let changed = false;
    // The screen reports every save; this only turns the report into the flag shut() sends.
    const ours = Object.assign({}, ctx, {
      onChange: () => {
        changed = true;
        if (typeof ctx.onChange === "function") ctx.onChange();
      },
    });
    renderInto(inner, ours).then(built => {
      /* Closed before the screen was even ready — the usual answer on a tunnel that is
         taking its time. Nothing may be left running behind a dialog that is gone. */
      if (closed) { if (built) built.destroy(); return; }
      work = built;
    });

    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); shut(); }
    }
    function shut() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("cert-is-open");
      if (work) work.destroy();
      holder.remove();
      if (typeof ctx.onClose === "function") ctx.onClose(changed);
      if (opener && document.contains(opener) && typeof opener.focus === "function") opener.focus();
    }
    return { close: shut };
  }

  return {
    mount,
    openOverlay,
    stageToLayout,
    DEFAULT_FRACTIONS: DEFAULT_POSITIONS,
    API_PATHS,
  };
})();
