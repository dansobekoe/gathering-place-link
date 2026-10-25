/* Attendance: every sitting that still waits for a mark.

   A teacher runs two or three classes a week and forgets one of them. A missionary runs
   the whole place and cannot remember which class was left open. The Classes page answers
   "what is happening in this place"; this page answers the narrower question that a pen
   is needed for: which sittings have happened and have nobody been counted in yet.

   The list is ordered by how much it wants doing — the sittings with nobody marked in
   first, then what is still to come, then what has already been recorded. One tap on
   "Mark" opens the same sheet the class page opens, with the same rules. */
const MarkingPage = (() => {
  const { el, icon, empty, tile, fmtDate, fmtTime, shell, render, notice, toast } = UI;

  /* How far back to look. A class that has not met for a term still wants its record
     filled in, but the sittings before that belong to a term nobody is asking about. */
  const DAYS = 90;

  let state = { chip: "all", q: "" };
  let repaint = () => {};

  /* Only the people who hold the pen are offered this screen: the teacher of a class,
     the missionary who runs the place, and the portal admin. A president watches
     attendance in — the Classes page shows what is missing — but does not fill it in. */
  function mayMark(stake) { return !!(stake.manage || stake.instructor); }

  async function mount(target) {
    const ctx = App.ctx();
    const stake = ctx.stake;
    if (!stake) {
      return render(target, shell("marking",
        notice("Attendance", "Pick a stake to see its classes.", "check"), App.nav(), ctx));
    }
    if (!mayMark(stake)) {
      return render(target, shell("marking", notice("Attendance",
        "Attendance is marked by the teacher of the class, the missionary who runs the "
        + "place, or the portal admin. The Classes page shows what is still waiting.",
        "check"), App.nav(), ctx));
    }

    const content = el("div");
    content.appendChild(head(stake));
    const stats = el("div", { class: "stat-grid" });
    const chipBar = el("div", { class: "chips" });
    const list = el("div");
    content.appendChild(stats);
    content.appendChild(chipBar);
    content.appendChild(searchBar());
    content.appendChild(list);
    list.appendChild(UI.loading(3));
    render(target, shell("marking", content, App.nav(), ctx));

    await refresh(stats, chipBar, list, stake);
  }

  /* One answer carries the whole page: every sitting in view, with the state of each.
     The marks left on it are already counted by the server, so the page never has to
     open a class to find out whether a class was recorded. */
  async function refresh(stats, chipBar, list, stake) {
    let data;
    try {
      data = await API.get(`/api/stakes/${stake.id}/classes?scope=auto&days=${DAYS}`);
    } catch (e) {
      list.replaceChildren(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }
    const rows = data.sessions || [];
    const waiting = rows.filter(r => r.needs_attendance);
    const today = rows.filter(r => r.is_today);
    const recorded = rows.filter(r => r.recorded > 0 && !r.is_upcoming);

    stats.replaceChildren(
      tile(waiting.length, "Waiting for a mark", waiting.length ? "nothing recorded yet" : "all recorded"),
      tile(today.length, "Today"),
      tile(recorded.length, "Recorded"));

    const defs = [
      { key: "all", label: "All", n: rows.length },
      { key: "waiting", label: "Waiting", n: waiting.length },
      { key: "today", label: "Today", n: today.length },
      { key: "upcoming", label: "Coming up", n: rows.filter(r => r.is_upcoming).length },
      { key: "recorded", label: "Recorded", n: recorded.length },
    ];
    const btns = defs.map(d => el("button", {
      class: "chip" + (state.chip === d.key ? " on" : ""),
      onclick: () => {
        state.chip = d.key;
        btns.forEach((b, i) => b.classList.toggle("on", defs[i].key === d.key));
        repaint();
      },
    }, [d.label, el("span", { class: "c" }, String(d.n))]));
    chipBar.replaceChildren(...btns);

    repaint = () => {
      const shown = rows.filter(matches);
      list.replaceChildren();
      if (!shown.length) {
        list.appendChild(el("div", { class: "card" }, [empty(
          rows.length ? "No sitting matches this filter."
            : "No class has been scheduled here yet.", "calendar")]));
        return;
      }
      /* Three shelves, in the order a person works in: what is waiting for a mark, what
         is still to come, and what has already been written down. */
      const shelves = [
        { label: "Waiting for a mark", rows: shown.filter(r => r.needs_attendance),
          sort: (a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")) },
        { label: "Coming up", rows: shown.filter(r => r.is_upcoming),
          sort: (a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")) },
        { label: "Recorded", rows: shown.filter(r => !r.needs_attendance && !r.is_upcoming),
          sort: (a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")) },
      ];
      shelves.forEach(shelf => {
        if (!shelf.rows.length) return;
        const card = el("div", { class: "card" });
        card.appendChild(el("h2", { class: "sec-title", style: "margin-top:0" }, shelf.label));
        shelf.rows.sort(shelf.sort).forEach(r => card.appendChild(sittingRow(r, stake.id)));
        list.appendChild(card);
      });
    };
    repaint();
  }

  function matches(r) {
    if (state.chip === "waiting" && !r.needs_attendance) return false;
    if (state.chip === "today" && !r.is_today) return false;
    if (state.chip === "upcoming" && !r.is_upcoming) return false;
    if (state.chip === "recorded" && !(r.recorded > 0)) return false;
    const q = state.q;
    if (q && !(String(r.title).toLowerCase().includes(q)
      || String(r.place || "").toLowerCase().includes(q)
      || String(r.room || "").toLowerCase().includes(q)
      || String(r.instructor || "").toLowerCase().includes(q))) return false;
    return true;
  }

  function head(stake) {
    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h1", { class: "page-title" }, "Attendance"),
        el("div", { class: "page-sub" }, "Sittings that still need a mark"),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn secondary sm", onclick: () => mount(document.getElementById("app")) },
          [icon("refresh", 15), "Refresh"]),
      ]),
    ]);
  }

  function searchBar() {
    const input = el("input", { type: "search", placeholder: "Search class, place or teacher",
      value: state.q, oninput: ev => { state.q = ev.target.value.toLowerCase(); repaint(); } });
    return el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), input]),
    ]);
  }

  /* One sitting, one row that can be read on a phone: the class and the day on a line of
     their own, the state of the record under them, and the button that fills it in on a
     line below. */
  function sittingRow(r, stakeId) {
    const marks = [];
    if (r.needs_attendance) marks.push(el("span", { class: "mini-pill hot" }, "nobody marked in"));
    else if (r.recorded > 0) marks.push(el("span", { class: "mini-pill ok" }, `${r.recorded} marked in`));
    if (r.attendance_rate != null)
      marks.push(el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok" : "") },
                   `${r.attendance_rate}% present`));
    if (r.is_today) marks.push(el("span", { class: "mini-pill mine" }, "today"));
    if (r.status === "cancelled") marks.push(el("span", { class: "mini-pill" }, "cancelled"));

    const acts = el("div", { class: "row-actions" });
    /* The button is offered only where it will be accepted: a sitting with nobody on the
       roster has nobody to count, and a cancelled one is not a record to fill in. */
    if (r.needs_attendance && r.enrolled > 0 && r.status !== "cancelled") {
      acts.appendChild(el("button", { class: "btn sm",
        onclick: e => openMark(r, stakeId, e.currentTarget) },
        [icon("check", 15), "Mark"]));
    }
    acts.appendChild(el("a", { class: "btn secondary sm",
      href: `#/course/${stakeId}/${r.course_id}` }, [icon("list", 15), "Open class"]));

    const where = [r.place, r.room].filter(Boolean)[0];
    const facts = [`${fmtDate(r.date)} · ${r.time ? fmtTime(r.time) : "time to be set"}`];
    if (where) facts.push(where);
    facts.push(`${r.enrolled} on the roster`);
    if (!r.is_mine) facts.push(r.instructor);

    return el("div", { class: "class-card" + (r.is_today ? " is-today" : "") }, [
      el("div", { class: "class-card-head" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, r.title),
          el("div", { class: "meta" }, facts.join(" · ")),
        ]),
      ]),
      el("div", { class: "class-card-foot" }, [
        el("div", { class: "class-card-marks" }, marks),
        acts,
      ]),
    ]);
  }

  /* The roster travels with the sheet, not before it: one tap asks for the class's
     register, and the sheet opens the moment it has it. A teacher who taps twice is
     still one sheet — the sheet itself refuses to open a second time. */
  async function openMark(r, stakeId, btn) {
    btn.disabled = true;
    let roster;
    try {
      roster = await API.get(`/api/stakes/${stakeId}/courses/${r.course_id}/roster`);
    } catch (e) {
      toast(e.message, "err");
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    MarkSheet.open({
      stakeId,
      course: { title: r.title },
      session: { id: r.session_id, scheduled_date: r.date,
                 start_time: r.time, end_time: r.time_end },
      roster,
      onSaved: () => mount(document.getElementById("app")),
    });
  }

  return { mount };
})();
