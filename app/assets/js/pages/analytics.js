/* Analytics dashboard: per-stake KPIs, attendance & enrolment, completion mix.
   Visible to stake presidents, service missionaries and portal admins; charts render
   as lightweight DOM (no chart library) so they stay crisp and on-brand, with
   PDF + print export. The bar/tile/stack builders come from the UI kit so this page
   and the dashboard can never drift apart visually. */
const AnalyticsPage = (() => {
  const { el, icon, toast, shell, loading, empty, render, tile, barSection,
          stackSection } = UI;

  async function mount(target, stakeId) {
    const ctx = App.ctx();
    const user = ctx.user || API.getUser();
    const isAdmin = !!(user && user.is_super_admin);
    const stakes = (ctx.stakes || []).filter(s => s.monitor);

    if (!stakes.length) {
      return render(target, shell("analytics",
        empty("Analytics is available to the stake presidency, service missionaries and Portal Admins.",
              "shield"), App.nav(), ctx));
    }
    // Portal admins land on the cross-stake overview; a stake id drills into it.
    if (isAdmin && !stakeId) return mountOverview(target, ctx);

    if (!stakes.some(s => s.stake_id === +stakeId) && !stakes.some(s => s.id === +stakeId)) {
      stakeId = (ctx.stake && ctx.stake.id) || stakes[0].id;
    }
    stakeId = +stakeId;
    const hit = stakes.find(s => s.id === stakeId) || stakes.find(s => s.stake_id === stakeId);
    const name = hit ? hit.name || hit.stake_name : "";

    const content = el("div");
    content.appendChild(el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, "Analytics"),
        el("div", { class: "page-sub" }, `${name} · attendance, enrolment and completion`),
      ]),
      actionsRow(stakes, stakeId, isAdmin),
    ]));
    content.appendChild(loading(2));
    render(target, shell("analytics", content, App.nav(), ctx));

    let data;
    try { data = await API.get(`/api/stakes/${stakeId}/analytics`); }
    catch (e) { content.lastChild.replaceWith(empty(e.message, "alert")); return; }
    content.lastChild.replaceWith(renderBody(data));
  }

  // ---------------- area admin overview ----------------
  async function mountOverview(target, ctx) {
    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("h2", { class: "page-title" }, "Area overview"),
      el("div", { class: "page-sub" }, "Every active stake at a glance — open one for its full report"),
    ]));
    content.appendChild(loading(2));
    render(target, shell("analytics", content, App.nav(), ctx));

    let rows;
    try { rows = (await API.get("/api/analytics/overview")).stakes; }
    catch (e) { content.lastChild.replaceWith(empty(e.message, "alert")); return; }
    content.lastChild.replaceWith(overviewBody(rows));
  }

  function overviewBody(rows) {
    if (!rows.length) return empty("No approved stakes are active yet.", "shield");
    const sum = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "stat-grid" }, [
      tile(rows.length, "Stakes"), tile(sum("students"), "Students"),
      tile(sum("enrolled"), "Enrolments"), tile(sum("certificates"), "Certificates"),
    ]));
    wrap.appendChild(el("div", { class: "sec-title" }, "Stakes"));
    const card = el("div", { class: "card" });
    rows.forEach(r => {
      const pct = parseInt(r.avg_attendance, 10) || 0;
      card.appendChild(el("div", { class: "list-item" }, [
        el("span", { class: "stake-dot", style: `background:${r.color}` }),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, r.stake_name),
          el("div", { class: "meta" }, `${r.students} students · ${r.courses} courses · ${r.enrolled} enrolments`),
        ]),
        el("span", { class: "pill " + (pct >= 75 ? "green" : pct >= 50 ? "amber" : "red") },
          r.avg_attendance),
        el("a", { class: "btn secondary sm", href: "#/analytics/" + r.stake_id }, "Open"),
      ]));
    });
    wrap.appendChild(card);
    return wrap;
  }

  function actionsRow(stakes, stakeId, isAdmin) {
    const row = el("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap" });
    if (stakes.length > 1 || isAdmin) {
      const sel = el("select", { onchange: ev => {
        location.hash = ev.target.value ? "#/analytics/" + ev.target.value : "#/analytics";
      }}, [
        isAdmin ? el("option", { value: "" }, "All stakes") : null,
        ...stakes.map(s => el("option", { value: s.id }, s.name)),
      ]);
      sel.value = String(stakeId);
      row.appendChild(sel);
    }
    row.appendChild(el("button", { class: "btn secondary sm", onclick: () => window.print() },
      [icon("print", 15), "Print"]));
    row.appendChild(el("button", { class: "btn sm", onclick: () =>
      API.download(`/api/stakes/${stakeId}/analytics.pdf`, `analytics-stake-${stakeId}.pdf`)
        .then(() => toast("Analytics PDF downloaded")).catch(e => toast(e.message, "err")) },
      [icon("download", 15), "Export PDF"]));
    return row;
  }

  function renderBody(d) {
    const wrap = el("div");

    const grid = el("div", { class: "stat-grid" });
    d.kpis.forEach(k => grid.appendChild(tile(k.value, k.label)));
    wrap.appendChild(grid);

    const charts = el("div", { class: "charts-2" });
    charts.appendChild(barSection("Attendance rate by course", d.attendance_by_course.map(i =>
      ({ name: i.course, pct: i.value, text: i.value + "%" })), { rate: true }));
    charts.appendChild(barSection("Enrolment vs capacity", d.enrollment_by_course.map(i =>
      ({ name: i.course, pct: i.capacity ? i.value / i.capacity * 100 : 0,
         text: i.value + "/" + (i.capacity || 0) })), {}));
    wrap.appendChild(charts);

    wrap.appendChild(stackSection("Completion status", [
      { k: "Completed", v: d.completion.completed, cls: "ok" },
      { k: "In progress", v: d.completion.in_progress, cls: "mid" },
      { k: "Withdrawn", v: d.completion.withdrawn, cls: "bad" },
    ]));
    return wrap;
  }

  return { mount };
})();
