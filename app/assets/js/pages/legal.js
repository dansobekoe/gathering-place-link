/* Legal: the three documents, and the one wording the rest of the portal quotes.

   The text is not written here. /api/legal holds it, because the same sentences have to
   appear on the page a person reads, in the dialog that opens from a sign-up tick, and
   behind the version string that goes on their consent receipt. A copy kept in the
   JavaScript would be a second policy nobody updates — and consent to wording nobody can
   read is not consent.

   Three ways in, one renderer:
     LegalPage.mount(target, "privacy")   its own page, signed in or not, no shell
     Legal.openModal(key)                 a dialog, over the sign-up form or the gate
     Legal.consentRows()                  the two ticks, links wired to the dialog
*/
const Legal = (() => {
  const { el, icon, modal, toast, announce } = UI;

  const TITLES = { privacy: "Privacy Policy", terms: "Terms of Use", cookies: "Cookie Notice" };
  let cached = null;
  let inflight = null;
  let seq = 0;              // checkbox ids, so two forms can be on screen at once

  function load() {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
      inflight = API.get("/api/legal")
        .then(d => { cached = d; inflight = null; return d; })
        .catch(e => { inflight = null; throw e; });
    }
    return inflight;
  }
  function version() { return cached ? cached.version : null; }
  function business() { return (cached && cached.business) || {}; }
  function find(key) {
    return ((cached && cached.documents) || []).find(d => d.key === key) || null;
  }

  // ---- one document, as nodes ----
  function sectionNode(s) {
    const kids = [el("h3", {}, s.h)];
    (s.p || []).forEach(p => kids.push(el("p", {}, p)));
    if (s.bullets && s.bullets.length) {
      kids.push(el("ul", {}, s.bullets.map(b => el("li", {}, b))));
    }
    if (s.table) {
      kids.push(el("table", {}, [
        el("thead", {}, [el("tr", {}, s.table.columns.map(c => el("th", {}, c)))]),
        el("tbody", {}, s.table.rows.map(r => el("tr", {}, r.map(c => el("td", {}, c))))),
      ]));
    }
    return el("section", { class: "doc-sec" }, kids);
  }
  function metaRow() {
    const b = business();
    const item = (k, v) => (v ? el("div", {}, [el("b", {}, k), String(v)]) : null);
    const rows = [item("Version in force", b.version),
                  item("Built and run by", b.responsible_person),
                  item("Questions go to", b.contact_email)];
    return el("div", { class: "doc-meta" }, rows.filter(Boolean));
  }
  /* The two sentences of small print: whose site this is not, and who owns the writing of
     it. They belong wherever the portal speaks in its own name — the sign-in card, the foot
     of a document, the side of the shell, the fixed public page, and the bottom of every
     sheet that is printed — so they are built once, here, from /api/legal.

     The pair below is what that endpoint says today. It is shown only in the moment before
     the endpoint has answered, and smallPrint() swaps in the served wording the moment it
     arrives; tests.test_smoke fails if the two ever disagree, which is what stops a stale
     sentence being printed on a roster. */
  const SMALL_PRINT = {
    disclaimer: "YSA Gathering Places is not an official website of The Church of Jesus Christ of Latter-day Saints.",
    copyright: "© 2026 Gathering Place. All rights reserved.",
  };

  /* One node holding both lines, so a call site appends one child and the styling stays in
     one rule — the sidebar and a policy page size it differently in CSS, not here. */
  function smallPrint() {
    const box = el("div", { class: "small-print" }, [
      el("div", {}, SMALL_PRINT.disclaimer),
      el("div", {}, SMALL_PRINT.copyright),
    ]);
    load()
      .then(() => {
        const b = business();
        if (b.disclaimer) box.children[0].textContent = b.disclaimer;
        if (b.copyright) box.children[1].textContent = b.copyright;
      })
      .catch(() => { /* the fallback is the same sentence; nothing to say about it */ });
    return box;
  }

  function footNode() {
    const b = business();
    return el("div", { class: "doc-foot" }, [
      [b.organisation, b.unit].filter(Boolean).join(" — "),
      el("div", { style: "margin-top:4px" },
        `Letters about the portal come from ${b.letters_sent_from || b.contact_email}.` +
        (b.reply_to ? ` Write back to ${b.reply_to} and it reaches me.` : "")),
      smallPrint(),
    ]);
  }

  // ---- the dialog ----
  /* Opened from a link inside a label, so it can be asked for while another dialog is
     already up — the consent gate holds a link to the policy, and someone reading it
     must still be able to reach the terms. modal() stacks and returns focus to whatever
     opened it, so reading one document from inside another costs nothing. */
  function openModal(key) {
    const d = find(key);
    if (!d) {
      // Asked for before the wording has arrived: fetch it, then open it.
      load().then(() => openModal(key)).catch(() => toast("The policy could not be loaded", "err"));
      return;
    }
    let box;
    box = modal({
      title: d.title,
      sub: `Version ${version() || ""} — nothing is recorded by reading it`,
      wide: true,
      body: el("div", {}, [
        el("p", { class: "muted", style: "font-size:14px;line-height:1.7;margin-bottom:6px" }, d.intro),
        ...d.sections.map(sectionNode),
        footNode(),
        el("div", { style: "margin-top:16px" }, [
          el("button", { class: "btn secondary", type: "button", onclick: () => box.close() },
            [icon("x", 16), "Close"]),
        ]),
      ]),
    });
    announce(d.title + " opened");
  }

  // ---- the two ticks ----
  /* Consent and age, as one block, because the portal refuses a registration that has
     only one of them. Each row is a real label over a real checkbox, so tapping the words
     ticks the box — the one dark pattern worth removing from a form like this is having
     to aim at a small square. */
  function consentRows(opts = {}) {
    const link = key => el("a", {
      href: "#/" + key,
      onclick: e => { e.preventDefault(); openModal(key); },
    }, TITLES[key]);

    const n = ++seq;
    const terms = el("input", { type: "checkbox", id: "ck-terms-" + n });
    const age = el("input", { type: "checkbox", id: "ck-age-" + n });
    const termsRow = el("div", { class: "consent-row" }, [terms,
      el("label", { for: terms.id }, [
        "I have read and accept the ", link("privacy"), " and ", link("terms"), ".",
        el("span", { class: "fine" },
          "What is kept is the date and this version number — not a copy of the words, " +
          "and nothing about how you read them."),
      ])]);
    const ageRow = el("div", { class: "consent-row" }, [age,
      el("label", { for: age.id }, [
        "I am 18 or older. If I am 13–17, my stake or district president knows that this " +
        "account exists.",
        el("span", { class: "fine" },
          "This is a Young Single Adult programme. Your age is this tick and no date of " +
          "birth — the number is nothing a class record needs."),
      ])]);

    const node = el("div", { class: "consent" }, opts.compact ? [termsRow, ageRow] : [
      el("div", { class: "sec-title", style: "margin-top:0" }, "Two words before anything is stored"),
      termsRow, ageRow,
    ]);
    load().catch(() => { /* the links still say what they are; the dialog will retry */ });

    return {
      node, terms, age,
      ready: () => terms.checked && age.checked,
      /* One call site, two payload keys: the server wants the pair, under names that
         say what each one is. */
      apply(payload) {
        payload.accept_terms = terms.checked;
        payload.age_attested = age.checked;
        return payload;
      },
    };
  }

  /* The first sign-in of an account the portal opened for someone. The administrator
     typed that person's details, so the words were never put to them — they are put now,
     once, in a dialog that cannot be stepped around. */
  function consentGate(user) {
    const rows = consentRows({ compact: true });
    const accept = el("button", { class: "btn", type: "button", disabled: "disabled",
      onclick: submit }, [icon("check", 17), "Accept and go on"]);
    const decline = el("button", { class: "btn ghost", type: "button",
      onclick: () => App.signOut("Nothing has changed — sign in again when you have decided") },
      "Not now");
    rows.terms.addEventListener("change", sync);
    rows.age.addEventListener("change", sync);
    function sync() { accept.disabled = !rows.ready(); }

    async function submit() {
      accept.disabled = true;
      try {
        const u = await API.post("/api/account/consent",
          { accept_terms: rows.terms.checked, age_attested: rows.age.checked });
        API.setUser(u);
        App.consentSettled();
        box.close();
        toast("Thank you — your acceptance is on record");
      } catch (e) {
        accept.disabled = !rows.ready();
        toast(e.message, "err");
      }
    }

    const box = modal({
      title: "One thing before you go on",
      sub: (user && user.email ? user.email : "This account") +
           " was opened for you by the person who runs this portal, so these words were " +
           "never put to you.",
      body: el("div", {}, [
        el("p", { class: "muted", style: "font-size:14px;line-height:1.7" },
          "The portal holds a class record with your name on it. It is entitled to hold " +
          "that record because you say it may. Both documents are short, and the student " +
          "who built this portal wrote them."),
        rows.node, accept, decline,
      ]),
    });
    /* Closing the dialog by its X or by Escape means the same as "Not now": leaving.
       A gate you can walk out of sideways is not a gate. */
    box.panel.querySelector(".mclose").addEventListener("click", () => App.signOut());
    box.panel.addEventListener("keydown", e => { if (e.key === "Escape") App.signOut(); });
    return box;
  }

  return { load, openModal, consentRows, consentGate, TITLES, version, business, find,
           sectionNode, metaRow, footNode, smallPrint, SMALL_PRINT };
})();

