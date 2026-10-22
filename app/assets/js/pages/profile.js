/* Profile: the details a person owns.

   Two things happen here that the rest of the portal depends on. A picture is uploaded
   and stored by the portal — not pasted in as a link to someone else's server — because
   the roster and the ID badge print from it. And a missionary couple is one account:
   both names, one picture, one login.

   Age is not collected. A Young Single Adult roster needs a name, a ward, a
   gender and someone to call in an emergency; a birth year is a number to
   explain and nothing in the portal uses it. */
const ProfilePage = (() => {
  const { el, toast, icon, statusPill, avatar, modal, loading, fmtDate, announce } = UI;

  async function mount(target) {
    const user = API.getUser();
    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("h2", { class: "page-title" }, "My profile"),
      el("div", { class: "page-sub" }, "The details used on rosters, badges and messages"),
    ]));

    /* ---------- picture ----------
       The box a person chooses a picture in is the same component the roster, the
       message list and the account chip draw, at its largest size — so the crop that is
       previewed is the crop that is kept, and a tall, wide or enormous photo is fitted by
       the box rather than fitting itself to the page. The file is stored exactly as it was
       uploaded; only how it is shown is cropped. */
    const KINDS = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1 };
    const MAX_BYTES = 4 * 1024 * 1024;
    const faceSlot = el("div");
    function drawFace(photo_url) {
      faceSlot.replaceChildren(avatar(Object.assign({}, user, { photo_url }), "lg"));
    }
    drawFace(user.photo_url);

    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif",
                               style: "display:none" });
    const pick = el("button", { class: "btn sm", onclick: () => file.click() },
      [icon("plus", 15), user.photo_url ? "Replace picture" : "Upload a picture"]);
    const remove = el("button", {
      class: "btn ghost sm",
      style: user.photo_url ? "" : "display:none",
      onclick: removePhoto,
    }, [icon("trash", 15), "Remove"]);
    const note = el("div", { class: "photo-note" },
      "PNG, JPG, WEBP or GIF, up to 4 MB. Any shape is welcome — the file is kept exactly " +
      "as it is, and the circle and the badge both hold on to the top of the picture, where " +
      "a face is. A head-and-shoulders photo prints best.");

    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";   // let the same file be picked again after a cancel
      if (!f) return;
      const trouble = checkPicture(f);
      if (trouble) return toast(trouble, "err");
      // The chosen file is shown before the server has seen it, in the very box it will
      // live in, so a person can judge the crop and pick again instead of discovering it
      // later on a roster.
      const preview = URL.createObjectURL(f);
      drawFace(preview);
      uploadPhoto(f, preview);
    });

    /* The browser knows only what the file says it is, and the server checks the bytes
       themselves. This is the friendly version of that same rule, so an obvious mistake is
       named in words instead of arriving as a rejected upload. */
    function checkPicture(f) {
      const ext = String(f.name || "").split(".").pop().toLowerCase();
      const mime = String(f.type || "").split("/").pop().toLowerCase();
      if (!KINDS[ext] && !KINDS[mime]) {
        return "That is not a picture this portal can take. Choose a PNG, JPG, WEBP or GIF.";
      }
      if (!f.size) return "That file arrived empty. Pick the picture again.";
      if (f.size > MAX_BYTES) {
        return `That picture is ${(f.size / 1048576).toFixed(1)} MB and the limit is 4 MB. ` +
               "Choose a smaller one — most photo apps can save a much smaller copy.";
      }
      return null;
    }

    async function uploadPhoto(f, preview) {
      pick.disabled = true;
      const form = new FormData();
      form.append("file", f);
      try {
        const r = await API.post("/api/auth/me/photo", form);
        // The stored file is named after its own contents, so this address is a different
        // one from the picture it replaced and the browser cannot serve the old face back.
        API.setUser(Object.assign({}, API.getUser(), { photo_url: r.url }));
        toast("Picture saved — it will show on your badge and roster");
        mount(target);           // the whole page, so the chip and sidebar change too
      } catch (e) {
        drawFace(API.getUser().photo_url);   // back to the picture that is really filed
        toast(e.message, "err");
        pick.disabled = false;
      } finally {
        URL.revokeObjectURL(preview);
      }
    }

    async function removePhoto() {
      try {
        const u = await API.del("/api/auth/me/photo");
        API.setUser(u);
        toast("Picture removed");
        mount(target);
      } catch (e) { toast(e.message, "err"); }
    }

    const photoCard = el("div", { class: "card" }, [
      el("div", { class: "sec-title", style: "margin-top:0" }, "Profile picture"),
      el("div", { class: "photo-pick", style: "margin-top:var(--sp-12)" }, [
        faceSlot,
        el("div", { class: "photo-side" }, [
          el("div", { class: "muted", style: "font-size:var(--t-ui)" },
            user.display_name || user.full_name),
          el("div", { class: "btns" }, [pick, remove, file]),
          note,
        ]),
      ]),
    ]);
    content.appendChild(photoCard);

    /* ---------- details ---------- */
    const f = (k, label, type = "text", ph = "") =>
      el("div", { class: "field" }, [el("label", {}, label),
        el("input", { id: "pf-" + k, type, placeholder: ph, value: user[k] ?? "" })]);

    const isCouple = (user.memberships || []).some(m => m.role === "service_missionary");
    const companion = f("companion_name", "Companion name", "text", "e.g. Sister Hansen");
    if (!isCouple && !user.companion_name) companion.style.display = "none";

    const genderSel = el("select", { id: "pf-gender" }, [
      el("option", { value: "" }, "—"),
      el("option", { value: "M", selected: user.gender === "M" ? "selected" : null }, "Male"),
      el("option", { value: "F", selected: user.gender === "F" ? "selected" : null }, "Female"),
    ]);

    /* Asked once at sign-up and changeable here. The third choice is a real answer, not a
       blank: a person who would rather not say leaves the record empty, and an empty
       record is never read as "no" when a roster is drawn up. */
    const memberSel = el("select", { id: "pf-member" }, [
      el("option", { value: "yes", selected: user.church_member === true ? "selected" : null }, "Yes"),
      el("option", { value: "no", selected: user.church_member === false ? "selected" : null }, "No"),
      el("option", { value: "", selected: user.church_member == null ? "selected" : null },
        "I'd rather not say"),
    ]);

    /* All three numbers use the field the sign-up form uses: one box, the whole number,
       the country prefix nowhere on screen. What goes back is a shape the server's
       validator reads, so a profile edit cannot produce a number the SMS gateway would
       have to guess at. */
    const phone = UI.phoneField({ label: "Phone" });
    const whatsapp = UI.phoneField({ label: "WhatsApp",
      note: "Only if you use WhatsApp for class messages. Same number is fine." });
    const emergPhone = UI.phoneField({ label: "Phone" });
    phone.set(user.phone);
    whatsapp.set(user.whatsapp);
    emergPhone.set(user.emergency_contact_phone);

    /* A ward is a line on the stake's own list, so this box shows that list rather than a
       blank to retype a name into — and it asks the server which stake's list to show,
       instead of taking the first membership on the page. */
    const ward = UI.wardField({ label: "Ward / branch" });
    ward.set(user.ward, user.ward_id);
    ward.load(user.ward_stake_id);

    const card = el("div", { class: "card" }, [
      el("div", { class: "row" }, [f("full_name", "Full name"), companion]),
      el("div", { class: "hint", style: "margin:-4px 0 var(--sp-12)" },
        "A service missionary couple shares one account: both names appear together " +
        "on rosters, badges and certificates."),
      el("div", { class: "row" }, [phone.node, whatsapp.node]),
      el("div", { class: "row" }, [ward.node,
        el("div", { class: "field" }, [el("label", {}, "Gender"), genderSel])]),
      el("div", { class: "field" }, [
        el("label", {}, "Member of the Church"), memberSel,
        el("div", { class: "hint" },
          "Asked so a class can be planned for members and investigators alike. " +
          "“I'd rather not say” is an answer of its own — it is never read as a no."),
      ]),
      el("hr", { class: "hr" }),
      el("div", { class: "sec-title", style: "margin-top:0" }, "Emergency contact"),
      el("div", { class: "row" }, [f("emergency_contact_name", "Name"), emergPhone.node]),
      el("button", { class: "btn", onclick: save }, [icon("check", 17), "Save changes"]),
    ]);
    content.appendChild(card);

    async function save() {
      const g = id => document.getElementById(id).value.trim();
      const payload = {
        full_name: g("pf-full_name"),
        companion_name: g("pf-companion_name") || null,
        phone: phone.get() || null, whatsapp: whatsapp.get() || null,
        gender: g("pf-gender") || null,
        church_member: memberSel.value === "yes" ? true
                     : memberSel.value === "no" ? false : null,
        emergency_contact_name: g("pf-emergency_contact_name"),
        emergency_contact_phone: emergPhone.get() || null,
      };
      if (!payload.full_name) return toast("A name is needed for the roster", "err");
      // "Add a ward that is not listed" with an empty box names nothing; saving that would
      // read as "no ward", which is a different answer from the one the box was for.
      if (ward.incomplete())
        return toast("Write your ward's name, or choose “None recorded”", "err");
      Object.assign(payload, ward.payload());
      // An empty gender box is what a person who opened the portal before the question
      // existed is left with; saving their phone number must not answer it for them.
      if (!payload.gender) delete payload.gender;
      try {
        const u = await API.patch("/api/auth/me", payload);
        API.setUser(u);
        toast("Profile saved");
        mount(target);
      } catch (e) { toast(e.message, "err"); }
    }

    /* ---------- where this account belongs ---------- */
    const mcard = el("div", { class: "card" }, [el("h3", {}, "My stake and district memberships")]);
    (user.memberships || []).forEach(m => mcard.appendChild(el("div", { class: "list-item" }, [
      avatar(user),
      el("div", { class: "grow" }, [
        el("div", { class: "title" }, m.stake_name || ("Tenant #" + m.stake_id)),
        el("div", { class: "meta" }, UI.roleLabel(m.role) +
          (m.status && m.status !== "active" ? " · " + m.status.replace("_", " ") : "")),
      ]),
      el("span", { html: statusPill(m.status || m.stake_status || "active") }),
    ])));
    if (!(user.memberships || []).length) {
      mcard.appendChild(UI.empty("No stake yet — ask the portal admin to confirm your request", "users"));
    }
    content.appendChild(mcard);

    /* ---------- password ---------- */
    const oldpw = el("input", { id: "pw-old", type: "password",
                                autocomplete: "current-password" });
    const newpw = el("input", { id: "pw-new", type: "password", autocomplete: "new-password" });
    const againpw = el("input", { id: "pw-again", type: "password", autocomplete: "new-password" });
    const pw = el("div", { class: "card" }, [
      el("h3", {}, "Password"),
      el("div", { class: "field" }, [el("label", { for: "pw-old" }, "Current password"),
                                     UI.passWrap(oldpw)]),
      el("div", { class: "row" }, [
        el("div", { class: "field" }, [el("label", { for: "pw-new" }, "New password"),
                                       UI.passWrap(newpw)]),
        el("div", { class: "field" }, [el("label", { for: "pw-again" }, "Confirm new password"),
                                       UI.passWrap(againpw)]),
      ]),
      el("button", { class: "btn secondary", onclick: changePassword },
        [icon("lock", 16), "Change password"]),
    ]);
    content.appendChild(pw);

    async function changePassword() {
      if (newpw.value.length < 8) return toast("A new password needs at least 8 characters", "err");
      if (!UI.passAgree(newpw, againpw, "new passwords")) return;
      try {
        await API.post("/api/auth/change-password",
                       { current_password: oldpw.value, new_password: newpw.value });
        oldpw.value = ""; newpw.value = ""; againpw.value = "";
        toast("Password changed");
      } catch (e) { toast(e.message, "err"); }
    }

    /* ---------- my data and my rights ---------- */
    content.appendChild(rightsCard());

    UI.render(target, UI.shell("profile", content, App.navFor(API.getUser())));
  }

  /* ---------- my data and my rights ----------
     The privacy policy makes five promises and sends the reader to this screen for each
     of them, so the rows below are that list, in that order, with the same words. One
     right is a link and three are buttons and none of them is a form somebody has to
     answer by hand: the record is read from the API, the copy leaves from this browser,
     and only the deletion needs the administrator — because an account that could delete
     itself can be deleted by whoever gets hold of the laptop. */
  function rightsCard() {
    const body = el("div", {}, loading(2));
    const card = el("div", { class: "card" }, [
      el("div", { class: "sec-title", style: "margin-top:var(--sp-22)" }, "My data and my rights"),
      body,
    ]);
    API.get("/api/account/data").then(fill, e => {
      body.innerHTML = "";
      body.appendChild(el("div", { class: "muted", style: "font-size:var(--t-ui)" },
        "Your record could not be read just now — " + e.message));
    });
    let lastNote = null;

    function fill(d) {
      body.innerHTML = "";
      const p = d.profile;
      if (lastNote) {
        body.appendChild(el("div", { class: "rights-note" }, [icon("mail", 16), lastNote]));
      }
      body.appendChild(status(p.email_verified_at
        ? "Address confirmed on " + fmtDate(p.email_verified_at)
        : "This address has not been confirmed yet", !p.email_verified_at));
      body.appendChild(status(d.consent_required
        ? "Version " + (d.policy_version || "—") + " of the policy is not accepted yet"
        : "You accepted version " + (p.consent_version || d.policy_version) +
          (p.consent_at ? " on " + fmtDate(p.consent_at) : ""), d.consent_required));

      const open = (d.requests || []).find(r => r.kind === "deletion" && r.status === "open");

      body.appendChild(row("idcard", "See your record",
        "Every value this portal holds about the account, with the counts of the rows " +
        "attached to it.",
        btn("See the record", "search", () => recordModal(d))));

      body.appendChild(row("download", "Take a copy of it",
        "One file with the same contents, your numbers in the form they are stored in, and " +
        "the dates. It downloads straight to this device and needs nobody's approval.",
        btn("Download my data", "download", () => takeCopy())));

      body.appendChild(row("edit", "Correct it",
        "Your own details are the fields above. An attendance mark or a class list belongs " +
        "to the gathering place, so tell your instructor or leader — or write to the " +
        "administrator.",
        mail("Write about a record", d.support_email, "A correction to my record")));

      if (open) {
        body.appendChild(row("clock", "Removal is already asked for",
          "Sent on " + fmtDate(open.asked_at) + " and with the administrator" +
          (open.note ? " — your note: \u201c" + open.note + "\u201d" : "") +
          ". You will hear from them when it is carried out.",
          btn("Withdraw the request", "x", withdraw)));
      } else if ((API.getUser() || {}).is_super_admin) {
        body.appendChild(row("shield", "Ask for it to be deleted",
          "This account is the portal administrator, so it cannot be emptied while it " +
          "holds the portal. Appoint a second administrator first, then ask.", null));
      } else {
        body.appendChild(row("trash", "Ask for it to be deleted",
          "Your name, address, numbers, photograph, letters and codes go. The attendance " +
          "row stays as an anonymous mark so a term's numbers still add up. The " +
          "administrator carries it out and writes to you when it is done.",
          btn("Request deletion", "trash", () => requestDeletion(d), "danger")));
      }

      body.appendChild(row("x", "Withdraw your consent",
        "There is nothing to switch off — no cookies, no advertising, no measurement. " +
        "Signing out and asking for the account to be closed is the whole of it.",
        mail("Ask to close the account", d.support_email, "Closing my account")));

      body.appendChild(el("div", { class: "doc-nav", style: "margin:var(--sp-16) 0 0" },
        ["privacy", "terms", "cookies"].map(k =>
          el("a", { class: "chip", href: "#/" + k }, Legal.TITLES[k]))));
    }

    function status(text, waiting) {
      return el("div", { class: "status-line" }, [
        el("span", { class: "dot" + (waiting ? " wait" : "") }), text]);
    }
    function row(ic, t, d, action) {
      return el("div", { class: "rights-row" }, [
        el("span", { class: "ic" + (action && action.classList.contains("danger") ? " red" : "") },
          icon(ic, 17)),
        el("div", { class: "grow" }, [el("div", { class: "t" }, t), el("div", { class: "d" }, d),
                                      action]),
      ]);
    }
    function btn(label, ic, fn, kind) {
      return el("button", { class: "btn sm " + (kind || "secondary"), type: "button",
                            onclick: fn }, [icon(ic, 15), label]);
    }
    function mail(label, to, subject) {
      if (!to) return null;
      return el("a", { class: "btn sm secondary",
                       href: "mailto:" + to + "?subject=" + encodeURIComponent(subject) },
        [icon("mail", 15), label]);
    }

    async function takeCopy() {
      try {
        await API.download("/api/account/data/export", "my-gathering-place-record.json");
        lastNote = "The copy went to this device. The portal keeps a dated note that you " +
                   "took one, and nothing else about it.";
        toast("Copy downloaded");
        announce("Your record was downloaded to this device.");
        API.get("/api/account/data").then(fill);
      } catch (e) { toast(e.message, "err"); }
    }

    async function withdraw() {
      try {
        await API.post("/api/account/deletion-request/cancel", {});
        lastNote = "The request is withdrawn. Nothing was removed, and nothing was changed " +
                   "in the class records.";
        toast("Request withdrawn");
        API.get("/api/account/data").then(fill);
      } catch (e) { toast(e.message, "err"); }
    }

    function requestDeletion(d) {
      const who = d.profile;
      modal({
        title: "Ask for your record to be removed",
        sub: "This sends the request to the portal administrator. Nothing is removed yet.",
        wide: true,
        body: el("div", {}, [
          el("div", { class: "rights-note" }, [icon("alert", 16),
            "Going: " + who.full_name + ", " + who.email + ", your numbers, your photograph, " +
            "the letters sent to you and your sign-in codes."]),
          el("div", { class: "hint", style: "margin:0 0 var(--sp-12)" },
            "Staying: the attendance marks and enrolment rows, with your name taken out of " +
            "them. They are the ministry record of the gathering place, and the leaders who " +
            "keep it need the totals to still add up."),
          el("div", { class: "field" }, [
            el("label", {}, "A note for the administrator, if you want to add one"),
            el("textarea", { id: "dl-note", rows: "3",
                             placeholder: "e.g. I have moved to another stake." })]),
        ]),
        actions: [
          { label: "Cancel", kind: "secondary", onClick: c => c() },
          { label: "Send the request", kind: "danger", onClick: c => send(c) },
        ],
      });

      async function send(close) {
        const note = (document.getElementById("dl-note") || {}).value || "";
        try {
          const r = await API.post("/api/account/deletion-request",
                                   { note: note.trim() || null });
          close();
          lastNote = r.message + (r.mail_expected === false
            ? " This device cannot send letters yet, so the administrator will tell you in " +
              "person instead." : "");
          toast(r.already ? "That request is already with the administrator" : "Request sent");
          announce("Your deletion request has been sent to the portal administrator.");
          API.get("/api/account/data").then(fill);
        } catch (e) { toast(e.message, "err"); }
      }
    }

    function recordModal(d) {
      const p = d.profile;
      const gone = v => (v === null || v === undefined || v === "" ? null : v);
      const lines = [
        ["Name", gone(p.full_name)],
        ["Companion", gone((API.getUser() || {}).companion_name)],
        ["Email", gone(p.email)],
        ["Phone", gone(p.phone)],
        ["WhatsApp", gone(p.whatsapp)],
        ["Gender", p.gender === "M" ? "Male" : p.gender === "F" ? "Female" : gone(p.gender)],
        ["Member of the Church", p.church_member === true ? "Yes"
                                : p.church_member === false ? "No" : "Not answered"],
        ["Ward or branch", gone(p.ward)],
        ["Emergency contact", gone([p.emergency_contact_name, p.emergency_contact_phone]
                                    .filter(Boolean).join("  ·  "))],
        ["Photograph", p.photo ? "On file with the portal" : null],
        ["Account", gone(String(p.account_status || "").replace(/_/g, " "))],
        ["Opened", gone(fmtDate(p.created_at))],
        ["Policy accepted", p.consent_version
          ? (p.consent_version + " on " + fmtDate(p.consent_at)) : null],
      ];
      const tally = [
        ["Gathering places you belong to", d.counts.memberships],
        ["Classes you are enrolled in", d.counts.enrollments],
        ["Attendance marks", d.counts.attendance],
        ["Courses you teach", (d.taught || []).length],
        ["Messages you have sent", d.counts.messages],
        ["Messages you opened", d.counts.read_receipts],
        ["Letters sent to you", d.counts.letters],
        ["Actions recorded", d.counts.activity],
      ];
      const table = rows => el("table", { class: "kv" }, rows.map(([k, v]) => el("tr", {}, [
        el("th", {}, k),
        v === null || v === undefined || v === ""
          ? el("td", { class: "none" }, "nothing held")
          : el("td", {}, typeof v === "number" ? v : String(v)),
      ])));
      modal({
        title: "What this portal holds about you",
        sub: "Read from the live record — the same file the download gives you.",
        wide: true,
        body: el("div", {}, [
          table(lines),
          el("div", { class: "sec-title", style: "margin-top:var(--sp-18)" }, "Rows attached to the account"),
          table(tally),
          el("div", { class: "sec-title", style: "margin-top:var(--sp-18)" }, "Deliberately not collected"),
          el("ul", { class: "not-held" }, (d.not_collected || []).map(x => el("li", {}, x))),
          el("div", { class: "hint", style: "margin-top:var(--sp-12)" },
            "Details of each row — which class, which date, who marked it — are in the " +
            "download, and on the class pages of this portal."),
        ]),
        actions: [{ label: "Close", kind: "secondary", onClick: c => c() }],
      });
    }

    return card;
  }

  return { mount };
})();
