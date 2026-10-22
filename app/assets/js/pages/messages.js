/* Messages: in-app inbox, announcements and direct notes.

   Who may be addressed is a server question, not a client guess. The composer asks
   /message-options, which is built from the same rules the send endpoint enforces, so
   every choice offered here is one that will be accepted: a president is never shown a
   broadcast he cannot send, a student is never shown a class he does not teach. */
const MessagesPage = (() => {
  const { el, icon, toast, shell, loading, empty, render, fmtDate, fmtTime,
          modal, roleLabel, avatar, draftSave, draftRead, draftDrop } = UI;

  let box = "inbox";
  let opts = null;        // this person's send options for the stake in view
  let unreadHere = 0;     // unread count inside the stake currently listed

  async function mount(target, which) {
    box = which === "sent" ? "sent" : "inbox";
    opts = null;                       // re-ask the server for the next compose
    const ctx = App.ctx();
    const stake = ctx.stake;
    if (!stake) {
      return render(target, shell("messages",
        empty("Messages live inside a stake — pick one to begin.", "home"), App.nav(), ctx));
    }
    const content = el("div");
    content.appendChild(head(stake, ctx.unread));
    content.appendChild(loading(3));
    render(target, shell("messages", content, App.nav(), ctx));

    let data;
    try {
      data = await API.get(`/api/stakes/${stake.id}/messages?box=${box}&limit=60`);
    } catch (e) {
      content.lastChild.replaceWith(el("div", { class: "card" }, [
        icon("alert", 22), el("div", { class: "muted" }, e.message)]));
      return;
    }
    unreadHere = data.unread || 0;
    content.lastChild.replaceWith(list(data, ctx));
  }

  function head(stake, unread) {
    const tabs = el("div", { class: "tabs", style: "margin-top:10px;max-width:260px" });
    [["inbox", "Inbox"], ["sent", "Sent"]].forEach(([key, label]) => {
      const b = el("button", {
        class: (box === key ? "active" : "") + (key === "inbox" ? " tab-inbox" : ""),
        onclick: () => { location.hash = key === "inbox" ? "#/messages" : "#/messages/sent"; },
      }, key === "inbox" && unread ? `${label} · ${unread}` : label);
      tabs.appendChild(b);
    });
    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, "Messages"),
        el("div", { class: "page-sub" }, `${stake.name} · ${stake.label || ""}`),
        tabs,
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn sm", onclick: () => compose({}) }, [icon("plus", 15), "New message"]),
      ]),
    ]);
  }

  function list(data, ctx) {
    const wrap = el("div");
    const rows = data.messages;
    wrap.appendChild(el("div", { class: "page-sub msg-count", style: "margin-bottom:10px" },
      `${rows.length} message(s)` +
      (box === "inbox" && unreadHere ? ` · ${unreadHere} unread` : "")));
    if (!rows.length) {
      wrap.appendChild(el("div", { class: "card" }, [empty(
        box === "inbox" ? "Nothing in the inbox yet." : "You have not sent a message yet.",
        "mail")]));
      return wrap;
    }
    const card = el("div", { class: "card msg-list" });
    rows.forEach(m => card.appendChild(row(m, ctx)));
    wrap.appendChild(card);
    return wrap;
  }

  /* Opening a message moves three numbers at once — the tally above the list, the
     Inbox tab and the badge beside every Messages link. They are refreshed in place
     so nothing on screen shows a count the server has already left behind. */
  function refreshCounts() {
    const rows = document.querySelectorAll(".msg-list .msg-row").length;
    const line = document.querySelector(".msg-count");
    if (line) line.textContent = `${rows} message(s)` +
      (box === "inbox" && unreadHere ? ` · ${unreadHere} unread` : "");
    Ctx.unread().then(u => {
      const tab = document.querySelector(".tab-inbox");
      if (tab) tab.textContent = u.total ? `Inbox · ${u.total}` : "Inbox";
      document.querySelectorAll(".nav-badge").forEach(b => {
        if (u.total > 0) b.textContent = String(u.total); else b.remove();
      });
    });
  }

  function row(m, ctx) {
    const when = m.created_at ? new Date(String(m.created_at)) : null;
    const unread = box === "inbox" && !m.read && !m.mine;
    const face = m.mine ? { full_name: ctx.user.full_name, photo_url: ctx.user.photo_url }
                        : { full_name: m.sender_name, photo_url: m.sender_photo_url };
    const node = el("div", { class: "msg-row" + (unread ? " unread" : "") }, [
      avatar(face),
      el("div", { class: "grow" }, [
        el("div", { class: "subject" }, (m.mine ? "→ " : "") + m.subject),
        el("div", { class: "snippet" }, String(m.body || "").slice(0, 120)),
        el("div", { class: "foot" }, [
          el("span", { style: "font-weight:600;color:var(--ink-2)" },
            m.mine ? "You" : m.sender_name),
          m.sender_role ? el("span", { class: "mini-pill" }, roleLabel(m.sender_role)) : null,
          el("span", { class: "mini-pill" }, m.audience_label),
          when ? el("span", {}, fmtDate(when.toISOString().slice(0, 10)) + " · "
                            + fmtTime(when.toISOString().slice(11, 16))) : null,
        ]),
      ]),
      el("span", { class: "dot" + (unread ? "" : " seen") }),
    ]);
    node.addEventListener("click", () => open(m, ctx, node));
    return node;
  }

  // ---------------- reading ----------------
  async function open(m, ctx, node) {
    const when = m.created_at ? new Date(String(m.created_at)) : null;
    const body = el("div", {}, [
      el("div", { class: "meta", style: "margin-bottom:10px" },
        `${m.mine ? "You" : m.sender_name}` +
        `${m.sender_role ? " · " + roleLabel(m.sender_role) : ""}` +
        `${when ? " · " + fmtDate(when.toISOString().slice(0, 10)) + " " + fmtTime(when.toISOString().slice(11, 16)) : ""}`),
      el("div", { class: "msg-body" }, m.body),
    ]);
    const actions = [];
    if (box === "inbox" && !m.mine) {
      actions.push({ label: "Reply", kind: "secondary",
        onClick: close => { close(); compose({ audience: "direct", recipient_id: m.sender_id,
          recipient_name: m.sender_name }); } });
    }
    if (m.mine || ctx.user.is_super_admin) {
      actions.push({ label: "Delete", kind: "danger", onClick: async close => {
        const ok = await UI.confirm("Remove this message?", { danger: true, okLabel: "Delete",
          title: "Delete message" });
        close();
        if (!ok) return;
        try { await API.del(`/api/messages/${m.id}`); toast("Message deleted");
          mount(document.getElementById("app")); }
        catch (e) { toast(e.message, "err"); }
      } });
    }
    actions.push({ label: "Close", kind: "", onClick: close => close() });

    // The reader opens first and the receipt is filed afterwards: a slow network must
    // never make a person wait to read a message that is already on their screen.
    const unread = box === "inbox" && !m.read && !m.mine;
    modal({ title: m.subject, sub: m.audience_label, body, actions });
    if (!unread) return;
    m.read = true;
    unreadHere = Math.max(0, unreadHere - 1);
    if (node) {
      node.classList.remove("unread");
      const d = node.querySelector(".dot");
      if (d) d.classList.add("seen");
    }
    refreshCounts();
    try {
      await API.post(`/api/messages/${m.id}/read`);
      Ctx.markRead(1);
      refreshCounts();
    } catch { /* the count reconciles on the next load */ }
  }

  // ---------------- composing ----------------
  function askOptions(stakeId, q) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const qs = params.toString();
    return API.get(`/api/stakes/${stakeId}/message-options` + (qs ? "?" + qs : ""));
  }

  async function compose(preset) {
    const ctx = App.ctx();
    const stake = ctx.stake;
    if (!stake) return toast("Pick a stake first.", "err");

    if (!opts) {
      try { opts = await askOptions(stake.id, ""); }
      catch (e) { return toast(e.message, "err"); }
    }
    const o = opts;
    if (!o.audiences.length) {
      return toast("There is no one here you can write to yet.", "err");
    }

    /* A reply has to reach the person who wrote the message. If the server's own
       options don't name them, opening a wider composer instead would let a note meant
       for one reader go out to the whole tenant — so stop and say why. */
    let presetPerson = null;
    if (preset.recipient_id) {
      const who = preset.recipient_name || "That person";
      if (!o.audiences.some(a => a.value === "direct")) {
        return toast(`You can’t send a note to one person in ${stake.name}.`, "err");
      }
      presetPerson = o.people.find(p => p.user_id === preset.recipient_id) || null;
      if (!presetPerson) {
        // the list is alphabetical and capped, so searching puts a later name in reach
        try {
          const res = await askOptions(stake.id, preset.recipient_name || "");
          presetPerson = res.people.find(p => p.user_id === preset.recipient_id) || null;
        } catch { /* treated as unreachable just below */ }
      }
      if (!presetPerson) return toast(`${who} isn’t someone you can write to here.`, "err");
    }

    const audience = el("select", {},
      o.audiences.map(a => el("option", { value: a.value }, a.label)));
    const roleSel = el("select", {}, o.roles.map(r => el("option", { value: r.value },
      `${r.label} · ${r.people} ${r.people === 1 ? "person" : "people"}`)));
    const courseSel = el("select", {},
      o.courses.map(c => el("option", { value: c.id }, c.title)));
    const to = el("div", { class: "to-line" });
    const toField = el("div", { class: "field" }, [el("label", {}, "To"), to]);

    // A name search re-asks the endpoint with ?q= — the server already knows which
    // people this caller may write to, so the results need no filtering here.
    let chosen = null, timer = null, callSeq = 0, people = o.people;
    const whoInput = el("input", { type: "search", placeholder: "Search by name" });
    const whoList = el("div", { class: "picker" });
    const whoBar = el("div", {}, [whoInput]);
    const whoChip = el("div");
    whoInput.addEventListener("input", () => {
      clearTimeout(timer);
      const term = whoInput.value;
      timer = setTimeout(() => search(term), 260);
    });

    function search(term) {
      const my = ++callSeq;
      whoList.innerHTML = "";
      whoList.appendChild(el("div", { class: "picker-empty" }, "Searching…"));
      askOptions(stake.id, (term || "").trim())
        .then(res => { if (my !== callSeq) return; people = res.people; paintPeople(); })
        .catch(() => { if (my !== callSeq) return; people = []; paintPeople(true); });
    }

    function paintPeople(error) {
      whoList.innerHTML = "";
      if (error) {
        whoList.appendChild(el("div", { class: "picker-empty" },
          "The people list isn’t available right now."));
        return;
      }
      if (!people.length) {
        whoList.appendChild(el("div", { class: "picker-empty" },
          "No one you can write to matches that name."));
        return;
      }
      people.forEach(p => whoList.appendChild(el("button", {
        class: "picker-item" + (chosen && chosen.user_id === p.user_id ? " on" : ""),
        type: "button", onclick: () => choosePerson(p),
      }, [
        avatar({ full_name: p.name, photo_url: p.photo_url }),
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", { class: "nm" }, p.name),
          el("div", { class: "sub" }, p.role_label),
        ]),
      ])));
    }

    function choosePerson(p) {
      chosen = p;
      whoBar.style.display = "none";
      whoList.style.display = "none";
      whoChip.innerHTML = "";
      whoChip.appendChild(el("div", { class: "picked" }, [
        avatar({ full_name: p.name, photo_url: p.photo_url }),
        el("div", { class: "grow" }, `${p.name} · ${p.role_label}`),
        el("button", { class: "linkbtn", type: "button", onclick: () => {
          chosen = null;
          whoBar.style.display = "";
          whoList.style.display = "";
          whoChip.innerHTML = "";
          paintPeople();
          showAudience("direct");
        } }, "Change"),
      ]));
      showAudience("direct");
    }

    const subject = el("input", { placeholder: "Subject", maxlength: "140" });
    const text = el("textarea", { placeholder: "Your message…", rows: "5" });

    /* A leader writing an announcement is interrupted by the same things everybody else is —
       a class starting, a phone that goes to the mail app, a page that came back blank with
       forty seconds of writing in it. Only the words are kept here, and only for the gathering
       place they were written in. Who a message goes to is chosen afresh every single time,
       because a quietly restored recipient is how a note meant for one reader reaches a whole
       tenant. Nothing is restored without saying so on the screen it appears on. */
    const keptMsg = draftRead("message");
    const fromDraft = !!(keptMsg && keptMsg.stake_id === stake.id
                         && (keptMsg.subject || keptMsg.body));
    if (fromDraft) { subject.value = keptMsg.subject || ""; text.value = keptMsg.body || ""; }
    const saveMsg = () => draftSave("message", { stake_id: stake.id,
                                                 subject: subject.value, body: text.value });
    subject.addEventListener("input", saveMsg);
    text.addEventListener("input", saveMsg);

    let msgNote = null;
    function discardDraft() {
      draftDrop("message");
      subject.value = ""; text.value = "";
      if (msgNote) msgNote.remove();
      subject.focus();
      toast("The message is empty again");
    }
    if (fromDraft) {
      msgNote = el("div", { class: "keep-note" }, [
        "This is the message you had not finished. It was kept on this device, for this "
        + "gathering place, and nowhere else. ",
        el("button", { class: "linkbtn", type: "button", onclick: discardDraft }, "Discard it"),
      ]);
    }

    const panels = {
      role: el("div", { class: "field" }, [el("label", {}, "Group"), roleSel]),
      course: el("div", { class: "field" }, [el("label", {}, "Class"), courseSel]),
      direct: el("div", { class: "field" }, [el("label", {}, "Person"), whoBar, whoList, whoChip]),
    };
    function showAudience(v) {
      Object.entries(panels).forEach(([k, node]) => { node.style.display = k === v ? "" : "none"; });
      // a chosen person is named by the chip below, and a direct note needs no "To" line
      toField.style.display = v === "direct" ? "none" : "";
      to.textContent = v === "stake" ? `Everyone in ${stake.name}`
        : v === "role" ? (roleSel.selectedIndex >= 0 ? roleSel.selectedOptions[0].text : "…")
        : (courseSel.selectedIndex >= 0 ? courseSel.selectedOptions[0].text : "…");
    }
    audience.addEventListener("change", () => showAudience(audience.value));
    roleSel.addEventListener("change", () => showAudience("role"));
    courseSel.addEventListener("change", () => showAudience("course"));

    /* A reply opens on the narrowest list it can use — defaulting a note to one person
       onto "everyone" would send an announcement by accident. A fresh message opens on
       the server's own headline choice, which is the whole tenant for a president. */
    const has = v => o.audiences.some(a => a.value === v);
    const want = has(preset.audience) ? preset.audience
      : (presetPerson ? "direct" : o.audiences[0].value);
    audience.value = want;
    if (preset.course_id) courseSel.value = String(preset.course_id);
    showAudience(want);
    // a reply arrives with its recipient already named; anything else leaves the picker
    // open so the first keystroke of a search has somewhere to go
    if (presetPerson && want === "direct") choosePerson(presetPerson);
    else paintPeople();

    const body = el("div", {}, [
      el("div", { class: "field" }, [el("label", {}, "Send to"), audience]),
      toField,
      panels.role, panels.course, panels.direct,
      el("div", { class: "field" }, [el("label", {}, "Subject"), subject]),
      el("div", { class: "field" }, [el("label", {}, "Message"), text]),
      msgNote,
    ]);

    const m = modal({
      title: "New message",
      sub: `${stake.name} · as ${roleLabel(o.viewer_role)}`,
      body,
      actions: [
        { label: "Cancel", kind: "secondary", onClick: close => close() },
        { label: "Send", kind: "", onClick: async close => {
            const payload = { audience: audience.value,
              subject: subject.value, body: text.value };
            if (payload.audience === "role") payload.target_role = roleSel.value;
            if (payload.audience === "course") payload.course_id = +courseSel.value;
            if (payload.audience === "direct") {
              if (!chosen) return toast("Pick who should receive it.", "err");
              payload.recipient_id = chosen.user_id;
            }
            if (!payload.subject.trim() || !payload.body.trim())
              return toast("A subject and a message are both required.", "err");
            try {
              await API.post(`/api/stakes/${stake.id}/messages`, payload);
              draftDrop("message");      // it is sent; there is nothing left to keep
              close(); toast("Message sent");
              if (box === "sent") mount(document.getElementById("app"));
            } catch (e) { toast(e.message, "err"); }
          } },
      ],
    });
    // a direct note opened from a person's row should already name them
    if (preset.recipient_name) subject.placeholder = `Note to ${preset.recipient_name}`;
    if (preset.course_title) subject.placeholder = `Note to ${preset.course_title}`;
    setTimeout(() => subject.focus && subject.focus(), 60);
    return m;
  }

  function composeDirect(person) {
    compose({ audience: "direct", recipient_id: person.user_id,
              recipient_name: person.name || person.full_name });
  }

  return { mount, compose, composeDirect };
})();
