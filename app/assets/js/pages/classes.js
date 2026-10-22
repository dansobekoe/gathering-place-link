/* Classes: every session in view, narrowed by scope and filter chips.

   The same feed answers four different questions — "what am I teaching today?",
   "what has not been recorded yet?", "what is running across the whole stake?" —
   so the scope toggle only appears for people allowed to ask them (the server
   rejects scope=stake unless the viewer is a president, missionary or admin).

   From here an instructor can open a class, project its check-in QR, or write to
   the whole roster without detouring through the course list. */
const ClassesPage = (() => {
  const { el, icon, shell, loading, empty, render, fmtDate, fmtTime, opensLabel,
          tile, modal, statusPill } = UI;

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
        empty("Pick a stake to see its classes.", "home"), App.nav(), ctx));
    }
    const scope = scopeFor(stake);
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
        el("h2", { class: "page-title" }, "Classes"),
        el("div", { class: "page-sub" },
          `${stake.name} · ${scope === "stake" ? "every class in the stake"
                          : stake.student ? "my enrolled classes" : "classes I teach"}`),
      ]),
      actions,
    ]);
  }

  function body(data, ctx, scope) {
    const stake = ctx.stake;
    const rows = data.sessions;
    const wrap = el("div");

    wrap.appendChild(el("div", { class: "stat-grid" }, [
      tile(data.counts.total, "In view"),
      tile(data.counts.today, "Today"),
      tile(data.counts.upcoming, "Upcoming"),
      tile(data.counts.needs_attendance, "Needs roster"),
    ]));

    const past = rows.filter(r => !r.is_today && !r.is_upcoming).length;
    wrap.appendChild(chips([
      { key: "all", label: "All", n: data.counts.total },
      { key: "today", label: "Today", n: data.counts.today },
      { key: "upcoming", label: "Upcoming", n: data.counts.upcoming },
      { key: "needs", label: "Needs roster", n: data.counts.needs_attendance },
      { key: "past", label: "Held", n: past },
    ]));

    const search = el("input", { type: "search", placeholder: "Search class, room or instructor",
      value: state.q, oninput: ev => { state.q = ev.target.value.toLowerCase(); repaint(); } });
    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
    ]));

    const host = el("div");
    wrap.appendChild(host);
    repaint = () => {
      const shown = rows.filter(matches);
      host.innerHTML = "";
      if (!shown.length) {
        host.appendChild(el("div", { class: "card" }, [empty(
          rows.length ? "No class matches this filter."
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

  function matches(r) {
    if (state.chip === "today" && !r.is_today) return false;
    if (state.chip === "upcoming" && !r.is_upcoming) return false;
    if (state.chip === "needs" && !r.needs_attendance) return false;
    if (state.chip === "past" && (r.is_today || r.is_upcoming)) return false;
    const q = state.q;
    if (q && !(r.title.toLowerCase().includes(q)
      || String(r.instructor || "").toLowerCase().includes(q)
      || String(r.room || "").toLowerCase().includes(q))) return false;
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
  function view(rows, ctx) {
    const card = el("div", { class: "card" });
    const list = el("div", { class: "only-narrow" });
    rows.forEach(r => list.appendChild(sessionCard(r, ctx)));
    card.appendChild(list);

    card.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, "When"), el("th", {}, "Class"), el("th", {}, "Room"),
        el("th", {}, "Instructor"), el("th", { class: "num" }, "Enrolled"),
        el("th", { class: "num" }, "Attendance"), el("th", {}, "")])]),
      el("tbody", {}, rows.map(r => el("tr", { class: r.is_today ? "is-today" : "" }, [
        el("td", { style: "white-space:nowrap" }, [
          el("div", { style: "font-weight:600" }, fmtDate(r.date)),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, fmtTime(r.time) || "TBA"),
          r.is_today ? el("span", { class: "mini-pill mine" }, "today") : null]),
        el("td", {}, [el("div", { style: "font-weight:600" }, r.title),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" },
            r.category_label + (r.status === "cancelled" ? " · cancelled" : ""))]),
        el("td", {}, r.room || r.place || "—"),
        el("td", {}, [r.instructor, r.is_mine && !ctx.stake.student
          ? el("span", { class: "mini-pill mine" }, "mine") : null]),
        el("td", { class: "num" }, String(r.enrolled) + (r.waitlisted ? ` (+${r.waitlisted})` : "")),
        el("td", { class: "num" }, r.attendance_rate == null
          ? (r.needs_attendance ? el("span", { class: "mini-pill hot" }, "unrecorded") : "—")
          : el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok"
                        : r.attendance_rate >= 50 ? "" : "hot") },
            `${r.present}/${r.recorded} · ${r.attendance_rate}%`)),
        el("td", {}, actionsCell(r, ctx)),
      ]))),
    ])]));
    return card;
  }

  function sessionCard(r, ctx) {
    const facts = [r.category_label, r.room || r.place || "no room",
                   `${r.instructor} · ${r.enrolled} enrolled`];
    if (r.waitlisted) facts.push(`${r.waitlisted} waitlisted`);
    if (r.recorded) facts.push(`${r.present}/${r.recorded} present`);
    return el("div", { class: "list-item" + (r.is_today ? " is-today" : "") }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, [r.title, el("span", { html: statusPill(r.status) })]),
        el("div", { class: "meta" }, `${fmtDate(r.date)} · ${fmtTime(r.time) || "TBA"}`),
        el("div", { class: "meta" }, facts.join(" · ")),
        el("div", { class: "meta", style: "display:flex;gap:var(--sp-6);margin-top:var(--sp-6);flex-wrap:wrap" }, [
          r.is_today ? el("span", { class: "mini-pill mine" }, "today") : null,
          r.needs_attendance ? el("span", { class: "mini-pill hot" }, "roster not recorded") : null,
          r.attendance_rate != null
            ? el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok" : "") },
                 r.attendance_rate + "% present") : null,
          r.is_mine && !ctx.stake.student ? el("span", { class: "mini-pill mine" }, "mine") : null,
        ]),
      ]),
      actionsCell(r, ctx),
    ]);
  }

  /* Recording a roll is not the same as watching one: the class's own instructor,
     the missionary who runs the place, or the portal admin. A president sees every
     class in the tenant but fills in none of them. */
  function canRun(r, stake) {
    return !!stake.manage || (stake.instructor && r.is_mine);
  }

  function actionsCell(r, ctx) {
    const stake = ctx.stake;
    const acts = el("div", { class: "row-actions" });
    if (stake.student) {
      acts.appendChild(el("a", { class: "btn sm", href: "#/checkin" }, [icon("qr", 14), "Check in"]));
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stake.id}/${r.course_id}` },
        [icon("idcard", 14), "Class"]));
      return acts;
    }
    const run = canRun(r, stake);
    acts.appendChild(el("a", {
      class: "btn" + (run || r.needs_attendance ? " sm" : " secondary sm"),
      href: `#/course/${stake.id}/${r.course_id}` },
      [icon(run || r.needs_attendance ? "check" : "list", 14),
       run || r.needs_attendance ? "Attendance" : "Open"]));
    if (run) {
      acts.appendChild(el("button", { class: "btn secondary icon-only", title: "Project check-in QR",
        onclick: () => qrModal(r, stake.id) }, [icon("qr", 15)]));
      acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Message this class",
        onclick: () => MessagesPage.compose({ audience: "course", course_id: r.course_id,
          course_title: r.title }) }, [icon("send", 15)]));
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
    const body = el("div", {}, [
      el("div", { class: "live-grid" }, [
        el("div", {}, [codeEl, statusEl, countEl]),
        qrHost,
      ]),
      el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-10)" },
        "Students scan this or type the six digits — the code changes on its own."),
    ]);

    const m = modal({
      title: row.title,
      sub: `${fmtDate(row.date)} · ${fmtTime(row.time) || "TBA"} — check-in code`
           + (stakeName ? ` · ${stakeName}` : ""),
      body,
      actions: [
        { label: "Open class", kind: "secondary",
          onClick: close => { close(); location.hash = `#/course/${stakeId}/${row.course_id}`; } },
        { label: "Close", kind: "", onClick: close => close() },
      ],
    });

    let rot = 30, last = 0, closed = false;
    function shutdown() { closed = true; clearInterval(liveTimer); }
    const origClose = m.close;
    m.close = () => { shutdown(); origClose(); };
    m.panel.querySelectorAll(".mactions .btn").forEach(b => {
      const fn = b.onclick;
      b.onclick = () => { shutdown(); if (fn) fn(m.close); };
    });

    async function fetchLive() {
      if (closed) return;
      try {
        const live = await API.get(`/api/attendance/sessions/${row.session_id}/live`);
        if (closed) return;
        rot = live.rotation_seconds || 30;
        codeEl.textContent = live.code;
        QR.render(qrHost, JSON.stringify({ s: row.session_id, c: live.code }), 190);
        statusEl.innerHTML = live.open ? '<span class="pill green">check-in open</span>'
                                       : '<span class="pill grey">check-in closed</span>';
        if (!live.open) countEl.textContent = opensLabel(live);
      } catch (e) { if (!closed) statusEl.textContent = e.message; }
    }
    function tick() {
      if (closed) return;
      const remaining = rot - (Math.floor(Date.now() / 1000) % rot);
      if (statusEl.querySelector(".pill.green"))
        countEl.textContent = `New code in ${remaining}s`;
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
