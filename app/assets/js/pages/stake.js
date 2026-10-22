/* The gathering place hub: infrastructure, terms and people for the stake or district
   currently in view.

   Three tiers, taken from Ctx.can() so they match the server: a leader or missionary
   sees the whole place; only the people who run it (admin, missionaries) add places,
   rooms and terms; and the paperwork — settings, the invite code, who belongs — is the
   portal admin's alone. A president watches over everything and edits nothing. */
const StakePage = (() => {
  const { el, toast, icon, statusPill, fmtDate, empty, tile, roleLabel, avatar } = UI;
  const GROUPS = ["stake_president", "district_president", "service_missionary",
                  "instructor", "student"];

  async function mount(target, stakeId) {
    const ctx = App.ctx();
    const stakes = ctx.stakes || [];

    if (!stakes.length) {
      const content = el("div");
      content.appendChild(el("div", { class: "page-head" }, [
        el("h2", { class: "page-title" }, "My gathering places"),
      ]));
      const mine = await API.get("/api/my-stakes").catch(() => []);
      if (mine.some(s => s.stake_status === "pending_approval")) {
        const pend = mine.find(s => s.stake_status === "pending_approval");
        content.appendChild(el("div", { class: "card" }, [
          el("div", { class: "list-item", style: "border:none" }, [
            el("div", { class: "grow" }, [
              el("div", { class: "title" }, pend.stake_name),
              el("div", { class: "meta" }, "Submitted for approval — you'll get full access once a Portal Admin approves it."),
            ]),
            el("span", { html: statusPill("pending_approval") }),
          ]),
        ]));
      } else {
        content.appendChild(el("div", { class: "card" },
          [empty("You haven't joined a stake or district yet. Use an invite code from your leader, or register a new one from the sign-up screen.", "users")]));
      }
      const joinable = await API.get("/api/auth/stakes/joinable").catch(() => []);
      if (joinable.length) {
        content.appendChild(el("div", { class: "sec-title" }, "Active places you can join"));
        const c = el("div", { class: "card" });
        /* The code is not shown here on purpose — it is what a leader hands over, and
           printing every place's code on one screen would make it worthless. */
        joinable.forEach(s => c.appendChild(el("div", { class: "list-item" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, s.name),
            el("div", { class: "meta" }, "Ask this place's leader for its invite code to join"),
          ]),
          el("span", { class: "pill grey" }, s.org_kind),
        ])));
        content.appendChild(c);
      }
      UI.render(target, UI.shell("stake", content, App.nav(), ctx));
      return;
    }

    const cur = (stakeId && stakes.find(s => s.id === +stakeId)) || ctx.stake || stakes[0];
    const stakeId_ = cur.id;
    Ctx.setStake(stakeId_);
    const word = cur.label || (cur.kind === "district" ? "District" : "Stake");
    const seesAll = Ctx.can(cur, "govern");      // leader or missionary: the whole place
    const runs = Ctx.can(cur, "places");         // ...and the people who run it day to day
    const paper = Ctx.can(cur, "settings");      // portal admin only: the paperwork
    const writes = Ctx.can(cur, "contacts");     // may reach people from a row

    const dash = await API.get(`/api/stakes/${stakeId_}/dashboard`);
    const content = el("div");
    content.appendChild(el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, dash.stake.name),
        el("div", { class: "page-sub" },
          `${word} · ${dash.active_term ? dash.active_term.name : "no active term"}` +
          (seesAll && !runs ? " · viewing only" : "")),
      ]),
      el("div", { class: "actions" }, [
        el("a", { class: "btn secondary sm", href: `#/analytics/${stakeId_}` },
          [icon("chart", 15), "Analytics"]),
      ]),
    ]));
    content.appendChild(el("div", { class: "stat-grid" }, [
      tile(dash.gathering_places, "Gathering places"),
      tile(dash.active_courses, "Courses"),
      tile(dash.active_enrollments, "Enrolled"),
      tile(dash.members, "People"),
    ]));

    if (!seesAll) {
      content.appendChild(el("div", { class: "card", style: "margin-top:var(--sp-16)" }, [
        el("div", { class: "list-item", style: "border:none" }, [
          icon("pin", 20),
          el("div", { class: "grow", style: "margin-left:var(--sp-10)" }, [
            el("div", { class: "meta" }, "Browse Classes or Courses to enrol, and check My record for the classes you have attended."),
            el("div", { class: "meta", style: "margin-top:var(--sp-4)" },
              `${word} settings, rooms and the people list are kept by the people who run this place.`),
          ]),
        ]),
      ]));
      UI.render(target, UI.shell("stake", content, App.nav(), ctx));
      return;
    }

    if (cur.status && cur.status !== "active") {
      /* The admin gets here from Portal control with a stake that is not open yet. Saying
         so is the point: the work below is real, and the doors it leads to are not. */
      content.appendChild(el("div", { class: "card", style: "margin-top:var(--sp-16)" }, [
        el("div", { class: "list-item", style: "border:none" }, [
          icon("alert", 20),
          el("div", { class: "grow", style: "margin-left:var(--sp-10)" }, [
            el("div", { class: "title", style: "display:flex;gap:var(--sp-8);align-items:center" },
              [word + " is " + cur.status.replace("_", " "), el("span", { html: statusPill(cur.status) })]),
            el("div", { class: "meta", style: "margin-top:var(--sp-4)" },
              "Places, rooms, terms and people are still managed from here, but nobody can "
              + "sign in to this " + word.toLowerCase() + " or join it with the invite code "
              + "until it is made active in Portal control."),
          ]),
        ]),
      ]));
    }

    const places = await API.get(`/api/stakes/${stakeId_}/places`);
    content.appendChild(await placesSection(stakeId_, runs, places));
    content.appendChild(await termsSection(stakeId_, runs));
    content.appendChild(await peopleSection(stakeId_, paper, writes));
    content.appendChild(await wardsSection(stakeId_, word));
    if (runs) content.appendChild(settingsSection(stakeId_, dash.stake, paper));
    content.appendChild(certSection(stakeId_, places, paper));
    UI.render(target, UI.shell("stake", content, App.nav(), ctx));
  }

  async function placesSection(stakeId, runs, places) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "Gathering places & rooms"));
    const card = el("div", { class: "card" });
    if (!places.length) card.appendChild(empty(runs ? "No gathering places yet — add your first below."
                                                    : "No gathering places have been registered yet.", "pin"));
    for (const p of places) {
      const rooms = await API.get(`/api/stakes/${stakeId}/places/${p.id}/rooms`);
      card.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, p.name + (p.is_active ? "" : " (inactive)")),
          el("div", { class: "meta" }, (p.address || p.place_type) + " · " +
            (rooms.length ? `${rooms.length} room${rooms.length === 1 ? "" : "s"}` : "no rooms")),
        ]),
        runs ? el("button", { class: "btn secondary sm", onclick: () => addRoom(stakeId, p.id) },
          [icon("plus", 15), "Room"]) : null,
        runs && p.is_active ? el("button", { class: "btn ghost icon-only",
          title: "Archive " + p.name, onclick: () => archivePlace(stakeId, p) },
          [icon("trash", 15)]) : null,
        /* An archived place used to leave the operator with nothing to press at all: the
           row said "(inactive)" and stayed that way for good. Archiving is a pause, so the
           way back has to sit on the same row. */
        runs && !p.is_active ? el("button", { class: "btn secondary sm",
          onclick: () => reopenPlace(stakeId, p) }, [icon("refresh", 15), "Bring back"]) : null,
      ]));
      /* Rooms are listed rather than named in one line, because a room typed with the
         wrong name is the one thing here that can still be taken out completely — and
         only while no class has ever been booked into it. When one has, the classes are
         named right here: the room is not blocked by a number, it is blocked by a class. */
      for (const r of rooms) {
        const held = (r.booked || []).map(b => b.title);
        card.appendChild(el("div", { class: "list-item sub" }, [
          el("div", { class: "grow" }, [
            el("div", { class: "title" }, r.name),
            el("div", { class: "meta" }, `holds ${r.capacity}` + (r.classes
              ? ` · ${r.classes} class${r.classes === 1 ? "" : "es"} booked`
              + (held.length ? `: ${held.join(", ")}` : "")
              : " · no class booked in it yet")),
          ]),
          runs ? el("button", { class: "btn ghost icon-only",
            title: (r.classes ? "What is booked in " : "Remove ") + r.name,
            onclick: () => removeRoom(stakeId, p, r) }, [icon("trash", 15)]) : null,
        ]));
      }
    }
    if (!runs) { wrap.appendChild(card); return wrap; }
    const name = el("input", { placeholder: "New gathering place name" });
    const addr = el("input", { placeholder: "Address (optional)" });
    card.appendChild(el("hr", { class: "hr" }));
    card.appendChild(el("div", { class: "row" }, [
      el("div", { class: "field", style: "flex:2" }, [el("label", {}, "Add a gathering place"), name]),
      el("div", { class: "field", style: "flex:2" }, [el("label", {}, "Address"), addr]),
      el("div", { class: "field", style: "flex:0 0 auto;display:flex;align-items:flex-end" }, [
        el("button", { class: "btn sm", style: "height:42px", onclick: async () => {
          if (!name.value) return toast("Enter a place name", "err");
          try { await API.post(`/api/stakes/${stakeId}/places`,
            { name: name.value, address: addr.value, place_type: "physical" });
            toast("Gathering place added"); refresh(stakeId); }
          catch (e) { toast(e.message, "err"); }
        }}, [icon("plus", 15), "Add"])]),
    ]));
    wrap.appendChild(card);
    return wrap;
  }

  async function archivePlace(stakeId, p) {
    const ok = await UI.confirm(
      `${p.name} comes off the places list and out of the course picker. Anything already `
      + `taught there keeps its record. Classes still meeting here have to be archived first.`,
      { danger: true, okLabel: "Archive", title: `Archive ${p.name}?` });
    if (!ok) return;
    try {
      await API.del(`/api/stakes/${stakeId}/places/${p.id}`);
      toast(`${p.name} archived`);
      UI.announce(`${p.name} has been archived.`);
      refresh(stakeId);
    } catch (e) { toast(e.message, "err"); }
  }

  async function reopenPlace(stakeId, p) {
    const ok = await UI.confirm(
      `${p.name} goes back on the places list and into the course picker. Its rooms and `
      + `everything already taught there are untouched — nothing was moved while it was shut.`,
      { okLabel: "Bring back", title: `Bring ${p.name} back?` });
    if (!ok) return;
    try {
      await API.post(`/api/stakes/${stakeId}/places/${p.id}/restore`, {});
      toast(`${p.name} is open again`);
      UI.announce(`${p.name} has been brought back.`);
      refresh(stakeId);
    } catch (e) { toast(e.message, "err"); }
  }

  async function removeRoom(stakeId, place, r) {
    const held = r.booked || [];
    if (!r.classes) {
      const ok = await UI.confirm(
        `${r.name} is removed from ${place.name} for good. No class is booked in it, so `
        + `nothing in the records loses its room.`,
        { danger: true, okLabel: "Remove", title: `Remove ${r.name}?` });
      if (!ok) return;
      try {
        await API.del(`/api/stakes/${stakeId}/places/${place.id}/rooms/${r.id}`);
        toast("Room removed");
        UI.announce(`${r.name} has been removed.`);
        refresh(stakeId);
      } catch (e) { toast(e.message, "err"); }
      return;
    }
    /* The room is held, so this dialog's job is to unhold it. Naming the classes is the
       first half — "2 classes booked" tells you nothing you can act on, and an archived
       class is not even on the list you would go and look through. Moving them all at once
       is the second half, and deleting the ones that never held anything is the third. */
    const others = el("select", { disabled: "true" });
    others.appendChild(el("option", { value: "" }, "Loading the rooms…"));
    const move = el("button", { class: "btn sm", disabled: true, onclick: async () => {
      if (!others.value) return toast("Choose the room to move them into", "err");
      try {
        const did = await API.post(`/api/stakes/${stakeId}/rooms/${r.id}/rebook`
          + `?to_room_id=${others.value}`);
        toast(`${did.moved} class${did.moved === 1 ? "" : "es"} moved to ${did.to_room}`);
        UI.announce(`Every class in ${r.name} has been moved to ${did.to_room}. `
          + `${r.name} can now be removed.`);
        close();
        refresh(stakeId);
      } catch (e) { toast(e.message, "err"); }
    } }, [icon("refresh", 15), "Move them all"]);
    const list = el("div", {}, held.map(b => el("div", { class: "list-item sub" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, b.title),
        // why it holds the room, and what can therefore be done about it
        el("div", { class: "meta" }, (b.active
          ? "still running"
          : "archived") + (b.can_erase
            ? " · nothing has ever been taken in it, so it can be deleted and release "
              + "the room"
            : " · its roster and the attendance taken in it name this room, so it can "
              + "only be moved")),
      ]),
      b.can_erase ? el("button", { class: "btn danger sm", onclick: async () => {
        const ok = await UI.confirm(
          `Delete "${b.title}" for good? Nothing was ever taken in it, so no record is `
          + `lost — and ${r.name} loses one class holding it.`,
          { danger: true, okLabel: "Delete", title: `Delete "${b.title}"?` });
        if (!ok) return;
        try {
          await API.del(`/api/stakes/${stakeId}/courses/${b.id}/erase`);
          toast(`"${b.title}" deleted`);
          close();
          refresh(stakeId);
        } catch (e) { toast(e.message, "err"); }
      } }, [icon("trash", 15), "Delete"])
        : el("span", { class: "pill grey" }, "move only"),
    ])));
    const { close } = UI.modal({
      title: `What is holding ${r.name}`,
      sub: `${held.length} class${held.length === 1 ? "" : "es"} booked into it, running or `
           + `archived. The room goes once none does.`,
      body: el("div", {}, [
        list,
        el("hr", { class: "hr" }),
        el("div", { class: "field" }, [
          el("label", {}, "Move every class into another room"),
          el("div", { style: "display:flex;gap:var(--sp-8);align-items:center" }, [others, move]),
          el("div", { class: "meta" },
            "Nothing is half-moved: if a class will not fit, or the hour is already taken in "
            + "the room you picked, the move is refused and every class keeps its room. To "
            + "change one class's room instead, use Edit on its class in Courses."),
        ]),
      ]),
      actions: [{ label: "Close", kind: "secondary", onClick: c => c() }],
    });
    /* Every other room in the stake, not just this place's: a class is usually being moved
       because it was booked in the wrong room to begin with. */
    (async () => {
      const places = await API.get(`/api/stakes/${stakeId}/places`);
      const grouped = await Promise.all(places.map(async p => ({
        place: p, rooms: await API.get(`/api/stakes/${stakeId}/places/${p.id}/rooms`),
      })));
      others.innerHTML = "";
      others.appendChild(el("option", { value: "" }, "Choose a room…"));
      grouped.forEach(({ place: p, rooms }) => {
        const usable = rooms.filter(x => x.id !== r.id);
        if (!usable.length) return;
        const group = el("optgroup", { label: p.name });
        usable.forEach(x => group.appendChild(el("option", { value: String(x.id) },
          `${x.name} · ${p.name} (holds ${x.capacity})`)));
        others.appendChild(group);
      });
      if (others.options.length > 1) { others.disabled = false; move.disabled = false; }
      else {
        others.options[0].textContent = "No other room to move them into yet";
      }
    })().catch(e => toast(e.message, "err"));
  }

  async function addRoom(stakeId, placeId) {
    const name = el("input", { placeholder: "e.g. Room C" });
    const cap = el("input", { type: "number", value: "30", min: "1" });
    UI.modal({
      title: "Add a room", sub: "Rooms are used for scheduling and capacity.",
      body: el("div", {}, [
        el("div", { class: "field" }, [el("label", {}, "Room name"), name]),
        el("div", { class: "field" }, [el("label", {}, "Capacity"), cap]),
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Add room", onClick: async c => {
          if (!name.value) return toast("Enter a room name", "err");
          try { await API.post(`/api/stakes/${stakeId}/places/${placeId}/rooms`,
            { name: name.value, capacity: +cap.value });
            toast("Room added"); c(); refresh(stakeId); }
          catch (e) { toast(e.message, "err"); }
        }},
      ],
    });
  }

  async function termsSection(stakeId, runs) {
    /* A term filed away has to stay findable by the people who run the place — an archive
       click that went one row too far used to vanish the term from every screen, records
       intact but unreachable. Everyone else gets the plain list, because an archived term
       is not something a student should be offered. */
    const termsUrl = `/api/stakes/${stakeId}/terms` + (runs ? "?include_archived=true" : "");
    let terms = await API.get(termsUrl);
    let live = [], filed = [];
    const split = () => {
      live = terms.filter(t => !t.is_archived);
      filed = terms.filter(t => t.is_archived);
    };
    split();

    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "Academic terms"));
    const card = el("div", { class: "card" });
    const list = el("div");
    card.appendChild(list);
    let showFiled = false;

    function termRow(t) {
      const when = fmtDate(t.start_date) + " → " + fmtDate(t.end_date);
      const held = t.classes
        ? `${t.classes} class${t.classes === 1 ? "" : "es"} scheduled`
        : "nothing scheduled in it yet";
      return el("div", { class: "list-item" + (t.is_archived && showFiled ? " sub" : "") }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, t.name),
          el("div", { class: "meta" }, when + " · " + held),
        ]),
        t.is_active ? el("span", { class: "pill green" }, "current") : null,
        t.is_archived ? el("span", { class: "pill" }, "archived") : null,
        runs ? el("button", { class: "btn ghost sm",
          onclick: () => editTerm(stakeId, t, reload) }, "Edit") : null,
        runs && t.is_archived ? el("button", { class: "btn secondary sm",
          onclick: () => restoreTerm(stakeId, t, reload) }, [icon("refresh", 15), "Bring back"]) : null,
        runs && !t.is_archived ? el("button", { class: "btn ghost sm",
          onclick: () => archiveTerm(stakeId, t, live.length, reload) }, "Archive") : null,
        /* Offered only where the server will take it: a term whose classes carry records
           can be filed away, not deleted, and the row says so in the same breath. */
        runs && t.can_erase ? el("button", { class: "btn ghost icon-only",
          title: "Delete " + t.name + " for good",
          onclick: () => eraseTerm(stakeId, t, reload) }, [icon("trash", 15)]) : null,
      ]);
    }

    function draw() {
      list.innerHTML = "";
      live.forEach(t => list.appendChild(termRow(t)));
      if (showFiled) filed.forEach(t => list.appendChild(termRow(t)));
      if (!live.length && !filed.length) {
        list.appendChild(empty(runs ? "No terms yet — create one to start scheduling classes."
                                    : "No terms have been created yet.", "calendar"));
      } else if (!live.length && runs) {
        list.appendChild(empty("Every term here has been archived, so no class can be "
          + "scheduled yet. Bring one back below.", "calendar"));
      }
      if (filed.length && runs) {
        list.appendChild(el("button", { class: "btn ghost sm", onclick: () => {
          showFiled = !showFiled;
          draw();
          UI.announce(showFiled ? `Showing ${filed.length} archived term(s).`
                                : `Hiding ${filed.length} archived term(s).`);
        } }, (showFiled ? "Hide archived (" : "Show archived (") + filed.length + ")"));
      }
    }
    draw();

    /* Refetched and redrawn here rather than reloading the whole hub: nothing else on the
       page changes when a term does, and a full reload would close the archived list the
       person is looking at. */
    async function reload(showArchived) {
      if (showArchived) showFiled = true;
      try { terms = await API.get(termsUrl); } catch (e) { return toast(e.message, "err"); }
      split();
      draw();
    }

    if (runs) {
      const tname = el("input", { placeholder: "e.g. 2026 Term 4" });
      const tstart = el("input", { type: "date" });
      const tend = el("input", { type: "date" });
      card.appendChild(el("hr", { class: "hr" }));
      card.appendChild(el("label", {}, "New term"));
      card.appendChild(tname);
      card.appendChild(el("div", { class: "row", style: "margin-top:var(--sp-8)" }, [tstart, tend]));
      card.appendChild(el("button", { class: "btn", style: "margin-top:var(--sp-10)", onclick: async () => {
        if (!tname.value || !tstart.value || !tend.value) return toast("Fill in the term name and dates", "err");
        try { await API.post(`/api/stakes/${stakeId}/terms`,
          { name: tname.value, start_date: tstart.value, end_date: tend.value });
          toast("Term created — it is the current term now"); reload(); }
        catch (e) { toast(e.message, "err"); }
      }}, [icon("plus", 16), "Create term"]));
    }
    wrap.appendChild(card);
    return wrap;
  }

  /* The three fields the term row shows, sent whole: the server reads an edit as the new
     shape of the term rather than a patch of one field, so the form has to be complete. */
  function editTerm(stakeId, t, after) {
    const name = el("input", { value: t.name });
    const start = el("input", { type: "date", value: t.start_date });
    const end = el("input", { type: "date", value: t.end_date });
    const current = el("input", { type: "checkbox", checked: t.is_active });
    const currentField = el("div", { class: "field" }, [
      el("label", {}, [current, " This is the term running now"]),
      el("div", { class: "meta" }, "The dashboards, the class picker and the reports all "
        + "open on this term. Only one term can hold it."),
    ]);
    UI.modal({
      title: "Edit " + t.name,
      sub: t.classes
        ? `Its ${t.classes} class${t.classes === 1 ? "" : "es"} `
          + `${t.classes === 1 ? "keeps" : "keep"} its own days and hours — changing these `
          + "dates moves no record."
        : "Nothing is scheduled in this term yet.",
      body: el("div", {}, [
        el("div", { class: "field" }, [el("label", {}, "Term name"), name]),
        el("div", { class: "field" }, [el("label", {}, "First day"), start]),
        el("div", { class: "field" }, [el("label", {}, "Last day"), end]),
        t.is_archived ? null : currentField,
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Save term", onClick: async c => {
          if (!name.value.trim()) return toast("Give the term a name", "err");
          if (!start.value || !end.value) return toast("Fill in both days", "err");
          try {
            await API.patch(`/api/stakes/${stakeId}/terms/${t.id}`, {
              name: name.value.trim(), start_date: start.value, end_date: end.value,
              is_active: t.is_archived ? undefined : current.checked,
            });
            c();
            toast(`${name.value.trim()} saved`);
            UI.announce(`${t.name} has been updated.`);
            after();
          } catch (e) { toast(e.message, "err"); }
        }},
      ],
    });
  }

  async function archiveTerm(stakeId, t, liveCount, after) {
    const onlyOne = liveCount <= 1;
    const ok = await UI.confirm(
      `${t.name} comes off the term list. Its classes, rosters and attendance keep their `
      + `records and can be brought back. ` + (t.classes
        ? `${t.classes} class${t.classes === 1 ? "" : "es"} stay scheduled in it.`
        : "Nothing is scheduled in it.")
      + (onlyOne ? " It is the only term on the list — with no term left, classes cannot be "
        + "scheduled until one is created or this one is brought back." : ""),
      { danger: false, okLabel: "Archive", title: `Archive ${t.name}?` });
    if (!ok) return;
    try {
      await API.post(`/api/stakes/${stakeId}/terms/${t.id}/archive`);
      toast(`${t.name} archived — it stays listed under "Show archived"`);
      UI.announce(`${t.name} has been archived. It is still in the records, and can be brought back.`);
      // Left open on purpose: the next thing whoever archived a term wants is to see it.
      after(true);
    } catch (e) { toast(e.message, "err"); }
  }

  async function restoreTerm(stakeId, t, after) {
    try {
      await API.post(`/api/stakes/${stakeId}/terms/${t.id}/restore`);
      toast(`${t.name} is back on the list`);
      UI.announce(`${t.name} has been brought back. It is not the current term — turn that on `
        + `with Edit if it should be.`);
      after();
    } catch (e) { toast(e.message, "err"); }
  }

  async function eraseTerm(stakeId, t, after) {
    const ok = await UI.confirm(
      `${t.name} is deleted for good. Nothing has ever been scheduled in it, so no record is `
      + `lost. A term that classes have been taught in can only be archived — this one is empty.`,
      { danger: true, okLabel: "Delete", title: `Delete ${t.name}?` });
    if (!ok) return;
    try {
      await API.del(`/api/stakes/${stakeId}/terms/${t.id}/erase`);
      toast(`${t.name} deleted`);
      UI.announce(`${t.name} has been deleted.`);
      after();
    } catch (e) { toast(e.message, "err"); }
  }

  async function peopleSection(stakeId, paper, writes) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "People"));
    const members = await API.get(`/api/stakes/${stakeId}/members`);
    const card = el("div", { class: "card" });
    const byRole = {};
    GROUPS.forEach(r => { byRole[r] = []; });
    // a role outside the hub's five groups still has to be shown, not dropped
    members.forEach(m => {
      const bucket = byRole[m.role] || (byRole[m.role] = []);
      bucket.push(m);
    });
    const order = GROUPS.filter(r => byRole[r] && byRole[r].length)
      .concat(Object.keys(byRole).filter(r => !GROUPS.includes(r)));
    order.forEach(role => {
      const list = byRole[role];
      card.appendChild(el("div", { class: "meta muted",
        style: "margin:var(--sp-8) 0 var(--sp-2);font-size:var(--t-fine);font-weight:700;letter-spacing:.06em;text-transform:uppercase",
        html: roleLabel(role) + " · " + list.length }));
      list.forEach(m => card.appendChild(el("div", { class: "list-item" }, [
        avatar({ full_name: m.name, photo_url: m.photo_url }),
        el("div", { class: "grow" }, [
          /* A person who asked to join is waiting on the portal admin, not switched off;
             reading both as "(inactive)" tells the president the wrong story. */
          el("div", { class: "title" }, m.name + (m.status === "pending_approval"
            ? " (awaiting approval)" : m.status !== "active" ? " (inactive)" : "")),
          el("div", { class: "meta" }, (m.email || "") + (m.phone ? " · " + m.phone : "")),
        ]),
        writes ? el("button", { class: "btn ghost icon-only", title: "Message " + m.name,
          onclick: () => MessagesPage.compose({ audience: "direct", recipient_id: m.user_id,
            recipient_name: m.name }) }, [icon("send", 15)]) : null,
        paper && role !== "stake_president"
          ? el("button", { class: "btn ghost icon-only", title: "Remove from this place",
              onclick: async () => {
              const ok = await UI.confirm(`Remove ${m.name} from this stake?`, { danger: true, okLabel: "Remove" });
              if (!ok) return;
              await API.del(`/api/stakes/${stakeId}/members/${m.user_id}`); toast("Removed"); refresh(stakeId);
            }}, [icon("trash", 15)]) : null,
      ])));
    });
    if (!order.length) card.appendChild(empty(
      "No one has joined yet. Share the invite code below, or add a person who already has an account.", "users"));
    if (paper) {
      card.appendChild(el("hr", { class: "hr" }));
      card.appendChild(el("div", { class: "meta muted", style: "font-size:var(--t-ui)" },
        "Add someone who already has an account, by email:"));
      const aemail = el("input", { type: "email", placeholder: "person@example.org" });
      const arole = el("select", {}, GROUPS.map(r => el("option", { value: r }, roleLabel(r))));
      card.appendChild(el("div", { class: "row", style: "margin-top:var(--sp-8)" }, [aemail, arole,
        el("button", { class: "btn sm", style: "align-self:flex-end;height:42px", onclick: async () => {
          try { await API.post(`/api/stakes/${stakeId}/members?email=${encodeURIComponent(aemail.value)}&role=${arole.value}`);
            toast("Member added"); refresh(stakeId); }
          catch (e) { toast(e.message, "err"); }
        }}, [icon("userplus", 15), "Add"])]));
    }
    wrap.appendChild(card);
    return wrap;
  }

  /* The plural of person is people. Five screens here count young single adults out loud,
     so the one place that spells it is the place that gets it right. */
  const persons = n => (n === 1 ? "person" : "people");

  /* A ward is a line on this tenant's list rather than a note beside a person, so the
     names here are the words every roster, badge and report prints — and the count under
     each name is the reason the list exists. Whoever watches the place keeps the list: a
     ward typed twice is merged, a ward named wrong is renamed, and one nobody stands under
     can be taken off. A ward that has people in it is never deleted, only renamed or
     merged, because their records name it. */
  async function wardsSection(stakeId, word) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "Wards & branches"));
    const card = el("div", { class: "card" });
    const list = el("div");
    card.appendChild(list);
    let roll = { wards: [], unassigned: 0 };
    try { roll = await API.get(`/api/stakes/${stakeId}/ward-roll`); }
    catch (e) { card.appendChild(empty(e.message, "alert")); wrap.appendChild(card); return wrap; }

    function wardRow(w) {
      return el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, w.name),
          el("div", { class: "meta" }, w.people === 0
            ? "nobody recorded under this name yet"
            : `${w.people} ${persons(w.people)} on the roll`),
        ]),
        el("button", { class: "btn ghost sm", onclick: () => renameWard(stakeId, w, reload) },
          [icon("edit", 15), "Rename"]),
        // Two wards stay on the list until someone says they are one, and the row that
        // goes is the one this button was pressed on.
        roll.wards.length > 1 ? el("button", { class: "btn ghost sm",
          onclick: () => mergeWard(stakeId, w, roll.wards, reload) },
          [icon("users", 15), "Merge into…"]) : null,
        /* Offered only where the server will take it — and a ward with people under it
           explains itself in the row above, rather than leaving a missing button to guess. */
        w.can_erase ? el("button", { class: "btn ghost icon-only",
          title: "Remove " + w.name + " from the list",
          onclick: () => removeWard(stakeId, w, reload) }, [icon("trash", 15)]) : null,
      ]);
    }

    function draw() {
      list.innerHTML = "";
      if (!roll.wards.length) {
        list.appendChild(empty(`No ward on this ${word.toLowerCase()}’s list yet. One appears `
          + "here the first time a person writes it at sign-up — or add it below.", "users"));
      } else roll.wards.forEach(w => list.appendChild(wardRow(w)));
      if (roll.unassigned) list.appendChild(el("div", { class: "meta muted",
        style: "padding:var(--sp-8) var(--sp-2) 0;font-size:var(--t-ui)" },
        `${roll.unassigned} ${persons(roll.unassigned)} here ${roll.unassigned === 1 ? "has" : "have"} no ward `
        + "recorded. They can put it on their own profile, or add the ward below and name it "
        + "when you register them."));
    }
    draw();

    /* Refetched and redrawn here rather than reloading the whole hub: nothing else on the
       page changes when a ward does. */
    async function reload() {
      try { roll = await API.get(`/api/stakes/${stakeId}/ward-roll`); }
      catch (e) { return toast(e.message, "err"); }
      draw();
    }

    const wname = el("input", { placeholder: "e.g. Nsawam Ward" });
    card.appendChild(el("hr", { class: "hr" }));
    card.appendChild(el("div", { class: "meta muted", style: "font-size:var(--t-ui)" },
      `Add a ward to this ${word.toLowerCase()}’s list, so the people who attend it can pick `
      + "the name instead of typing it:"));
    card.appendChild(el("div", { class: "row", style: "margin-top:var(--sp-8)" }, [wname,
      el("button", { class: "btn sm", style: "align-self:flex-end;height:42px",
        onclick: async () => {
          if (!wname.value.trim()) return toast("A ward needs a name", "err");
          try {
            await API.post(`/api/stakes/${stakeId}/wards`, { name: wname.value.trim() });
            toast("Ward added"); wname.value = ""; reload();
          } catch (e) { toast(e.message, "err"); }
        }}, [icon("plus", 15), "Add"])]));
    wrap.appendChild(card);
    return wrap;
  }

  function renameWard(stakeId, w, reload) {
    const name = el("input", { value: w.name });
    UI.modal({
      title: "Rename a ward",
      sub: "The people stay where they are — this changes the name on the list.",
      body: el("div", { class: "field" }, [el("label", {}, "Ward name"), name,
        el("div", { class: "hint" }, "Every roster, badge and report printed for this ward "
          + "takes the new name from here on.")]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Save name", onClick: async c => {
          if (!name.value.trim()) return toast("A ward needs a name", "err");
          try {
            await API.patch(`/api/stakes/${stakeId}/wards/${w.id}`, { name: name.value.trim() });
            toast("Ward renamed"); c(); reload();
          } catch (e) { toast(e.message, "err"); }
        }},
      ],
    });
  }

  function mergeWard(stakeId, w, wards, reload) {
    const others = wards.filter(x => x.id !== w.id);
    const into = el("select", {}, others.map(x => el("option", { value: x.id },
      `${x.name} · ${x.people} ${persons(x.people)}`)));
    UI.modal({
      title: `Merge ${w.name} into another ward`,
      sub: `${w.people} ${persons(w.people)} ${w.people === 1 ? "is" : "are"} recorded under ${w.name}. `
        + "They all move to the ward that stays, and this name comes off the list.",
      body: el("div", {}, [
        el("div", { class: "field" }, [el("label", {}, "Keep this ward"), into]),
        el("div", { class: "hint" }, "Use this when one ward was written two ways. Nothing is "
          + "deleted: the people come across with their classes and the attendance taken in "
          + "them, and the record keeps the name that stays."),
      ]),
      actions: [
        { label: "Cancel", kind: "secondary", onClick: c => c() },
        { label: "Merge wards", onClick: async c => {
          try {
            const r = await API.post(`/api/stakes/${stakeId}/wards/${w.id}/merge`,
              { into_id: +into.value });
            toast(`${r.moved} ${persons(r.moved)} moved to ${r.into.name}`);
            UI.announce(`${w.name} has been merged into ${r.into.name}.`);
            c(); reload();
          } catch (e) { toast(e.message, "err"); }
        }},
      ],
    });
  }

  async function removeWard(stakeId, w, reload) {
    const ok = await UI.confirm(
      `${w.name} comes off this list for good. Nobody is recorded under it, so no person's `
      + "record, roster or badge loses a name.",
      { danger: true, okLabel: "Remove", title: `Remove ${w.name}?` });
    if (!ok) return;
    try {
      await API.del(`/api/stakes/${stakeId}/wards/${w.id}`);
      toast("Ward removed");
      UI.announce(`${w.name} has been removed from the ward list.`);
      reload();
    } catch (e) { toast(e.message, "err"); }
  }

  function settingsSection(stakeId, stake, paper) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "Invite & settings"));
    const card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "list-item" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, "Invite code"),
        el("div", { class: "meta" }, "Share it with instructors and students so they can join this place"),
      ]),
      el("span", { class: "pill blue", style: "font-size:var(--t-body);letter-spacing:.12em;padding:var(--sp-6) var(--sp-12)" },
        stake.invite_code || "—"),
    ]));
    if (paper) {
      card.appendChild(el("button", { class: "btn ghost sm", onclick: async () => {
        const r = await API.post(`/api/stakes/${stakeId}/invite-code/regenerate`);
        toast("New invite code: " + r.invite_code); refresh(stakeId);
      }}, [icon("refresh", 15), "Regenerate code"]));
    }
    const color = el("input", { type: "color", value: stake.color || stake.branding_color || "#085088",
      style: "height:42px;padding:var(--sp-4)" });
    const grace = el("input", { type: "number", min: "0", max: "120",
      value: stake.attendance_grace_minutes ?? 15 });
    const lateAfter = el("input", { type: "number", min: "0", max: "120",
      value: stake.late_after_minutes ?? 10 });
    if (!paper) { wrap.appendChild(card); return wrap; }
    card.appendChild(el("hr", { class: "hr" }));
    card.appendChild(el("div", { class: "row", style: "align-items:flex-end" }, [
      el("div", { class: "field", style: "flex:0 0 auto" }, [el("label", {}, "Branding color"), color]),
      el("div", { class: "field", style: "flex:0 0 auto" }, [
        el("button", { class: "btn secondary sm", style: "height:42px", onclick: async () => {
          await API.patch(`/api/stakes/${stakeId}/settings`, { branding_color: color.value });
          toast("Branding saved");
        }}, "Save")]),
    ]));
    card.appendChild(el("hr", { class: "hr" }));
    card.appendChild(el("div", { class: "title", style: "font-weight:700;margin-bottom:var(--sp-8)" },
      "Attendance check-in window"));
    card.appendChild(el("div", { class: "row", style: "align-items:flex-end" }, [
      el("div", { class: "field" }, [el("label", {}, "Grace (min before/after start)"), grace]),
      el("div", { class: "field" }, [el("label", {}, "Count as late after (min)"), lateAfter]),
      el("div", { class: "field", style: "flex:0 0 auto" }, [
        el("button", { class: "btn secondary sm", style: "height:42px", onclick: async () => {
          try {
            await API.patch(`/api/stakes/${stakeId}/settings`, {
              attendance_grace_minutes: +grace.value, late_after_minutes: +lateAfter.value });
            toast("Check-in window saved");
          } catch (e) { toast(e.message, "err"); }
        }}, "Save")]),
    ]));
    wrap.appendChild(card);
    return wrap;
  }

  /* One line per gathering place, because that is how a certificate is decided: the
     designer draws a sheet for *this* place, and the Portal Admin places the lines on it.
     Leaders open it to see why a name came out where it did — the placement is theirs to
     read, the artwork and the positions are the portal admin's to set.

     Each row goes to the Certificates page rather than opening a window here: a sheet with
     handles on it deserves an address of its own, and the same page is one tap away in the
     navigation bar. */
  function certSection(stakeId, places, paper) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "sec-title" }, "Certificates"));
    const card = el("div", { class: "card" });
    if (!places.length) card.appendChild(empty("No gathering places yet.", "pin"));
    for (const p of places) {
      const own = p.cert_style === "custom" && p.cert_design_url;
      card.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, p.name),
          el("div", { class: "meta" }, own
            ? "Prints on the artwork this place uploaded, where the lines were placed."
            : "Prints on the portal's own certificate design."),
        ]),
        el("span", { class: "pill " + (own ? "blue" : "grey") }, own ? "Own design" : "Portal design"),
        el("a", { class: "btn secondary sm", href: "#/certificates/" + p.id,
                  title: "Certificate for " + p.name },
          [icon("file", 15), paper ? "Place the lines" : "Look inside"]),
      ]));
    }
    if (!paper) card.appendChild(el("div", { class: "meta", style: "padding:var(--sp-12) var(--sp-16) var(--sp-6)" },
      "Only the Portal Admin can put a design up or move a line. Ask for a sample before "
      + "the awards night, not after."));
    wrap.appendChild(card);
    return wrap;
  }

  function refresh(stakeId) { mount(document.getElementById("app"), stakeId); }
  return { mount };
})();
