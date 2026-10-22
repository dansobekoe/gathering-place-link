/* Study: the Gospel Library, opened inside the portal.

   An instructor preparing a Come, Follow Me lesson and a student told to read a chapter
   are doing the same thing as attending a class here, so the Library belongs one tap
   away rather than in a bookmark on someone's personal phone. It is also the portal's one
   third party, and this page says so in the same words the cookie notice uses: the frame
   is served by churchofjesuschrist.org, their browser sees that request, and nothing about
   what is read comes back here.

   Nothing is stored about the visit — no last section, no history, no key in local
   storage. The frame starts at the Library's own home each time, which is the least a
   page that promises not to track reading can do. */
const StudyPage = (() => {
  const { el, icon } = UI;

  const BASE = "https://www.churchofjesuschrist.org";
  /* The address above is not free choice: the portal's Content-Security-Policy names it in
     `frame-src`, and that line is the only reason a browser lets the Library appear inside
     these pages at all. Point this page at any other site and the browser draws a blank
     window and blames the owner of this one. The two live in different folders, so if the
     Library ever moves, change it in both places. */
  // Every address here was checked against the site. A dead link in a list like this is
  // the sort of thing a member finds first and nobody fixes last.
  const SECTIONS = [
    { key: "library", label: "Gospel Library", path: "/study?lang=eng",
      sub: "Everything in one place", icon: "globe" },
    { key: "scriptures", label: "Scriptures", path: "/study/scriptures?lang=eng",
      sub: "Book of Mormon · Bible · Doctrine and Covenants · Pearl of Great Price",
      icon: "book" },
    { key: "conference", label: "General Conference", path: "/study/general-conference?lang=eng",
      sub: "Addresses, talks and sessions by year", icon: "users" },
    { key: "follow", label: "Come, Follow Me", path: "/study/come-follow-me?lang=eng",
      sub: "The outlines these classes prepare from", icon: "calendar" },
    { key: "music", label: "Hymns and music", path: "/media/music/collections/hymns?lang=eng",
      sub: "The music library, hymnbook included", icon: "music" },
  ];

  let veil = null;
  let blankTimer = null;

  function stopTimer() {
    if (blankTimer) clearTimeout(blankTimer);
    blankTimer = null;
  }
  /* A frame from another site cannot be read from here, so a frame that never reports
     its load is described rather than guessed at: the hint points at the way out that
     always works, and it goes away the moment the Library says it is up. */
  function watchBlank() {
    stopTimer();
    blankTimer = setTimeout(() => {
      veil.innerHTML = "";
      veil.appendChild(el("div", { class: "hint" },
        "Still blank? The Library is not obliged to show itself inside another site — " +
        "“Open in a new tab” always works."));
    }, 12000);
  }

  function mount(target) {
    stopTimer();
    const content = el("div");
    content.appendChild(el("div", { class: "page-head" }, [
      el("h2", { class: "page-title" }, "Study"),
      el("div", { class: "page-sub" }, "The Gospel Library, one tap from the class you are preparing"),
    ]));

    /* ---------- the reading ---------- */
    veil = el("div", { class: "muted", style: "font-size:var(--t-ui);padding:var(--sp-10) var(--sp-2) 0" },
      "Loading the Library…");
    const frame = el("iframe", {
      class: "study-frame",
      title: "The Gospel Library at churchofjesuschrist.org",
      src: BASE + SECTIONS[0].path,
      // Scripts and forms so the Library works; no top-navigation, so nothing inside
      // this frame can move the portal somewhere else.
      sandbox: "allow-scripts allow-same-origin allow-forms allow-popups " +
               "allow-popups-to-escape-sandbox",
      referrerpolicy: "strict-origin-when-cross-origin",
    });
    frame.addEventListener("load", () => {
      stopTimer();
      veil.innerHTML = "";
      UI.announce("The Library has loaded");
    });

    let shown = SECTIONS[0];
    const openTab = el("a", { class: "btn sm secondary", href: BASE + SECTIONS[0].path,
                              target: "_blank", rel: "noopener noreferrer" },
      [icon("external", 15), "Open in a new tab"]);
    const chips = el("div", { class: "chips" }, SECTIONS.map(s => el("button", {
      class: "chip" + (s === shown ? " on" : ""), type: "button", onclick: () => go(s),
    }, s.label)));

    function go(s) {
      shown = s;
      frame.src = BASE + s.path;
      openTab.href = BASE + s.path;
      [...chips.children].forEach((c, i) => c.classList.toggle("on", SECTIONS[i] === s));
      veil.textContent = "Loading " + s.label + "…";
      watchBlank();
    }
    watchBlank();

    content.appendChild(el("div", { class: "card" }, [
      el("div", { class: "btns", style: "justify-content:space-between;margin-bottom:var(--sp-10)" }, [
        el("div", { class: "sec-title", style: "margin:0" }, "Reading"),
        openTab,
      ]),
      chips,
      frame,
      veil,
    ]));

    /* ---------- the honest paragraph ---------- */
    content.appendChild(el("div", { class: "card" }, [
      el("div", { class: "sec-title", style: "margin-top:0" }, "About this window"),
      el("p", { class: "muted", style: "font-size:var(--t-ui);line-height:1.7;margin:var(--sp-8) 0 0" },
        "What you see above is served by churchofjesuschrist.org, not by this portal. Your " +
        "browser speaks to them directly, so they see the request and may set their own " +
        "cookies on your device. Their privacy notice governs that part. This portal keeps " +
        "no record of what you read here — no page titles, no searches, no time spent."),
      el("div", { class: "btns", style: "margin-top:var(--sp-12)" }, [
        el("a", { class: "btn sm ghost", href: "#/cookies" }, [icon("file", 15), "Cookie Notice"]),
        el("a", { class: "btn sm ghost", href: "#/privacy" }, [icon("shield", 15), "Privacy Policy"]),
      ]),
    ]));

    /* ---------- the same places, outside the frame ---------- */
    content.appendChild(el("div", { class: "chart-block" }, [
      el("div", { class: "sec-title" }, "Or open a section in its own tab"),
      el("div", { class: "study-links" }, SECTIONS.map(s => el("a", {
        href: BASE + s.path, target: "_blank", rel: "noopener noreferrer",
      }, [
        icon(s.icon, 17),
        el("div", { style: "flex:1;min-width:0" }, [
          el("div", {}, s.label),
          el("span", { class: "sub" }, s.sub),
        ]),
        icon("external", 15),
      ]))),
    ]));

    UI.render(target, UI.shell("study", content, App.nav()));
  }

  return { mount, stop: stopTimer };
})();
