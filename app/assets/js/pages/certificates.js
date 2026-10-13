/* Certificates: the sheet each gathering place prints on, and where its lines land.

   A place's own designer draws the artwork; the portal stamps the lines that change onto
   it — whose name, which class, which date, who signed. That placement used to live inside
   the Stake page as a window floating over the list, so a leader looking for it had to know
   that a row in a card was a door. It is now a page of its own, in the navigation bar under
   Messages, with the places offered across the top and the sheet underneath.

   Who may do what is the server's answer rather than this page's guess: a person who
   watches over the tenant can read the placement, and only the Portal Admin can put artwork
   up or move a line. The designer asks the certificate route for both, and this page only
   mirrors the same rule so the tabs and the notice agree with what will actually be accepted. */
const CertificatesPage = (() => {
  const { el, icon, shell, render, empty, loading } = UI;

  async function mount(target, placeId) {
    const ctx = App.ctx();
    const stake = ctx.stake;
    if (!stake) {
      return render(target, shell("certificates",
        empty("Pick a stake or a district to see the certificates its places print.", "home"),
        App.nav(), ctx));
    }

    /* The certificate routes answer a leader only. Saying so here saves a person from
       watching a screen spin and then being handed the server's flat "leader access
       required", which explains nothing about who they should ask. */
    if (!Ctx.can(stake, "govern")) {
      return render(target, shell("certificates", notForYou(stake), App.nav(), ctx));
    }

    // The title and a skeleton go up at once, so the page never reads as a blank screen.
    const content = el("div");
    content.appendChild(head(stake));
    content.appendChild(loading(3));
    render(target, shell("certificates", content, App.nav(), ctx));
    const slot = content.lastChild;

    let places;
    try {
      places = await API.get(`/api/stakes/${stake.id}/places`);
    } catch (e) {
      slot.replaceWith(failed(e.message, stake, placeId));
      return;
    }
    if (!places.length) {
      slot.replaceWith(noPlaces(stake));
      return;
    }

    /* A bookmarked or stale place id is not a mistake worth a message: the sheet the person
       is sent to is the first place in the list, and the tabs above it say which one that is. */
    const chosen = places.find(p => p.id === placeId) || places[0];
    const canEdit = Ctx.can(stake, "settings");
    // the head is written again with the places in hand, because it now names the sheet
    content.replaceChildren(head(stake, chosen, places));
    if (places.length > 1) content.appendChild(tabs(places, chosen, stake));
    if (!canEdit) content.appendChild(readOnlyNote());
    const host = el("div", { class: "cert-host" });
    content.appendChild(host);
    await CertDesign.mount(host, { stakeId: stake.id, place: chosen, canEdit });
  }

  // ---------- the head ----------
  /* The one sentence that tells a person what this screen is for, and — when a place has
     been chosen — which place's sheet they are looking at. */
  function head(stake, chosen, places) {
    const actions = el("div", { class: "actions" });
    if (places && places.length > 1) {
      actions.appendChild(el("a", { class: "btn secondary sm", href: "#/stake" },
        [icon("home", 15), stake.name]));
    }
    actions.appendChild(el("button", {
      class: "btn ghost sm", type: "button", title: "Read this page again from the portal",
      onclick: () => mount(document.getElementById("app"), chosen ? chosen.id : null) },
      [icon("refresh", 15), "Reload"]));
    return el("div", { class: "page-head",
        style: "display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, "Certificates"),
        el("div", { class: "page-sub" }, chosen
          ? `${stake.name} · ${places.length === 1 ? "the one gathering place here"
                        : `${places.length} gathering places`} — choose one to place its lines`
          : "The lines that change on a place's own artwork: a member's name, their class, " +
            "the date, and who signed."),
      ]),
      actions,
    ]);
  }

  // ---------- the places, across the top ----------
  /* Every place prints on its own sheet, so the sheet on the screen is only ever one
     place's. The list is a row of named doors rather than a dropdown: a leader knows
     their place by its name, and one look at the row says whether the other places have
     artwork yet or not. */
  function tabs(places, chosen, stake) {
    return el("nav", { class: "tabs scroll", "aria-label": "Gathering places in " + stake.name },
      places.map(p => el("button", {
        type: "button",
        class: p.id === chosen.id ? "active" : "",
        "aria-current": p.id === chosen.id ? "page" : null,
        title: p.name,
        onclick: () => { location.hash = "#/certificates/" + p.id; },
      }, p.name + (p.is_active ? "" : " (set aside)"))));
  }

  function readOnlyNote() {
    return el("div", { class: "subcard" }, [
      el("div", { class: "row", style: "gap:10px;align-items:flex-start" }, [
        icon("lock", 18),
        el("div", { class: "meta" },
          "You can see where every line lands and how a member's certificate will read. " +
          "Putting a design up and moving a line is the Portal Admin's to do — ask for a " +
          "sample before the awards night, not after."),
      ]),
    ]);
  }

  // ---------- the three ways this page can have nothing to show ----------
  function notForYou(stake) {
    const wrap = el("div");
    wrap.appendChild(el("div", { class: "page-head" }, [
      el("div", {}, [
        el("h2", { class: "page-title" }, "Certificates"),
        el("div", { class: "page-sub" }, stake.name),
      ]),
    ]));
    wrap.appendChild(el("div", { class: "card" }, [
      el("div", { class: "row", style: "gap:10px;align-items:flex-start" }, [
        icon("award", 20),
        el("div", {}, [
          el("div", { class: "title" }, "This screen belongs to the people who watch over the place"),
          el("div", { class: "meta", style: "margin-top:5px" },
            "A president, a YSA service missionary or the Portal Admin can open it. If a "
            + "certificate has come out wrong, say whose name and which class it was, and "
            + "the Portal Admin will move the line."),
          el("a", { class: "btn secondary sm", href: "#/", style: "margin-top:12px;width:auto" },
            [icon("back", 15), "Back to my dashboard"]),
        ]),
      ]),
    ]));
    return wrap;
  }

  function failed(why, stake, placeId) {
    return el("div", { class: "card" }, [
      el("div", { class: "row", style: "gap:10px;align-items:flex-start" }, [
        icon("alert", 20),
        el("div", { class: "grow" }, [
          el("div", { class: "title" }, "The places could not be read"),
          el("div", { class: "meta", style: "margin-top:5px" }, why),
          el("button", { class: "btn secondary sm", type: "button", style: "margin-top:12px",
            onclick: () => mount(document.getElementById("app"), placeId) },
            [icon("refresh", 15), "Try again"]),
        ]),
      ]),
    ]);
  }

  function noPlaces(stake) {
    const runs = Ctx.can(stake, "places");
    const wrap = el("div");
    wrap.appendChild(empty("No gathering place has been registered in " + stake.name + " yet.",
                           "pin"));
    /* The artwork is drawn for a place, so there is genuinely nothing to place until one
       exists — but the way to that is the Stake page, and only the person who can add a
       place is offered the step. */
    wrap.appendChild(el("div", { class: "card soft" }, [
      el("div", { class: "meta" }, runs
        ? "A certificate is printed for the members of one gathering place, so the sheet "
          + "and its lines come after the place itself is registered."
        : "A certificate is printed for the members of one gathering place, so there is no "
          + "sheet to place lines on until the Portal Admin registers one."),
      el("a", { class: "btn secondary sm", href: "#/stake",
                style: "margin-top:12px;width:auto" }, [icon("home", 15), "Open " + stake.name]),
    ]));
    return wrap;
  }

  return { mount };
})();
