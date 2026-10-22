/* My attendance: personal history + per-course rollup */
const RecordPage = (() => {
  const { el, icon, statusPill, fmtDate, CATEGORIES } = UI;
  /* The record names how each mark came in, and a student has no use for the method
     codes the portal keeps. These are the same three doors the check-in pages offer. */
  const HOW = {
    manual: "marked by hand",
    qr_dynamic: "marked by scanning the class code",
    qr_badge: "marked by scanning a badge",
  };

  async function mount(target) {
    const ctx = App.ctx();
    const nav = App.nav();
    const page = () => el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, "My attendance"),
        el("div", { class: "page-sub" }, "Your check-in record across every course and stake"),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn secondary sm", onclick: () => window.print() },
          [icon("print", 15), "Print"]),
      ]),
    ]);

    const content = el("div");
    content.appendChild(page());
    content.appendChild(UI.loading(2));
    UI.render(target, UI.shell("record", content, nav, ctx));

    let data;
    try { data = await API.get("/api/attendance/my-history"); }
    catch (e) {
      content.lastChild.replaceWith(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }

    const body = el("div");
    if (!data.history.length) {
      body.appendChild(UI.empty(
        "No attendance recorded yet. Check in at your next class and it will appear here.", "check"));
      content.lastChild.replaceWith(body);
      return;
    }

    // rollup tiles
    body.appendChild(el("div", { class: "sec-title", style: "margin-top:0" }, "By course"));
    const grid = el("div", { class: "stat-grid" });
    data.rollup.forEach(r => grid.appendChild(el("div", { class: "stat" }, [
      el("div", { class: "n" }, r.pct + "%"),
      el("div", { class: "l" }, r.title),
      el("div", { class: "meta muted", style: "font-size:var(--t-fine);margin-top:var(--sp-2)" },
        `${r.present} of ${r.total} sessions`),
    ])));
    body.appendChild(grid);

    // timeline grouped by course
    body.appendChild(el("div", { class: "sec-title" }, "Session history"));
    const byCourse = {};
    data.history.forEach(h => (byCourse[h.course_title] = byCourse[h.course_title] || []).push(h));
    for (const [title, rows] of Object.entries(byCourse)) {
      const card = el("div", { class: "card" }, [
        el("h3", {}, title),
        el("div", { class: "meta muted", style: "margin:-6px 0 var(--sp-8);font-size:var(--t-meta)" },
          rows[0].stake_name + " · " + (CATEGORIES[rows[0].category] || "")),
      ]);
      rows.forEach(r => card.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, fmtDate(r.date)),
          el("div", { class: "meta" }, HOW[r.method] || "marked in the room"),
        ]),
        el("span", { html: statusPill(r.status) }),
      ])));
      body.appendChild(card);
    }

    content.lastChild.replaceWith(body);
  }
  return { mount };
})();
