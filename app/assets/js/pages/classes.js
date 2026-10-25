/* Classes: every session in view, narrowed by scope and filter chips.

   The same feed answers four different questions — "what am I teaching today?",
   "what has not been recorded yet?", "what is running across the whole stake?" —
   so the scope toggle only appears for people allowed to ask them (the server
   rejects scope=stake unless the viewer is a president, missionary or admin).

   From here an instructor can open a class, project its check-in QR, or write to
   the whole roster without detouring through the course list. */
const ClassesPage = (() => {
  const { el, icon, shell, loading, empty, render, fmtDate, fmtTime, doorLabel, doorPill,
          tile, modal, notice } = UI;

  const SCOPE_KEY = "gp_class_scope";
  let liveTimer = null;
  let state = { chip: "all", q: "" };
  let repaint = () => {};

  async function mount(target) {
    stop();
    const ctx = App.ctx();
    const stake = ctx.stake;
    state.q = "";
    if (!stake) {
      return render(target, shell("classes",
        notice("Classes", "Pick a stake to see its classes.", "home"), App.nav(), ctx));
    }
    const scope = scopeFor(stake);
    /* The roster chip only exists for the people who can fill a roster in, so a chip
       left over from another account would otherwise filter the list to nothing. */
    if (state.chip === "needs" && stake.student) state.chip = "all";
    const content = el("div");
    content.appendChild(head(stake, scope));
    content.appendChild(loading(3));
    render(target, shell("classes", content, App.nav(), ctx));

    let data;
    try {
      data = await API.get(`/api/stakes/${stake.id}/classes?scope=${scope}&days=30`);
    } catch (e) {
      content.lastChild.replaceWith(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }
    content.lastChild.replaceWith(body(data, ctx, scope));
  }

  /* Instructors and students only ever get their own scope; a leader's last
     choice is remembered so the toggle survives a page change. */
  function scopeFor(stake) {
    if (!stake.monitor) return "mine";
    return localStorage.getItem(SCOPE_KEY) === "mine" ? "mine" : "stake";
  }

  function head(stake, scope) {
    const actions = el("div", { class: "actions" });
    if (stake.monitor) {
      const sel = el("select", { "aria-label": "Class scope", onchange: ev => {
        localStorage.setItem(SCOPE_KEY, ev.target.value); mount(document.getElementById("app"));
      }}, [
        el("option", { value: "stake" }, `Whole ${(stake.kind || "stake").toLowerCase()}`),
        el("option", { value: "mine" }, stake.instructor ? "My classes" : "Classes I teach"),
      ]);
      sel.value = scope;
      actions.appendChild(sel);
    }
    actions.appendChild(el("button", { class: "btn secondary sm", onclick: () => window.print() },
      [icon("print", 15), "Print"]));
    actions.appendChild(el("button", { class: "btn sm", onclick: () => mount(document.getElementById("app")) },
      [icon("refresh", 15), "Refresh"]));

    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h1", { class: "page-title" }, "Classes"),
        el("div", { class: "page-sub" },
          `${stake.name} · ${scope === "stake" ? "every class in the stake"
                          : stake.student ? "my enrolled classes" : "classes I teach"}`),
      ]),
      actions,
    ]);
  }

  /* One class, not one sitting. A student enrolled in a single class was seeing that
     class written out once for every date it meets — twenty rows of the same title on a
     page called Classes — so the class is what the row is, and the sittings live inside
     it: which one is next, which one is today, which ones have no roster yet. */
  function groupClasses(rows) {
    const map = new Map();
    rows.forEach(r => {
      let c = map.get(r.course_id);
      if (!c) {
        c = {
          course_id: r.course_id, title: r.title, category_label: r.category_label,
          room: r.room, place: r.place, instructor: r.instructor, enrolled: r.enrolled,
          waitlisted: r.waitlisted, is_mine: r.is_mine, rows: [],
          today: null, next: null, upcoming: null, last: null, needs: [], rate: null,
        };
        map.set(r.course_id, c);
      }
      c.rows.push(r);
      if (r.is_today) c.today = r;
      if (r.needs_attendance) c.needs.push(r);
      if (r.is_upcoming && (!c.upcoming || when(r) < when(c.upcoming))) c.upcoming = r;
      /* The most recent sitting that still stands. The door never closes, so a class whose
         sittings have all gone by still has one a student can be counted into — late. */
      if (r.status !== "cancelled" && (!c.last || when(r) > when(c.last))) c.last = r;
    });
    const list = Array.from(map.values());
    list.forEach(c => {
      c.next = c.today || c.upcoming;
      const rates = c.rows.map(r => r.attendance_rate).filter(v => v != null);
      c.rate = rates.length
        ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    });
    list.sort((a, b) => {
      const aw = a.next ? when(a.next) : "9999";
      const bw = b.next ? when(b.next) : "9999";
      if (aw !== bw) return aw < bw ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    return list;
  }
  function when(r) { return r.date + " " + (r.time || ""); }

  /* The numbers count classes now, the same way the list does. A class that meets today
     is counted as today and not again as upcoming, so the four figures add up. */
  function classCounts(list) {
    return {
      total: list.length,
      today: list.filter(c => c.today).length,
      upcoming: list.filter(c => !c.today && c.next).length,
      needs: list.filter(c => c.needs.length).length,
      finished: list.filter(c => !c.next).length,
    };
  }

  function body(data, ctx, scope) {
    const stake = ctx.stake;
    const wrap = el("div");
    const classes = groupClasses(data.sessions);
    const counts = classCounts(classes);

    const tiles = [
      tile(counts.total, "In view"),
      tile(counts.today, "Today"),
      tile(counts.upcoming, "Upcoming"),
    ];
    /* A student has no roster to fill in, so the figure would always read zero. */
    if (!stake.student) tiles.push(tile(counts.needs, "Needs roster"));
    wrap.appendChild(el("div", { class: "stat-grid" + (stake.student ? " three" : "") }, tiles));

    const defs = [
      { key: "all", label: "All", n: counts.total },
      { key: "today", label: "Today", n: counts.today },
      { key: "upcoming", label: "Upcoming", n: counts.upcoming },
    ];
    if (!stake.student) defs.push({ key: "needs", label: "Needs roster", n: counts.needs });
    defs.push({ key: "finished", label: "Finished", n: counts.finished });
    wrap.appendChild(chips(defs));

    const search = el("input", { type: "search", placeholder: "Search class, room or instructor",
      value: state.q, oninput: ev => { state.q = ev.target.value.toLowerCase(); repaint(); } });
    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
    ]));

    const host = el("div");
    wrap.appendChild(host);
    repaint = () => {
      const shown = classes.filter(matches);
      host.innerHTML = "";
      if (!shown.length) {
        host.appendChild(el("div", { class: "card" }, [empty(
          classes.length ? "No class matches this filter."
            : scope === "mine" && !stake.student
              ? "You do not teach a class in this stake yet." : "Nothing scheduled.",
          "calendar")]));
        return;
      }
      host.appendChild(view(shown, ctx));
    };
    repaint();
    return wrap;
  }

  function matches(c) {
    if (state.chip === "today" && !c.today) return false;
    if (state.chip === "upcoming" && (c.today || !c.next)) return false;
    if (state.chip === "needs" && !c.needs.length) return false;
    if (state.chip === "finished" && c.next) return false;
    const q = state.q;
    if (q && !(c.title.toLowerCase().includes(q)
      || String(c.instructor || "").toLowerCase().includes(q)
      || String(c.room || c.place || "").toLowerCase().includes(q))) return false;
    return true;
  }

  function chips(defs) {
    const bar = el("div", { class: "chips" });
    const btns = defs.map(d => el("button", {
      class: "chip" + (state.chip === d.key ? " on" : ""),
      onclick: () => {
        state.chip = d.key;
        btns.forEach((b, i) => b.classList.toggle("on", defs[i].key === d.key));
        repaint();
      },
    }, [d.label, el("span", { class: "c" }, String(d.n))]));
    btns.forEach(b => bar.appendChild(b));
    return bar;
  }

  // ---------------- rows ----------------
  function view(list, ctx) {
    const card = el("div", { class: "card" });
    const narrow = el("div", { class: "only-narrow" });
    list.forEach(c => narrow.appendChild(classCard(c, ctx)));
    card.appendChild(narrow);

    card.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, "Next"), el("th", {}, "Class"), el("th", {}, "Room"),
        el("th", {}, "Instructor"), el("th", { class: "num" }, "Enrolled"),
        el("th", { class: "num" }, "Attendance"), el("th", {}, "")])]),
      el("tbody", {}, list.map(c => el("tr", { class: c.today ? "is-today" : "" }, [
        el("td", { style: "white-space:nowrap" }, [
          el("div", { style: "font-weight:600" }, c.next ? fmtDate(c.next.date) : "—"),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" },
            c.next ? (fmtTime(c.next.time) || "TBA") : "no sitting left"),
          c.today ? el("span", { class: "mini-pill mine" }, "today") : null]),
        el("td", {}, [el("div", { style: "font-weight:600" }, c.title),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" },
            `${c.rows.length} sitting${c.rows.length === 1 ? "" : "s"} · ${c.category_label}`)]),
        el("td", {}, c.room || c.place || "—"),
        el("td", {}, [c.instructor, c.is_mine && !ctx.stake.student
          ? el("span", { class: "mini-pill mine" }, "mine") : null]),
        el("td", { class: "num" }, String(c.enrolled) + (c.waitlisted ? ` (+${c.waitlisted})` : "")),
        el("td", { class: "num" }, c.rate == null
          ? (c.needs.length ? el("span", { class: "mini-pill hot" }, "unrecorded") : "—")
          : el("span", { class: "mini-pill " + (c.rate >= 75 ? "ok"
                        : c.rate >= 50 ? "" : "hot") }, `${c.rate}%`)),
        el("td", {}, actionsCell(c, ctx)),
      ]))),
    ])]));
    return card;
  }

  /* A class on a phone: what it is, where it meets, and then the marks and the buttons
     on a line of their own. */
  function classCard(c, ctx) {
    const facts = [`${c.rows.length} sitting${c.rows.length === 1 ? "" : "s"}`,
                   c.category_label, c.room || c.place || "no room"];
    const who = [`${c.instructor} · ${c.enrolled} enrolled`];
    if (c.waitlisted) who.push(`${c.waitlisted} waitlisted`);

    const cancelled = c.rows.filter(r => r.status === "cancelled").length;
    const marks = [];
    if (c.today) marks.push(el("span", { class: "mini-pill mine" },
      "Today · " + (fmtTime(c.today.time) || "TBA")));
    else if (c.next) marks.push(el("span", { class: "mini-pill" },
      "Next " + fmtDate(c.next.date) + " · " + (fmtTime(c.next.time) || "TBA")));
    else marks.push(el("span", { class: "mini-pill" }, "no sittings left"));
    if (cancelled) marks.push(el("span", { class: "mini-pill hot" },
      cancelled === c.rows.length ? "cancelled" : cancelled + " cancelled"));
    if (c.needs.length) marks.push(el("span", { class: "mini-pill hot" },
      c.needs.length === 1 ? "roster not recorded" : `${c.needs.length} rosters to record`));
    if (c.rate != null) marks.push(el("span", { class: "mini-pill " + (c.rate >= 75 ? "ok" : "") },
      c.rate + "% present"));

    return el("div", { class: "class-card" + (c.today ? " is-today" : "") }, [
      el("div", { class: "class-card-head" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, c.title),
          el("div", { class: "meta" }, facts.join(" · ")),
          el("div", { class: "meta" }, who.join(" · ")),
        ]),
      ]),
      el("div", { class: "class-card-foot" }, [
        el("div", { class: "class-card-marks" }, marks),
        actionsCell(c, ctx),
      ]),
    ]);
  }

  /* Recording a roll is not the same as watching one: the class's own instructor,
     the missionary who runs the place, or the portal admin. A president sees every
     class in the tenant but fills in none of them. */
  function canRun(c, stake) {
    return !!stake.manage || (stake.instructor && c.is_mine);
  }

  function actionsCell(c, ctx) {
    const stake = ctx.stake;
    const acts = el("div", { class: "row-actions" });
    if (stake.student) {
      /* Check-in belongs to a sitting, and the door never closes — so a class whose
         sittings have all passed still has one to be counted into, marked late. */
      if (c.rows.some(r => r.status !== "cancelled"))
        acts.appendChild(el("a", { class: "btn sm", href: `#/checkin/${c.course_id}` },
          [icon("qr", 14), "Check in"]));
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stake.id}/${c.course_id}` },
        [icon("idcard", 14), "Class"]));
      return acts;
    }
    const run = canRun(c, stake);
    const needs = c.needs.length > 0;
    acts.appendChild(el("a", {
      class: "btn" + (run || needs ? " sm" : " secondary sm"),
      href: `#/course/${stake.id}/${c.course_id}` },
      [icon(run || needs ? "check" : "list", 14),
       run || needs ? "Attendance" : "Open"]));
    if (run) {
      /* The code belongs to a sitting, so it is projected for the one that is next — or
         for the last one when the class has already met, because that is the sitting a
         student is checking in to late. */
      const project = c.next || c.last;
      if (project) acts.appendChild(el("button", { class: "btn secondary icon-only",
        title: "Project check-in QR", onclick: () => qrModal(project, stake.id) },
        [icon("qr", 15)]));
      acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Message this class",
        onclick: () => MessagesPage.compose({ audience: "course", course_id: c.course_id,
          course_title: c.title }) }, [icon("send", 15)]));
    }
    return acts;
  }

  // ---------------- class check-in QR ----------------
  /* Projects the same rotating code the classroom screen shows, so a class can be
     opened straight from the list — including classes the viewer does not own,
     which is what portal admins and service missionaries need. */
  function qrModal(row, stakeId, stakeName) {
    const codeEl = el("div", { class: "code-big" }, "······");
    const qrHost = el("div", { class: "qr-box" });
    const statusEl = el("div", { style: "margin-top:var(--sp-8)" });
    const countEl = el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-4)" });
    const tickEl = el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-2)" });
    const body = el("div", {}, [
      el("div", { class: "live-grid" }, [
        el("div", {}, [codeEl, statusEl, countEl, tickEl]),
        qrHost,
      ]),
      el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-10)" },
        "Students scan this or type the six digits — the code changes on its own."),
      el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-4)" },
        "Once the door opens it stays open. A student who checks in late — or days later — "
        + "is still counted, marked late."),
    ]);

    /* The code rotates while the dialog is up, so it has to stop however the dialog is
       left — the X, Escape, a tap on the backdrop, or one of the buttons. `onClose` is the
       one place all four arrive at. */
    let rot = 30, last = 0, closed = false, standing = false;
    function shutdown() { closed = true; clearInterval(liveTimer); }

    modal({
      title: row.title,
      sub: `${fmtDate(row.date)} · ${fmtTime(row.time) || "TBA"} — check-in code`
           + (stakeName ? ` · ${stakeName}` : ""),
      body,
      onClose: shutdown,
      actions: [
        { label: "Open class", kind: "secondary",
          onClick: close => { close(); location.hash = `#/course/${stakeId}/${row.course_id}`; } },
        { label: "Close", kind: "", onClick: close => close() },
      ],
    });

    async function fetchLive() {
      if (closed) return;
      try {
        const live = await API.get(`/api/attendance/sessions/${row.session_id}/live`);
        if (closed) return;
        rot = live.rotation_seconds || 30;
        codeEl.textContent = live.code;
        QR.render(qrHost, JSON.stringify({ s: row.session_id, c: live.code }), 190,
          "Check-in code for this class. The same code is written in digits beside it.");
        statusEl.innerHTML = doorPill(live);
        countEl.textContent = doorLabel(live);
        standing = !!live.open;
      } catch (e) { if (!closed) statusEl.textContent = e.message; }
    }
    function tick() {
      if (closed) return;
      const remaining = rot - (Math.floor(Date.now() / 1000) % rot);
      if (standing) tickEl.textContent = `New code in ${remaining}s`;
      if (Date.now() - last > 4000) { last = Date.now(); fetchLive(); }
    }
    last = Date.now(); fetchLive();
    clearInterval(liveTimer);
    liveTimer = setInterval(tick, 1000);
  }

  function stop() { clearInterval(liveTimer); liveTimer = null; }

  /* The admin console projects the same code for classes the viewer does not own,
     so the QR logic lives in exactly one place. */
  return { mount, stop, showQr: qrModal };
})();