/* A document as its own page: #/privacy, #/terms, #/cookies. Outside the app shell on
   purpose — someone reading a policy from the sign-in screen has no session to shell
   around, and a signed-in reader loses nothing by having the whole width. */
const LegalPage = (() => {
  function mount(target, key) {
    const { el, icon, render, announce, loading } = UI;
    const doc = el("div", { class: "doc" });
    const backTo = API.getToken() ? App.homeHash() : "#/login";
    render(target, el("main", { class: "doc-plain", id: "main", tabindex: "-1" }, [
      el("img", { class: "brand-img", src: "assets/img/logo.png?v=49", alt: "Gathering Place" }),
      el("a", { class: "back", href: backTo }, [icon("back", 14),
        API.getToken() ? "Back to the portal" : "Back to sign in"]),
      doc,
    ]));
    doc.appendChild(loading(4));

    function paint(d) {
      doc.innerHTML = "";
      doc.appendChild(el("div", { class: "doc-head" }, [
        el("h2", {}, d.title),
        el("div", { class: "who" },
          [Legal.business().organisation, Legal.business().unit].filter(Boolean).join(" · ")),
      ]));
      doc.appendChild(Legal.metaRow());
      doc.appendChild(el("div", { class: "doc-nav" }, Object.keys(Legal.TITLES).map(k =>
        el("a", { class: "chip" + (k === key ? " on" : ""), href: "#/" + k,
                  "aria-current": k === key ? "page" : null }, Legal.TITLES[k]))));
      doc.appendChild(el("p", { class: "muted",
        style: "font-size:14.5px;line-height:1.75;margin:-2px 0 6px" }, d.intro));
      d.sections.forEach(s => doc.appendChild(Legal.sectionNode(s)));
      doc.appendChild(Legal.footNode());
    }

    paint({ title: Legal.TITLES[key] || "Document", intro: "", sections: [] });
    Legal.load().then(() => paint(Legal.find(key) || { title: Legal.TITLES[key],
                                                       intro: "", sections: [] }))
      .catch(() => {
        doc.innerHTML = "";
        doc.appendChild(el("div", { class: "card" },
          "The wording could not be loaded. Try again in a moment."));
      });
    announce((Legal.TITLES[key] || "Document") + " opened");
  }
  return { mount };
})();
