/* Student: QR check-in (camera or manual code) + personal badge */
const CheckinPage = (() => {
  const { el, toast, icon, empty, fmtDate, startsAt, hoursText } = UI;
  let stopScan = null;

  async function mount(target) {
    if (stopScan) { stopScan(); stopScan = null; }
    const user = API.getUser();
    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("h2", { class: "page-title" }, "Check in"),
      el("div", { class: "page-sub" }, "Scan the code on the classroom screen, or show your badge."),
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
      if (mode === "scan") scanTab(body); else badgeTab(body);
    }
    content.appendChild(tabs);
    content.appendChild(body);
    UI.render(target, UI.shell("checkin", content, App.navFor(user)));
    draw();
  }

  // ---------------- check in ----------------
  function scanTab(body) {
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
        if (await submit(payload.s, payload.c)) {
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
    body.appendChild(el("div", { class: "sec-title" }, "Or enter the code manually"));
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
          API.get(`/api/stakes/${st.stake_id}/students/${API.getUser().id}/enrollments`),
          API.get(`/api/stakes/${st.stake_id}/courses`),
        ]);
        const titles = {}; courses.forEach(c => { titles[c.id] = c.title; });
        mine.filter(e => e.status === "enrolled").forEach(e =>
          opts.push({ stake_id: st.stake_id, course_id: e.course_id,
                      label: `${titles[e.course_id] || "Course"} · ${st.stake_name}` }));
      }
      if (!opts.length) { loading.remove();
        mcard.appendChild(empty("You're not enrolled in any courses yet.", "book")); return; }
      opts.forEach((o, i) => courseSel.appendChild(
        el("option", { value: i }, o.label)));
      async function loadSessions() {
        const o = opts[+courseSel.value];
        const all = (await API.get(
          `/api/stakes/${o.stake_id}/courses/${o.course_id}/sessions`))
          .filter(s => s.status !== "cancelled")
          .sort((a, b) => startsAt(a) - startsAt(b));
        const today = new Date().toISOString().slice(0, 10);
        /* Today counts, even if the class has already finished: the door stays open for an
           hour after the bell, and a student who is typing the code in by hand is exactly
           the person who may be using it. */
        const ahead = all.filter(s => s.scheduled_date >= today);
        const list = ahead.length ? ahead : (all.length ? [all[all.length - 1]] : []);
        sessSel.innerHTML = "";
        if (!list.length) {
          sessionId = null;
          sessSel.appendChild(el("option", { value: "" }, "No sitting to check in to"));
          sessSel.disabled = true;
          sessHint.textContent = "This class has no date on the calendar yet.";
          return;
        }
        sessSel.disabled = false;
        list.forEach(s => sessSel.appendChild(
          el("option", { value: s.id }, `${fmtDate(s.scheduled_date)} · ${hoursText(s)}`)));
        sessionId = +sessSel.value;
        sessHint.textContent = list.length > 1
          ? "Pick the sitting you are in — a class can meet more than once on a day."
          : "The code on the screen belongs to this sitting.";
      }
      courseSel.addEventListener("change", loadSessions);
      sessSel.addEventListener("change", () => { sessionId = +sessSel.value; });
      loading.remove();
      mcard.appendChild(el("div", { class: "field" }, [el("label", {}, "Course"), courseSel]));
      mcard.appendChild(el("div", { class: "field" }, [el("label", {}, "Sitting"), sessSel]));
      mcard.appendChild(sessHint);
      mcard.appendChild(el("div", { class: "field", style: "margin-top:var(--sp-10)" },
        [el("label", {}, "Code on screen"), codeIn]));
      mcard.appendChild(el("button", { class: "btn", style: "margin-top:var(--sp-12)",
        onclick: () => sessionId && submit(sessionId, codeIn.value) },
        [icon("check", 17), "Check in"]));
      await loadSessions();
    })().catch(e => { loading.remove(); toast(e.message, "err"); });
  }

  /* True on success so the caller can leave the camera alone once the name is in. */
  async function submit(sessionId, code) {
    if (sessionId == null || !String(code).trim()) {
      toast("Pick the course and type the 6-digit code on the screen", "err");
      return false;
    }
    try {
      const r = await API.post("/api/attendance/checkin",
        { session_id: +sessionId, code: String(code).trim() });
      toast(`Checked in — ${r.status}`, "ok");
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  }

  // ---------------- my badge ----------------
  async function badgeTab(body) {
    const card = el("div", { class: "card center" });
    card.appendChild(el("div", { class: "muted", style: "font-size:var(--t-ui)" },
      "Show this to your instructor to be scanned in."));
    const host = el("div", { class: "qr-box" });
    card.appendChild(host);
    card.appendChild(el("div", { style: "font-weight:600;margin-top:var(--sp-10)" }, API.getUser().full_name));
    const tools = el("div", { class: "actions", style: "margin-top:var(--sp-14);justify-content:center" });
    card.appendChild(tools);
    body.appendChild(card);
    try {
      const b = await API.get("/api/attendance/my-badge");
      QR.render(host, b.token, 210);

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
