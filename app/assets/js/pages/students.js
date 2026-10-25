/* Students: the people of this place, and how to reach them.

   Three people come to this screen for three different reasons, and the server decides
   what each of them is allowed to see:

   - A leader or a missionary opens it to find somebody: every member of the place, with
     the ward they belong to and the number that can be rung.
   - A teacher opens it for the students in their own classes, and nothing else — the
     privacy promise keeps the whole place's list out of a teacher's hands.
   - A student has no place on it at all.

   The list is searchable by name, ward or number, because the person standing in front
   of you usually knows one of those three and not the other two. */
const StudentsPage = (() => {
  const { el, icon, empty, tile, shell, render, notice, avatar } = UI;

  const LEADERS = ["stake_president", "district_president", "service_missionary"];

  let state = { chip: "all", q: "" };
  let repaint = () => {};

  async function mount(target) {
    const ctx = App.ctx();
    const stake = ctx.stake;
    if (!stake) {
      return render(target, shell("students",
        notice("Students", "Pick a stake to see its people.", "users"), App.nav(), ctx));
    }
    if (stake.student) {
      return render(target, shell("students", notice("Students",
        "The list of students belongs to the teacher of a class and to the leaders of the "
        + "place.", "users"), App.nav(), ctx));
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
    render(target, shell("students", content, App.nav(), ctx));

    await refresh(stats, chipBar, list, stake);
  }

  async function refresh(stats, chipBar, list, stake) {
    let people = [], courses = [];
    try {
      if (stake.monitor) {
        /* A leader sees the whole place: every member, with the ward and the number.
           The register of the place names each person by their user id, and so does the
           message composer — so that id is kept under one name here too, and the note
           button knows who it is writing to. */
        const rows = await API.get(`/api/stakes/${stake.id}/members`);
        people = rows.map(r => Object.assign({}, r, { id: r.id || r.user_id }));
      } else {
        const set = await teacherStudents(stake.id);
        people = set.people;
        courses = set.courses;
      }
    } catch (e) {
      list.replaceChildren(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }

    const students = people.filter(p => p.role === "student");
    const teachers = people.filter(p => p.role === "instructor");
    const waiting = people.filter(p => p.requested || p.status === "pending_approval");

    const tiles = stake.monitor
      ? [tile(people.length, "People"),
         tile(students.length, "Students"),
         tile(teachers.length, "Teachers"),
         tile(waiting.length, "Waiting")]
      : [tile(people.length, "Students"),
         tile(courses.length, "Your classes")];
    stats.replaceChildren(...tiles);

    /* One filter answers "who am I looking for" — and for a teacher it is the class,
       because a teacher thinks of their people class by class. */
    const defs = stake.monitor
      ? [{ key: "all", label: "All", n: people.length },
         { key: "student", label: "Students", n: students.length },
         { key: "instructor", label: "Teachers", n: teachers.length },
         { key: "leader", label: "Leaders", n: people.filter(p => LEADERS.includes(p.role)).length },
         { key: "waiting", label: "Waiting", n: waiting.length }]
      : [{ key: "all", label: "All", n: people.length }]
        .concat(courses.map(c => ({ key: "class:" + c.id, label: c.title, n: people.filter(p => p.classes.includes(c.title)).length })));

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
      const shown = people.filter(matches);
      list.replaceChildren();
      if (!shown.length) {
        list.appendChild(el("div", { class: "card" }, [empty(
          people.length ? "Nobody matches this filter."
            : stake.monitor ? "No one has joined this place yet."
            : "No student is enrolled in your classes yet.", "users")]));
        return;
      }
      const card = el("div", { class: "card" });
      shown.forEach(p => card.appendChild(personRow(p, stake)));
      list.appendChild(card);
    };
    repaint();
  }

  function matches(p) {
    if (state.chip === "student" && p.role !== "student") return false;
    if (state.chip === "instructor" && p.role !== "instructor") return false;
    if (state.chip === "leader" && !LEADERS.includes(p.role)) return false;
    if (state.chip === "waiting" && !(p.requested || p.status === "pending_approval")) return false;
    if (state.chip.startsWith("class:") && !p.classes.includes(state.chip.slice(6))) return false;
    const q = state.q;
    if (q && !(String(p.name).toLowerCase().includes(q)
      || String(p.ward || "").toLowerCase().includes(q)
      || String(p.phone || "").toLowerCase().includes(q)
      || String(p.email || "").toLowerCase().includes(q))) return false;
    return true;
  }

  /* A teacher's own students. The class list is the teacher's own — the server answers
     with the classes they teach and nobody else's — and the register of each class is
     read in parallel, so the page waits for the slowest register rather than for all of
     them one after the other. */
  async function teacherStudents(stakeId) {
    const courses = await API.get(`/api/stakes/${stakeId}/courses?mine=true`);
    const rosters = await Promise.all(courses.map(c =>
      API.get(`/api/stakes/${stakeId}/courses/${c.id}/roster`).catch(() => [])));
    const byStudent = new Map();
    courses.forEach((c, i) => {
      (rosters[i] || []).forEach(r => {
        if (r.status !== "enrolled") return;
        let p = byStudent.get(r.student_id);
        if (!p) {
          p = { id: r.student_id, name: r.student_name, photo_url: r.photo_url,
                ward: r.ward, phone: r.phone, phone_dial: r.phone_dial,
                whatsapp_dial: r.whatsapp_dial, role: "student", role_label: "Student",
                status: "active", classes: [] };
          byStudent.set(r.student_id, p);
        }
        if (!p.classes.includes(c.title)) p.classes.push(c.title);
      });
    });
    return { courses, people: Array.from(byStudent.values()) };
  }

  function head(stake) {
    const sub = stake.monitor
      ? `Everyone in ${stake.name}`
      : "The students in your classes";
    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:var(--sp-12);flex-wrap:wrap" }, [
      el("div", {}, [
        el("h1", { class: "page-title" }, "Students"),
        el("div", { class: "page-sub" }, sub),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn secondary sm", onclick: () => mount(document.getElementById("app")) },
          [icon("refresh", 15), "Refresh"]),
      ]),
    ]);
  }

  function searchBar() {
    const input = el("input", { type: "search", placeholder: "Search name, ward or number",
      value: state.q, oninput: ev => { state.q = ev.target.value.toLowerCase(); repaint(); } });
    return el("div", { class: "filterbar" }, [
      el("div", { class: "f search" }, [el("label", {}, "Search"), icon("search", 15), input]),
    ]);
  }

  /* A person, then what is known about them, then the things that can be done with them
     — each on a line of its own. Held on one line, a name wraps to two words and a phone
     number breaks across three. */
  function personRow(p, stake) {
    const marks = [];
    if (p.role_label && p.role !== "student")
      marks.push(el("span", { class: "mini-pill mine" }, p.role_label));
    if (p.requested || p.status === "pending_approval")
      marks.push(el("span", { class: "mini-pill hot" }, "waiting to join"));
    else if (p.status && p.status !== "active")
      marks.push(el("span", { class: "mini-pill" }, p.status.replace(/_/g, " ")));
    /* A member written down without an account has no sign-in of their own — they are
     reached by their number, not by a message to a mailbox. */
    if (p.has_account === false)
      marks.push(el("span", { class: "mini-pill" }, "no sign-in of their own"));

    const acts = el("div", { class: "row-actions" });
    if (p.phone_dial) {
      acts.appendChild(el("a", { class: "btn ghost sm", href: `tel:${p.phone_dial}`,
        title: `Call ${p.name} on ${p.phone}`,
        "aria-label": `Call ${p.name}` }, [icon("phone", 15), p.phone]));
    }
    if (p.whatsapp_dial) {
      const hello = `Hello ${p.name}, this is ${stake.monitor ? "a leader" : "your teacher"} `
        + `from ${stake.name} at Gathering Place.`;
      acts.appendChild(el("a", { class: "btn ghost sm",
        href: `https://wa.me/${p.whatsapp_dial.replace("+", "")}?text=${encodeURIComponent(hello)}`,
        target: "_blank", rel: "noopener noreferrer",
        title: `Message ${p.name} on WhatsApp`,
        "aria-label": `Message ${p.name} on WhatsApp` },
        [icon("chat", 15), "WhatsApp"]));
    }
    if (p.id) {
      acts.appendChild(el("button", { class: "btn ghost icon-only", title: "Message " + p.name,
        onclick: () => MessagesPage.compose({ audience: "direct", recipient_id: p.id,
          recipient_name: p.name }) }, [icon("send", 15)]));
    }

    const facts = [];
    if (p.ward) facts.push(p.ward);
    if (p.email) facts.push(p.email);
    if (p.classes && p.classes.length) facts.push(p.classes.join(" · "));

    return el("div", { class: "list-item" }, [
      avatar({ full_name: p.name, photo_url: p.photo_url }),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, p.name),
        el("div", { class: "meta" }, facts.join(" · ") || "No ward on file"),
        marks.length ? el("div", { class: "class-card-marks", style: "margin-top:var(--sp-8)" },
                          marks) : null,
      ]),
      acts,
    ]);
  }

  return { mount };
})();
