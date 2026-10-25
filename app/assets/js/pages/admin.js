/* Portal control — the console for the whole platform.

   A portal admin does not belong to a stake to run one, so this page is organised
   around decisions rather than tenancy: which new account is waiting to be let in,
   which stake or district is not open yet, who asked to join a place they found in
   the directory, which class has no roster recorded, what happened last.
   Every approval lives behind this desk — a president watches over a gathering place,
   he does not open one or let people into it.
   Every write here goes through /api/admin/*, the widest surface in the API. */
const AdminPage = (() => {
  const { el, icon, toast, shell, loading, empty, render, fmtDate, fmtTime, ago, modal, statusPill,
          roleLabel, tile, avatar, logAction, logDetail, logKind } = UI;

  const TABS = [["overview", "Overview"], ["approvals", "Approvals"],
                ["requests", "Data requests"], ["stakes", "Stakes"],
                ["people", "People"], ["classes", "Classes"], ["activity", "Activity"],
                ["mail", "Mail"]];
  /* The roles the console can hand out inside a stake or a district. The server takes
     any Role at /users/{id}/roles; portal control itself is a separate switch
     (/users/{id}/admin-flag), so "Portal Admin" is deliberately not offered here. */
  const STAKE_ROLES = ["stake_president", "district_president", "service_missionary",
                       "instructor", "student"];
  /* Leaders watch over a gathering place; the missionary holds the paperwork. */
  const LEADER_ROLES = ["stake_president", "district_president", "service_missionary"];
  const MISSIONARY = "service_missionary";
  const STAKE_STATES = [["active", "Active"], ["pending_approval", "Awaiting approval"],
                        ["suspended", "Suspended"], ["archived", "Archived"]];
  const TENANT_KINDS = [["all", "Stakes and districts"], ["stake", "Stakes only"],
                        ["district", "Districts only"]];
  const MAIL_KINDS = { signup_received: "Sign-up received", account_approved: "Account approved",
                       account_rejected: "Account turned down",
                       account_created: "Account made for you",
                       password_reset: "Password reset", email_verify: "Confirm your address",
                       deletion_done: "Removal confirmed", message: "Letter" };
  const TAB_KEY = "gp_admin_tab";

  let tab = localStorage.getItem(TAB_KEY) || "overview";
  let choseTab = false;      // a clicked tab beats the queue's claim on where to land
  /* Whether a decision sends a letter to the person. The queue loads it; the copy in
     the turn-down box waits on it, so the console never promises post it cannot send. */
  let mailExpected = true;
  let stats = {}, stakes = [];
  let tilesHost = null, panelHost = null, tabBtns = null;
  let classStake = null;
  const filt = { stakeChip: "all", stakeKind: "all", stakeQ: "", personChip: "all",
                 personQ: "", classChip: "all", classQ: "", auditKind: "all", auditStake: "" };

  // ---------------- mount ----------------
  async function mount(target) {
    const content = el("div");
    content.appendChild(head());
    content.appendChild(loading(3));
    render(target, shell("admin", content, App.nav(), App.ctx()));

    try {
      const [s, k] = await Promise.all([
        API.get("/api/admin/stats"), API.get("/api/admin/stakes"),
      ]);
      stats = s; stakes = k;
    } catch (e) {
      content.lastChild.replaceWith(el("div", { class: "card" },
        [empty("Could not load the console: " + e.message, "alert")]));
      return;
    }

    /* Something waiting is the reason this console exists, so the console opens on it
       — until the admin clicks somewhere else, which is a choice we respect. */
    if (!choseTab && waitingCount() && tab === "overview") tab = "approvals";

    const built = el("div");
    tilesHost = el("div", { class: "stat-grid" });
    panelHost = el("div");
    built.appendChild(tilesHost);
    built.appendChild(tabbar());
    built.appendChild(panelHost);
    content.lastChild.replaceWith(built);
    paintTiles();
    paintTabs();
    paint();
  }

  /* Everything still needing a decision, counted from /api/admin/stats. */
  function waitingCount() {
    return (stats.accounts_pending || 0) + (stats.membership_requests || 0)
      + (stats.stakes_pending || 0);
  }

  function head() {
    return el("div", { class: "page-head stack-head" }, [
      el("div", {}, [
        el("h1", { class: "page-title" }, "Portal control"),
        el("div", { class: "page-sub" },
          "Let new accounts in, open stakes and districts, register and correct any person, reset passwords, and write to the whole portal."),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn sm", onclick: () => announceModal() },
          [icon("send", 15), "Announce"]),
        el("button", { class: "btn secondary sm", onclick: () => registerModal(null) },
          [icon("userplus", 15), "Register person"]),
        el("button", { class: "btn secondary sm", onclick: () => stakeModal(null) },
          [icon("plus", 15), "New stake or district"]),
      ]),
    ]);
  }

  function tabbar() {
    const bar = el("div", { class: "tabs scroll" });
    tabBtns = {};
    TABS.forEach(def => {
      const b = el("button", {
        class: tab === def[0] ? "active" : "",
        onclick: () => {
          tab = def[0]; choseTab = true; localStorage.setItem(TAB_KEY, def[0]);
          paintTabs();
          paint();
        },
      }, tabLabel(def));
      tabBtns[def[0]] = b;
      bar.appendChild(b);
    });
    return bar;
  }

  /* The two queues that hold people waiting carry their count in the label, so a
     decision is visible from whichever tab the admin happens to be reading. */
  function tabLabel(def) {
    const n = def[0] === "approvals"
      ? (stats.accounts_pending || 0) + (stats.membership_requests || 0)
      : def[0] === "requests" ? (stats.deletion_requests || 0) : 0;
    return n ? `${def[1]} · ${n}` : def[1];
  }

  function paintTabs() {
    if (!tabBtns) return;
    TABS.forEach(def => {
      const b = tabBtns[def[0]];
      if (!b) return;
      b.textContent = tabLabel(def);
      b.classList.toggle("active", def[0] === tab);
    });
  }

  function paintTiles() {
    tilesHost.innerHTML = "";
    [tile(stats.stakes_active, "Open stakes",
          `${stats.stakes_total} registered · ${stats.districts_total || 0} districts`),
     tile(stats.accounts_pending, "Accounts to let in",
          stats.accounts_pending ? "waiting on a decision" : "nobody is waiting"),
     tile(stats.membership_requests, "Requests to join",
          stats.membership_requests ? "found in the directory" : "queue is clear"),
     tile(stats.deletion_requests, "Removals asked for",
          stats.deletion_requests ? "waiting to be carried out" : "nothing asked"),
     tile(stats.stakes_pending, "Stakes not opened yet",
          stats.stakes_pending ? "awaiting approval" : "every stake decided"),
     tile(stats.users_total, "People", "across the portal"),
     tile(stats.courses_active, "Open classes",
          `${UI.plural(stats.enrollments_total, "enrolment")} · ` +
          `${stats.courses_unassigned || 0} without a teacher`)]
      .forEach(t => tilesHost.appendChild(t));
  }

  async function paint() {
    if (!panelHost) return;
    panelHost.innerHTML = "";
    panelHost.appendChild(loading(2));
    const panel = { overview: panelOverview, approvals: panelApprovals,
                    requests: panelRequests, stakes: panelStakes,
                    people: panelPeople, classes: panelClasses, activity: panelActivity,
                    mail: panelMail }[tab];
    let node;
    try { node = await panel(); }
    catch (e) { node = el("div", { class: "card" }, [empty(e.message, "alert")]); }
    panelHost.innerHTML = "";
    panelHost.appendChild(node);
  }

  /* Writes refresh the numbers and the stake cache, then redraw the open section. */
  async function reload() {
    const [s, k] = await Promise.all([
      API.get("/api/admin/stats"), API.get("/api/admin/stakes"),
    ]);
    stats = s; stakes = k;
    paintTiles();
    paintTabs();
    paint();
  }

  // ---------------- overview ----------------
  async function panelOverview() {
    const [unrecorded, logs] = await Promise.all([
      API.get("/api/admin/sessions/pending?days_back=7"),
      API.get("/api/admin/audit?limit=10"),
    ]);
    const pending = stakes.filter(s => s.status === "pending_approval");
    const wrap = el("div");

    wrap.appendChild(el("div", { class: "charts-2" }, [
      card([
        cardTitle("Approval queue", pending.length
          ? el("span", { class: "mini-pill hot" }, pending.length + " waiting") : null),
        pending.length ? el("div", {}, pending.map(approvalRow))
                       : el("div", { class: "muted", style: "font-size:var(--t-ui)" },
                           "Every stake has been decided. New requests appear here."),
        el("a", { class: "linkbtn", href: "#/admin", style: "margin-top:var(--sp-10)",
                  onclick: ev => { ev.preventDefault(); pickTab("approvals"); } },
          "Accounts and requests to join →"),
      ]),
      card([
        cardTitle("Attendance not recorded", unrecorded.sessions.length
          ? el("span", { class: "mini-pill hot" }, unrecorded.sessions.length + " open") : null),
        unrecorded.sessions.length ? el("div", {}, unrecorded.sessions.map(unrecordedRow))
          : el("div", { class: "muted", style: "font-size:var(--t-ui)" },
              "Nothing from the last week is missing a roster."),
      ]),
    ]));

    wrap.appendChild(el("h2", { class: "sec-title" }, "Latest portal activity"));
    wrap.appendChild(card([
      logs.length ? el("div", {}, logs.map(logRow))
                  : el("div", { class: "muted", style: "font-size:var(--t-ui)" }, "No activity yet."),
      el("a", { class: "linkbtn", href: "#/admin", style: "margin-top:var(--sp-10)",
                onclick: ev => { ev.preventDefault(); pickTab("activity"); } },
        "See the full trail →"),
    ]));
    return wrap;
  }

  function pickTab(key) {
    tab = key; choseTab = true; localStorage.setItem(TAB_KEY, key);
    paintTabs();
    paint();
  }

  /* A stake and a district are one kind of tenant to this console; only the word
     differs, and getting it right is how an admin tells them apart in a queue. */
  function kindWord(s) {
    return (s && s.org_kind === "district") ? "District" : "Stake";
  }

  /* What the row under a tenant's name says: which kind it is and where it sits.
     Two tenants called "Ofankor" are told apart here, so both go on the same line.
     A missing address is named, not left blank: this console is where the admin can
     type it in, so the row has to say what is absent as well as what is there. */
  function whereLine(s) {
    return [kindWord(s), s.address || "No address recorded"].filter(Boolean).join(" · ");
  }

  // ---------------- approvals ----------------
  /* Two queues, and both are decisions nobody else on this portal can make: an
     account that has never been let in, and a person who found their gathering place
     in the directory and asked for a seat. A president is never asked to decide. */
  async function panelApprovals() {
    const wrap = el("div");
    wrap.appendChild(loading(2));
    let accounts, requests, turned;
    try {
      [accounts, requests, turned] = await Promise.all([
        API.get("/api/admin/accounts?status=pending"),
        API.get("/api/admin/membership-requests"),
        API.get("/api/admin/accounts?status=rejected"),
      ]);
    } catch (e) {
      wrap.innerHTML = "";
      wrap.appendChild(card([empty(e.message, "alert")]));
      return wrap;
    }
    wrap.innerHTML = "";
    mailExpected = accounts.mail_expected !== false;

    wrap.appendChild(queueCard(
      "Accounts to let in",
      accounts.count
        ? `${accounts.count} registration${accounts.count === 1 ? "" : "s"} waiting on you`
        : "Every account on this portal passes through here.",
      accounts.accounts.map(accountRow),
      "Nobody is waiting for a decision. That is the state to keep."));

    wrap.appendChild(queueCard(
      "Requests to join",
      requests.length
        ? `${requests.length} ${requests.length === 1 ? "person asks" : "people ask"} for a seat`
        : "From someone who searched the directory for their place, once their account "
          + "is open.",
      requests.map(requestRow),
      "Nobody is asking for a seat right now."));

    if (turned.accounts.length) {
      wrap.appendChild(queueCard(
        "Turned away",
        `${turned.count} ${turned.count === 1 ? "registration" : "registrations"} closed`,
        turned.accounts.slice(0, 8).map(turnedRow),
        "Nothing here is final — let someone in and their account opens again."));
    }
    return wrap;
  }

  function queueCard(title, note, rows, whenEmpty) {
    const sec = el("div");
    sec.appendChild(el("h2", { class: "sec-title", style: "margin-top:var(--sp-22)" }, title));
    sec.appendChild(el("div", { class: "meta", style: "margin-bottom:var(--sp-8)" }, note));
    if (!rows.length) { sec.appendChild(empty(whenEmpty, "check")); return sec; }
    const card_ = card([]);
    rows.forEach(r => card_.appendChild(r));
    sec.appendChild(card_);
    return sec;
  }

  /* What a registration actually asked for, in one line per thing. A person can
     register a stake and ask to teach in it in the same minute. */
  function asksOf(a) {
    const lines = [];
    if (a.asking_to_run) {
      const run = a.asking_to_run;
      lines.push(`Wants to open the ${run.kind === "district" ? "district" : "stake"} `
                 + `“${run.name}”`);
    }
    (a.memberships || []).forEach(m => {
      lines.push(`Asks to join ${m.stake_name || stakeName(m.stake_id)} as `
                 + `${(m.role_label || roleLabel(m.role)).toLowerCase()}`);
    });
    if (!lines.length) lines.push("Wants an account, no gathering place named yet");
    return lines;
  }

  function waitedText(a) {
    if (!a.created_at) return "";
    const days = a.waiting_days || 0;
    return `registered ${when(a.created_at)}` + (days ? ` · waiting ${days} ${days === 1 ? "day" : "days"}` : "");
  }

  function accountRow(a) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, a.name),
        el("div", { class: "meta" }, [a.email, a.phone].filter(Boolean).join(" · ")),
        /* A person with no mailbox has no code to send, so what decides their account is
           the admin speaking to them. The queue says which of the two it is, because the
           two are confirmed in different ways. */
        a.confirm_by === "phone"
          ? el("div", { class: "meta" }, "No mailbox — confirm the number in person")
          : null,
        ...asksOf(a).map(t => el("div", { class: "meta" }, t)),
        el("div", { class: "meta" }, waitedText(a)),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn sm", onclick: () => decideAccount(a, true) },
          [icon("check", 14), "Let in"]),
        el("button", { class: "btn ghost sm", onclick: () => declineAccountModal(a) },
          "Turn down"),
      ]),
    ]);
  }

  async function decideAccount(a, approve) {
    try {
      await API.post(`/api/admin/accounts/${a.id}/approval`, { approve });
      /* Letting someone in is only half the journey when they came through the
         directory: their seat is a separate decision in the queue below, and a person
         who can sign in to nothing will write to ask why. */
      const seat = approve && (a.memberships || [])
        .some(m => m.status === "pending_approval");
      toast(approve ? (seat ? `${a.name} can sign in — confirm their seat below`
                            : `${a.name} can now sign in`)
                    : "Registration turned down");
      reload();
    } catch (e) { toast(e.message, "err"); }
  }

  /* The reason is not for our files — it is the body of the letter they receive,
     so the box comes before the button. With no mailbox the reason still rides with
     the decision, but the box says what reaches the person rather than promising post. */
  function declineAccountModal(a) {
    const note = el("textarea", { rows: "3",
      placeholder: "What is missing, or whom to speak with" });
    modal({
      title: "Turn down this registration",
      sub: `${a.name} · ${a.email || a.phone || "no address on file"}`,
      body: el("div", {}, [
        el("div", { class: "meta", style: "margin-bottom:var(--sp-10)" },
          mailExpected
            ? "They will be emailed this wording, and will not be able to sign in "
              + "until you let them in."
            : "They will not be able to sign in until you let them in. No mailbox is "
              + "connected yet, so this reason stays here — see the Mail tab."),
        field("Reason", note),
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Turn down", kind: "danger", onClick: async c => {
            try {
              await API.post(`/api/admin/accounts/${a.id}/approval`,
                             { approve: false, note: note.value.trim() || null });
              c(); toast(mailExpected ? "Turned down, and told why"
                                      : "Registration turned down"); reload();
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });
  }

  function requestRow(r) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.name),
        el("div", { class: "meta" },
          `Asks to join ${r.stake_name} as ${(r.role_label || roleLabel(r.role)).toLowerCase()}`
          + ` · ${r.kind === "district" ? "district" : "stake"}`),
        el("div", { class: "meta" }, [r.email, r.requested_at ? when(r.requested_at) : ""]
          .filter(Boolean).join(" · ")),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn sm", onclick: () => decideRequest(r, true) },
          [icon("check", 14), "Confirm"]),
        el("button", { class: "btn ghost sm", onclick: () => decideRequest(r, false) },
          "Decline"),
      ]),
    ]);
  }

  async function decideRequest(r, approve) {
    if (!approve) {
      const ok = await UI.confirm(
        `${r.name} will not be added to ${r.stake_name}, and the request is removed. `
        + `They can ask again from the directory.`,
        { danger: true, okLabel: "Decline", title: "Decline this request?" });
      if (!ok) return;
    }
    const query = `?user_id=${r.user_id}&stake_id=${r.stake_id}&approve=${approve}`;
    try {
      await API.post("/api/admin/membership-requests/decision" + query);
      toast(approve ? `${r.name} is now in ${r.stake_name}` : "Request declined");
      reload();
    } catch (e) { toast(e.message, "err"); }
  }

  function turnedRow(a) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, a.name),
        el("div", { class: "meta" }, a.email || a.phone || "no address on file"),
        ...asksOf(a).map(t => el("div", { class: "meta" }, t)),
      ]),
      el("div", { class: "row-actions" }, [
        el("span", { html: statusPill("rejected") }),
        el("button", { class: "btn secondary sm", onclick: () => decideAccount(a, true) },
          "Let in after all"),
      ]),
    ]);
  }

  function approvalRow(s) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, s.name),
        el("div", { class: "meta" },
          `${kindWord(s)} requested ${fmtDate(s.created_at)}`
          + (s.address ? ` · ${s.address}` : " · No address given with the request")),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn sm", onclick: () => decide(s, true) },
          [icon("check", 14), "Approve"]),
        el("button", { class: "btn ghost sm", onclick: () => decide(s, false) }, "Reject"),
      ]),
    ]);
  }

  function unrecordedRow(r) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.course),
        el("div", { class: "meta" },
          `${fmtDate(r.date)} · ${stakeName(r.stake_id)} · ${r.enrolled} on the roster`),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn ghost sm", onclick: () => openCourse(r.stake_id, r.course_id) },
          [icon("check", 14), "Record"]),
      ]),
    ]);
  }

  function logRow(l) {
    const who = [l.actor_name || "System", l.stake_name].filter(Boolean).join(" — ");
    const what = logAction(l.action);
    const note = logDetail(l.detail);
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title", style: "font-size:var(--t-ui)" }, who),
        el("div", { class: "meta" }, note ? `${what} — ${note}` : what),
      ]),
      el("div", { style: "flex:none;text-align:right" }, [
        el("div", { class: "meta", style: "white-space:nowrap" }, when(l.created_at)),
      ]),
    ]);
  }

  // ---------------- data requests ----------------
  /* A person reads their own record and takes their own copy without asking anyone, so
     the only thing that waits here is a removal. It is the one action on this console
     that cannot be undone from the screen, which is why the card above the queue spells
     out what goes and what stays before any button is pressed. */
  async function panelRequests() {
    const wrap = el("div");
    wrap.appendChild(loading(2));
    let data;
    try { data = await API.get("/api/admin/data-requests?status=all"); }
    catch (e) {
      wrap.innerHTML = "";
      wrap.appendChild(card([empty(e.message, "alert")]));
      return wrap;
    }
    wrap.innerHTML = "";
    mailExpected = data.mail_expected !== false;

    const rows = data.requests || [];
    const waiting = rows.filter(r => r.status === "open" && r.kind === "deletion");
    const trail = rows.filter(r => r.status !== "open");

    wrap.appendChild(card([
      el("h2", { class: "sec-title", style: "margin-top:0" }, "What carrying out a removal does"),
      el("div", { class: "meta" }, "Gone: the name, the address, the phone and WhatsApp "
        + "numbers, the ward or branch, the emergency contact, the photograph, the letters "
        + "sent to that address and the sign-in codes. The account stops working."),
      el("div", { class: "meta", style: "margin-top:var(--sp-6)" }, "Kept: the enrolment and "
        + "attendance rows with the name taken out of them, so a term still adds up for the "
        + "leaders who keep the gathering place. That is what the privacy policy promises."),
      el("div", { class: "hint", style: "margin-top:var(--sp-10)" }, mailExpected
        ? "The person is written to at the address being removed, so they can see it is "
          + "done even after they can no longer sign in."
        : "No mailbox is connected, so the confirmation letter only files itself in the "
          + "Mail tab. Tell the person yourself when it is carried out."),
    ]));

    wrap.appendChild(queueCard("Waiting to be carried out",
      waiting.length
        ? `${waiting.length} ${waiting.length === 1 ? "person asks" : "people ask"} to be taken off the portal`
        : "Nobody has asked to be removed.",
      waiting.map(dataRequestRow),
      "Nothing is waiting. A request appears here the moment someone sends one from their "
      + "profile screen."));

    wrap.appendChild(queueCard("The trail",
      `${trail.length} ${trail.length === 1 ? "entry" : "entries"} — copies taken and requests decided`,
      trail.slice(0, 40).map(loggedRequest),
      "Every copy a person takes of their own record is filed here, and so is every "
      + "decision made above."));

    return wrap;
  }

  function dataRequestRow(r) {
    const waited = r.waiting_days >= 1
      ? ` · ${r.waiting_days} ${r.waiting_days === 1 ? "day" : "days"} with it` : "";
    return el("div", { class: "list-item" }, [
      avatar({ full_name: r.name, photo_url: r.photo_url }),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.name),
        el("div", { class: "meta" }, r.email || "no address on file"),
        el("div", { class: "meta" }, (r.memberships || []).length
          ? r.memberships.map(m => `${m.role_label} — ${m.stake_name}`).join(" · ")
          : "No gathering place attached"),
        el("div", { class: "meta" }, "Asked " + when(r.asked_at) + waited
          + (r.note ? ` · their note: \u201c${r.note}\u201d` : "")),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn danger sm", onclick: () => fulfilRequest(r) },
          [icon("trash", 14), "Carry out"]),
        el("button", { class: "btn ghost sm", onclick: () => declineRequestModal(r) },
          "Not as asked"),
      ]),
    ]);
  }

  async function fulfilRequest(r) {
    const ok = await UI.confirm(
      `${r.name} (${r.email || "no address"}) will be taken off the portal: the name, the `
      + "contact details, the photograph and the letters go, and the sign-in stops. The "
      + "class rows stay with no name on them. This cannot be undone from this screen.",
      { danger: true, title: "Carry out this removal?", okLabel: "Remove this person" });
    if (!ok) return;
    try {
      const res = await API.post(`/api/admin/data-requests/${r.id}/fulfil`, {});
      if (res.already) { toast(res.message); reload(); return; }
      toast(`Removed ${res.removed_email}` + (mailExpected ? " · confirmation letter sent" : ""));
      UI.announce(`${r.name} has been removed from the portal.`);
      reload();
    } catch (e) { toast(e.message, "err"); }
  }

  /* Turning a request down is allowed — a person may be mid-transfer, or the leader may
     need to be told first — but the reason goes to them, so it is written before the
     button, not after. */
  function declineRequestModal(r) {
    const note = el("textarea", { rows: "3", placeholder: "Why it cannot go as asked" });
    modal({
      title: "Do not carry this out as asked",
      sub: `${r.name} · asked ${when(r.asked_at)}`,
      body: el("div", {}, [
        el("div", { class: "meta", style: "margin-bottom:var(--sp-10)" }, mailExpected
          ? "The request is closed and this wording is emailed to them. They can send a new "
            + "one at any time."
          : "The request is closed and the reason stays on this server — no mailbox is "
            + "connected yet, so tell them yourself."),
        field("Reason", note),
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Close the request", kind: "danger", onClick: async c => {
            try {
              await API.post(`/api/admin/data-requests/${r.id}/decline`,
                             { note: note.value.trim() || null });
              c(); toast("Request closed"); reload();
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });
  }

  function loggedRequest(r) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title", style: "font-size:var(--t-ui)" }, r.name),
        el("div", { class: "meta" }, (r.kind === "export" ? "Took a copy of their record"
                                                           : "Asked to be removed")
          + (r.note ? " · " + r.note : "")),
      ]),
      el("div", { style: "flex:none;text-align:right" }, [
        el("span", { html: statusPill(r.status) }),
        el("div", { class: "meta", style: "margin-top:var(--sp-4);white-space:nowrap" },
          r.handled_at ? "Decided " + when(r.handled_at) : "Asked " + when(r.asked_at)),
      ]),
    ]);
  }

  // ---------------- stakes ----------------
  async function panelStakes() {
    const wrap = el("div");
    const counts = { all: stakes.length };
    STAKE_STATES.forEach(([k]) => { counts[k] = stakes.filter(s => s.status === k).length; });

    const search = el("input", { type: "search", placeholder: "Search by name or area",
      value: filt.stakeQ, oninput: ev => { filt.stakeQ = ev.target.value.toLowerCase(); draw(); } });
    wrap.appendChild(chipRow(
      [{ key: "all", label: "All", n: counts.all }]
        .concat(STAKE_STATES.map(([k, label]) => ({ key: k, label, n: counts[k] }))),
      filt.stakeChip, k => { filt.stakeChip = k; draw(); }));
    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
      el("div", { class: "f clear" }, [
        el("button", { class: "btn secondary sm", style: "height:42px",
                       onclick: () => stakeModal(null) }, [icon("plus", 15), "New stake or district"])]),
    ]));

    const host = el("div");
    wrap.appendChild(host);
    function draw() {
      // The area is searched with the name: a stake is often known by where it meets.
      const list = stakes.filter(s => (filt.stakeChip === "all" || s.status === filt.stakeChip)
        && (!filt.stakeQ
            || s.name.toLowerCase().includes(filt.stakeQ)
            || (s.address || "").toLowerCase().includes(filt.stakeQ)));
      host.innerHTML = "";
      host.appendChild(stakesView(list));
    }
    draw();
    return wrap;
  }

  function stakesView(list) {
    if (!list.length) return card([empty("No stake or district matches this filter.", "search")]);
    const wrapEl = el("div", { class: "card" });

    const narrow = el("div", { class: "only-narrow" });
    list.forEach(s => narrow.appendChild(el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, [s.name, el("span", { html: statusPill(s.status) })]),
        el("div", { class: "meta" }, whereLine(s)),
        el("div", { class: "meta" }, `Invite ${s.invite_code || "—"}`),
        el("div", { class: "meta" },
          `Check-in opens ${s.attendance_grace_minutes} min early, late after ${s.late_after_minutes}`),
      ]),
      stakeActions(s),
    ])));
    wrapEl.appendChild(narrow);

    wrapEl.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [el("th", {}, "Stake or district"), el("th", {}, "Status"),
        el("th", {}, "Invite code"), el("th", {}, "Where it is"), el("th", {}, "Created"),
        el("th", {}, "")])]),
      el("tbody", {}, list.map(s => el("tr", {}, [
        el("td", {}, [el("div", { style: "font-weight:600" }, s.name),
                      el("div", { class: "muted", style: "font-size:var(--t-meta)" }, kindWord(s))]),
        el("td", {}, [el("span", { html: statusPill(s.status) })]),
        el("td", {}, s.invite_code
          ? el("button", { class: "linkbtn", title: "Copy invite code",
                           onclick: () => copy(s.invite_code) }, s.invite_code)
          : "—"),
        el("td", { class: "muted" }, s.address
          ? el("div", { class: "truncate", title: s.address }, s.address)
          : el("div", { class: "unset" }, "No address recorded")),
        el("td", { class: "muted" }, fmtDate(s.created_at)),
        el("td", {}, stakeActions(s)),
      ]))),
    ])]));
    return wrapEl;
  }

  function stakeActions(s) {
    const acts = el("div", { class: "row-actions" });
    if (s.status === "pending_approval") {
      acts.appendChild(el("button", { class: "btn sm", onclick: () => decide(s, true) },
        [icon("check", 14), "Approve"]));
    }
    if (s.status === "active" || s.status === "suspended") {
      /* A suspended stake still has to be opened: its people, its rooms and the record of
         what it ran are on these pages, and putting it back to rights is done from here. */
      acts.appendChild(el("button", { class: "btn ghost sm", onclick: () => openStake(s) },
        [icon("grid", 14), "Open"]));
    }
    acts.appendChild(iconBtn("users", "Roster and roles", () => rosterModal(s)));
    acts.appendChild(iconBtn("edit", "Edit stake", () => stakeModal(s)));
    acts.appendChild(iconBtn("key", "Invite code", () => inviteModal(s)));
    acts.appendChild(iconBtn(s.status === "active" ? "ban" : "refresh",
      s.status === "active" ? "Suspend stake" : "Make this stake active",
      () => (s.status === "active" ? suspendStake(s) : setStatus(s, "active"))));
    return acts;
  }

  async function decide(s, approve) {
    if (!approve) {
      const ok = await UI.confirm(
        `Reject ${s.name}? It becomes suspended, and its people lose access until you approve it again.`,
        { danger: true, okLabel: "Reject", title: "Reject this stake?" });
      if (!ok) return;
    }
    try {
      await API.post(`/api/admin/stakes/${s.id}/approval`, { approve });
      toast(approve ? `${s.name} is now active` : `${s.name} rejected`, approve ? "ok" : "err");
      await reload();
    } catch (e) { toast(e.message, "err"); }
  }

  async function suspendStake(s) {
    const ok = await UI.confirm(`Suspend ${s.name}? Instructors and students in it will not be able to use it.`,
      { danger: true, okLabel: "Suspend", title: "Suspend this stake?" });
    if (!ok) return;
    try { await API.post(`/api/admin/stakes/${s.id}/suspend`); toast("Stake suspended", "err"); await reload(); }
    catch (e) { toast(e.message, "err"); }
  }

  async function setStatus(s, statusValue) {
    try {
      await API.patch(`/api/admin/stakes/${s.id}`, { status: statusValue });
      toast(statusValue === "active" ? "Stake is active" : "Stake archived");
      await reload();
    } catch (e) { toast(e.message, "err"); }
  }

  function openStake(s) {
    Ctx.setStake(s.id);
    location.hash = "#/";
  }
  function openCourse(stakeId, courseId) {
    Ctx.setStake(stakeId);
    location.hash = `#/course/${stakeId}/${courseId}`;
  }

  function inviteModal(s) {
    const box = secretBox(s.invite_code);
    modal({
      title: "Invite · " + s.name,
      sub: "A code people type, or a square they scan — both open registration with this "
           + "stake already found.",
      body: el("div", {}, [
        box,
        el("div", { class: "msection", style: "margin:var(--sp-18) 0 var(--sp-4)" }, "Join QR"),
        QR.joinBlock(s.id),
        el("div", { class: "meta muted", style: "margin-top:var(--sp-12)" },
          "Rotate the code if it has spread beyond the stake — anyone who has not joined yet will need the new one. The QR keeps working either way, because it carries the stake, not the code."),
      ]),
      actions: [
        { label: "Rotate code", kind: "danger", onClick: async close => {
            const ok = await UI.confirm(`Issue a new invite code for ${s.name}? The current one stops working.`,
              { danger: true, okLabel: "Rotate" });
            if (!ok) return;
            try {
              const r = await API.post(`/api/admin/stakes/${s.id}/invite-code`);
              s.invite_code = r.invite_code;
              close(); toast("New invite code issued");
              inviteModal(s);
              await reload();
            } catch (e) { toast(e.message, "err"); }
          } },
        { label: "Close", onClick: c => c() },
      ],
    });
  }

  /* One letter, many inboxes. The hub is per gathering place, so an announcement to
     the whole portal is written once into each open stake and district — which is why
     the server reports both the inboxes it touched and the people reached. */
  async function announceModal() {
    let opts;
    try { opts = await API.get("/api/admin/audiences"); }
    catch (e) { return toast(e.message, "err"); }

    // "" means every role; the server turns that into a tenant-wide announcement.
    const whoSel = el("select", {}, opts.options.map(o => el("option", {
      value: o.value === null || o.value === undefined ? "" : o.value,
    }, `${o.label} · ${o.people} ${o.people === 1 ? "person" : "people"}`)));
    const open = stakes.filter(s => s.status === "active");
    const whereSel = el("select", {}, [el("option", { value: "" },
      `Every stake and district (${opts.stakes})`)].concat(
      open.map(s => el("option", { value: s.id }, tenantLabel(s)))));
    const subject = el("input", { placeholder: "Subject", maxlength: "140" });
    const text = el("textarea", { rows: "6", placeholder: "Write it as you would say it." });

    modal({
      wide: true,
      title: "Post an announcement",
      sub: "It lands in Messages — the in-app hub — for everyone in the group you choose.",
      body: el("div", {}, [
        el("div", { class: "row" }, [
          field("Who", whoSel),
          field("Where", whereSel, "One gathering place, or the whole portal."),
        ]),
        field("Subject", subject),
        field("Message", text),
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Post announcement", onClick: async close => {
            if (!subject.value.trim() || !text.value.trim())
              return toast("A subject and a message are both required", "err");
            try {
              const r = await API.post("/api/admin/announcement", {
                subject: subject.value.trim(), body: text.value.trim(),
                target_role: whoSel.value || null,
                stake_id: whereSel.value ? +whereSel.value : null,
              });
              close();
              toast(`Posted to ${r.messages} ${r.messages === 1 ? "inbox" : "inboxes"} `
                    + `· ${r.reached} ${r.reached === 1 ? "person" : "people"}`);
              reload();
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });
  }

  /* A stake and a district are two words for the same standing: each one is a tenant
     of its own, with its own people, rooms and records, and neither sits under the
     other. So the box asks only which word to put on it, and the rest follows. */
  const TENANT_NEW = [["stake", "A stake"], ["district", "A district"]];

  function stakeModal(s) {
    const isNew = !s;
    const name = el("input", { value: (s && s.name) || "", placeholder: "e.g. Achimota Ghana Stake" });
    /* Ghana sits on GMT all year, so Accra time is the only zone this portal has
       ever needed; the field stays editable for the day that changes. */
    const tz = el("input", { value: (s && s.timezone) || "Africa/Accra", placeholder: "Africa/Accra" });
    const addr = el("input", { value: (s && s.address) || "", placeholder: "e.g. Ofankor, Accra" });
    const owner = el("input", { type: "email", placeholder: "president@example.org" });
    const grace = el("input", { type: "number", min: "0", max: "120",
                                value: (s && s.attendance_grace_minutes) ?? 15 });
    const late = el("input", { type: "number", min: "0", max: "120",
                               value: (s && s.late_after_minutes) ?? 10 });
    const color = el("input", { type: "color", value: (s && s.branding_color) || "#085088",
                                style: "height:42px;padding:var(--sp-4)" });
    const statusSel = el("select", {}, STAKE_STATES.map(([v, l]) => el("option", { value: v }, l)));
    if (s) statusSel.value = s.status;

    const kindSel = el("select", {}, TENANT_NEW.map(([v, l]) => el("option", { value: v }, l)));
    if (s) kindSel.value = s.org_kind === "district" ? "district" : "stake";

    const kindField = field("What is this", kindSel,
      "It stands on its own, and its president is a stake president.");
    const addrField = field("Address", addr,
      "Where this stake keeps its office and records. The gathering places it meets in are added under it.");

    /* Not a location: this clock is only used to decide when a class starts and when a
       check-in counts as late. The address above is where a tenant actually is. */
    const tzField = field("Check-in clock", tz,
      "Times classes and check-ins for this tenant. Ghana keeps one zone, so Africa/Accra is right unless you know otherwise.");

    const bodyNodes = [
      el("div", { class: "row" }, [field("Name", name), kindField]),
      addrField, tzField,
    ];
    if (isNew) {
      bodyNodes.push(field("First president", owner,
        "Optional. That person must already have an account; they get president rights the moment this is created."));
    } else {
      bodyNodes.push(el("div", { class: "row" },
        [field("Status", statusSel), field("Branding colour", color)]));
      bodyNodes.push(el("div", { class: "row" },
        [field("Check-in opens (min before)", grace), field("Late after (min)", late)]));
    }

    const word = () => (kindSel.value === "district" ? "district" : "stake");
    const m = modal({
      wide: true,
      title: isNew ? "Register a stake" : "Edit " + s.name,
      sub: isNew
        ? "For a leader who could not sign themselves up — a walk-in, a transfer, a new gathering place."
        : "Everything here applies to this stake only.",
      body: el("div", {}, bodyNodes),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: isNew ? "Create stake" : "Save changes", onClick: async close => {
            if (!name.value.trim()) return toast(`A ${word()} needs a name`, "err");
            const retype = !isNew && kindSel.value !== s.org_kind;
            try {
              if (isNew) {
                await API.post("/api/admin/stakes", {
                  name: name.value.trim(), org_kind: kindSel.value,
                  address: addr.value.trim() || null,
                  timezone: tz.value.trim() || "Africa/Accra",
                  owner_email: owner.value.trim() || null, branding_color: color.value,
                });
                toast(`${kindWord({ org_kind: kindSel.value })} registered and active`);
              } else {
                await API.patch(`/api/admin/stakes/${s.id}`, {
                  name: name.value.trim(), address: addr.value.trim() || null,
                  org_kind: kindSel.value,
                  timezone: tz.value.trim() || "Africa/Accra",
                  status: statusSel.value, branding_color: color.value,
                  attendance_grace_minutes: Math.max(0, +grace.value || 0),
                  late_after_minutes: Math.max(0, +late.value || 0),
                });
                toast(retype
                  ? /* The caption of its president moves with the word, and the roster is
                       where the admin can see it; nothing is promised here about people
                       who may not be seated yet. */
                    `Re-typed as a ${word()} — its people, rooms and records stayed put`
                  : "Saved");
              }
              close(); await reload();
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });

    const head = m.panel.querySelector(".mt");
    const btns = m.panel.querySelectorAll(".mactions .btn");
    const primary = btns[btns.length - 1];
    function paint() {
      const district = kindSel.value === "district";
      name.placeholder = district ? "e.g. Dansoman Ghana District" : "e.g. Achimota Ghana Stake";
      addrField.querySelector("label").textContent = district ? "District address" : "Stake address";
      addrField.querySelector(".hint").textContent = district
        ? "Where this district keeps its records. The rooms its classes meet in are added under it."
        : "Where this stake keeps its office and records. The gathering places it meets in are added under it.";
      kindField.querySelector(".hint").textContent = district
        ? "It stands on its own, exactly as a stake does, and its president is a district president."
        : "It stands on its own, and its president is a stake president.";
      if (isNew) {
        head.querySelector("h2").textContent = `Register a ${word()}`;
        primary.textContent = `Create ${word()}`;
      } else {
        m.panel.querySelector(".msub").textContent =
          `Everything here applies to this ${word()} only.`;
      }
    }
    kindSel.addEventListener("change", paint);
    /* A tenant can be re-typed — several of the ones loaded onto this portal are
       districts entered while the box only asked for a stake — and what moves with it
       is the word and its president's title. Its people, rooms, classes and records
       stay exactly where they are. */
    paint();
  }

  async function rosterModal(s) {
    const body = el("div", {}, [loading(3)]);
    modal({
      wide: true,
      title: s.name + " — roster",
      sub: "Everyone holding a role in this stake.",
      body,
      actions: [
        { label: "Register a person here", kind: "secondary",
          onClick: close => { close(); registerModal(s.id); } },
        { label: "Classes", onClick: close => { close(); classStake = s.id; pickTab("classes"); } },
      ],
    });
    let rows;
    try { rows = await API.get(`/api/admin/stakes/${s.id}/roster`); }
    catch (e) { body.innerHTML = ""; body.appendChild(empty(e.message, "alert")); return; }

    body.innerHTML = "";
    const leaders = rows.filter(r => r.role !== "student").length;
    body.appendChild(el("div", { class: "stat-grid" }, [
      tile(rows.length, "People", `${leaders} in leadership`),
      tile(rows.filter(r => r.role === "instructor").length, "Instructors"),
      tile(rows.filter(r => r.role === "student").length, "Students"),
      tile(rows.filter(r => !r.is_active).length, "Deactivated accounts"),
    ]));

    let chip = "all";
    const list = el("div");
    function draw() {
      list.innerHTML = "";
      const shown = rows.filter(r => chip === "all" || r.role === chip);
      if (!shown.length) {
        list.appendChild(el("div", { class: "muted", style: "font-size:var(--t-ui)" }, "Nobody in this group."));
      }
      shown.forEach(r => list.appendChild(rosterRow(s, r, rows, draw)));
    }
    body.appendChild(el("h2", { class: "sec-title" }, "Roles"));
    body.appendChild(chipRow(roleFacets(rows), chip, k => { chip = k; draw(); }));
    body.appendChild(list);
    draw();
  }

  function roleFacets(rows) {
    return [{ key: "all", label: "Everyone", n: rows.length }]
      .concat(STAKE_ROLES.map(k => ({ key: k, label: roleLabel(k),
                                      n: rows.filter(r => r.role === k).length })));
  }

  function rosterRow(s, r, rows, draw) {
    const sel = el("select", {}, STAKE_ROLES.map(k => el("option", { value: k }, roleLabel(k))));
    sel.value = r.role;
    sel.addEventListener("change", async () => {
      try {
        await API.patch(`/api/admin/users/${r.user_id}/roles`, { stake_id: s.id, role: sel.value });
        r.role = sel.value;
        toast(`${r.name} is now ${roleLabel(sel.value).toLowerCase()}`);
        draw();
      } catch (e) { toast(e.message, "err"); sel.value = r.role; }
    });
    return el("div", { class: "list-item" }, [
      avatar(r),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, [r.name,
          r.is_active ? null : el("span", { class: "pill red" }, "deactivated")]),
        el("div", { class: "meta" }, [r.email, r.ward].filter(Boolean).join(" · ")),
      ]),
      el("div", { class: "row-actions" }, [
        sel,
        el("button", { class: "btn ghost icon-only", title: "Remove from stake",
          onclick: e => UI.act(e.currentTarget, async () => {
            const ok = await UI.confirm(`Remove ${r.name} from ${s.name}? Their attendance history stays on file.`,
              { danger: true, okLabel: "Remove" });
            if (!ok) return;
            try {
              await API.del(`/api/admin/users/${r.user_id}/roles?stake_id=${s.id}`);
              rows.splice(rows.indexOf(r), 1);
              toast("Membership removed"); draw();
            } catch (e) { toast(e.message, "err"); }
          }) }, [icon("trash", 14)]),
      ]),
    ]);
  }

  // ---------------- people ----------------
  async function panelPeople() {
    const wrap = el("div");
    const search = el("input", { type: "search", placeholder: "Search by name or email",
                                 value: filt.personQ });
    let timer;
    search.addEventListener("input", () => {
      filt.personQ = search.value;
      clearTimeout(timer); timer = setTimeout(load, 320);
    });

    const bar = el("div");
    const host = el("div");
    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
      el("div", { class: "f clear" }, [
        el("button", { class: "btn secondary sm", style: "height:42px",
                       onclick: () => registerModal(null) }, [icon("userplus", 15), "Register"])]),
    ]));
    wrap.appendChild(bar);
    wrap.appendChild(host);

    async function load() {
      host.innerHTML = "";
      host.appendChild(loading(2));
      let users;
      try {
        users = await API.get("/api/admin/users"
          + (filt.personQ.trim() ? `?search=${encodeURIComponent(filt.personQ.trim())}` : ""));
      } catch (e) { host.innerHTML = ""; host.appendChild(card([empty(e.message, "alert")])); return; }
      bar.innerHTML = "";
      bar.appendChild(chipRow(personFacets(users), filt.personChip, k => {
        filt.personChip = k; draw(users);
      }));
      draw(users);
    }
    function draw(users) {
      host.innerHTML = "";
      host.appendChild(peopleView(users.filter(matchesPerson)));
    }
    await load();
    return wrap;
  }

  /* A couple holds one missionary account, and a district president leads a district
     the same way a stake president leads a stake — both count as leadership here. */
  const isLeader = u => u.roles.some(r => LEADER_ROLES.includes(r));

  function personFacets(users) {
    return [
      { key: "all", label: "Everyone", n: users.length },
      { key: "admin", label: "Portal admins", n: users.filter(u => u.is_super_admin).length },
      { key: "leader", label: "Leaders", n: users.filter(isLeader).length },
      { key: "instructor", label: "Instructors", n: users.filter(u => u.roles.includes("instructor")).length },
      { key: "student", label: "Students", n: users.filter(u => u.roles.includes("student")).length },
      { key: "none", label: "No stake", n: users.filter(u => !u.roles.length).length },
      { key: "off", label: "Deactivated", n: users.filter(u => !u.is_active).length },
    ];
  }

  function matchesPerson(u) {
    if (filt.personChip === "all") return true;
    if (filt.personChip === "admin") return u.is_super_admin;
    if (filt.personChip === "leader") return isLeader(u);
    if (filt.personChip === "none") return !u.roles.length;
    if (filt.personChip === "off") return !u.is_active;
    return u.roles.includes(filt.personChip);
  }

  function peopleView(list) {
    if (!list.length) return card([empty("No account matches this filter.", "search")]);
    const wrapEl = el("div", { class: "card" });

    const narrow = el("div", { class: "only-narrow" });
    list.forEach(u => narrow.appendChild(el("div", { class: "list-item" }, [
      avatar(u),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, [u.name,
          u.is_super_admin ? el("span", { class: "pill blue" }, "Portal Admin") : null,
          u.is_active ? null : el("span", { class: "pill red" }, "deactivated")]),
        el("div", { class: "meta" }, contactLine(u)),
        el("div", { class: "meta" }, accessLine(u)),
      ]),
      personActions(u),
    ])));
    wrapEl.appendChild(narrow);

    wrapEl.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [el("th", {}, "Person"), el("th", {}, "Roles"),
        el("th", {}, "Stakes"), el("th", {}, "Status"), el("th", {}, "")])]),
      el("tbody", {}, list.map(u => el("tr", {}, [
        el("td", {}, [
          el("div", { style: "font-weight:600" }, u.name),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, contactLine(u))]),
        el("td", {}, [u.roles.map(roleLabel).join(", ") || "—",
          u.is_super_admin ? el("span", { class: "mini-pill mine" }, "portal admin") : null]),
        el("td", { class: "muted", style: "font-size:var(--t-meta)" }, u.stakes.join(", ") || "—"),
        el("td", {}, u.is_active ? el("span", { class: "mini-pill ok" }, "active")
                                 : el("span", { class: "mini-pill hot" }, "deactivated")),
        el("td", {}, personActions(u)),
      ]))),
    ])]));
    return wrapEl;
  }

  function accessLine(u) {
    const bits = [];
    if (u.roles.length) bits.push(u.roles.map(roleLabel).join(", "));
    if (u.stakes.length) bits.push(u.stakes.join(", "));
    return bits.join(" · ") || "not in a stake yet";
  }

  /* How this person is reached, and whether they have a way in of their own. A paper
     member has no address and no sign-in, so the line says both rather than leaving a
     blank where an email address would be. */
  function contactLine(u) {
    const bits = [u.email || u.phone || "no address on file"];
    if (u.has_account === false) bits.push("no sign-in of their own");
    return bits.join(" · ");
  }

  function personActions(u) {
    const acts = el("div", { class: "row-actions" });
    acts.appendChild(el("button", { class: "btn ghost sm", onclick: () => manageModal(u) },
      [icon("edit", 14), "Manage"]));
    acts.appendChild(iconBtn("clock", "Account record", () => activityModal(u.id, u.name)));
    return acts;
  }

  // ---------------- managing one person ----------------
  /* A stake and a district are one kind of tenant to this console, but an admin
     choosing between two same-named places should see which is which. */
  function tenantLabel(s) {
    const kind = s.org_kind === "district" ? "district" : "stake";
    return `${s.name} · ${kind}`;
  }

  async function registerModal(stakeId) {
    const name = el("input", { placeholder: "Full name" });
    const email = el("input", { type: "email", placeholder: "person@example.org",
                                autocapitalize: "off", autocorrect: "off",
                                spellcheck: "false" });
    const pw = el("input", { placeholder: "leave blank to generate one", autocomplete: "new-password" });
    const phone = UI.phoneField({ label: "Phone number",
      note: "A Ghanaian number, with or without the leading 0. This is how they sign in." });
    /* Somebody with no phone of their own cannot sign in at all. They are still on the
       register — name, number, ward, class — but with no password, no code and no
       mailbox, so there is nothing to lose, share or reset. The record says who vouched
       for it, and the console can open a real account for them later. */
    const paper = el("input", { type: "checkbox", style: "width:auto" });
    const pwField = field("Password", UI.passWrap(pw),
      "Leave blank and we generate a one-time password you can hand over.");
    const paperLine = el("div", { class: "field inline" }, [
      paper,
      el("label", { style: "margin:0;font-weight:600" },
         "They have no phone of their own — write them down without an account"),
    ]);
    const paperNote = el("div", { class: "hint", style: "margin:-2px 0 var(--sp-14)" },
      "They are on the register and in the class list, but there is no sign-in, so "
      + "there is nothing to lose or reset. You can open one for them later from Manage.");
    paperNote.style.display = "none";
    function setPaper(on) {
      pwField.style.display = on ? "none" : "";
      paperNote.style.display = on ? "" : "none";
      label.textContent = on ? "Write them down" : "Create account";
    }
    paper.addEventListener("change", () => setPaper(paper.checked));
    /* The ward comes off the stake's own list, so the box below the stake choice is the
       one that shows it — and with no stake chosen there is no list, which is said here
       rather than left for the save to refuse. */
    const ward = UI.wardField({ label: "Ward or branch",
      typeNote: "Choose the stake or district first — a ward belongs to one of those." });
    // A missionary is set apart as a couple and shares one account, so the second
    // name belongs on the account itself, not in a note.
    const companion = el("input", { placeholder: "e.g. Sister Hansen" });
    const companionField = field("Companion", companion,
      "A service missionary and his companion hold one account, one name and one picture.");
    companionField.style.display = "none";
    const options = stakes.filter(s => s.status === "active");
    const stakeSel = el("select", {},
      [el("option", { value: "" }, "No stake yet")].concat(
        options.map(s => el("option", { value: s.id }, tenantLabel(s)))));
    if (stakeId) stakeSel.value = String(stakeId);
    const roleSel = el("select", {}, STAKE_ROLES.map(r => el("option", { value: r }, roleLabel(r))));
    roleSel.addEventListener("change", () => {
      companionField.style.display = roleSel.value === MISSIONARY ? "" : "none";
    });
    stakeSel.addEventListener("change", () => ward.load(stakeSel.value ? +stakeSel.value : null));
    ward.load(stakeSel.value ? +stakeSel.value : null);

    const label = el("span", {}, "Create account");
    modal({
      wide: true,
      title: "Register a person",
      sub: "Write somebody down — a walk-in, a transfer, a student with no phone of their own.",
      body: el("div", {}, [
        el("div", { class: "row" }, [
          field("Full name", name),
          field("Email address (optional)", email,
            "Only if they have one. A phone number is enough to sign in with.")]),
        el("div", { class: "row" }, [pwField, phone.node]),
        el("div", { class: "row" }, [field("Stake or district", stakeSel), field("Role there", roleSel)]),
        el("div", { class: "row" }, [ward.node, companionField]),
        paperLine, paperNote,
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label, onClick: async close => {
            if (!name.value.trim())
              return toast("A name is required", "err");
            if (!email.value.trim() && !phone.get())
              return toast("Give an email address or a phone number — one is enough", "err");
            if (!paper.checked && pw.value && pw.value.length < 8)
              return toast("A password needs at least 8 characters", "err");
            if (ward.incomplete())
              return toast("Write the ward's name, or choose “None recorded”", "err");
            const pickedWard = ward.payload();
            if (!stakeSel.value && pickedWard.ward_name)
              return toast("Pick the stake or district this ward belongs to first — "
                           + "a ward is a line on one tenant's list.", "err");
            try {
              const r = await API.post("/api/admin/users", {
                full_name: name.value.trim(), email: email.value.trim() || null,
                password: paper.checked ? null : (pw.value || null),
                phone: phone.get() || null,
                no_account: paper.checked,
                companion_name: roleSel.value === MISSIONARY ? (companion.value.trim() || null) : null,
                stake_id: stakeSel.value ? +stakeSel.value : null,
                role: stakeSel.value ? roleSel.value : null,
                ...pickedWard,
              });
              close();
              reload();
              if (!r.has_account) {
                toast(name.value.trim() + " is written down — no sign-in of their own");
              } else {
                toast("Account created");
                if (r.generated_password) {
                  credentialsModal({ name: name.value.trim(),
                                     email: r.email || r.phone,
                                     password: r.generated_password,
                                     mailExpected: r.mail_expected });
                }
              }
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });
  }

  function credentialsModal({ name, email, password, mailExpected }) {
    modal({
      title: "Sign-in details · " + name,
      sub: email,
      body: el("div", {}, [secretBox(password),
        el("div", { class: "meta muted", style: "margin-top:var(--sp-10)" },
          "This is the only time it is shown. Pass it to the person directly — they can change it under My profile."),
        mailExpected ? null :
          el("div", { class: "meta muted", style: "margin-top:var(--sp-6)" },
            "No letter went out — this portal has no mailbox connected, so the password "
            + "is handed over in person.")]),
      actions: [{ label: "Done", onClick: c => c() }],
    });
  }

  async function manageModal(u) {
    const body = el("div", {}, [loading(3)]);
    const m = modal({ wide: true, title: u.name,
      sub: (u.email || u.phone || "no address on file") + " — every section saves on its own.",
      body,
      actions: [{ label: "Close", onClick: c => c() }] });
    let d;
    try { d = await API.get(`/api/admin/users/${u.id}`); }
    catch (e) { body.innerHTML = ""; body.appendChild(empty(e.message, "alert")); return; }
    body.innerHTML = "";
    body.appendChild(el("div", { class: "admin-grid" }, [
      profileCard(d), rolesCard(d), passwordCard(d), accessCard(d, m.close),
    ]));
  }

  function profileCard(d) {
    const name = el("input", { value: d.full_name || "" });
    const email = el("input", { type: "email", value: d.email || "" });
    /* The same field a person sees on their own profile, so a number written by the
       desk is stored in the one shape the SMS gateway reads. */
    const phone = UI.phoneField({ label: "Phone" });
    const wa = UI.phoneField({ label: "WhatsApp" });
    const emPhone = UI.phoneField({ label: "Emergency phone" });
    phone.set(d.phone);
    wa.set(d.whatsapp);
    emPhone.set(d.emergency_contact_phone);
    /* Opened on the tenant whose list this person's ward came from, which is the tenant
       the save checks against. With no stake behind the account there is no list, and the
       server's own sentence is what answers a name typed into that box. */
    const ward = UI.wardField({ label: "Ward or branch" });
    ward.set(d.ward, d.ward_id);
    ward.load(d.ward_stake_id);
    const companion = el("input", { value: d.companion_name || "",
                                    placeholder: "Only for a service missionary" });
    const emName = el("input", { value: d.emergency_contact_name || "" });
    return subcard("Profile", `joined ${fmtDate(d.created_at)}`, el("div", {}, [
      el("div", { class: "row" }, [field("Full name", name), field("Email", email)]),
      el("div", { class: "row" }, [phone.node, wa.node]),
      el("div", { class: "row" }, [ward.node,
        field("Companion", companion,
              "A missionary and his companion share one account: both names, one picture.")]),
      el("div", { class: "row" }, [field("Emergency contact", emName), emPhone.node]),
      el("button", { class: "btn secondary sm",
        onclick: e => UI.act(e.currentTarget, "Saving…", async () => {
          if (!name.value.trim() || !email.value.trim())
            return toast("Name and email cannot be empty", "err");
          if (ward.incomplete())
            return toast("Write the ward's name, or choose “None recorded”", "err");
          try {
            await API.patch(`/api/admin/users/${d.id}`, {
              full_name: name.value.trim(), email: email.value.trim(),
              phone: phone.get() || null, whatsapp: wa.get() || null,
              ...ward.payload(),
              companion_name: companion.value.trim() || null,
              emergency_contact_name: emName.value || null,
              emergency_contact_phone: emPhone.get() || null });
            toast("Profile saved"); reload();
          } catch (e) { toast(e.message, "err"); }
        }) }, [icon("check", 14), "Save profile"]),
    ]));
  }

  function rolesCard(d) {
    const list = el("div");
    const options = stakes.filter(s => s.status === "active");
    const stakeSel = el("select", {}, options.map(s => el("option", { value: s.id }, tenantLabel(s))));
    const roleSel = el("select", {}, STAKE_ROLES.map(r => el("option", { value: r }, roleLabel(r))));
    const add = el("button", { class: "btn secondary sm", disabled: !options.length,
      onclick: e => UI.act(e.currentTarget, "Adding…", async () => {
        if (!stakeSel.value) return toast("There is no active stake or district to assign", "err");
        try {
          await API.patch(`/api/admin/users/${d.id}/roles`,
            { stake_id: +stakeSel.value, role: roleSel.value });
          const picked = stakeById(+stakeSel.value);
          d.roles.push({ stake_id: +stakeSel.value, stake_name: stakeName(+stakeSel.value),
                         stake_kind: picked ? picked.org_kind : "stake",
                         role: roleSel.value, joined_at: new Date().toISOString(), status: "active" });
          toast("Membership added"); draw(); reload();
        } catch (e) { toast(e.message, "err"); }
      }) }, [icon("plus", 14), "Add"]);

    function draw() {
      list.innerHTML = "";
      if (!d.roles.length) {
        list.appendChild(el("div", { class: "muted", style: "font-size:var(--t-ui)" },
          "Not a member of any stake or district — they can sign in, but there is nothing to see."));
      }
      d.roles.forEach(r => list.appendChild(membershipRow(d, r, draw)));
    }
    draw();

    return subcard("Roles", `${d.roles.length} assignment${d.roles.length === 1 ? "" : "s"}`, el("div", {}, [
      list,
      el("hr", { class: "hr" }),
      el("div", { class: "row give", style: "align-items:flex-end" }, [
        el("div", { class: "field" }, [el("label", {}, "Stake or district"), stakeSel]),
        el("div", { class: "field" }, [el("label", {}, "Role"), roleSel]),
        el("div", { class: "field", style: "flex:0 0 auto" }, add),
      ]),
      options.length ? null : el("div", { class: "meta muted" }, "Open a stake or district first."),
    ]));
  }

  function membershipRow(d, r, draw) {
    const sel = el("select", {}, STAKE_ROLES.map(k => el("option", { value: k }, roleLabel(k))));
    sel.value = r.role;
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, (r.stake_name || stakeName(r.stake_id))
          + (r.stake_kind === "district" ? " · district" : "")),
        el("div", { class: "meta" }, `since ${fmtDate(r.joined_at)} · ${String(r.status).replace("_", " ")}`),
      ]),
      el("div", { class: "row-actions" }, [
        sel,
        el("button", { class: "btn ghost sm",
          onclick: e => UI.act(e.currentTarget, "Saving…", async () => {
            try {
              await API.patch(`/api/admin/users/${d.id}/roles`,
                { stake_id: r.stake_id, role: sel.value });
              r.role = sel.value; toast("Role updated"); draw();
            } catch (e) { toast(e.message, "err"); }
          }) }, "Save"),
        el("button", { class: "btn ghost icon-only", title: "Remove membership",
          onclick: e => UI.act(e.currentTarget, async () => {
            const ok = await UI.confirm(`Remove them from ${r.stake_name || "this stake"}?`,
              { danger: true, okLabel: "Remove" });
            if (!ok) return;
            try {
              await API.del(`/api/admin/users/${d.id}/roles?stake_id=${r.stake_id}`);
              d.roles = d.roles.filter(x => x !== r);
              toast("Membership removed"); draw(); reload();
            } catch (e) { toast(e.message, "err"); }
          }) }, [icon("trash", 14)]),
      ]),
    ]);
  }

  function passwordCard(d) {
    const pw = el("input", { placeholder: "At least 8 characters", autocomplete: "new-password" });
    const must = el("input", { type: "checkbox", style: "width:auto",
                               checked: "checked" });
    const out = el("div");
    /* A paper member has no sign-in, so this card is the door into one. It says what
       will happen — the record becomes an account they can sign into with their number,
       and nothing else about them changes. */
    const paper = d.has_account === false;
    async function set(value) {
      try {
        const r = await API.post(`/api/admin/users/${d.id}/password`,
          { new_password: value || null, must_change: must.checked });
        if (r.generated_password) {
          out.innerHTML = "";
          out.appendChild(secretBox(r.generated_password));
          out.appendChild(el("div", { class: "meta muted", style: "margin-top:var(--sp-8)" },
            "Shown once. Copy it before you close this dialog."));
          if (paper) out.appendChild(el("div", { class: "meta muted", style: "margin-top:var(--sp-6)" },
            "Hand it to them in person. They sign in with their phone number and this "
            + "password."));
        } else toast(paper ? "Account opened" : "Password updated");
      } catch (e) { toast(e.message, "err"); }
    }
    return subcard(paper ? "Open an account" : "Password",
      d.is_super_admin ? "portal admin" : "", el("div", {}, [
        paper ? el("div", { class: "hint", style: "margin-bottom:var(--sp-12)" },
          "This person has no sign-in of their own. Setting a password here opens an "
          + "account for them.") : null,
        el("div", { class: "field" }, [el("label", {}, paper ? "Their password" : "New password"),
          UI.passWrap(pw)]),
        el("div", { class: "field inline" }, [must,
          el("label", { style: "margin:0;font-weight:600" }, "Require a new one at next sign-in")]),
        el("div", { class: "row" }, [
          el("button", { class: "btn secondary sm", onclick: () => set(pw.value) },
            paper ? "Open the account" : "Set this password"),
          el("button", { class: "btn sm", onclick: () => set("") },
            [icon("key", 14), "Generate one-time"]),
        ]),
        out,
      ]));
  }

  function accessCard(d, closeAll) {
    const me = (API.getUser() || {}).id;
    const isSelf = d.id === me;
    const host = el("div");
    function redraw() {
      host.innerHTML = "";
      host.appendChild(subcard("Access", "", el("div", {}, rows())));
    }

    function rows() {
      return [
        el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, "Account status"),
            el("div", { class: "meta" }, d.has_account === false
              ? "Written down without a sign-in — counted, marked and printed like anybody else."
              : d.is_active
              ? "Can sign in and use every stake they belong to."
              : "Blocked from signing in; their records stay on file."),
          ]),
          el("button", { class: "btn ghost sm", disabled: isSelf,
            onclick: e => UI.act(e.currentTarget,
              d.is_active ? "Deactivating…" : "Activating…", async () => {
                try {
                  await API.patch(`/api/admin/users/${d.id}/active?active=${!d.is_active}`);
                  d.is_active = !d.is_active;
                  toast(d.is_active ? "Account activated" : "Account deactivated");
                  redraw(); reload();
                } catch (e) { toast(e.message, "err"); }
              }) }, d.is_active ? "Deactivate" : "Activate"),
        ]),
        el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, "Portal admin access"),
            el("div", { class: "meta" }, d.is_super_admin
              ? "Full control of the portal: every stake, account and class."
              : "No portal control — this is a stake-level account."),
          ]),
          el("button", { class: "btn " + (d.is_super_admin ? "ghost" : "secondary") + " sm",
            disabled: isSelf,
            onclick: e => UI.act(e.currentTarget,
              d.is_super_admin ? "Revoking…" : "Granting…", async () => {
                const revoke = d.is_super_admin;
                if (revoke) {
                  const ok = await UI.confirm(`Revoke portal control from ${d.full_name}? Their stake roles stay as they are.`,
                    { danger: true, okLabel: "Revoke" });
                  if (!ok) return;
                }
                try {
                  await API.post(`/api/admin/users/${d.id}/admin-flag?grant=${!revoke}`);
                  d.is_super_admin = !revoke;
                  toast(revoke ? "Portal access revoked" : "Portal admin granted");
                  redraw(); reload();
                } catch (e) { toast(e.message, "err"); }
              }) }, d.is_super_admin ? "Revoke" : "Grant"),
        ]),
        el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, "Erase this account"),
            el("div", { class: "meta" }, "Removes the person, their enrolments, attendance and messages. Classes they taught stay on file."),
          ]),
          el("button", { class: "btn danger sm", disabled: isSelf || d.is_super_admin,
            title: d.is_super_admin ? "A portal admin must be demoted first" : null,
            onclick: e => UI.act(e.currentTarget, "Erasing…", async () => {
              const ok = await UI.confirm(
                `Permanently erase ${d.full_name} and everything personal to them? This cannot be undone.`,
                { danger: true, okLabel: "Erase permanently", title: "Erase this account?" });
              if (!ok) return;
              try {
                await API.del(`/api/admin/users/${d.id}`);
                if (closeAll) closeAll();
                toast("Account erased"); reload();
              }
              catch (e) { toast(e.message, "err"); }
            }) }, [icon("trash", 14), "Erase"]),
        ]),
      ];
    }
    redraw();
    return host;
  }

  async function activityModal(id, label) {
    const body = el("div", {}, [loading(3)]);
    const m = modal({ wide: true, title: (label || "Account") + " — record",
      sub: "Everything the portal holds about this person.", body,
      actions: [{ label: "Close", onClick: c => c() }] });
    let a;
    try { a = await API.get(`/api/admin/users/${id}/activity`); }
    catch (e) { body.innerHTML = ""; body.appendChild(empty(e.message, "alert")); return; }

    const c = a.attendance.counts || {};
    const secs = [];
    secs.push(subcard("Stake roles", "", a.roles.length
      ? el("div", {}, a.roles.map(r => el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [el("div", { class: "title" }, r.stake_name || "Stake " + r.stake_id),
            el("div", { class: "meta" }, roleLabel(r.role))]),
        ])))
      : el("div", { class: "muted", style: "font-size:var(--t-ui)" }, "No stake membership.")));

    if (a.teaching.length) {
      secs.push(subcard("Teaching", `${a.teaching.length} class${a.teaching.length === 1 ? "" : "es"}`,
        el("div", {}, a.teaching.map(t => el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [el("div", { class: "title" }, t.title),
            el("div", { class: "meta" }, `${t.term} · ${stakeName(t.stake_id)}`)]),
          el("button", { class: "btn ghost sm", onclick: () => { m.close(); openCourse(t.stake_id, t.course_id); } },
            "Open class"),
        ])))));
    }
    if (a.enrollments.length) {
      secs.push(subcard("Enrolments", "", el("div", {}, a.enrollments.map(e =>
        el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, e.title),
            el("div", { class: "meta" }, String(e.completion_status || e.status).replace(/_/g, " ")),
          ]),
          e.certificate_issued ? el("span", { class: "mini-pill ok" }, "certificate") : null,
        ])))));
    }
    if (a.attendance.sessions) {
      const segs = [["Present", c.present || 0, "ok"], ["Late", c.late || 0, "mid"],
                    ["Absent", c.absent || 0, "bad"], ["Excused", c.excused || 0, "mid"]];
      secs.push(subcard("Attendance mix", `${a.attendance.sessions} marked`, el("div", {}, [
        el("div", { class: "stack-bar" }, segs.map(([k, v, cls]) =>
          el("div", { class: "stack-seg " + cls, title: `${k}: ${v}`,
            style: `width:${(v / a.attendance.sessions) * 100}%` }))),
        el("div", { class: "legend" }, segs.map(([k, v, cls]) => el("div", { class: "legend-item" }, [
          el("span", { class: "dot " + cls }), el("span", {}, `${k} — ${v}`)]))),
        el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-6)" },
          a.attendance.recent.slice(0, 6).map(r => `${fmtDate(r.date)} — ${r.status}`).join(" · ") || "—"),
      ])));
    }
    secs.push(subcard("Recent portal actions", "latest " + a.activity.length, a.activity.length
      ? el("div", {}, a.activity.map(logRow))
      : el("div", { class: "muted", style: "font-size:var(--t-ui)" }, "Nothing logged.")));

    body.innerHTML = "";
    body.appendChild(el("div", { class: "stat-grid" }, [
      tile(a.attendance.sessions, "Sessions recorded", a.attendance.recent.length
        ? `latest ${fmtDate(a.attendance.recent[0].date)}` : "no attendance yet"),
      tile(a.enrollments.length, "Class enrolments"),
      tile(a.teaching.length, "Classes taught"),
      tile(a.activity.length, "Portal actions"),
    ]));
    body.appendChild(el("div", { class: "admin-grid" }, secs));
  }

  // ---------------- classes ----------------
  async function panelClasses() {
    const active = stakes.filter(s => s.status === "active");
    if (!active.length) {
      return el("div", { class: "card" }, [empty("No active stake yet — approve one to see its classes.", "home")]);
    }
    const viewed = App.ctx().stake;
    if (!classStake || !active.some(s => s.id === classStake)) {
      classStake = (viewed && active.some(s => s.id === viewed.id)) ? viewed.id : active[0].id;
    }
    const stakeSel = el("select", { "aria-label": "Stake" },
      active.map(s => el("option", { value: s.id }, s.name)));
    stakeSel.value = String(classStake);
    stakeSel.addEventListener("change", () => { classStake = +stakeSel.value; paint(); });

    const wrap = el("div");
    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f" }, [el("label", {}, "Stake"), stakeSel]),
      el("div", { class: "f clear" }, [
        el("button", { class: "btn secondary sm", style: "height:42px",
          onclick: () => { Ctx.setStake(classStake); location.hash = "#/classes"; } },
          [icon("list", 15), "Open Classes page"])]),
    ]));
    const host = el("div");
    wrap.appendChild(host);
    host.appendChild(loading(2));

    const data = await API.get(`/api/stakes/${classStake}/classes?scope=stake&days=45`);
    const sName = stakeName(classStake);
    host.innerHTML = "";
    host.appendChild(el("div", { class: "stat-grid" }, [
      tile(data.counts.total, "Sessions in view"),
      tile(data.counts.today, "Today"),
      tile(data.counts.upcoming, "Upcoming"),
      tile(data.counts.needs_attendance, "No roster recorded"),
    ]));

    let chip = "all";
    const all = data.sessions;
    const chips = chipRow([
      { key: "all", label: "All", n: all.length },
      { key: "today", label: "Today", n: data.counts.today },
      { key: "upcoming", label: "Upcoming", n: data.counts.upcoming },
      { key: "needs", label: "Needs roster", n: data.counts.needs_attendance },
    ], chip, k => { chip = k; draw(); });
    host.appendChild(chips);

    const search = el("input", { type: "search", placeholder: "Search class or teacher",
      value: filt.classQ, oninput: ev => { filt.classQ = ev.target.value.toLowerCase(); draw(); } });
    host.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
    ]));

    const listHost = el("div");
    host.appendChild(listHost);
    function draw() {
      const q = filt.classQ;
      const shown = all.filter(r => {
        if (chip === "today" && !r.is_today) return false;
        if (chip === "upcoming" && !r.is_upcoming) return false;
        if (chip === "needs" && !r.needs_attendance) return false;
        return !q || r.title.toLowerCase().includes(q)
          || String(r.instructor).toLowerCase().includes(q);
      });
      listHost.innerHTML = "";
      listHost.appendChild(classesView(shown, classStake, sName));
    }
    draw();
    return wrap;
  }

  function classesView(rows, stakeId, sName) {
    if (!rows.length) return card([empty("No class matches this filter.", "calendar")]);
    const wrapEl = el("div", { class: "card" });

    const narrow = el("div", { class: "only-narrow" });
    rows.forEach(r => narrow.appendChild(el("div", { class: "list-item" + (r.is_today ? " is-today" : "") }, [
      el("div", { class: "when" }, [
        el("div", { class: "d" }, String(new Date(r.date + "T00:00:00").getDate())),
        el("div", { class: "m" }, new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })),
      ]),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.title),
        el("div", { class: "meta" }, `${fmtTime(r.time) || "TBA"} · ${r.room || r.place || "no room"}`),
        el("div", { class: "meta" }, `${r.instructor} · ${r.enrolled} enrolled` +
          (r.recorded ? ` · ${r.present}/${r.recorded} present` : "")),
        el("div", { class: "meta", style: "display:flex;gap:var(--sp-6);margin-top:var(--sp-4);flex-wrap:wrap" }, [
          r.needs_attendance ? el("span", { class: "mini-pill hot" }, "roster not recorded") : null,
          r.is_today ? el("span", { class: "mini-pill mine" }, "today") : null,
          r.status !== "scheduled" ? el("span", { html: statusPill(r.status) }) : null,
        ]),
      ]),
      classActions(r, stakeId, sName),
    ])));
    wrapEl.appendChild(narrow);

    wrapEl.appendChild(el("div", { class: "table-wrap only-wide" }, [el("table", {}, [
      el("thead", {}, [el("tr", {}, [el("th", {}, "When"), el("th", {}, "Class"),
        el("th", {}, "Room"), el("th", {}, "Instructor"), el("th", { class: "num" }, "Enrolled"),
        el("th", { class: "num" }, "Attendance"), el("th", {}, "")])]),
      el("tbody", {}, rows.map(r => el("tr", { class: r.is_today ? "is-today" : "" }, [
        el("td", { style: "white-space:nowrap" }, [
          el("div", { style: "font-weight:600" }, fmtDate(r.date)),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, fmtTime(r.time) || "TBA")]),
        el("td", {}, [el("div", { style: "font-weight:600" }, r.title),
          el("div", { class: "muted", style: "font-size:var(--t-meta)" }, r.category_label)]),
        el("td", {}, r.room || r.place || "—"),
        el("td", {}, r.instructor),
        el("td", { class: "num" }, String(r.enrolled) + (r.waitlisted ? ` (+${r.waitlisted})` : "")),
        el("td", { class: "num" }, r.attendance_rate == null
          ? (r.needs_attendance ? el("span", { class: "mini-pill hot" }, "unrecorded") : "—")
          : el("span", { class: "mini-pill " + (r.attendance_rate >= 75 ? "ok" : "") },
              `${r.present}/${r.recorded} · ${r.attendance_rate}%`)),
        el("td", {}, classActions(r, stakeId, sName)),
      ]))),
    ])]));
    return wrapEl;
  }

  function classActions(r, stakeId, sName) {
    const acts = el("div", { class: "row-actions" });
    acts.appendChild(el("button", { class: "btn secondary sm",
      title: "Project the check-in code", onclick: () => ClassesPage.showQr(r, stakeId, sName) },
      [icon("qr", 14), "Code"]));
    acts.appendChild(iconBtn("download", "Rosters, attendance and badges",
      () => docsModal(stakeId, r)));
    acts.appendChild(el("button", { class: "btn ghost sm", onclick: () => openCourse(stakeId, r.course_id) },
      "Open class"));
    return acts;
  }

  function docsModal(stakeId, r) {
    const dl = (path, name) => {
      API.download(path, name).then(() => toast("Download started"))
        .catch(e => toast(e.message, "err"));
    };
    const base = `/api/stakes/${stakeId}/courses/${r.course_id}`;
    const item = (label, meta, ic, fn) => el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [el("div", { class: "title" }, label),
        el("div", { class: "meta" }, meta)]),
      el("button", { class: "btn secondary sm", onclick: fn }, [icon(ic, 14), "Get"]),
    ]);
    modal({
      title: "Documents · " + r.title,
      sub: "Print-ready files for this class.",
      body: el("div", {}, [
        item("Class roster", "Everyone enrolled, with their contact detail", "list",
          () => dl(`${base}/roster.pdf`, "roster.pdf")),
        item("Roster as spreadsheet", "Same rows, for your own records", "download",
          () => dl(`${base}/roster.csv`, "roster.csv")),
        item("Attendance report", "Session-by-session record with the rate", "chart",
          () => dl(`${base}/attendance.pdf`, "attendance.pdf")),
        item("Badge sheet", "Static QR badges students can check in with", "idcard",
          () => dl(`${base}/badges.pdf`, "badges.pdf")),
      ]),
      actions: [{ label: "Close", onClick: c => c() }],
    });
  }

  // ---------------- mail ----------------
  /* Letters are written by the portal on its own — sign-up receipts, approvals, reset
     codes — and delivery never blocks a decision. This is where an admin checks that
     the letters actually went out, which is the difference between a portal that
     answers people and one that only files notes. */
  async function panelMail() {
    const wrap = el("div");
    wrap.appendChild(loading(2));
    let data;
    try { data = await API.get("/api/admin/mail?limit=80"); }
    catch (e) {
      wrap.innerHTML = "";
      wrap.appendChild(card([empty(e.message, "alert")]));
      return wrap;
    }
    const s = data.settings || {};
    wrap.innerHTML = "";

    const state = card([
      el("h2", { class: "sec-title" }, s.configured ? "Mailbox connected" : "No mailbox yet"),
      s.configured
        ? el("div", { class: "meta" },
            `Letters go out as ${s.from_name || "Gathering Place"} <${s.from_address}>`
            + ` through ${s.host || "the configured server"}`
            + ` · checked ${when(s.checked_at)}`)
        : el("div", {}, [
            el("div", { class: "meta" },
              "Nothing has been emailed. Every letter below is recorded and dated, "
              + "but it stays on this server until a mailbox is connected."),
            el("div", { class: "hint", style: "margin-top:var(--sp-10)" },
              "Add SMTP_HOST, SMTP_USER, the app password and SUPPORT_EMAIL to backend/.env, "
              + "then restart the server. The address a person sees in their inbox comes from there."),
          ]),
    ]);
    wrap.appendChild(state);

    const entries = data.entries || [];
    wrap.appendChild(el("h2", { class: "sec-title", style: "margin-top:var(--sp-22)" },
      entries.length ? `Last ${entries.length} letters` : "Letters"));
    if (!entries.length) {
      wrap.appendChild(empty("The portal has not tried to send anything yet.", "mail"));
      return wrap;
    }
    const list = card([]);
    entries.forEach(r => list.appendChild(mailRow(r)));
    wrap.appendChild(list);
    return wrap;
  }

  function mailPill(status) {
    const tone = { sent: "green", failed: "red", queued: "amber", skipped: "grey" }[status] || "grey";
    return `<span class="pill ${tone}">${String(status || "").replace(/_/g, " ")}</span>`;
  }

  function mailRow(r) {
    return el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, r.to_name || r.to_email),
        el("div", { class: "meta" }, r.to_email),
        el("div", { class: "meta" }, r.subject),
        r.detail ? el("div", { class: "meta" },
          (r.status === "failed" ? "Failed: " : "") + r.detail) : null,
      ]),
      el("div", { style: "flex:none;text-align:right" }, [
        el("span", { html: mailPill(r.status) }),
        el("div", { class: "meta" }, MAIL_KINDS[r.kind] || String(r.kind || "").replace(/_/g, " ")),
        el("div", { class: "meta", style: "margin-top:var(--sp-4);white-space:nowrap" }, when(r.created_at)),
      ]),
    ]);
  }

  // ---------------- activity ----------------
  async function panelActivity() {
    const wrap = el("div");
    const withStakes = [{ id: "", name: "Every stake" }]
      .concat(stakes.filter(s => s.status !== "archived").map(s => ({ id: s.id, name: s.name })));
    const stakeSel = el("select", { "aria-label": "Stake" },
      withStakes.map(s => el("option", { value: s.id }, s.name)));
    stakeSel.value = filt.auditStake;
    stakeSel.addEventListener("change", () => { filt.auditStake = stakeSel.value; paint(); });

    const logs = await API.get("/api/admin/audit?limit=150"
      + (filt.auditStake ? `&stake_id=${filt.auditStake}` : ""));
    const kinds = Array.from(new Set(logs.map(l => String(l.action || "").split(".")[0]))).sort();

    wrap.appendChild(el("div", { class: "filterbar" }, [
      el("div", { class: "f" }, [el("label", {}, "Stake"), stakeSel]),
      el("div", { class: "f" }, [el("label", {}, "Kind"),
        el("select", { "aria-label": "Action kind",
          onchange: ev => { filt.auditKind = ev.target.value; draw(); } },
          [el("option", { value: "all" }, "Every action")].concat(
            kinds.map(k => el("option", { value: k }, logKind(k))))) ]),
    ]));

    const host = el("div");
    wrap.appendChild(host);
    function draw() {
      const shown = logs.filter(l => filt.auditKind === "all"
        || l.action.split(".")[0] === filt.auditKind);
      host.innerHTML = "";
      host.appendChild(card([shown.length ? el("div", {}, shown.map(logRow))
        : empty("Nothing logged for this filter.", "clock")]));
    }
    draw();
    return wrap;
  }

  // ---------------- small shared builders ----------------
  function card(children) { return el("div", { class: "card" }, children); }
  function cardTitle(label, right) {
    return el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:var(--sp-10);margin-bottom:var(--sp-4)" },
      [el("div", { class: "title", style: "font-weight:600" }, label), right || null]);
  }
  function subcard(title, note, node) {
    return el("div", { class: "subcard" }, [
      el("div", { class: "msection" }, [title, note ? el("span", { class: "muted note" }, " · " + note) : null]),
      node]);
  }
  /* A labelled box. The label is tied to the control it names, so a screen reader says
     what the box is when focus lands on it rather than only when it is read top down.
     A wrapped control — the password box, which carries its own show-and-hide button —
     keeps the plain label, because the id belongs to the input inside it. */
  let fieldSeq = 0;
  function field(label, input, hint) {
    const plain = input && ["INPUT", "SELECT", "TEXTAREA"].includes(input.tagName);
    if (plain && !input.id) input.id = "f-" + (++fieldSeq);
    return el("div", { class: "field" }, [el("label", plain ? { for: input.id } : {}, label),
      input, hint ? el("div", { class: "hint" }, hint) : null]);
  }
  function iconBtn(ic, title, fn) {
    return el("button", { class: "btn ghost icon-only", title, "aria-label": title, onclick: fn },
      [icon(ic, 15)]);
  }
  function chipRow(defs, active, onPick) {
    const bar = el("div", { class: "chips" });
    const btns = defs.map(d => {
      const b = el("button", { class: "chip" + (d.key === active ? " on" : ""),
        "data-key": d.key,
        onclick: () => { btns.forEach(x => x.classList.remove("on")); b.classList.add("on"); onPick(d.key); } },
        [d.label, el("span", { class: "c" }, String(d.n))]);
      return b;
    });
    btns.forEach(b => bar.appendChild(b));
    return bar;
  }
  function secretBox(text) {
    return el("div", { class: "secret-box" }, [
      el("code", {}, text || "—"),
      el("button", { class: "btn secondary sm", onclick: () => copy(text) }, "Copy"),
    ]);
  }

  function stakeById(id) {
    return stakes.find(s => s.id === id) || null;
  }
  function stakeName(id) {
    const hit = stakeById(id);
    return hit ? hit.name : "—";
  }
  /* One wording for "how long ago", shared with the bell: the console and the notices must
     never disagree about how old the same stamp is, and a queue of waiting accounts is
     exactly where a person notices that they do. */
  const when = ago;
  async function copy(text) {
    if (!text) return;
    try { await navigator.clipboard.writeText(String(text)); toast("Copied to the clipboard"); }
    catch { toast("Select the text and copy it manually", "err"); }
  }

  return { mount };
})();
