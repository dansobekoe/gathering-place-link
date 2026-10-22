/* Course detail. Two pages wear one route: the people who run a class get the working
   screen (live check-in, sittings to mark, the roster with its grades and papers), and a
   member opening the class they attend gets their own view of it — where and when, how
   far it has run, whether they were in it, and who else is coming. */
const AttendancePage = (() => {
  const { el, toast, icon, statusPill, fmtDate, fmtTime, opensLabel, startsAt, hoursText,
          modal, empty } = UI;
  const STATUSES = ["present", "late", "excused", "absent"];
  const ATT_WORD = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
  let liveTimer = null;

  const slug = s => String(s || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Fetches a document and saves it; failures surface as a toast, never a bogus file.
  function download(path, filename, label) {
    return API.download(path, filename)
      .then(() => toast(`${label} downloaded`))
      .catch(e => toast(e.message, "err"));
  }
  function dlBtn(label, ic, path, filename) {
    return el("button", { class: "btn secondary sm", onclick: () => download(path, filename, label) },
      [icon(ic, 15), label]);
  }

  /* ---------------- the class picture ----------------
     A teacher hangs one photograph over his class — the room, a project, a page of music —
     and everyone who opens the class sees it: the members before they walk in, the leaders
     who run the place, the admin. Only the people who may edit this class are given the
     buttons, so a member finds a picture and nothing to press.

     The file goes up exactly as it was chosen, and the portal redraws it before keeping it:
     upright, inside 1600 px on the long edge, one clean JPEG with the camera's own notes —
     where it was taken, which phone, at what minute — thrown away with the bytes that made
     them. The new drawing gets a new address, named after what is inside it, so no browser
     can hand back the picture this frame held last term. */
  const COVER_KINDS = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1 };
  const COVER_MAX_BYTES = 12 * 1024 * 1024;    // and the server refuses past its own 12 MB

  function coverBlock(course, stakeId, courseId, maySet, refresh) {
    // No picture and nothing to do about it: the page opens on its title, as it did before.
    if (!maySet && !course.cover_url) return null;

    const frame = el("div", { class: "cd-cover" });
    const art = el("div", { class: "cd-cover-art" });
    frame.appendChild(art);
    function draw(url) {
      art.replaceChildren(url
        ? el("img", { src: API.abs(url), alt: "", decoding: "async" })
        : el("div", { class: "cd-cover-blank" },
            [icon("image", 22), el("span", {}, "This class has no picture yet")]));
    }
    draw(course.cover_url);
    if (!maySet) return frame;

    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif",
                              style: "display:none" });
    const pick = el("button", { class: "btn sm", onclick: () => file.click() },
      [icon(course.cover_url ? "image" : "plus", 15),
       course.cover_url ? "Replace class picture" : "Add a class picture"]);
    const drop = el("button", { class: "btn ghost sm",
                                style: course.cover_url ? "" : "display:none",
                                onclick: removeCover }, [icon("trash", 15), "Remove"]);
    const note = el("div", { class: "photo-note" },
      "PNG, JPG, WEBP or GIF, up to 12 MB. Any shape is welcome — the portal turns it upright, " +
      "keeps its longest edge inside 1600 px, and drops the place, phone and minute a camera " +
      "buries inside the file.");

    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";          // let the same file be picked again after a cancel
      if (!f) return;
      const trouble = checkPicture(f);
      if (trouble) return toast(trouble, "err");
      // Shown in this very frame before the server has seen it, so a person can judge the
      // picture and choose again instead of meeting it later on someone else's screen.
      const preview = URL.createObjectURL(f);
      draw(preview);
      upload(f, preview);
    });

    /* The browser knows only what a file says it is; the server reads the bytes. This is the
       friendly half of that rule — an obvious mistake named in words, not a rejected upload. */
    function checkPicture(f) {
      const ext = String(f.name || "").split(".").pop().toLowerCase();
      const mime = String(f.type || "").split("/").pop().toLowerCase();
      if (!COVER_KINDS[ext] && !COVER_KINDS[mime])
        return "That is not a picture this portal can take. Choose a PNG, JPG, WEBP or GIF.";
      if (!f.size) return "That file arrived empty. Pick the picture again.";
      if (f.size > COVER_MAX_BYTES)
        return `That picture is ${(f.size / 1048576).toFixed(1)} MB and the limit is 12 MB. ` +
               "Most photo apps can save a much smaller copy.";
      return null;
    }

    async function upload(f, preview) {
      pick.disabled = true;
      const form = new FormData();
      form.append("file", f);
      try {
        await API.post(`/api/stakes/${stakeId}/courses/${courseId}/cover`, form);
        toast("Class picture saved");
        refresh();
      } catch (e) {
        draw(course.cover_url);   // back to the picture that is really filed
        toast(e.message, "err");
        pick.disabled = false;
      } finally {
        URL.revokeObjectURL(preview);
      }
    }

    async function removeCover() {
      try {
        await API.del(`/api/stakes/${stakeId}/courses/${courseId}/cover`);
        toast("Class picture removed");
        refresh();
      } catch (e) { toast(e.message, "err"); }
    }

    /* The frame is the band across the top of the card it sits in, so the buttons belong to
       it and not to a second box beside it: choose a picture, and the picture you just chose
       is directly above the button that chose it. */
    frame.appendChild(el("div", { class: "cd-cover-bar" }, [pick, drop, file]));
    frame.appendChild(note);
    return frame;
  }

  async function mount(target, stakeId, courseId) {
    stop();
    const user = API.getUser();
    const f = await Ctx.flags(stakeId);          // president / missionary / admin / instructor
    const course = await API.get(`/api/stakes/${stakeId}/courses/${courseId}`);
    /* Two different things, and the page must not blur them:
       `runs` fills in this class — its instructor, a service missionary, or the admin;
       `records` is what a leader holds — the papers, never the pen. */
    const isInstructor = course.instructor_id === user.id;
    const runs = isInstructor || !!f.manage;      // fills in this class: teacher, missionary, admin
    const seats = !!f.manage;                     // books and frees seats: missionary, admin
    const records = runs || Ctx.can(f, "downloads");   // ...and everyone who may take a paper out
    const canManage = runs;

    /* A member who does not run the class has no use for a live code, a grade box or a
       badge sheet — and the working screen handed them every classmate's record on the way
       past. This is the page they actually came for. */
    if (f.student && !isInstructor) return memberView(target, stakeId, courseId, course, f);

    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("a", { href: "#/classes", style: "font-size:var(--t-ui);font-weight:600" }, "← Classes"),
      el("h2", { class: "page-title", style: "margin-top:6px" }, course.title),
      el("div", { class: "page-sub" },
        `${course.gathering_place_name || ""} · ${course.enrolled_count}/${course.capacity} enrolled` +
        (course.instructor_name ? ` · ${course.instructor_name}` : "")),
    ]));

    /* The class picture, hung from the page the teacher works on — the one place the buttons
       that change it live. A leader who runs nothing still sees the picture he is answerable
       for, but is not handed the pen: the same line this page holds everywhere else. */
    const cover = coverBlock(course, stakeId, courseId, canManage,
      () => mount(target, stakeId, courseId));
    if (cover) content.appendChild(el("div", { class: "card" }, [cover]));

    // ---------- Sessions ----------
    /* The three lists this page shows — sittings, roster, summary — answer from the class
       id alone, so they are asked together. In turn, a phone on a tunnel waited out the
       round trip for each one before the next even started. */
    const [sessions, roster, summary] = await Promise.all([
      API.get(`/api/stakes/${stakeId}/courses/${courseId}/sessions`),
      API.get(`/api/stakes/${stakeId}/courses/${courseId}/roster`),
      API.get(`/api/stakes/${stakeId}/courses/${courseId}/attendance-summary`).catch(() => null),
    ]);
    if (canManage) content.appendChild(liveSection(sessions));
    content.appendChild(el("div", { class: "sec-title", style: canManage ? "" : "margin-top:0" }, "Sessions"));
    const scard = el("div", { class: "card" });
    if (!sessions.length) scard.appendChild(empty("No sittings booked yet — build them from the weekly schedule, or book one by hand.", "calendar"));
    sessions.forEach(s => {
      const acts = el("div", { style: "display:flex;gap:6px;flex:none" });
      if (canManage) {
        acts.appendChild(el("button", { class: "btn sm", title: "Record attendance",
          onclick: () => markSession(s) }, [icon("check", 15), "Attendance"]));
        acts.appendChild(el("button", { class: "btn secondary icon-only",
          title: "Change the date and time", onclick: () => sittingModal(s) },
          [icon("calendar", 15)]));
        if (s.status !== "cancelled")
          acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Cancel session",
            onclick: () => cancelSession(s) }, [icon("ban", 15)]));
        /* Deleting is offered only where it will be accepted: a sitting nobody has been
           marked in is a line on a calendar that was booked by mistake, while one with
           marks in it is proof the class met and stays whatever else happens to it. */
        if (!s.marked)
          acts.appendChild(el("button", { class: "btn ghost icon-only",
            title: "Delete this sitting — no one has been marked in it",
            onclick: () => eraseSession(s) }, [icon("trash", 15)]));
      } else {
        acts.appendChild(el("span", { html: statusPill(s.status) }));
      }
      scard.appendChild(el("div", { class: "list-item" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, fmtDate(s.scheduled_date) + " · " + hoursText(s)),
          el("div", { class: "meta" }, [el("span", { html: statusPill(s.status) }),
            s.notes ? el("span", { class: "muted" }, " — " + s.notes) : null]),
        ]),
        acts,
      ]));
    });
    if (canManage) {
      scard.appendChild(el("hr", { class: "hr" }));
      scard.appendChild(el("div", { class: "actions" }, [
        el("button", { class: "btn secondary sm", onclick: async () => {
          try {
            const r = await API.post(`/api/stakes/${stakeId}/courses/${courseId}/sessions/generate`);
            toast(r.created
              ? `${r.created} sitting${r.created === 1 ? "" : "s"} booked` +
                (r.skipped ? ` · ${r.skipped} kept their own time` : "")
              : "Every date in this schedule is already booked");
            mount(target, stakeId, courseId);
          }
          catch (e) { toast(e.message, "err"); }
        } }, [icon("refresh", 15), "Generate from weekly schedule"]),
        el("button", { class: "btn secondary sm", onclick: () => sittingModal(null) },
          [icon("plus", 15), sessions.length ? "Book another sitting" : "Book a sitting"]),
      ]));
    }
    content.appendChild(scard);

    // ---------- Roster ----------
    content.appendChild(el("div", { class: "sec-title" }, "Roster"));
    const rcard = el("div", { class: "card" });
    if (!roster.length) rcard.appendChild(empty("No students enrolled yet.", "users"));
    roster.forEach(r => {
      const acts = el("div", { style: "display:flex;gap:6px;flex:none" });
      if (canManage && r.status === "enrolled") {
        acts.appendChild(el("button", { class: "btn secondary sm", onclick: () => grade(r) },
          [icon("award", 15), "Grade"]));
      }
      if (seats && r.status === "enrolled") {
        acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Withdraw student",
          onclick: () => withdraw(r) }, [icon("trash", 15)]));
      }
      if (records && r.completion_status === "completed") {
        acts.appendChild(el("button", { class: "btn secondary icon-only", title: "Completion certificate (PDF)",
          onclick: () => download(`/api/stakes/${stakeId}/enrollments/${r.id}/certificate.pdf`,
            `certificate-${slug(r.student_name)}.pdf`, "Certificate") }, [icon("cert", 15)]));
      }
      /* Two taps to reach the person, straight out of the number the portal already holds.
         These buttons only appear when the server sent a number with the row, and it sends
         one for the teacher of this class and whoever runs the place — never for a
         classmate reading the very same list. A member who has not saved this number reads
         an unknown caller, so the WhatsApp opening names the class it comes from. */
      const contacts = [];
      if (r.phone_dial) {
        contacts.push(el("a", { class: "btn ghost sm", href: `tel:${r.phone_dial}`,
          title: `Call ${r.student_name} on ${r.phone}`,
          "aria-label": `Call ${r.student_name}` }, [icon("phone", 15), r.phone]));
      }
      if (r.whatsapp_dial) {
        const hello = `Hello ${r.student_name}, this is ${course.instructor_name
          || "your teacher"} from "${course.title}" at Gathering Place.`;
        contacts.push(el("a", { class: "btn ghost sm",
          href: `https://wa.me/${r.whatsapp_dial.replace("+", "")}?text=${encodeURIComponent(hello)}`,
          target: "_blank", rel: "noopener noreferrer",
          title: `Message ${r.student_name} on WhatsApp`,
          "aria-label": `Message ${r.student_name} on WhatsApp` },
          [icon("chat", 15), "WhatsApp"]));
      }
      rcard.appendChild(el("div", { class: "list-item" }, [
        UI.avatar({ name: r.student_name, photo_url: r.photo_url }),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, r.student_name),
          el("div", { class: "meta" }, [
            r.ward,
            (r.completion_status || "").replace("_", " "),
            r.final_grade ? "grade " + r.final_grade : "",
            r.certificate_issued ? "certificate issued" : "",
          ].filter(Boolean).join(" · ")),
          contacts.length ? el("div", { class: "rsr-contacts" }, contacts) : null,
        ]),
        el("span", { html: statusPill(r.status) }),
        r.waitlist_position ? el("span", { class: "pill grey" }, "#" + r.waitlist_position) : null,
        acts,
      ]));
    });
    if (seats) {
      rcard.appendChild(el("hr", { class: "hr" }));
      rcard.appendChild(el("button", { class: "btn secondary sm", onclick: enrollSomeone },
        [icon("userplus", 15), "Register a student"]));
    }
    if (records) {
      rcard.appendChild(el("hr", { class: "hr" }));
      rcard.appendChild(el("div", { class: "sec-title", style: "margin:0 0 9px" }, "Documents & exports"));
      rcard.appendChild(el("div", { class: "actions" }, [
        dlBtn("Roster (PDF)", "print", `/api/stakes/${stakeId}/courses/${courseId}/roster.pdf`,
          `roster-course-${courseId}.pdf`),
        dlBtn("Attendance record", "check", `/api/stakes/${stakeId}/courses/${courseId}/attendance.pdf`,
          `attendance-course-${courseId}.pdf`),
        dlBtn("ID badges (9-up)", "idcard", `/api/stakes/${stakeId}/courses/${courseId}/badges.pdf`,
          `badges-course-${courseId}.pdf`),
        dlBtn("Roster (CSV)", "download", `/api/stakes/${stakeId}/courses/${courseId}/roster.csv`,
          `roster-course-${courseId}.csv`),
      ]));
      rcard.appendChild(el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:9px" },
        "Documents carry this stake's branding. Badge sheets are CR80 cards (54 × 85.6 mm), nine to an A4 page."));
    }
    content.appendChild(rcard);

    // ---------- Summary ----------
    if (summary && summary.completed_sessions > 0) {
      content.appendChild(el("div", { class: "sec-title" }, "Attendance summary"));
      const c2 = el("div", { class: "card" });
      const table = el("table");
      table.innerHTML = "<thead><tr><th>Student</th><th>Present</th><th>Rate</th></tr></thead>";
      const tb = el("tbody");
      summary.students.forEach(s => tb.appendChild(el("tr", {}, [
        el("td", {}, s.name),
        el("td", { class: "muted" }, `${s.present}/${s.total_sessions}`),
        el("td", { html: `<span class="pill ${s.attendance_pct >= 75 ? "green" : s.attendance_pct >= 50 ? "amber" : "red"}">${s.attendance_pct}%</span>` }),
      ])));
      table.appendChild(tb);
      c2.appendChild(table);
      content.appendChild(c2);
    }

    UI.render(target, UI.shell("courses", content, App.nav(), App.ctx()));

    // ---------- live QR check-in ----------
    function liveSection(sessions) {
      const wrap = el("div");
      wrap.appendChild(el("div", { class: "sec-title", style: "margin-top:0" }, "Live check-in"));
      const card = el("div", { class: "card" });
      const candidates = sessions.filter(s => s.status !== "cancelled");
      if (!candidates.length) {
        card.appendChild(empty("No sessions to check in yet — generate them below.", "calendar"));
        wrap.appendChild(card);
        return wrap;
      }
      const now = Date.now();
      candidates.sort((a, b) => Math.abs(startsAt(a) - now) - Math.abs(startsAt(b) - now));
      const sel = el("select", {}, candidates.map(s =>
        el("option", { value: s.id }, fmtDate(s.scheduled_date) + " · " + hoursText(s))));
      sel.value = String(candidates[0].id);

      const codeEl = el("div", { class: "code-big" }, "······");
      const qrHost = el("div", { class: "qr-box" });
      const statusEl = el("div", { style: "margin-top:8px" });
      const countEl = el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:4px" });

      let rot = 30, lastFetch = 0;
      async function fetchLive() {
        try {
          const live = await API.get(`/api/attendance/sessions/${sel.value}/live`);
          rot = live.rotation_seconds || 30;
          codeEl.textContent = live.code;
          QR.render(qrHost, JSON.stringify({ s: +sel.value, c: live.code }), 190);
          statusEl.innerHTML = live.open
            ? '<span class="pill green">check-in open</span>'
            : '<span class="pill grey">check-in closed</span>';
          if (!live.open) countEl.textContent = opensLabel(live);
        } catch (e) { statusEl.textContent = e.message; }
      }
      function tick() {
        const remaining = rot - (Math.floor(Date.now() / 1000) % rot);
        if (statusEl.querySelector(".pill.green"))
          countEl.textContent = `Code refreshes in ${remaining}s`;
        if (Date.now() - lastFetch > 4000) { lastFetch = Date.now(); fetchLive(); }
      }
      sel.addEventListener("change", () => { lastFetch = 0; tick(); });
      lastFetch = Date.now(); fetchLive();
      liveTimer = setInterval(tick, 1000);

      card.appendChild(el("div", { class: "field" }, [el("label", {}, "Session"), sel]));
      card.appendChild(el("div", { class: "live-grid" }, [
        el("div", {}, [codeEl, statusEl, countEl]),
        qrHost,
      ]));
      card.appendChild(el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:10px" },
        "Project this screen. Students scan the code, or you scan their badges."));
      card.appendChild(el("button", { class: "btn secondary sm", style: "margin-top:10px",
        onclick: () => badgeScan(+sel.value) }, [icon("qr", 15), "Scan student badges"]));
      wrap.appendChild(card);
      return wrap;
    }

    function badgeScan(sessionId) {
      const video = el("video", { class: "scan-video", muted: "muted", playsinline: "true" });
      const feed = el("div", { class: "scan-feed" });
      let stop = null;
      const m = modal({
        title: "Scan student badges",
        sub: "Each successful scan marks that student present or late.",
        body: el("div", {}, [video, feed]),
        actions: [{ label: "Done", kind: "secondary", onClick: c => { if (stop) stop(); c(); } }],
      });
      QR.startScanner(video, async text => {
        if (!text.startsWith("GPB.")) return;
        try {
          const r = await API.post(`/api/attendance/sessions/${sessionId}/scan`, { badge: text });
          feed.prepend(el("div", { class: "list-item" }, [
            el("div", { class: "grow" }, [
              el("div", { class: "title" }, r.student_name),
              el("div", { class: "meta" }, r.already ? "already checked in" : "marked " + r.status),
            ]),
            el("span", { html: r.already ? statusPill("grey") : statusPill(r.status) }),
          ]));
        } catch (e) {
          feed.prepend(el("div", { class: "muted", style: "font-size:var(--t-meta);padding:6px 2px" }, e.message));
        }
      }, msg => feed.prepend(el("div", { class: "muted", style: "font-size:var(--t-meta);padding:6px 2px" }, msg)))
        .then(s => { stop = s; });
      return m;
    }

    // ---------- actions ----------
    /* The four marks wear the colours the rest of the portal already gives them — the sitting
       list, the badge scanner and the printed record all show a green present and a red
       absent — so anyone who has read one of the three can read all three. Each word is short
       on the button and plainer still on hover, because a leader marking thirty names in a
       borrowed room should not have to stop and think about what "excused" covers. */
    const MARK_TONE = { present: "ok", late: "warn", excused: "info", absent: "danger" };
    const MARK_GLOSS = { present: "Was in class", late: "Came after the class started",
                         excused: "Away with a reason given", absent: "Not there, no reason given" };

    /* Attendance used to be marked with a dropdown beside each name, and every part of that
       was hard to use on a phone in a room full of people:

       - A select is as wide as its longest word ("excused"), so the name next to it was
         squeezed down to "G… N…" and a teacher worked out whose mark he was setting by
         counting rows. Here the name owns the remaining width and wraps instead of clipping.
       - A bordered box holding the lowercase word "present" looks like an answer somebody
         has already typed. It was a question, not an answer — and it opened by answering
         itself for everyone, so a class that never met could be saved as attending in two
         taps. A mark is now a button: filled in its own colour when chosen, quiet when not.
       - Thirty names did not fit inside a dialog at all, so the sheet ran off the screen.

       The list scrolls under a bar that counts what has been answered, one tap sets a mark,
       the arrow keys walk the four choices, and Save refuses while anyone is left out —
       naming them, because a silent half-marked sheet is worse than an honest error. The
       sheet opens at once and folds in what the record already holds when that answer
       arrives, so a phone on a slow tunnel never stares at a spinner instead of a class. */
    function markSession(session) {
      const enrolled = roster.filter(r => r.status === "enrolled");
      if (!enrolled.length) return toast("No enrolled students yet", "err");
      /* One sheet at a time. What is already kept for this sitting arrives over the tunnel,
         which on a phone can take a second, and a teacher who taps "Attendance" twice inside
         that second would otherwise be handed two sheets of one class — and could save the
         second without knowing the first is still open behind it. */
      if (document.querySelector(".mark-sheet")) return toast("The attendance sheet is open");

      // Everyone starts blank; nobody is marked just for being on the roster
      const marks = {};
      enrolled.forEach(r => marks[r.student_id] = null);
      const touched = new Set();      // rows answered here, by hand or by arrow key

      const rowOf = {};
      const rowsHost = el("div", { class: "mark-list" });

      function paint(id, focusOn) {
        const { row, opts } = rowOf[id];
        const st = marks[id];
        STATUSES.forEach(s => {
          const on = s === st;
          opts[s].classList.toggle("on", on);
          opts[s].setAttribute("aria-checked", on ? "true" : "false");
          // one stop per row for the Tab key — the arrows move within it
          opts[s].setAttribute("tabindex", on || (!st && s === STATUSES[0]) ? "0" : "-1");
        });
        row.classList.toggle("is-marked", !!st);
        if (st) row.classList.remove("is-missing");
        if (focusOn && opts[focusOn]) opts[focusOn].focus();
      }
      function choose(id, status, focusOn) {
        marks[id] = status;
        touched.add(id);
        paint(id, focusOn);
        syncBar();
      }

      enrolled.forEach(r => {
        const opts = {};
        const seg = el("div", { class: "mark-seg", role: "radiogroup",
                                "aria-label": `Attendance for ${r.student_name}` });
        STATUSES.forEach(s => {
          opts[s] = el("button", { class: "mark-opt " + MARK_TONE[s], type: "button",
            role: "radio", "aria-checked": "false", tabindex: "-1",
            title: MARK_GLOSS[s],
            onclick: () => choose(r.student_id, s) }, ATT_WORD[s]);
          seg.appendChild(opts[s]);
        });
        seg.addEventListener("keydown", e => {
          const at = STATUSES.indexOf(marks[r.student_id]);
          const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
                     : e.key === "ArrowLeft"  || e.key === "ArrowUp"   ? -1 : 0;
          if (!step && e.key !== "Home" && e.key !== "End") return;
          e.preventDefault();
          const last = STATUSES.length - 1;
          const to = e.key === "Home" ? 0 : e.key === "End" ? last
            : at < 0 ? (step > 0 ? 0 : last) : (at + step + STATUSES.length) % STATUSES.length;
          choose(r.student_id, STATUSES[to], STATUSES[to]);
        });
        const row = el("div", { class: "mark-row" }, [
          UI.avatar({ name: r.student_name, photo_url: r.photo_url }),
          el("div", { class: "mark-who" }, [
            el("div", { class: "mark-name" }, r.student_name),
            el("div", { class: "mark-meta" }, [
              el("span", {}, [r.ward, r.phone].filter(Boolean).join(" · ") || "No ward on file"),
              el("span", { class: "mark-need" }, "Not marked"),
            ]),
          ]),
          seg,
        ]);
        rowOf[r.student_id] = { row, opts };
        rowsHost.appendChild(row);
        paint(r.student_id);
      });

      const countEl = el("div", { class: "mark-count" });
      const tally = el("div", { class: "mark-tally" });
      const btnAll = el("button", { class: "btn ghost sm", type: "button",
        title: "Mark present everyone who has no mark yet",
        onclick: fillRest }, "Mark the rest present");
      const btnClear = el("button", { class: "btn ghost sm", type: "button",
        title: "Take every mark back and start again",
        onclick: clearAll }, "Clear");
      const bar = el("div", { class: "mark-bar" }, [
        el("div", { class: "mark-bar-l" }, [countEl, tally]),
        el("div", { class: "mark-bar-r" }, [btnAll, btnClear]),
      ]);
      const warn = el("div", { class: "mark-warn" });

      function syncBar() {
        const done = enrolled.filter(r => marks[r.student_id]).length;
        const left = enrolled.length - done;
        countEl.textContent = left ? `${done} of ${enrolled.length} marked`
                                   : `All ${enrolled.length} marked`;
        countEl.classList.toggle("is-full", !left);
        tally.replaceChildren(...STATUSES
          .map(s => [s, enrolled.filter(r => marks[r.student_id] === s).length])
          .filter(([, n]) => n)
          .map(([s, n]) => el("span", { class: "mark-tick " + MARK_TONE[s] },
                              `${n} ${ATT_WORD[s].toLowerCase()}`)));
      }
      /* Two deliberate shortcuts, because a class of thirty is marked in one action far more
         often than thirty times: the first fills only the blanks, so an excused name already
         chosen stays excused; the second takes everything back before anything is saved. */
      function fillRest() {
        const missing = enrolled.filter(r => !marks[r.student_id]);
        if (!missing.length) return toast("Everyone already has a mark", "err");
        missing.forEach(r => { marks[r.student_id] = "present"; paint(r.student_id); });
        hideWarn(); syncBar();
        UI.announce(`${missing.length} more students marked present.`);
      }
      function clearAll() {
        enrolled.forEach(r => { marks[r.student_id] = null; paint(r.student_id); });
        hideWarn(); syncBar();
      }
      function hideWarn() {
        warn.classList.remove("show");
        enrolled.forEach(r => rowOf[r.student_id].row.classList.remove("is-missing"));
      }

      let saving = false;
      const m = modal({
        wide: true,
        // The sheet owns the dialog's height: the names scroll inside it while the count bar
        // and Save stay put, so a thirty-name class never buries its own confirm button.
        cls: "mark-modal",
        title: "Attendance · " + fmtDate(session.scheduled_date),
        sub: `${course.title} · ${hoursText(session)} · ${enrolled.length} on the roster`,
        body: el("div", { class: "mark-sheet" }, [bar, rowsHost, warn]),
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => c() },
          { label: "Save marks", onClick: async c => {
            const missing = enrolled.filter(r => !marks[r.student_id]);
            if (missing.length) {
              missing.forEach(r => rowOf[r.student_id].row.classList.add("is-missing"));
              const names = missing.slice(0, 3).map(r => r.student_name).join(", ");
              const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
              const one = missing.length === 1 ? "student has" : "students have";
              warn.textContent = `${missing.length} ${one} no mark yet — ${names}${more}. `
                + "Choose a status for them, or use Mark the rest present.";
              warn.classList.add("show");
              UI.announce(warn.textContent);
              rowOf[missing[0].student_id].row.scrollIntoView({ block: "nearest" });
              return;
            }
            if (saving) return;                       // one save per sheet, however fast the tap
            saving = true;
            const payload = enrolled.map(r =>
              ({ student_id: r.student_id, status: marks[r.student_id], method: "manual" }));
            try {
              await API.post(`/api/stakes/${stakeId}/sessions/${session.id}/attendance`, { marks: payload });
              toast("Attendance saved");
              c();
              UI.announce(`Attendance saved for ${fmtDate(session.scheduled_date)}.`);
              mount(target, stakeId, courseId);
            } catch (e) { toast(e.message, "err"); }
            finally { saving = false; }
          }},
        ],
      });
      syncBar();

      /* The sheet is on the screen the moment it is asked for, and what this sitting already
         has on the record is filled into it as soon as that answer arrives — into the rows the
         teacher has not answered himself. Until then Save and the two shortcuts are shut,
         because a sheet that has not yet seen its own record could write blanks straight over
         marks someone kept days ago. */
      const saveBtn = [...m.panel.querySelectorAll(".mactions .btn")]
        .find(x => /Save marks/.test(x.textContent));
      const setClosed = off => {
        [saveBtn, btnAll, btnClear].forEach(b => { if (b) b.disabled = !off; });
      };
      countEl.textContent = "Reading the marks already kept…";
      tally.replaceChildren();
      setClosed(false);
      API.get(`/api/stakes/${stakeId}/sessions/${session.id}/attendance`).then(existing => {
        existing.forEach(a => {
          if (touched.has(a.student_id)) return;
          if (marks[a.student_id] !== undefined && STATUSES.includes(a.status)) {
            marks[a.student_id] = a.status;
            paint(a.student_id);
          }
        });
        hideWarn();
        syncBar();
        setClosed(true);
      }).catch(e => {
        /* Nothing has been written and nothing will be from this sheet: the honest answer is
           to say what could not be read and how to try again, not to let him mark blind. */
        warn.textContent = "The marks already kept for this sitting could not be read — "
          + e.message + ". Nothing has been changed. Close this sheet and open it again.";
        warn.classList.add("show");
        countEl.textContent = "Nothing kept for this sitting could be read";
      });
      return m;
    }

    /* One form books a sitting and moves one, because they are the same three answers:
       the day, the hour it runs from and to, and whether the door stays open to
       latecomers while the class is still going. A class can have several sittings on one
       day, so the hour is what tells them apart — the server refuses two that overlap and
       says which one is already booked. */
    function sittingModal(session) {
      const adding = !session;
      const d = el("input", { type: "date", value: adding ? "" : session.scheduled_date });
      const t = el("input", { type: "time",
        value: adding ? (course.start_time || "19:00:00").slice(0, 5)
                      : (session.start_time || "19:00:00").slice(0, 5) });
      const e = el("input", { type: "time",
        value: adding ? (course.end_time || "").slice(0, 5)
                      : (session.end_time || "").slice(0, 5) });
      const door = el("input", { type: "checkbox", style: "width:auto",
        checked: (adding ? true : session.checkin_open_until_end !== false) ? "checked" : null });
      modal({
        title: adding ? "Book a sitting" : "Change this sitting",
        sub: adding ? course.title
                    : `Currently ${fmtDate(session.scheduled_date)} · ${hoursText(session)}`,
        body: el("div", {}, [
          el("div", { class: "field" }, [el("label", {}, "Date"), d]),
          el("div", { class: "row" }, [
            el("div", { class: "field" }, [el("label", {}, "Starts"), t]),
            el("div", { class: "field" }, [el("label", {}, "Ends"), e]),
          ]),
          el("div", { class: "field", style: "display:flex;gap:9px;align-items:center" }, [
            door, el("label", { style: "margin:0" }, "Check-in stays open until the class ends"),
          ]),
          el("div", { class: "hint" },
            "Either way the door closes an hour after the class finishes, so someone on " +
            "their way is still counted. Leaving the end blank keeps the class's own hours."),
        ]),
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => c() },
          { label: adding ? "Book sitting" : "Save", onClick: async c => {
            if (!d.value) return toast("Choose the date this sitting is on", "err");
            const hhmm = v => v ? v + ":00" : null;
            try {
              if (adding) {
                await API.post(`/api/stakes/${stakeId}/courses/${courseId}/sessions`, {
                  scheduled_date: d.value, start_time: hhmm(t.value), end_time: hhmm(e.value),
                  checkin_open_until_end: door.checked,
                });
                toast("Sitting booked");
              } else {
                const q = new URLSearchParams({ new_date: d.value });
                if (t.value) q.set("new_time", hhmm(t.value));
                if (e.value) q.set("new_end", hhmm(e.value));
                q.set("open_until_end", door.checked ? "true" : "false");
                await API.patch(`/api/stakes/${stakeId}/sessions/${session.id}?${q}`);
                toast("Sitting updated");
              }
              c(); mount(target, stakeId, courseId);
            } catch (err) { toast(err.message, "err"); }
          }},
        ],
      });
    }

    async function cancelSession(session) {
      const ok = await UI.confirm(`Cancel the ${fmtDate(session.scheduled_date)} session? Students keep their prior attendance records.`,
        { danger: true, okLabel: "Cancel session", title: "Cancel this session?" });
      if (!ok) return;
      try { await API.patch(`/api/stakes/${stakeId}/sessions/${session.id}?new_status=cancelled`);
        toast("Session cancelled"); mount(target, stakeId, courseId); }
      catch (e) { toast(e.message, "err"); }
    }

    async function eraseSession(session) {
      const ok = await UI.confirm(
        `The ${fmtDate(session.scheduled_date)} sitting at ${hoursText(session)} goes off the `
        + `calendar for good. No one has been marked in it, so nothing is taken out of the `
        + `records — but a cancelled session stays on the list and this one will not.`,
        { danger: true, okLabel: "Delete sitting", title: "Delete this sitting?" });
      if (!ok) return;
      try {
        await API.del(`/api/stakes/${stakeId}/sessions/${session.id}`);
        toast("Sitting deleted");
        UI.announce(`The ${fmtDate(session.scheduled_date)} sitting has been deleted.`);
        mount(target, stakeId, courseId);
      } catch (e) { toast(e.message, "err"); }
    }

    function grade(r) {
      const comp = el("select", {}, ["in_progress", "completed", "withdrawn"].map(v =>
        el("option", { value: v, selected: r.completion_status === v ? "selected" : null }, v.replace("_", " "))));
      const g = el("input", { placeholder: "e.g. A, B, Pass", value: r.final_grade || "" });
      const cert = el("input", { type: "checkbox", style: "width:auto",
        checked: r.certificate_issued ? "checked" : null });
      modal({
        title: "Grade · " + r.student_name,
        sub: course.title,
        body: el("div", {}, [
          el("div", { class: "field" }, [el("label", {}, "Completion status"), comp]),
          el("div", { class: "field" }, [el("label", {}, "Final grade"), g]),
          el("div", { class: "field", style: "display:flex;gap:9px;align-items:center" },
            [cert, el("label", { style: "margin:0" }, "Certificate issued")]),
        ]),
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => c() },
          { label: "Save record", onClick: async c => {
            try { await API.post(`/api/stakes/${stakeId}/enrollments/${r.id}/grade`, {
              completion_status: comp.value, final_grade: g.value || null, certificate_issued: cert.checked });
              toast("Record saved"); c(); mount(target, stakeId, courseId); }
            catch (e) { toast(e.message, "err"); }
          }},
        ],
      });
    }

    async function withdraw(r) {
      const ok = await UI.confirm(`Withdraw ${r.student_name} from ${course.title}? The next waitlisted student is promoted automatically.`,
        { danger: true, okLabel: "Withdraw", title: "Withdraw student?" });
      if (!ok) return;
      try { await API.post(`/api/stakes/${stakeId}/enrollments/${r.id}/drop`);
        toast("Student withdrawn"); mount(target, stakeId, courseId); }
      catch (e) { toast(e.message, "err"); }
    }

    /* Registering someone into a class is a leader/admin power — a stake president,
       service missionary or portal admin can enrol a student who never got round to
       signing themselves up, and the seat/waitlist rules are the server's. */
    async function enrollSomeone() {
      const all = await API.get(`/api/stakes/${stakeId}/members?role=student`);
      const onRoster = new Set(roster.map(r => r.student_id));
      const free = all.filter(m => !onRoster.has(m.user_id));
      if (!free.length) return toast("Every student in this stake is already on this roster.", "err");
      const sel = el("select", {}, free.map(m => el("option", { value: m.user_id }, m.name)));
      modal({
        title: "Register a student", sub: course.title,
        body: el("div", { class: "field" }, [el("label", {}, "Student"), sel]),
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => c() },
          { label: "Enrol", onClick: async c => {
            try {
              const r = await API.post(`/api/stakes/${stakeId}/courses/${courseId}/enroll?student_id=${sel.value}`);
              toast(r.status === "waitlisted" ? "Added to the waitlist" : "Student enrolled");
              c(); mount(target, stakeId, courseId);
            } catch (e) { toast(e.message, "err"); }
          }},
        ],
      });
    }
  }

  // ==================== a member's own view of the class ====================
  /* Five answers, in the order a person actually wants them: whether they are on their
     way, where and when it sits, how far the class has run, whether they were in it, and
     who else is coming. Every line below is a ClassSession, an Enrollment or an Attendance
     row — this portal keeps no lesson, material, event or announcement record to fill a
     picture with, so nothing here is standing in for one. */
  async function memberView(target, stakeId, courseId, course, f) {
    const user = API.getUser();
    const [sessions, myEnrolments, history, roster] = await Promise.all([
      API.get(`/api/stakes/${stakeId}/courses/${courseId}/sessions`),
      API.get(`/api/stakes/${stakeId}/students/${user.id}/enrollments`),
      API.get("/api/attendance/my-history").catch(() => ({ history: [], rollup: [] })),
      API.get(`/api/stakes/${stakeId}/courses/${courseId}/roster`),
    ]);
    const seat = myEnrolments.find(r => r.course_id === courseId
      && (r.status === "enrolled" || r.status === "waitlisted")) || null;
    const myMarks = history.history.filter(h => h.course_id === courseId);
    const myRoll = history.rollup.find(r => r.course_id === courseId) || null;

    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
                   + `-${String(today.getDate()).padStart(2, "0")}`;
    const now = Date.now();
    const booked = sessions.filter(s => s.status !== "cancelled");
    const upcoming = booked.filter(s => startsAt(s) >= now).sort((a, b) => startsAt(a) - startsAt(b));
    const past = sessions.filter(s => s.status !== "cancelled" && startsAt(s) < now)
                         .sort((a, b) => startsAt(b) - startsAt(a));
    const heldCount = sessions.filter(s => s.status === "completed").length;
    const next = upcoming[0] || null;
    // A code exists only around the sitting itself, so the camera is offered on the day —
    // nowhere else in the portal does a button promise a scan that cannot happen.
    const meetsToday = !!next && next.scheduled_date === isoToday;

    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("a", { href: "#/classes", style: "font-size:var(--t-ui);font-weight:600" }, "← Classes"),
    ]));

    // ---------------- hero ----------------
    const days = (course.weekdays || []).map(d => UI.WEEKDAYS[d]).join(" / ");
    const hours = !course.start_time ? "" : (course.end_time
      ? `${fmtTime(course.start_time)} – ${fmtTime(course.end_time)}` : fmtTime(course.start_time));
    const full = !!course.capacity && course.enrolled_count >= course.capacity;
    const fact = (ic, txt) => el("div", { class: "cd-fact" }, [icon(ic, 14), txt]);
    const acts = el("div", { class: "btns" });
    if (meetsToday && seat && seat.status === "enrolled") {
      acts.appendChild(el("a", { class: "btn", href: "#/checkin" }, [icon("qr", 15), "Check in"]));
    }
    if (!seat && Ctx.can(f, "enrol")) {
      acts.appendChild(el("button", { class: "btn", onclick: () => join() },
        [icon("plus", 15), full ? "Join the waitlist" : "Enrol"]));
    }
    if (seat) {
      acts.appendChild(el("button", { class: "btn ghost sm",
        onclick: () => leave(seat) }, [icon("x", 15), "Leave this class"]));
    }
    const skills = (course.skills || "").split("\n").map(s => s.trim()).filter(Boolean);
    const hero = el("div", { class: "card cd-hero" });
    /* Across the top, as the design always meant it: the picture is what a member is looking
       for when they open the class they are coming to, and it belongs above the words, not
       beside them. No buttons here — this page shows a class, it does not run one. */
    const cover = coverBlock(course, stakeId, courseId, false, null);
    if (cover) hero.appendChild(cover);
    hero.appendChild(el("div", { class: "cd-top" }, [
      el("div", { class: "nu-kind" }, UI.CATEGORIES[course.category] || course.category || ""),
      el("h2", { class: "cd-title" }, course.title),
      course.description ? el("div", { class: "cd-desc" }, course.description) : null,
    ]));
    if (skills.length) {
      hero.appendChild(el("div", { class: "cd-skills" },
        skills.map(s => el("span", {}, s))));
    }
    hero.appendChild(el("div", { class: "cd-facts" }, [
      fact("clock", (days || "Days to be set") + (hours ? " · " + hours : "")),
      fact("pin", `${course.room_name || "No room set"} · ` +
           (course.gathering_place_name || "no gathering place")),
      fact("user", course.instructor_name || "No instructor given yet"),
      fact("calendar", course.course_start_date
        ? `Runs ${fmtDate(course.course_start_date)} – ${fmtDate(course.course_end_date)}`
        : "No dates set for this class"),
      fact("users", course.capacity
        ? `${course.enrolled_count} of ${course.capacity} seats taken`
          + (course.waitlist_count ? ` · ${course.waitlist_count} waiting` : "")
        : `${course.enrolled_count} enrolled`),
    ]));
    hero.appendChild(el("div", { class: "cd-foot" }, [
      el("div", { class: "cd-state" }, [
        seat && seat.status === "enrolled"
          ? el("span", { class: "pill green" }, "On this class list") : null,
        seat && seat.status === "waitlisted"
          ? el("span", { class: "pill amber" },
               "Waitlisted · position " + seat.waitlist_position) : null,
        seat && seat.completion_status === "completed"
          ? el("span", { class: "mini-pill ok" }, "Completed") : null,
        !seat && full ? el("span", { class: "pill amber" }, "Full") : null,
        !course.is_active ? el("span", { class: "mini-pill" }, "Not running") : null,
        !seat ? el("span", { class: "cd-plain" }, "You are not on this class list.") : null,
      ]),
      acts,
    ]));
    if (next) {
      hero.appendChild(el("div", { class: "cd-next" }, [
        icon("calendar", 14),
        (meetsToday ? "Meets today at " : "Next sitting " + fmtDate(next.scheduled_date) + " at ")
          + hoursText(next),
      ]));
    }
    content.appendChild(hero);

    // ---------------- my record in this class ----------------
    if (seat && seat.status === "enrolled") content.appendChild(myRecord(course, myMarks, myRoll,
      heldCount, booked.length, meetsToday));

    // ---------------- sessions ----------------
    content.appendChild(el("div", { class: "sec-title" }, "Sessions"));
    const scard = el("div", { class: "card" });
    if (!sessions.length) {
      scard.appendChild(empty("No sitting has been booked for this class yet — your teacher "
        + "or the missionary sets the dates.", "calendar"));
    }
    const row = s => scard.appendChild(el("div", { class: "list-item" }, [
      el("div", { class: "when" }, [
        el("div", { class: "d" }, new Date(s.scheduled_date + "T00:00:00").getDate()),
        el("div", { class: "m" }, new Date(s.scheduled_date + "T00:00:00")
          .toLocaleDateString(undefined, { month: "short" })),
      ]),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, new Date(s.scheduled_date + "T00:00:00")
          .toLocaleDateString(undefined, { weekday: "long" }) + " · " + hoursText(s)),
        el("div", { class: "meta" }, [el("span", { html: statusPill(s.status) }),
          s.notes ? el("span", { class: "muted" }, " — " + s.notes) : null]),
      ]),
    ]));
    upcoming.slice(0, 4).forEach(row);
    if (past.length) {
      scard.appendChild(el("div", { class: "cd-sub" },
        past.length + (past.length === 1 ? " sitting held" : " sittings held")));
      past.slice(0, 8).forEach(row);
      if (past.length > 8) scard.appendChild(el("div", { class: "hint" },
        `${past.length - 8} earlier sitting(s) are on your full record.`));
    }
    content.appendChild(scard);

    // ---------------- classmates ----------------
    const others = roster.filter(r => r.student_id !== user.id && r.status === "enrolled");
    content.appendChild(el("div", { class: "sec-title" }, "Who is in this class"));
    const pcards = el("div", { class: "card" });
    if (!others.length) {
      pcards.appendChild(empty("No one else is on this class list yet.", "users"));
    }
    others.forEach(r => pcards.appendChild(el("div", { class: "list-item" }, [
      UI.avatar({ name: r.student_name, photo_url: r.photo_url }),
      el("div", { class: "grow" }, [el("div", { class: "title" }, r.student_name)]),
    ])));
    if (course.waitlist_count) {
      pcards.appendChild(el("div", { class: "hint" },
        `${course.waitlist_count} ${course.waitlist_count === 1 ? "person is" : "people are"} `
        + "waiting for a seat here."));
    }
    content.appendChild(pcards);

    // ---------------- messages ----------------
    content.appendChild(el("div", { class: "sec-title" }, "Keep the conversation going"));
    const mcard = el("div", { class: "card" });
    mcard.appendChild(el("div", { class: "cd-copy" },
      "Notices about this class arrive in Messages. A member writes to an instructor "
      + "directly, and to anyone who has written to them first."));
    mcard.appendChild(el("div", { class: "actions" }, [
      el("a", { class: "btn secondary sm", href: "#/messages" }, [icon("mail", 15), "Open messages"]),
      course.instructor_id ? el("button", { class: "btn sm",
        onclick: () => MessagesPage.composeDirect({ user_id: course.instructor_id,
                                                    name: course.instructor_name }) },
        [icon("send", 15), "Message the instructor"]) : null,
    ]));
    content.appendChild(mcard);

    UI.render(target, UI.shell("courses", content, App.nav(), App.ctx()));

    async function join() {
      try {
        const e = await API.post(`/api/stakes/${stakeId}/courses/${courseId}/enroll`);
        toast(e.status === "waitlisted"
          ? `You're #${e.waitlist_position} on the waitlist` : "Enrolled — see you in class");
        mount(target, stakeId, courseId);
      } catch (e) { toast(e.message, "err"); }
    }
    async function leave(seatRow) {
      const ok = await UI.confirm(seatRow.status === "waitlisted"
        ? `Leave the waitlist for "${course.title}"?`
        : `Leave "${course.title}"? If it is full, the first person on the waitlist takes `
          + "your seat and your attendance record stays on file.",
        { danger: true, okLabel: "Leave", title: "Leave this class?" });
      if (!ok) return;
      try {
        await API.post(`/api/stakes/${stakeId}/enrollments/${seatRow.id}/drop`);
        toast(seatRow.status === "waitlisted" ? "Left the waitlist" : "You have left this class");
        mount(target, stakeId, courseId);
      } catch (e) { toast(e.message, "err"); }
    }
  }

  /* The member's own figures for one class. The squares are attendance rows this person
     was marked in, oldest first, so the strip reads the same way as the one on their home
     screen; a class whose rosters have never been taken says so instead of showing zero. */
  function myRecord(course, marks, roll, heldCount, bookedCount, meetsToday) {
    const card = el("div", { class: "card" });
    card.appendChild(el("div", { class: "mc-head" }, [
      el("div", {}, [
        el("div", { class: "nu-kind" }, "Your record in this class"),
        el("div", { class: "mc-name" }, roll ? roll.pct + "%" : "Nothing marked yet"),
        el("div", { class: "mc-meta" }, roll
          ? `You were in ${roll.present} of ${roll.total} session${roll.total === 1 ? "" : "s"} `
            + "your teacher marked"
          : "No roster has been taken in this class yet."),
      ]),
      el("a", { class: "btn ghost sm", href: "#/record" }, [icon("list", 14), "Full record"]),
    ]));
    if (bookedCount) {
      card.appendChild(el("div", { class: "meter" }, [el("i", {
        style: `width:${Math.round(heldCount / bookedCount * 100)}%` })]));
      card.appendChild(el("div", { class: "mc-count", style: "margin-top:7px" },
        `${heldCount} of ${bookedCount} sittings held`));
    }
    if (marks.length) {
      card.appendChild(el("div", { class: "strip", style: "margin-top:15px",
        "aria-label": "One square for each session you were marked in, oldest first" },
        marks.slice().reverse().map(m => el("i", { class: "att-cell " + m.status,
          title: `${fmtDate(m.date)} · ${ATT_WORD[m.status] || m.status}` }))));
      card.appendChild(el("div", { class: "strip-legend" },
        ["present", "late", "excused", "absent"].map(k =>
          el("span", {}, [el("i", { class: "att-cell " + k }), ATT_WORD[k]]))));
    }
    card.appendChild(el("div", { class: "hint" }, meetsToday
      ? "Scan the code your teacher projects, or show them the QR on your badge."
      : "At the next sitting, scan the code your teacher projects or show your badge."));
    return card;
  }

  function stop() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  return { mount, stop };
})();
