/* The marking sheet, on its own.

   Two screens open it: the class a teacher runs, and the Attendance tab that lists
   every sitting still waiting for a mark. The sheet belongs to neither — it is one piece
   of work with one set of rules, and a second copy of it would drift from the first the
   moment one of them was changed.

   Attendance used to be marked with a dropdown beside each name, and every part of that
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
const MarkSheet = (() => {
  const { el, toast, icon, modal, fmtDate, hoursText } = UI;

  const STATUSES = ["present", "late", "excused", "absent"];
  const ATT_WORD = { present: "Present", late: "Late", excused: "Excused", absent: "Absent" };
  /* The four marks wear the colours the rest of the portal already gives them — the sitting
     list, the badge scanner and the printed record all show a green present and a red
     absent — so anyone who has read one of the three can read all three. Each word is short
     on the button and plainer still on hover, because a leader marking thirty names in a
     borrowed room should not have to stop and think about what "excused" covers. */
  const MARK_TONE = { present: "ok", late: "warn", excused: "info", absent: "danger" };
  const MARK_GLOSS = { present: "Was in class", late: "Came after the class started",
                       excused: "Away with a reason given", absent: "Not there, no reason given" };

  /* stakeId, course, session and roster come from the screen that opens the sheet.
     onSaved is called once the marks are kept, so that screen can redraw. */
  function open({ stakeId, course, session, roster, onSaved }) {
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
            if (onSaved) onSaved();
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

  return { open, ATT_WORD };
})();
