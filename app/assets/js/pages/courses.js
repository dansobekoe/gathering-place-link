/* Courses: students search the catalogue and enrol; instructors claim the classes
   the admin or a service missionary published; the people who run a stake create
   classes and book them into rooms.

   Two rules shape this page. A class lives in a room — the gathering place is a
   consequence of that booking, never a choice of its own — and a president only
   watches, so every button here is keyed to Ctx.can(), never to who signs the call. */
const CoursesPage = (() => {
  const { el, toast, icon, fmtTime, WEEKDAYS, CATEGORIES, empty, coverTile } = UI;
  const metaFlex = "display:flex;gap:var(--sp-8);align-items:center;margin-top:var(--sp-4)";

  /* The words a certificate line may name; the printer swaps each one for that member's
     own when it prints. The authority for this list is `cert_layout.PLACEHOLDERS` in the
     backend, and a smoke check keeps the two in step — a chip here that the printer does
     not know would type a literal brace onto somebody's certificate. */
  const CERT_WORDS = ["{name}", "{course}", "{grade}", "{category}", "{skills}", "{date}",
                      "{instructor}", "{leader}", "{stake}", "{place}"];
  const CERT_TEXT_MAX = 600;   // likewise cert_layout.MAX_BODY_TEXT

  async function mount(target) {
    const user = API.getUser() || {};
    const ctx = App.ctx();
    const st = ctx.stake;
    if (!st) {
      UI.render(target, UI.shell("courses",
        UI.notice("Courses", "Join or register a stake first — see the Stake tab.", "users"),
        App.nav(), ctx));
      return;
    }
    const stakeId = st.id;
    const canManage = Ctx.can(st, "courses");    // portal admin or service missionary
    const canCreate = Ctx.can(st, "newCourse");  // ...and a teacher opening their own class
    const canClaim = Ctx.can(st, "claim");       // ...and any instructor
    const isStudent = !!st.student && Ctx.can(st, "enrol");

    const runsTerms = Ctx.can(st, "terms");   // who may create, edit and un-archive a term

    /* The heading, the stake and what this person may do are all known the moment the
       click lands, so the screen is painted before the term list is asked for. Waiting on
       /terms first left the page blank for one whole round trip — the slowest screen in
       the portal over a tunnel. The term, the tabs and the classes fill in underneath. */
    const content = el("div");
    const sub = el("div", { class: "page-sub" }, st.name);
    content.appendChild(el("div", { class: "page-head" }, [
      el("h1", { class: "page-title" }, "Courses"),
      sub,
    ]));
    const waiting = UI.loading(3);
    content.appendChild(waiting);
    const body = el("div");
    UI.render(target, UI.shell("courses", content, App.nav(), ctx));

    let terms;
    try {
      terms = await API.get(`/api/stakes/${stakeId}/terms`
        + (runsTerms ? "?include_archived=true" : ""));
    } catch (e) {
      waiting.replaceWith(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }
    const activeTerm = terms.find(t => t.is_active && !t.is_archived) || terms[0];
    sub.textContent = (activeTerm ? activeTerm.name : "No active term yet") + ` · ${st.name}`;
    waiting.remove();
    if (!activeTerm) {
      /* Archived terms are excluded from the list a student sees, so this reads as an
         empty stake to them. To whoever runs the place it says what actually happened —
         a term can be archived one click too many, and nothing here works until one is
         brought back. */
      const filed = terms.filter(t => t.is_archived).length;
      content.appendChild(empty(runsTerms && filed
        ? `${filed} term${filed === 1 ? " is" : "s are"} archived, so there is no term to `
          + "schedule classes in. Open the " + (st.label || "Stake") + " page, under Academic "
          + "terms, and bring one back."
        : "No term has been opened for this stake yet.", "calendar"));
      UI.render(target, UI.shell("courses", content, App.nav(), ctx));
      return;
    }

    /* Browse is a student's page and Classes a teacher's; a president gets the
       timetable, which is all a monitor is meant to have. */
    const tabs = [];
    if (isStudent) tabs.push(["browse", "Browse"]);
    if (canClaim || canManage) tabs.push(["classes", "Classes"]);
    tabs.push(["timetable", "Timetable"]);
    let view = tabs[0][0];

    const tabBar = el("div", { class: "tabs" }, tabs.map(([key, label], i) =>
      el("button", { class: i === 0 ? "active" : "", onclick: e => setView(key, e) }, label)));
    content.appendChild(tabBar);
    content.appendChild(body);

    function setView(v, e) {
      view = v;
      [...tabBar.children].forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      drawBody();
    }
    async function drawBody() {
      if (view === "browse") return drawBrowse();
      if (view === "classes") return drawClasses();
      return drawTimetable();
    }

    /* The tabs this person has not opened are read beside the first one, not after it.
       A tap on Timetable or Classes then finds its answer already kept, exactly as a
       repeat visit does, instead of a skeleton and another round trip. A warm read that
       fails says nothing — nobody asked for that tab yet — and the tap itself asks again,
       this time with a reason on screen if it fails. */
    function warmTabs() {
      const has = key => tabs.some(([k]) => k === key);
      const quietly = p => p.catch(() => {});
      if (view !== "browse" && has("browse")) quietly(fetchCatalogue());
      if (view !== "classes" && has("classes")) quietly(API.get(classesUrl(false)));
      if (view !== "timetable") quietly(API.get(timetableUrl()));
    }

    // ---------------------------------------------------------------- browse
    const browse = { q: "", category: "", mine: false };
    let myRows = {};            // course_id -> the viewer's live enrollment row
    let rowsHost = null;        // where a re-search swaps results in

    async function drawBrowse() {
      body.innerHTML = "";
      const search = el("input", { type: "search", placeholder: "Search by title or description",
                                   value: browse.q });
      let timer = null;
      // the server does the matching (title or description), so we debounce to it
      search.addEventListener("input", () => {
        browse.q = search.value.trim();
        clearTimeout(timer);
        timer = setTimeout(loadCatalogue, 250);
      });
      const chipFor = (label, on, set) => el("button", {
        class: "chip" + (on ? " on" : ""), onclick: () => { set(); drawBrowse(); } }, label);
      const chips = el("div", { class: "chips" }, [
        chipFor("All", !browse.category && !browse.mine,
          () => { browse.category = ""; browse.mine = false; }),
        ...Object.entries(CATEGORIES).map(([v, l]) =>
          chipFor(l, browse.category === v, () => { browse.category = v; })),
        chipFor("My classes", browse.mine, () => { browse.mine = !browse.mine; }),
      ]);
      rowsHost = el("div");
      body.appendChild(el("div", { class: "filterbar" }, [
        el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), search]),
      ]));
      body.appendChild(chips);
      body.appendChild(rowsHost);
      await loadCatalogue();
    }

    function browseParams() {
      const params = new URLSearchParams({ term_id: String(activeTerm.id) });
      if (browse.q) params.set("q", browse.q);
      if (browse.category) params.set("category", browse.category);
      if (browse.mine) params.set("mine", "1");
      return params;
    }
    /* The catalogue and this person's own enrolments answer from the class list alone,
       so they are asked side by side: one round trip for the whole Browse tab. */
    function fetchCatalogue() {
      return Promise.all([
        API.get(`/api/stakes/${stakeId}/catalogue?${browseParams()}`),
        API.get(`/api/stakes/${stakeId}/students/${user.id}/enrollments`),
      ]);
    }

    async function loadCatalogue() {
      rowsHost.innerHTML = "";
      rowsHost.appendChild(UI.loading(2));
      try {
        const [data, mine] = await fetchCatalogue();
        myRows = {};
        mine.forEach(r => {
          if (r.status === "enrolled" || r.status === "waitlisted") myRows[r.course_id] = r;
        });
        rowsHost.innerHTML = "";
        if (!data.count) {
          rowsHost.appendChild(browse.q
            ? empty(`Nothing matches “${browse.q}” this term.`, "search")
            : empty(browse.mine ? "You are not on any class list yet."
                                : "No classes are on offer this term.", "book"));
          return;
        }
        const card = el("div", { class: "card" });
        card.appendChild(el("h2", { class: "sec-title" },
          `${data.count} ${data.count === 1 ? "class" : "classes"} on offer`));
        data.courses.forEach(r => card.appendChild(catalogueRow(r)));
        rowsHost.appendChild(card);
      } catch (e) { rowsHost.innerHTML = ""; toast(e.message, "err"); }
    }

    function whenText(r) {
      /* A class can meet on several days, and a course that has not been given any is
         still worth listing — it simply reads "TBA" until someone picks the days. */
      const days = Array.isArray(r.days) ? r.days : (r.days == null ? [] : [r.days]);
      const day = days.length ? days.map(d => WEEKDAYS[d].slice(0, 3)).join(" / ") : "TBA";
      const time = r.start ? `${fmtTime(r.start)}–${fmtTime(r.end)}` : "";
      return `${day} ${time}`.trim();
    }

    function catalogueRow(r) {
      const full = r.seats_left === 0;
      const pct = r.capacity ? Math.min(100, Math.round(r.enrolled / r.capacity * 100)) : 0;
      const my = r.my_status ? myRows[r.course_id] : null;
      return el("div", { class: "list-item" }, [
        // A class that has been photographed shows itself; one that has not simply reads
        // as text, exactly as it did before any class carried a picture.
        coverTile(r.cover_url),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, r.title),
          el("div", { class: "meta" }, (r.category_label || r.category || "")
            + (r.description ? " — " + r.description : "")),
          el("div", { class: "meta", style: metaFlex }, [icon("clock", 13), whenText(r)]),
          // room first; the place is only ever named through it
          el("div", { class: "meta", style: metaFlex },
            [icon("pin", 13), `${r.room || "no room set"} · ${r.place || ""}`]),
          el("div", { class: "meta", style: metaFlex },
            [icon("user", 13), r.instructor || "No instructor yet"]),
          el("div", { class: "meter" + (full ? " full" : "") },
            [el("i", { style: `width:${pct}%` })]),
        ]),
        el("div", { style: "text-align:right;flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:var(--sp-8)" }, [
          my && my.status === "enrolled" ? el("span", { class: "pill green" }, "Enrolled")
            : my && my.status === "waitlisted" ? el("span", { class: "pill amber" },
                "Waitlist #" + my.waitlist_position)
            : full ? el("span", { class: "pill amber" }, "Full")
            : el("span", { class: "pill green" }, `${r.seats_left} seats`),
          !my && r.can_join ? el("button", { class: "btn sm", onclick: () => enrol(r) },
            [icon("plus", 15), r.would_waitlist ? "Join waitlist" : "Enrol"]) : null,
          my ? el("button", { class: "btn ghost sm",
            onclick: () => leaveCourse(my, r) }, [icon("x", 15), "Leave"]) : null,
        ]),
      ]);
    }

    async function enrol(r) {
      try {
        const e = await API.post(`/api/stakes/${stakeId}/courses/${r.course_id}/enroll`);
        toast(e.status === "waitlisted"
          ? `You're #${e.waitlist_position} on the waitlist` : "Enrolled — see you in class");
        loadCatalogue();
      } catch (e) { toast(e.message, "err"); }
    }
    async function leaveCourse(enrollment, r) {
      const msg = enrollment.status === "waitlisted"
        ? `Leave the waitlist for "${r.title}"?`
        : `Leave "${r.title}"? If it's full, the first waitlisted student takes your seat.`;
      const ok = await UI.confirm(msg, { danger: true, okLabel: "Leave", title: "Leave this class?" });
      if (!ok) return;
      try {
        await API.post(`/api/stakes/${stakeId}/enrollments/${enrollment.id}/drop`);
        toast(enrollment.status === "waitlisted" ? "Left the waitlist" : "Left the class");
        loadCatalogue();
      } catch (e) { toast(e.message, "err"); }
    }

    // --------------------------------------------------------------- classes
    /* The list a person who runs the place works from: every class of the term, each with
       the tools to change it, move it, put it away or — while nothing has been taken in it
       — delete it. Archived classes are hidden until asked for, and asked for they are,
       because an archived class is often the one holding a room nobody can remove. */
    const classView = { archived: false };
    let formHost = null;          // where a create-or-edit form opens
    let cardById = {};            // course id -> its card, so Edit opens under that class

    function classesUrl(archived) {
      const params = new URLSearchParams({ term_id: String(activeTerm.id) });
      if (archived) params.set("include_archived", "true");
      return `/api/stakes/${stakeId}/courses?${params}`;
    }

    async function drawClasses() {
      body.innerHTML = "";
      body.appendChild(UI.loading(3));
      try {
        const courses = await API.get(classesUrl(classView.archived));
        body.innerHTML = "";
        cardById = {};
        formHost = el("div");
        // an instructor should see what's on offer before hunting through the list
        const open = courses.filter(c => c.claimable && c.is_active);
        if (open.length && canClaim) body.appendChild(openCard(open));
        if (canCreate) body.appendChild(archivedSwitch(courses.length));
        if (!courses.length) {
          body.appendChild(empty(classView.archived
            ? "No class has been created for this term, archived ones included."
            : "No classes have been created for this term.", "book"));
        }
        courses.forEach(c => {
          const card = classCard(c);
          cardById[c.id] = card;
          body.appendChild(card);
        });
        if (canCreate) {
          body.appendChild(createPrompt());
          body.appendChild(formHost);
        }
      } catch (e) { body.innerHTML = ""; toast(e.message, "err"); }
    }

    function archivedSwitch(shown) {
      const on = classView.archived;
      const box = el("button", {
        class: "chip" + (on ? " on" : ""), type: "button",
        onclick: () => { classView.archived = !on; drawClasses(); },
      }, on ? "Showing archived too" : "Show archived classes");
      const wrap = el("div", { class: "chips", style: "margin-top:var(--sp-14)" }, [box]);
      wrap.appendChild(el("div", { class: "meta" },
        on ? `Archived classes are here so a room they hold can be moved or cleared. ${shown} shown.`
           : "Archived classes keep their roster and attendance and are off this list."));
      return wrap;
    }

    function createPrompt() {
      return el("div", { style: "margin-top:var(--sp-20)" }, [
        el("button", { class: "btn secondary", onclick: () => openForm(null) },
          [icon("plus", 17), "Create a class"]),
      ]);
    }

    /* One form for both jobs, opened under the class being changed rather than in a
       dialog: it has a dozen fields, a day picker and a room list that arrives a moment
       later, and a modal would only make it scroll. Opening the same one twice closes it. */
    function openForm(course) {
      const key = String(course ? course.id : "new");
      const wasOpen = formHost.dataset.for === key;
      formHost.innerHTML = "";
      delete formHost.dataset.for;
      if (wasOpen) return;
      if (course && cardById[course.id]) cardById[course.id].after(formHost);
      else body.appendChild(formHost);
      formHost.dataset.for = key;
      formHost.appendChild(courseForm(course));
      const first = formHost.querySelector("input:not([disabled]), select");
      if (first) first.focus();
      formHost.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function openCard(open) {
      const card = el("div", { class: "card" });
      card.appendChild(el("h2", { class: "sec-title" }, "Open classes to claim"));
      card.appendChild(el("div", { class: "meta", style: "margin-bottom:var(--sp-6)" },
        "Published by the admin or a service missionary, waiting for an instructor."));
      open.forEach(c => card.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, c.title),
          el("div", { class: "meta" },
            `${CATEGORIES[c.category] || c.category} · ${c.room_name || "no room"} · ${c.gathering_place_name || ""}`),
          el("div", { class: "meta", style: metaFlex }, [icon("clock", 13), whenText({
            days: c.weekdays, start: c.start_time, end: c.end_time })]),
        ]),
        el("button", { class: "btn sm", onclick: () => claim(c) },
          [icon("check", 15), "Claim"]),
      ])));
      return card;
    }

    function classCard(c) {
      const seatsLeft = c.capacity - c.enrolled_count;
      const mayEdit = canManage || c.is_mine;
      const card = el("div", { class: "card" });
      card.appendChild(el("div", { class: "list-item", style: "border:none;padding-top:var(--sp-2)" }, [
        coverTile(c.cover_url),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, [
            c.title,
            c.is_active ? null : el("span", { class: "pill grey", style: "margin-left:var(--sp-8)" },
                                    "archived"),
          ]),
          // the booking reads room first — the place is derived, not chosen
          el("div", { class: "meta" },
            `${CATEGORIES[c.category] || c.category} · ${c.room_name || "no room"} · ${c.gathering_place_name || ""}`),
          el("div", { class: "meta", style: metaFlex }, [icon("clock", 13), whenText({
            days: c.weekdays, start: c.start_time, end: c.end_time })]),
          el("div", { class: "meta", style: metaFlex }, [icon("user", 13),
            c.instructor_name || (c.claimable ? "Unassigned — open for an instructor to claim" : "Unassigned")]),
        ]),
        el("div", { style: "text-align:right;flex:none" }, [
          el("div", { html: seatsLeft > 0 ? `<span class="pill green">${seatsLeft} seats</span>`
                                          : `<span class="pill amber">waitlist</span>` }),
          el("div", { class: "meta", style: "margin-top:var(--sp-6)" },
            `${c.enrolled_count}/${c.capacity}`
            + (c.waitlist_count ? ` · ${c.waitlist_count} waiting` : "")),
        ]),
      ]));

      const actions = el("div", { class: "actions", style: "margin-top:var(--sp-10)" });
      if (c.claimable && canClaim) {
        actions.appendChild(el("button", { class: "btn sm", onclick: () => claim(c) },
          [icon("check", 15), "Claim this class"]));
      }
      if (c.is_mine && canClaim) {
        actions.appendChild(el("button", { class: "btn ghost sm", onclick: () => release(c) },
          [icon("refresh", 15), "Release"]));
      }
      // only the teacher and the two who run the stake get in on a class
      if (c.is_mine) {
        actions.appendChild(el("button", { class: "btn secondary sm",
          onclick: () => { location.hash = `#/course/${stakeId}/${c.id}`; } },
          [icon("check", 15), "Take attendance"]));
      }
      if (mayEdit) {
        if (canManage && !c.is_mine) {
          actions.appendChild(el("button", { class: "btn secondary sm",
            onclick: () => { location.hash = `#/course/${stakeId}/${c.id}`; } },
            [icon("edit", 15), "Manage"]));
        }
        actions.appendChild(el("button", {
          class: "btn " + (formHost.dataset.for === String(c.id) ? "" : "ghost ") + "sm",
          onclick: () => openForm(c) }, [icon("edit", 15), "Edit"]));
        /* The two endings, and only ever one of them. A class nothing has been taken in
           can be deleted outright — which is what frees the room it sits in. One with a
           roster or an attendance mark behind it can only be put away, and the server
           says so too, so the button here is never a promise the portal cannot keep. */
        if (c.is_active) {
          actions.appendChild(c.can_erase
            ? el("button", { class: "btn danger sm", onclick: () => eraseCourse(c) },
                 [icon("trash", 15), "Delete"])
            : el("button", { class: "btn ghost sm", onclick: () => archiveCourse(c) },
                 [icon("trash", 15), "Archive"]));
        } else {
          actions.appendChild(el("button", { class: "btn ghost sm", onclick: () => restoreCourse(c) },
            [icon("refresh", 15), "Bring it back"]));
        }
      }
      if (mayEdit) {
        actions.appendChild(el("button", { class: "btn ghost icon-only", title: "Message this class",
          onclick: () => MessagesPage.compose({ audience: "course", course_id: c.id,
            course_title: c.title }) }, [icon("send", 15)]));
      }
      if (actions.children.length) card.appendChild(actions);
      return card;
    }

    async function claim(c) {
      try {
        await API.post(`/api/stakes/${stakeId}/courses/${c.id}/claim`);
        toast(`You now teach "${c.title}"`);
        drawClasses();
      } catch (e) { toast(e.message, "err"); }
    }
    async function release(c) {
      const ok = await UI.confirm(`Release "${c.title}"? The class goes back to the open list.`,
        { danger: true, okLabel: "Release", title: "Hand this class back?" });
      if (!ok) return;
      try {
        await API.post(`/api/stakes/${stakeId}/courses/${c.id}/release`);
        toast("Released");
        drawClasses();
      } catch (e) { toast(e.message, "err"); }
    }

    async function archiveCourse(c) {
      const ok = await UI.confirm(
        `"${c.title}" comes off the timetable, the catalogue and the class lists. The attendance `
        + `already taken in it stays in the record, and so does everyone enrolled — nothing is `
        + `erased, which is why a class with a history is archived rather than deleted. `
        + `It can be brought back from this list with "Show archived classes".`,
        { danger: true, okLabel: "Archive", title: `Archive "${c.title}"?` });
      if (!ok) return;
      try {
        await API.del(`/api/stakes/${stakeId}/courses/${c.id}`);
        toast(`"${c.title}" archived`);
        UI.announce(`${c.title} has been archived.`);
        drawClasses();
      } catch (e) { toast(e.message, "err"); }
    }

    async function eraseCourse(c) {
      const ok = await UI.confirm(
        `Nothing has been taken in "${c.title}" — no one on a roster, no attendance marked — `
        + `so it can go for good rather than be filed away. Every sitting booked for it comes `
        + `off the calendar with it, and the booking of ${c.room_name || "its room"} is `
        + `released. There is no bringing this one back.`,
        { danger: true, okLabel: "Delete for good", title: `Delete "${c.title}"?` });
      if (!ok) return;
      try {
        const gone = await API.del(`/api/stakes/${stakeId}/courses/${c.id}/erase`);
        const n = gone && gone.sittings_removed;
        toast(`"${c.title}" deleted`);
        UI.announce(`${c.title} has been deleted`
          + (n ? `, along with ${n} sitting${n === 1 ? "" : "s"} booked for it.` : "."));
        drawClasses();
      } catch (e) { toast(e.message, "err"); }
    }

    async function restoreCourse(c) {
      try {
        await API.post(`/api/stakes/${stakeId}/courses/${c.id}/activate`);
        toast(`"${c.title}" is back on the lists`);
        UI.announce(`${c.title} has been reopened.`);
        drawClasses();
      } catch (e) { toast(e.message, "err"); }
    }

    /* ------------------------------------------- create or edit (room-first)
       One form, opened either empty or filled in. Booking a class into a different room
       is the same act as booking it at all, so the room picker is live in both cases —
       that is the road out of a room that was added twice. */
    function courseForm(course) {
      const editing = !!course;
      const sec = el("div");
      sec.appendChild(el("h2", { class: "sec-title", style: "margin-top:var(--sp-22)" },
        editing ? `Edit “${course.title}”` : "Create a class"));
      const card = el("div", { class: "card" });
      const title = el("input", { placeholder: "Course title", value: editing ? course.title : "" });
      const cat = el("select", {}, Object.entries(CATEGORIES).map(([v, l]) => el("option", { value: v }, l)));
      if (editing) cat.value = course.category;
      const roomSel = el("select");
      /* A room is often needed at the moment the class is booked — the bench, the second
         classroom, the corrected spelling of the first one. Adding it here, rather than
         sending the teacher off to another page and back, is what makes the form one pass. */
      const newRoomBtn = el("button", { class: "btn ghost sm", type: "button",
        onclick: () => addRoomInline() }, [icon("plus", 15), "New room"]);
      // the place is derived by the server from the room; shown so the booking
      // reads in plain terms, never picked
      const placeOut = el("input", { disabled: "true", placeholder: "Follows the room",
                                     value: editing ? (course.gathering_place_name || "") : "" });
      const instrSel = el("select");
      /* Whether the teacher list really arrived. Until it does the select can only say
         "unassigned", and whoever runs the place may open this form to write one sentence
         on the certificates without thinking about teachers at all — a save made in that
         silence would hand the class to nobody. So an assignment the form could not show
         is left exactly where it was. */
      let teachersShown = false;
      const teacherNote = el("div", { class: "meta" }, "");
      const cap = el("input", { type: "number",
        value: String(editing ? course.capacity : 25), min: "1" });
      const capHint = el("div", { class: "meta" }, "Choose a room to see how large this class may be.");
      /* A class can meet on more than one day, so the days are chips rather than a
         dropdown: every day you tap is a day the schedule will be built for. */
      const days = new Set(editing ? (course.weekdays || []) : []);
      const dayHint = el("div", { class: "meta" },
        editing ? daysCalendarHint(days)
                 : "Pick every day this class meets — the schedule is built from these.");
      const dayChips = el("div", { class: "chips" }, WEEKDAYS.map((d, i) =>
        el("button", { class: "chip" + (days.has(i) ? " on" : ""), type: "button", onclick: e => {
          if (days.has(i)) days.delete(i); else days.add(i);
          e.target.classList.toggle("on", days.has(i));
          dayHint.textContent = days.size
            ? `${editing ? "Meets" : "Schedule"} on ${[...days].sort((a, b) => a - b)
                .map(n => WEEKDAYS[n]).join(", ")}.`
            : (editing ? "With no day picked the class keeps the sittings it already has."
                       : "Pick every day this class meets — the schedule is built from these.");
        } }, d)));
      const stt = el("input", { type: "time",
        value: editing && course.start_time ? course.start_time.slice(0, 5) : "19:00" });
      const ent = el("input", { type: "time",
        value: editing && course.end_time ? course.end_time.slice(0, 5) : "20:30" });
      const cstart = el("input", { type: "date",
        value: editing && course.course_start_date ? course.course_start_date : "" });
      const cend = el("input", { type: "date",
        value: editing && course.course_end_date ? course.course_end_date : "" });
      /* Written as achievements rather than advertising: each line becomes one skill
         printed on the completion certificate. */
      const skillsTA = el("textarea", { rows: "3",
        placeholder: "Pattern drafting\nMachine operation\nFabric selection" },
        editing && course.skills ? course.skills : "");
      /* The sentence printed under a graduate's name. A gathering place can write one
         line for all its classes, and one line cannot say both "valuable techniques as
         a Caterer" and "as a Web Designer", so a class may write its own and this is it.
         Blank means the place's line is used instead — see `Course.cert_text`. */
      const certTA = el("textarea", { rows: "3", id: "course-cert-text",
        maxlength: String(CERT_TEXT_MAX),
        placeholder: "e.g. For demonstrating dedication to the {course} program, and for " +
          "the techniques you have shown as a caterer." },
        editing && course.cert_text ? course.cert_text : "");

      roomSel.appendChild(el("option", { value: "" }, "Choose a room…"));
      const roomIndex = new Map();          // room_id -> { name, capacity, place }
      let placeList = [];                   // for the inline room picker

      /* There is no stake-wide rooms endpoint: read the places, then each place's
         rooms. There are only a handful of each, so one parallel pass is cheap. */
      async function loadRooms(select) {
        const places = await API.get(`/api/stakes/${stakeId}/places`);
        placeList = places;
        const grouped = await Promise.all(places.map(async p => ({
          place: p,
          rooms: await API.get(`/api/stakes/${stakeId}/places/${p.id}/rooms`),
        })));
        roomSel.innerHTML = "";
        roomSel.appendChild(el("option", { value: "" }, "Choose a room…"));
        roomIndex.clear();
        grouped.forEach(({ place, rooms }) => {
          if (!rooms.length) return;
          const group = el("optgroup", { label: place.name });
          rooms.forEach(r => {
            roomIndex.set(r.id, { name: r.name, capacity: r.capacity, place: place.name });
            group.appendChild(el("option", { value: String(r.id) },
              `${r.name} · ${place.name} (holds ${r.capacity})`));
          });
          roomSel.appendChild(group);
        });
        if (select && roomIndex.has(+select)) roomSel.value = String(select);
        applyRoom();
      }
      loadRooms(editing ? course.room_id : null).catch(e => toast(e.message, "err"));

      function applyRoom() {
        const r = roomIndex.get(+roomSel.value);
        if (!r) {
          placeOut.value = "";
          cap.removeAttribute("max");
          capHint.textContent = "Choose a room to see how large this class may be.";
          return;
        }
        placeOut.value = r.place;
        cap.max = String(r.capacity);
        if (!cap.value || +cap.value > r.capacity) cap.value = String(r.capacity);
        capHint.textContent = `${r.name} holds ${r.capacity}; the class cannot be larger.`;
      }
      roomSel.addEventListener("change", applyRoom);

      function daysCalendarHint(set) {
        return set.size
          ? "Changing the days does not move sittings already on the calendar — edit or "
            + "delete those from the class page."
          : "With no day picked the class keeps the sittings it already has.";
      }

      function addRoomInline() {
        if (!placeList.length) {
          return toast("Register a gathering place first — a room belongs inside one", "err");
        }
        const placeSel = el("select", {}, placeList.map(p => el("option",
          { value: String(p.id) }, p.name + (p.is_active ? "" : " (inactive)"))));
        const rname = el("input", { placeholder: "e.g. Room C" });
        const rcap = el("input", { type: "number", value: "25", min: "1" });
        UI.modal({
          title: "Add a room",
          sub: "The class you are booking goes into it as soon as it is made.",
          body: el("div", {}, [
            el("div", { class: "field" }, [el("label", {}, "Gathering place"), placeSel]),
            el("div", { class: "field" }, [el("label", {}, "Room name"), rname]),
            el("div", { class: "field" }, [el("label", {}, "How many sit"), rcap]),
          ]),
          actions: [
            { label: "Cancel", kind: "secondary", onClick: c => c() },
            { label: "Add room", onClick: async c => {
              if (!rname.value.trim()) return toast("Give the room a name", "err");
              try {
                const made = await API.post(`/api/stakes/${stakeId}/places/${+placeSel.value}/rooms`,
                  { name: rname.value.trim(), capacity: +rcap.value || 1 });
                c();
                await loadRooms(made.id);
                toast(`${made.name} added — this class is booked into it`);
              } catch (e) { toast(e.message, "err"); }
            }},
          ],
        });
      }

      card.appendChild(el("div", { class: "field" }, [el("label", {}, "Title"), title]));
      card.appendChild(el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", {}, "Category"), cat]),
        el("div", { class: "field" }, [el("label", {}, "Capacity"), cap, capHint])]));
      card.appendChild(el("div", { class: "row" }, [
        el("div", { class: "field", style: "flex:1" }, [
          el("label", {}, "Room"),
          el("div", { style: "display:flex;gap:var(--sp-8);align-items:center" }, [roomSel, newRoomBtn]),
        ]),
        el("div", { class: "field" }, [el("label", {}, "Gathering place"), placeOut])]));
      if (canManage) {
        card.appendChild(el("div", { class: "field" }, [
          el("label", {}, "Instructor"), instrSel, teacherNote]));
      } else {
        /* A teacher opening a class opens it for themselves, so there is nothing to
           choose here — and no second name to choose wrongly. */
        card.appendChild(el("div", { class: "meta", style: "margin:var(--sp-2) 0 var(--sp-12)" }, editing
          ? "You teach this class. Whoever runs the gathering place can hand it to someone "
            + "else from their own copy of this form."
          : "You will teach this class. Whoever runs the gathering place can hand it to "
            + "someone else later."));
      }
      card.appendChild(el("div", { class: "field" }, [el("label", {}, "Meets on"),
        dayChips, dayHint]));
      card.appendChild(el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", {}, "Start"), stt]),
        el("div", { class: "field" }, [el("label", {}, "End"), ent])]));
      card.appendChild(el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", {}, "First class"), cstart]),
        el("div", { class: "field" }, [el("label", {}, "Last class"), cend])]));
      card.appendChild(el("div", { class: "field" }, [
        el("label", {}, "Skills this course develops"), skillsTA,
        el("div", { class: "meta" },
          "One skill per line — each one is printed on the student's certificate.")]));

      // ---------- the sentence on this class's certificates ----------
      const certCount = el("span", { class: "cert-count" }, "");
      const certNote = el("div", { class: "meta" }, "");
      const sayWhatTheLineDoes = () => {
        // counted the way the portal counts it: the line is printed as one paragraph, so
        // the newlines a long sentence forces take up no room on the certificate
        const used = certTA.value.trim().split(/\s+/).join(" ").length;
        certCount.textContent = `${used} of ${CERT_TEXT_MAX}`;
        certNote.textContent = used
          ? "This is the line that will stand under a graduate's name at the end of this "
            + "class, instead of the gathering place's own line."
          : "Nothing written yet, so the gathering place's line prints for this class. "
            + "Write one when this class needs saying in its own words.";
      };
      const putWord = (ph) => {
        const at = certTA.selectionStart == null ? certTA.value.length : certTA.selectionStart;
        const end = certTA.selectionEnd == null ? at : certTA.selectionEnd;
        certTA.value = certTA.value.slice(0, at) + ph + certTA.value.slice(end);
        certTA.focus();
        certTA.setSelectionRange(at + ph.length, at + ph.length);
        sayWhatTheLineDoes();
      };
      certTA.addEventListener("input", sayWhatTheLineDoes);
      sayWhatTheLineDoes();
      card.appendChild(el("div", { class: "field" }, [
        el("div", { class: "cert-body-head" }, [
          el("label", { for: "course-cert-text" }, "The line on their certificate"),
          certCount,
        ]),
        certTA,
        certNote,
        el("div", { class: "cert-words" },
          CERT_WORDS.map(ph => el("button", { class: "cert-word", type: "button",
            title: `Put ${ph} into the line`, onclick: () => putWord(ph) }, ph))),
        el("div", { class: "meta", style: "margin-top:var(--sp-8)" },
          "A word between braces is filled in with that member's own when the certificate "
          + "prints — {name} becomes the graduate, {course} this class."),
      ]));

      const save = el("button", { class: "btn", onclick: submit },
        [icon(editing ? "check" : "plus", 17), editing ? "Save changes" : "Create class"]);
      card.appendChild(el("div", { class: "actions", style: "margin-top:var(--sp-14)" }, [
        save,
        el("button", { class: "btn ghost", onclick: () => closeForm() }, "Cancel"),
      ]));
      sec.appendChild(card);

      function closeForm() {
        formHost.innerHTML = "";
        delete formHost.dataset.for;
      }

      async function submit() {
        if (!title.value.trim()) return toast("Give the class a title", "err");
        if (!roomSel.value) return toast("Choose the room this class will be held in", "err");
        if (stt.value && ent.value && ent.value <= stt.value) {
          return toast("The class cannot finish before it starts", "err");
        }
        const room = roomIndex.get(+roomSel.value);
        // A manager who never saw the teacher list is not asked to choose a teacher: the
        // class keeps the one it has. Choosing "unassigned" from a list that did arrive is
        // a real choice and is sent as one.
        const kept = editing ? (course.instructor_id || null) : null;
        const payload = {
          term_id: activeTerm.id,
          room_id: +roomSel.value,
          instructor_id: !canManage ? null
            : instrSel.value ? +instrSel.value
            : teachersShown || !editing ? null : kept,
          title: title.value.trim(), category: cat.value,
          description: editing ? course.description : null,
          capacity: Math.min(+cap.value || room.capacity, room.capacity),
          weekdays: days.size ? [...days].sort((a, b) => a - b) : null,
          start_time: stt.value ? stt.value + ":00" : null,
          end_time: ent.value ? ent.value + ":00" : null,
          course_start_date: cstart.value || null, course_end_date: cend.value || null,
          skills: skillsTA.value.split("\n").map(s => s.trim()).filter(Boolean).join("\n")
            || null,
          // blank means "use the gathering place's line", which is what null says
          cert_text: certTA.value.trim() || null,
        };
        save.disabled = true;
        try {
          const saved = editing
            ? await API.patch(`/api/stakes/${stakeId}/courses/${course.id}`, payload)
            : await API.post(`/api/stakes/${stakeId}/courses`, payload);
          closeForm();
          toast(editing ? `“${saved.title}” saved` : `“${saved.title}” created`);
          UI.announce(editing ? `${saved.title} has been updated.`
                              : `${saved.title} has been created.`);
          await drawClasses();
        } catch (e) { save.disabled = false; toast(e.message, "err"); }
      }

      if (canManage) {
        // only whoever runs the place picks another teacher; a teacher has no choice to make
        teacherNote.textContent = "Reading who may teach…";
        API.get(`/api/stakes/${stakeId}/members?role=instructor`).then(members => {
          instrSel.innerHTML = "";
          instrSel.appendChild(el("option", { value: "" },
            "Unassigned — open for an instructor to claim"));
          members.forEach(m => instrSel.appendChild(
            el("option", { value: String(m.user_id) }, m.name)));
          teachersShown = true;
          if (editing && course.instructor_id) {
            const wanted = String(course.instructor_id);
            /* The teacher is named even when they are not on this list: a class handed to
               somebody who has since left the instructor role is still taught by them, and
               a form that could not say so would un-teacher the class on the next save. */
            if (![...instrSel.options].some(o => o.value === wanted)) {
              instrSel.appendChild(el("option", { value: wanted },
                course.instructor_name || "The teacher it has now"));
            }
            instrSel.value = wanted;
          }
          teacherNote.textContent = "";
        }).catch(e => {
          teacherNote.textContent = editing && course.instructor_id
            ? "The list of teachers did not arrive, so this form cannot choose one. Saving "
              + "will keep the class with the teacher it has."
            : "The list of teachers did not arrive — reload the page to choose one.";
          toast(e.message, "err");
        });
      }
      return sec;
    }

    // -------------------------------------------------------------- timetable
    function timetableUrl() {
      return `/api/stakes/${stakeId}/timetable?term_id=${activeTerm.id}`;
    }

    async function drawTimetable() {
      body.innerHTML = "";
      body.appendChild(UI.loading(2));
      try {
        const grid = await API.get(timetableUrl());
        const wrap = el("div", { class: "card" });
        let any = false;
        WEEKDAYS.forEach(day => {
          const items = grid[day] || [];
          if (!items.length) return;
          any = true;
          wrap.appendChild(el("h2", { class: "sec-title", style: "margin:var(--sp-14) 0 var(--sp-4)" }, day));
          items.forEach(i => wrap.appendChild(el("div", { class: "list-item" }, [
            el("div", { class: "grow" }, [
              el("div", { class: "title" }, i.title),
              el("div", { class: "meta" },
                `${fmtTime(i.start)}–${fmtTime(i.end)} · ${i.room || "no room"} · ${i.place || ""}`),
            ]),
            i.instructor ? el("span", { class: "pill grey" }, i.instructor) : null,
          ])));
        });
        if (!any) wrap.appendChild(empty("Nothing scheduled this term.", "calendar"));
        body.innerHTML = "";
        body.appendChild(wrap);
      } catch (e) { body.innerHTML = ""; toast(e.message, "err"); }
    }

    /* The other tabs are read beside the first one, not after it: by the time this
       screen is on the glass, their answers are usually already kept. */
    warmTabs();
    await drawBody();
  }

  return { mount };
})();
