/* Student: QR check-in (camera or manual code) + personal badge */
const CheckinPage = (() => {
  const { el, toast, icon, empty, fmtDate, startsAt, hoursText } = UI;
  let stopScan = null;

  async function mount(target, courseId) {
    if (stopScan) { stopScan(); stopScan = null; }
    const user = API.getUser() || {};
    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("h1", { class: "page-title" }, "Check in"),
      el("div", { class: "page-sub" }, "Scan the code on the classroom screen, or show your badge."),
      el("div", { class: "muted", style: "font-size:var(--t-ui);margin-top:var(--sp-6)" },
        "Check-in never closes. You can check in for any sitting of your class — late, or "
        + "days after it met — and the record will say you were late, and still count you."),
    ]));

    const tabs = el("div", { class: "tabs" });
    const body = el("div");
    let mode = "scan";
    function draw() {
      if (stopScan) { stopScan(); stopScan = null; }
      tabs.innerHTML = "";
      tabs.appendChild(el("button", { class: mode === "scan" ? "active" : "",
        onclick: () => { mode = "scan"; draw(); } }, "Check in"));
      tabs.appendChild(el("button", { class: mode === "badge" ? "active" : "",
        onclick: () => { mode = "badge"; draw(); } }, "My badge"));
      body.innerHTML = "";
      if (mode === "scan") scanTab(body, user, courseId); else badgeTab(body);
    }
    content.appendChild(tabs);
    content.appendChild(body);
    UI.render(target, UI.shell("checkin", content, App.navFor(user)));
    draw();
  }

  // ---------------- check in ----------------
  function scanTab(body, user, courseId) {
    /* What was written down is put on the page, not only in a toast that fades away.
       "Late" is the one word a student needs to still be able to read a minute later, and
       it is the word that tells them they were counted rather than turned away. */
    const resultHost = el("div");
    body.appendChild(resultHost);
    function showResult(r) {
      resultHost.innerHTML = "";
      const late = r.late || r.status === "late";
      resultHost.appendChild(el("div", { class: "card" }, [
        el("div", { style: "margin-bottom:var(--sp-8)" },
          [el("span", { class: "pill " + (late ? "amber" : "green") },
            late ? "Checked in late" : "Checked in")]),
        el("div", { style: "font-weight:600" },
          r.note || "Your attendance has been recorded."),
        el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-6)" },
          late ? "You are counted as late, not absent. The class record keeps both."
                : "Your attendance has been recorded for this sitting."),
      ]));
    }

    const card = el("div", { class: "card center" });
    const video = el("video", { class: "scan-video", muted: "muted", playsinline: "true",
      hidden: "hidden" });
    const hint = el("div", { class: "muted center", style: "font-size:var(--t-ui);margin-top:var(--sp-10)" },
      "The code on the classroom screen renews every 30 seconds, so scan it while it is showing.");
    const camBtn = el("button", { class: "btn", style: "margin-top:var(--sp-12)" }, "Turn on camera");
    const stopBtn = el("button", { class: "btn secondary sm", style: "margin-top:var(--sp-12)",
      hidden: "hidden" }, "Stop camera");
    card.append(video, hint, camBtn, stopBtn);
    body.appendChild(card);

    /* The camera waits for a tap on purpose. A prompt that appears the instant the page
       loads gets declined out of reflex, and a declined permission is not something a
       first-time user knows how to undo. Here they choose it, and can choose it again. */
    function idle(message, label) {
      if (stopScan) { stopScan(); stopScan = null; }   // hand the camera back to the phone
      video.hidden = true;
      camBtn.hidden = false;
      camBtn.disabled = false;
      camBtn.textContent = label;
      stopBtn.hidden = true;
      hint.textContent = message;
    }
    async function startCamera() {
      camBtn.disabled = true;
      camBtn.textContent = "Starting camera…";
      let refused = null;
      const stop = await QR.startScanner(video, async text => {
        let payload;
        try { payload = JSON.parse(text); } catch { return; }   // ignore unrelated codes
        if (!payload || !payload.s || !payload.c) return;
        idle("Ready when you are — turn the camera on again to scan another code.",
          "Turn on camera");
        const r = await submit(payload.s, payload.c);
        if (r) {
          showResult(r);
          hint.textContent = "You're checked in.";
          camBtn.hidden = true;
        }
      }, msg => { refused = msg; });
      if (refused) return idle(refused, "Try again");
      stopScan = stop;
      video.hidden = false;
      camBtn.hidden = true;
      stopBtn.hidden = false;
      hint.textContent = "Hold the phone steady and keep the whole code inside the frame.";
    }
    camBtn.onclick = startCamera;
    stopBtn.onclick = () => idle("The camera is off. Turn it on again whenever you're ready.",
      "Turn on camera");

    // manual fallback
    const secTitle = el("h2", { class: "sec-title" }, "Or enter the code manually");
    body.appendChild(secTitle);
    const mcard = el("div", { class: "card" });
    /* Which sitting the code belongs to. A class can meet twice on one day, so the date
       alone never picks one out — the hour does — and every sitting still to come is
       listed rather than guessed at on the student's behalf. */
    const courseSel = el("select");
    const sessSel = el("select");
    const sessHint = el("div", { class: "muted", style: "font-size:var(--t-ui);margin-top:var(--sp-6)" }, "—");
    const codeIn = el("input", { placeholder: "6-digit code", inputmode: "numeric", maxlength: "6" });
    const loading = el("div", { class: "muted", style: "font-size:var(--t-meta);margin-top:var(--sp-8)" },
      "Loading your courses…");
    let sessionId = null;

    mcard.appendChild(loading);
    body.appendChild(mcard);

    (async () => {
      const stakes = (await API.get("/api/my-stakes"))
        .filter(s => s.role === "student" && s.member_status === "active"
                  && s.stake_status === "active");
      const opts = [];
      for (const st of stakes) {
        const [mine, courses] = await Promise.all([
          API.get(`/api/stakes/${st.stake_id}/students/${user.id}/enrollments`),
          API.get(`/api/stakes/${st.stake_id}/courses`),
        ]);
        const titles = {}; courses.forEach(c => { titles[c.id] = c.title; });
        mine.filter(e => e.status === "enrolled").forEach(e =>
          opts.push({ stake_id: st.stake_id, course_id: e.course_id,
                      label: `${titles[e.course_id] || "Course"} · ${st.stake_name}` }));
      }
      /* Nothing to enter by hand means nothing to offer. A heading that promises a
         choice and then says there is no choice is a small let-down, so the heading
         goes with the field, and the way out is offered instead. */
      if (!opts.length) {
        loading.remove();
        secTitle.remove();
        mcard.appendChild(empty(
          "You are not in any class yet. Join one, and its code will work right here.",
          "book"));
        mcard.appendChild(el("a", { class: "btn secondary", style: "margin-top:var(--sp-12)",
          href: "#/courses" }, "Find a class"));
        return;
      }
      opts.forEach((o) => courseSel.appendChild(
        el("option", { value: o.course_id }, o.label)));
      /* The class a student tapped on the Classes page comes with them, so the class they
         meant is already chosen when they arrive. */
      if (courseId && opts.some(o => o.course_id === courseId)) courseSel.value = String(courseId);
      const checkBtn = el("button", { class: "btn", style: "margin-top:var(--sp-12)",
        onclick: async () => {
          const r = await submit(sessionId, codeIn.value);
          if (r) showResult(r);
        } },
        [icon("check", 17), "Check in"]);
      async function loadSessions() {
        const o = opts.find(x => x.course_id === +courseSel.value);
        const all = (await API.get(
          `/api/stakes/${o.stake_id}/courses/${o.course_id}/sessions`))
          .filter(s => s.status !== "cancelled")
          .sort((a, b) => startsAt(a) - startsAt(b));
        sessSel.innerHTML = "";
        if (!all.length) {
          sessionId = null;
          sessSel.appendChild(el("option", { value: "" }, "No sitting to check in to"));
          sessSel.disabled = true;
          checkBtn.disabled = true;
          sessHint.textContent = "This class has no date on the calendar yet.";
          return;
        }
        sessSel.disabled = false;
        checkBtn.disabled = false;
        /* Every sitting is offered — the ones still to come and the ones already gone.
           The door no longer shuts, so a student who was on the way, or who is checking in
           days later, is not refused for want of a choice. They are listed under two
           headings because "12 Oct" on its own does not tell anybody whether that class
           has happened yet. */
        const now = Date.now();
        const ahead = all.filter(s => startsAt(s) >= now);
        const past = all.filter(s => startsAt(s) < now).reverse();
        const group = (label, rows) => {
          if (!rows.length) return;
          const g = el("optgroup", { label });
          rows.forEach(s => g.appendChild(el("option", { value: s.id },
            `${fmtDate(s.scheduled_date)} · ${hoursText(s)}`)));
          sessSel.appendChild(g);
        };
        group("Still to come", ahead);
        group("Already happened", past);
        /* The sitting nearest to now is the one the student means: the class that is
           running, or the one that has just finished. */
        const nearest = all.slice().sort((a, b) =>
          Math.abs(startsAt(a) - now) - Math.abs(startsAt(b) - now))[0];
        sessSel.value = String(nearest.id);
        sessionId = nearest.id;
        sessHint.textContent = past.length
          ? "Pick the sitting you are in. One that has already happened is still open — "
            + "you will be marked late."
          : "Pick the sitting you are in — a class can meet more than once on a day.";
      }
      courseSel.addEventListener("change", loadSessions);
      sessSel.addEventListener("change", () => { sessionId = +sessSel.value; });
      loading.remove();
      mcard.appendChild(el("div", { class: "field" }, [el("label", {}, "Course"), courseSel]));
      mcard.appendChild(el("div", { class: "field" }, [el("label", {}, "Sitting"), sessSel]));
      mcard.appendChild(sessHint);
      mcard.appendChild(el("div", { class: "field", style: "margin-top:var(--sp-10)" },
        [el("label", {}, "Code on screen"), codeIn]));
      mcard.appendChild(checkBtn);
      await loadSessions();
    })().catch(e => { loading.remove(); toast(e.message, "err"); });
  }

  /* The answer, so the caller can leave the camera alone once the name is in — and put
     what was recorded on the screen instead of letting a toast carry it away. */
  async function submit(sessionId, code) {
    if (sessionId == null || !String(code).trim()) {
      toast("Pick the course and type the 6-digit code on the screen", "err");
      return null;
    }
    try {
      const r = await API.post("/api/attendance/checkin",
        { session_id: +sessionId, code: String(code).trim() });
      toast(r.note || `Checked in — ${r.status}`, "ok");
      return r;
    } catch (e) { toast(e.message, "err"); return null; }
  }

  // ---------------- my badge ----------------
  async function badgeTab(body) {
    const card = el("div", { class: "card center" });
    card.appendChild(el("div", { class: "muted", style: "font-size:var(--t-ui)" },
      "Show this to your instructor to be scanned in."));
    const host = el("div", { class: "qr-box" });
    card.appendChild(host);
    card.appendChild(el("div", { style: "font-weight:600;margin-top:var(--sp-10)" },
      (API.getUser() || {}).full_name || ""));
    const tools = el("div", { class: "actions", style: "margin-top:var(--sp-14);justify-content:center" });
    card.appendChild(tools);
    body.appendChild(card);
    try {
      const b = await API.get("/api/attendance/my-badge");
      QR.render(host, b.token, 210, "Your personal check-in code");

      // Printable card is branded per stake, so ask which membership to print when there is more than one.
      const stakes = (await API.get("/api/my-stakes"))
        .filter(s => s.member_status === "active" && s.stake_status === "active");
      if (!stakes.length) return;
      let stakeSel = null;
      if (stakes.length > 1) {
        stakeSel = el("select", { style: "max-width:230px" }, stakes.map(s =>
          el("option", { value: s.stake_id }, s.stake_name)));
        tools.appendChild(stakeSel);
      }
      tools.appendChild(el("button", { class: "btn secondary sm", onclick: () => {
        const sid = stakeSel ? +stakeSel.value : stakes[0].stake_id;
        API.download(`/api/stakes/${sid}/students/${b.user_id}/badge.pdf`, `badge-${b.user_id}.pdf`)
          .then(() => toast("Badge card downloaded"))
          .catch(e => toast(e.message, "err"));
      }}, [icon("idcard", 15), "Printable card (PDF)"]));
    } catch (e) { toast(e.message, "err"); }
  }

  return { mount, stop: () => { if (stopScan) { stopScan(); stopScan = null; } } };
})();
