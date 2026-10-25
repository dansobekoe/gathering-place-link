/* Dashboard: one responsive feed that reshapes itself for the signed-in role.

   Instructor → their classes; service missionary / stake president → the whole stake;
   portal admin → any stake they switch to; student → their own classes and record.

   Everything (cards, filters, charts, tables, actions) comes from
   GET /api/stakes/{id}/dashboard so a single load paints the whole screen. */
const DashboardPage = (() => {
  const { el, icon, toast, shell, loading, empty, render, fmtDate, fmtTime,
          tile, barSection, stackSection, statusPill, logAction, logDetail, coverTile,
          seatRow, notice } = UI;

  let filters = {};
  let filtersStake = null;

  async function mount(target) {
    const ctx = App.ctx();
    if (filtersStake !== (ctx.stake ? ctx.stake.id : null)) { filters = {}; filtersStake = ctx.stake ? ctx.stake.id : null; }
    if (!ctx.stake) {
      return render(target, shell("home",
        notice("Dashboard", "Pick a stake to see its dashboard.", "home"), App.nav(), ctx));
    }
    const content = el("div");
    content.appendChild(head(ctx));
    content.appendChild(loading(3));
    render(target, shell("home", content, App.nav(), ctx));

    let data;
    try {
      const qs = query();
      data = await API.get(`/api/stakes/${ctx.stake.id}/dashboard${qs}`);
    } catch (e) {
      content.lastChild.replaceWith(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }
    content.lastChild.replaceWith(body(data, ctx));
  }

  function query() {
    const parts = Object.entries(filters)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return parts.length ? "?" + parts.join("&") : "";
  }

  function head(ctx) {
    const s = ctx.stake;
    const who = String(ctx.user.full_name || "").split(" ")[0] || "there";
    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h1", { class: "page-title" }, `Welcome, ${who}`),
        el("div", { class: "page-sub" },
          `${s.name} · ${s.label || UI.roleLabel(s.role)}` +
          (s.monitor ? ` · whole ${(s.kind || "stake").toLowerCase()}` : " · my classes")),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn secondary sm", onclick: () => window.print() },
          [icon("print", 15), "Print"]),
        el("button", { class: "btn sm", onclick: () => mount(document.getElementById("app")) },
          [icon("refresh", 15), "Refresh"]),
      ]),
    ]);
  }

  function body(data, ctx) {
    if (ctx.stake.student) return memberHome(data, ctx);
    const wrap = el("div");
    const stake = ctx.stake;
    const monitors = !!stake.monitor;

    // ---------- cards ----------
    wrap.appendChild(el("div", { class: "stat-grid" }, data.cards.map(c =>
      tile(c.value, c.label, c.sub))));

    // ---------- filters ----------
    if (data.courses.length || monitors) wrap.appendChild(filterBar(data.filters, ctx));

    // ---------- needs attention ----------
    if (data.attention.length) {
      const card = el("div", { class: "card", style: "border-color:rgba(225,29,72,.32)" });
      card.appendChild(el("h2", { class: "sec-title", style: "color:#be123c;margin-bottom:var(--sp-8)" },
        [icon("alert", 15), " Needs attendance"]));
      data.attention.forEach(a => card.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, a.course),
          el("div", { class: "meta" }, `${UI.plural(a.sessions, "session")} recorded as done with no roster`),
        ]),
        el("a", { class: "btn sm", href: `#/course/${stake.id}/${a.course_id}` },
          [icon("check", 15), "Take attendance"]),
      ])));
      wrap.appendChild(card);
    }

    // ---------- charts ----------
    const charts = el("div", { class: "charts-2" });
    charts.appendChild(barSection("Attendance rate by class",
      data.charts.attendance_by_course.map(i => ({ name: i.name, pct: i.value ?? 0,
        text: i.value == null ? "no rosters yet" : i.value + "%" })), { rate: true }));
    charts.appendChild(barSection("Enrolment vs capacity",
      data.charts.enrolment_by_course.map(i => ({ name: i.name,
        pct: i.capacity ? i.value / i.capacity * 100 : 0,
        text: `${i.value}/${i.capacity || "∞"}` })), {}));
    wrap.appendChild(charts);

    const trend = data.charts.trend.filter(t => t.value != null);
    if (trend.length) {
      wrap.appendChild(barSection("Attendance by meeting day",
        trend.map(t => ({ name: t.label, pct: t.value, text: t.value + "%" })), { rate: true }));
    }
    wrap.appendChild(stackSection("Completion", [
      { k: "Completed", v: data.charts.completion.completed, cls: "ok" },
      { k: "In progress", v: data.charts.completion.in_progress, cls: "mid" },
      { k: "Withdrawn", v: data.charts.completion.withdrawn, cls: "bad" },
    ]));

    // ---------- classes table ----------
    wrap.appendChild(el("h2", { class: "sec-title" }, monitors ? "Classes in view" : "My classes"));
    wrap.appendChild(classesTable(data.courses, ctx));

    // ---------- people + upcoming ----------
    const two = el("div", { class: "stack-2" });
    const left = el("div");
    left.appendChild(el("h2", { class: "sec-title" },
      monitors ? "People" : (stake.student ? "Classmates" : "My students")));
    left.appendChild(peopleTable(data.people, data.people_by_role, ctx));
    two.appendChild(left);

    const right = el("div");
    right.appendChild(el("h2", { class: "sec-title" }, "Next classes"));
    right.appendChild(upcomingCard(data.upcoming, ctx));
    if (data.activity && data.activity.length) {
      right.appendChild(el("h2", { class: "sec-title" }, "Recent activity"));
      right.appendChild(activityCard(data.activity));
    }
    two.appendChild(right);
    wrap.appendChild(two);
    return wrap;
  }

  // ---------------- member home ----------------
  /* What a member opens the portal for: the class they are going to, how far it has run,
     whether they were in it, and who else is coming. The feed under this is what a teacher
     or a leader reads — a stake's numbers are nobody's reason to open a phone at home.

     Nothing here is invented: there is no lesson, event or notification record in this
     portal, so the progress is ClassSession counts and the strip is attendance the
     dashboard has already loaded (data.mine). */
  function memberHome(data, ctx) {
    const wrap = el("div");
    // no filter bar here: a member has a handful of classes, and the search and term
    // narrowers exist to cut a stake's list down to size. Their history is one tap away
    // on "My record".
    const next = nextUpCard(data, ctx);
    if (next) wrap.appendChild(next);
    wrap.appendChild(el("h2", { class: "sec-title" }, "My classes"));
    wrap.appendChild(myClasses(data.courses, ctx));
    wrap.appendChild(recordCard(data.mine));
    wrap.appendChild(el("h2", { class: "sec-title" }, "Classmates"));
    wrap.appendChild(classmatesCard(data.people));
    return wrap;
  }

  const ATT_WORD = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };

  function nextUpCard(data, ctx) {
    const r = data.upcoming[0];
    if (!r) return null;
    const dt = new Date(r.date + "T00:00:00");
    const today = new Date();
    const isToday = dt.toDateString() === today.toDateString();
    // the class plate carries the details the upcoming row does not: who teaches it, where
    const cls = data.courses.find(c => c.id === r.course_id) || {};
    return el("div", { class: "card nextup" }, [
      el("div", { class: "nu-top" }, [
        el("div", { class: "when" }, [
          el("div", { class: "d" }, dt.getDate()),
          el("div", { class: "m" }, dt.toLocaleDateString(undefined, { month: "short" })),
        ]),
        el("div", { class: "grow" }, [
          el("div", { class: "nu-kind" }, isToday ? "Class today" : "Next class"),
          el("div", { class: "nu-name" }, r.course),
          el("div", { class: "nu-meta" }, dt.toLocaleDateString(undefined,
            { weekday: "long" }) + " · " + (r.time ? fmtTime(r.time) : "time not set") +
            (r.time_end ? " – " + fmtTime(r.time_end) : "")),
          el("div", { class: "nu-meta" }, [
            r.room || cls.place || "room not set",
            cls.instructor ? "with " + cls.instructor : null,
            `${r.enrolled} ${r.enrolled === 1 ? "person" : "people"} enrolled`,
          ].filter(Boolean).join(" · ")),
        ]),
      ]),
      el("div", { class: "btns" }, [
        isToday ? el("a", { class: "btn", href: "#/checkin" }, [icon("qr", 15), "Check in"]) : null,
        el("a", { class: isToday ? "btn secondary" : "btn",
                   href: `#/course/${ctx.stake.id}/${r.course_id}` },
          [icon("idcard", 15), "Open class"]),
      ]),
    ]);
  }

  function myClasses(rows, ctx) {
    if (!rows.length) return el("div", { class: "card" },
      [empty("You are not enrolled in a class yet — open Courses to find one.", "book")]);
    const wrap = el("div");
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` +
                `-${String(today.getDate()).padStart(2, "0")}`;
    rows.forEach(r => {
      // The shortcut is offered on the day the class meets, because that is the class the
      // student is standing in. The door itself never shuts: a student checking in for a
      // class that has already met goes to "Check in" in the sidebar, where that sitting
      // is still waiting to be marked late.
      const meetsToday = r.next_session_date === iso;
      wrap.appendChild(el("div", { class: "card" }, [
        el("div", { class: "mc-head" }, [
          // The class picture rides at the leading edge, the way a face does on a roster:
          // one glance tells a member which of their four plates is the choir practice.
          el("div", { class: "mc-who" }, [
            coverTile(r.cover_url),
            el("div", { class: "mc-text" }, [
              el("div", { class: "mc-name" }, r.title),
              el("div", { class: "mc-meta" }, `${r.category_label} · ${r.when}`),
              el("div", { class: "mc-meta" }, `${r.room || "no room set"} · ${r.instructor}`),
            ]),
          ]),
          r.next_session_date ? el("span", { class: "mini-pill" },
            meetsToday ? "Today" : "Next " + fmtDate(r.next_session_date)) : null,
        ]),
        r.sessions_total ? el("div", { class: "meter" },
          [el("i", { style: `width:${Math.round(r.sessions_completed / r.sessions_total * 100)}%` })]) : null,
        el("div", { class: "mc-foot" }, [
          el("div", { class: "mc-count" }, r.sessions_total
            ? `${r.sessions_completed} of ${r.sessions_total} sessions held`
            : "no sessions scheduled yet"),
          el("div", { class: "btns" }, [
            el("a", { class: meetsToday ? "btn secondary sm" : "btn sm",
                      href: `#/course/${ctx.stake.id}/${r.id}` },
              [icon("idcard", 14), "Class"]),
            meetsToday ? el("a", { class: "btn sm", href: "#/checkin" },
              [icon("qr", 14), "Check in"]) : null,
          ]),
        ]),
        el("div", { class: "my-marks" }, r.my_marks
          ? ["You were in ", el("b", {}, `${r.my_present} of ${r.my_marks}`),
             " sessions marked here."]
          : "No roster has been taken in this class yet."),
        // The plate ends on the room, not on the person: one mark per seat, filled
        // as the class fills. The same row opens the class page behind "Class".
        seatRow(r.enrolled, r.capacity, r.waitlisted),
      ]));
    });
    return wrap;
  }

  function recordCard(mine) {
    const m = mine || { rate: null, here: 0, marks: 0, sessions: [], skipped: 0 };
    const card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "mc-head" }, [
      el("div", {}, [
        el("div", { class: "nu-kind" }, "My attendance"),
        el("div", { class: "mc-name" }, m.rate == null ? "Nothing marked yet" : m.rate + "%"),
        el("div", { class: "mc-meta" }, m.marks
          ? `${m.here} of ${m.marks} sessions across my classes`
          : "Your instructors have not taken a roster yet."),
      ]),
      el("a", { class: "btn ghost sm", href: "#/record" }, [icon("list", 14), "Full record"]),
    ]));
    if (!m.sessions.length) return card;
    card.appendChild(el("div", { class: "strip", style: "margin-top:var(--sp-16)",
      "aria-label": "One square for each session marked, oldest first" },
      m.sessions.map(s => el("i", { class: "att-cell " + s.status,
        title: `${s.course_title} · ${fmtDate(s.date)} · ${ATT_WORD[s.status] || s.status}` }))));
    card.appendChild(el("div", { class: "strip-legend" },
      ["present", "late", "excused", "absent"].map(k =>
        el("span", {}, [el("i", { class: "att-cell " + k }), ATT_WORD[k]]))));
    if (m.skipped) {
      card.appendChild(el("div", { class: "hint" },
        `The full record holds ${UI.plural(m.skipped, "earlier session")}.`));
    }
    return card;
  }

  /* A member's roster of classmates: who shares a class, and nothing else. Their roles,
     contact details and attendance figures are not this person's to read — the hub does not
     let a student write to a classmate either, so there is no button to offer. */
  function classmatesCard(people) {
    const card = el("div", { class: "card" });
    if (!people.length) {
      card.appendChild(empty("No one else is on your classes yet.", "users"));
      return card;
    }
    people.forEach(p => card.appendChild(el("div", { class: "list-item" }, [
      UI.avatar(p),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, p.name),
        el("div", { class: "meta" }, p.courses.join(", ")),
      ]),
    ])));
    return card;
  }

  // ---------------- filters ----------------
  function filterBar(f, ctx) {
    const bar = el("div", { class: "filterbar" });
    const sel = (label, key, options, allLabel) => {
      const s = el("select", { onchange: ev => { filters[key] = ev.target.value; reload(); } });
      s.appendChild(el("option", { value: "" }, allLabel));
      options.forEach(o => s.appendChild(el("option", { value: o.value }, o.label)));
      s.value = String(filters[key] ?? "");
      return el("div", { class: "f" }, [el("label", {}, label), s]);
    };
    const search = el("input", { type: "search", placeholder: "Search class title",
      value: filters.q || "", onkeydown: ev => { if (ev.key === "Enter") { filters.q = ev.target.value; reload(); } } });
    bar.appendChild(el("div", { class: "f search" }, [
      el("label", {}, "Search"), icon("search", 15), search,
    ]));
    /* Every term this stake has kept, archived ones included: analytics is where a closed
       term's records are looked up, so hiding it here would lose the history. */
    bar.appendChild(sel("Term", "term_id", f.terms.map(t => ({ value: t.id,
      label: t.name + (t.is_active ? " · current" : "")
        + (t.is_archived ? " · archived" : "") })), "All terms"));
    // a student filters a handful of their own classes: the venue and programme
    // narrowers are for the people who oversee a whole stake or their own teaching
    if (!ctx.stake.student) {
      bar.appendChild(sel("Gathering place", "place_id", f.places.map(p => ({ value: p.id, label: p.name })),
        "All places"));
      bar.appendChild(sel("Room", "room_id", f.rooms.map(r => ({ value: r.id, label: r.name })), "All rooms"));
      bar.appendChild(sel("Category", "category", f.categories.map(c => ({ value: c.value, label: c.label })),
        "All categories"));
    }
    const anyFilter = Object.values(filters).some(v => v !== "" && v != null);
    if (anyFilter) {
      bar.appendChild(el("button", { class: "btn ghost sm clear", onclick: () => { filters = {}; reload(); } },
        [icon("x", 14), "Clear"]));
    }
    return bar;
  }
  function reload() { mount(document.getElementById("app")); }

  // ---------------- classes ----------------
  function classesTable(rows, ctx) {
    const stakeId = ctx.stake.id;
    if (!rows.length) return el("div", { class: "card" }, [empty(
      ctx.stake.student ? "You are not enrolled in a class yet — open Courses to enroll."
                        : "No classes match these filters.", "book")]);
    const card = el("div", { class: "card" });
    // narrow screens: one card per class; wide: a comparable table
    const list = el("div", { class: "only-narrow" });
    rows.forEach(r => list.appendChild(classCard(r, stakeId, ctx)));
    card.appendChild(list);

    const table = el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, "Class"), el("th", {}, "When"), el("th", {}, "Room"),
        el("th", {}, "Instructor"), el("th", { class: "num" }, "Enrolled"),
        el("th", { class: "num" }, "Attendance"), el("th", {}, "")])]),
      el("tbody", {}, rows.map(r => el("tr", {}, [
        el("td", {}, [el("div", { style: "font-weight:600" }, r.title),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, r.category_label)]),
        el("td", {}, r.when),
        el("td", {}, r.room || "—"),
        el("td", {}, [r.instructor, r.is_mine ? el("span", { class: "mini-pill mine" }, "mine") : null]),
        el("td", { class: "num" }, r.capacity ? `${r.enrolled}/${r.capacity}` : String(r.enrolled)),
        el("td", { class: "num" }, r.attendance_rate == null ? "—"
          : el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok"
                        : r.attendance_rate >= 50 ? "" : "hot") }, r.attendance_rate + "%")),
        el("td", {}, actionsCell(r, stakeId, ctx)),
      ]))),
    ])]);
    card.appendChild(table);
    return card;
  }

  /* The buttons a class can be reached by. On the wide table the next date rides
     along with them; on the card it sits with the facts about the class instead,
     because a date is information and a button is an action. */
  function actionsCell(r, stakeId, ctx) {
    const acts = el("div", { class: "row-actions" });
    if (ctx.stake.student) {
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("idcard", 14), "Class"]));
      acts.appendChild(el("a", { class: "btn sm", href: "#/checkin" }, [icon("qr", 14), "Check in"]));
      return acts;
    }
    if (r.needs_attendance) {
      acts.appendChild(el("a", { class: "btn sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("check", 14), `Roster (${r.needs_attendance})`]));
    } else if (r.is_mine || ctx.stake.manage) {
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("list", 14), "Attendance"]));
    }
    if (r.next_session_id) {
      acts.appendChild(el("span", { class: "mini-pill" }, "Next " + fmtDate(r.next_session_date)));
    }
    return acts;
  }

  function classButtons(r, stakeId, ctx) {
    const acts = el("div", { class: "row-actions" });
    if (ctx.stake.student) {
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("idcard", 14), "Class"]));
      acts.appendChild(el("a", { class: "btn sm", href: "#/checkin" }, [icon("qr", 14), "Check in"]));
      return acts;
    }
    if (r.needs_attendance) {
      acts.appendChild(el("a", { class: "btn sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("check", 14), `Roster (${r.needs_attendance})`]));
    } else if (r.is_mine || ctx.stake.manage) {
      acts.appendChild(el("a", { class: "btn secondary sm", href: `#/course/${stakeId}/${r.id}` },
        [icon("list", 14), "Attendance"]));
    }
    return acts;
  }

  /* A class on a phone: the picture and the name of the class, the facts under them,
     then the marks and the buttons on a line of their own. Sharing one line would
     squeeze the name of the class into a single word wide, which is how a title
     becomes unreadable. */
  function classCard(r, stakeId, ctx) {
    return el("div", { class: "class-card" }, [
      el("div", { class: "class-card-head" }, [
        coverTile(r.cover_url),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, r.title),
          el("div", { class: "meta" }, `${r.category_label} · ${r.when}`),
          el("div", { class: "meta" }, `${r.room || "no room"} · ${r.instructor}` +
            ` · ${r.enrolled}${r.capacity ? "/" + r.capacity : ""} enrolled` +
            (r.waitlisted ? ` · ${r.waitlisted} waitlisted` : "")),
        ]),
      ]),
      el("div", { class: "class-card-foot" }, [
        el("div", { class: "class-card-marks" }, [
          r.next_session_date ? el("span", { class: "mini-pill" },
            "Next " + fmtDate(r.next_session_date)) : null,
          r.attendance_rate == null ? el("span", { class: "mini-pill" }, "no roster yet")
            : el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok" : "") },
                 r.attendance_rate + "% attendance"),
          r.sessions_completed ? el("span", { class: "mini-pill" },
            `${r.sessions_completed}/${r.sessions_total} held`) : null,
          r.is_mine ? el("span", { class: "mini-pill mine" }, "mine") : null,
        ]),
        classButtons(r, stakeId, ctx),
      ]),
    ]);
  }

  // ---------------- people ----------------
  function peopleTable(people, byRole, ctx) {
    const card = el("div", { class: "card" });
    const chips = el("div", { style: "display:flex;gap:var(--sp-6);flex-wrap:wrap;margin-bottom:var(--sp-10)" });
    byRole.forEach(r => chips.appendChild(el("span", { class: "mini-pill" },
      `${r.label} · ${r.count}`)));
    card.appendChild(chips);
    if (!people.length) {
      card.appendChild(empty(ctx.stake.instructor
        ? "No students on your rosters yet." : "No one else in this stake yet.", "users"));
      return card;
    }
    const list = el("div", { class: "only-narrow" });
    people.slice(0, 40).forEach(p => list.appendChild(el("div", { class: "list-item" }, [
      UI.avatar(p),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, p.name),
        el("div", { class: "meta" }, `${p.role_label}${p.ward ? " · " + p.ward : ""}`),
        el("div", { class: "meta" }, p.course_count
          ? UI.plural(p.course_count, "class") : "no classes"),
      ]),
      personActions(p, ctx),
    ])));
    card.appendChild(list);

    card.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", {}, "Person"), el("th", {}, "Role"), el("th", {}, "Classes"),
        el("th", { class: "num" }, "Attendance"), el("th", {}, "")])]),
      el("tbody", {}, people.slice(0, 60).map(p => el("tr", {}, [
        el("td", {}, [el("div", { style: "font-weight:600" }, p.name),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, p.email || p.ward || "")]),
        el("td", {}, el("span", { class: "mini-pill" }, p.role_label)),
        el("td", {}, p.courses.length ? p.courses.join(", ") : "—"),
        el("td", { class: "num" }, p.attendance_rate == null ? "—" : p.attendance_rate + "%"),
        el("td", {}, personActions(p, ctx)),
      ]))),
    ])]));
    return card;
  }

  function personActions(p, ctx) {
    const acts = el("div", { class: "row-actions" });
    if (p.certificate_issued) acts.appendChild(el("span", { class: "mini-pill ok" }, "certified"));
    if (Ctx.can(ctx.stake, "contacts")) {
      acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Message " + p.name,
        onclick: () => MessagesPage.composeDirect(p) }, [icon("send", 14)]));
    }
    return acts;
  }

  // ---------------- upcoming / activity ----------------
  function upcomingCard(rows, ctx) {
    const card = el("div", { class: "card" });
    if (!rows.length) return el("div", { class: "card" }, [empty("Nothing scheduled ahead.", "calendar")]);
    rows.forEach(r => card.appendChild(el("div", { class: "list-item" }, [
      el("div", { class: "when" }, [
        el("div", { class: "d" }, new Date(r.date + "T00:00:00").getDate()),
        el("div", { class: "m" }, new Date(r.date + "T00:00:00")
          .toLocaleDateString(undefined, { month: "short" })),
      ]),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.course),
        el("div", { class: "meta" }, `${r.time ? fmtTime(r.time) : "TBA"}` +
          `${r.room ? " · " + r.room : ""} · ${r.enrolled} enrolled`),
      ]),
      el("a", { class: "btn ghost sm", href: `#/course/${ctx.stake.id}/${r.course_id}` }, "Open"),
    ])));
    return card;
  }

  function activityCard(logs) {
    const card = el("div", { class: "card" });
    logs.slice(0, 6).forEach(l => card.appendChild(el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "meta", style: "font-weight:600;color:var(--ink)" },
          logAction(l.action)),
        el("div", { class: "meta" }, [l.actor, logDetail(l.detail)]
          .filter(Boolean).join(" · ")),
      ]),
      el("div", { class: "meta", style: "flex:none" },
        fmtDate(String(l.created_at || "").slice(0, 10))),
    ])));
    return card;
  }

  return { mount };
})();
