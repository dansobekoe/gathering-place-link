/* Auth: sign in, register, confirm the address, wait for the administrator.

   A new person no longer guesses an invite code — they search the public directory for
   their stake or district. Registration is now three gates, and the screen shows which one
   they are standing at:

     1. consent      two ticks, on the form itself, with the documents one tap away
     2. the code     proof the address is theirs, because an approval queue full of
                     mailboxes nobody owns is worse than no queue at all
     3. the admin    one named person approves every account, and the card says so

   Nothing here pretends a letter was sent. `email_expected` and `dev_code` come from the
   server, which is the only party that knows whether a mailbox is wired up — so with no
   SMTP account the screen stops mentioning an email and shows the code instead. */
const AuthPage = (() => {
  const { el, toast, render, icon, modal, statusPill, roleLabel, logoUrl,
          draftSave, draftRead, draftDrop } = UI;

  const RESEND_WAIT = 30;        // seconds of courtesy before a second code is offered

  function mount(target) {
    /* What this device was left holding, if anything. A person who goes to fetch the code
       the form just asked for often comes back to a page that has been thrown away — a phone
       that needed the memory, a tab that was closed, a reload pressed in confusion — and the
       forty seconds of typing they would have to do again is the point where registrations
       are quietly abandoned. Nothing secret is in here: see UI's draft store. */
    const kept = draftRead("auth") || {};
    const SCREENS = ["login", "signup", "verify", "waiting"];
    let mode = SCREENS.indexOf(kept.mode) >= 0 ? kept.mode : "login";
    let keptForm = kept.form || null;
    let waitData = mode === "waiting" ? (draftRead("waiting") || null) : null;
    let verifyData = mode === "verify" ? (draftRead("verify") || null) : null;
    // a screen whose own data did not survive is not a screen anybody can be put back on
    if (mode === "waiting" && !waitData) mode = keptForm ? "signup" : "login";
    if (mode === "verify" && !verifyData) mode = keptForm ? "signup" : "login";
    // said once, on the screen it came back to, and true for as long as that draft is live
    let restored = !!(keptForm || waitData || verifyData);
    let timer = null;
    const card = el("div", { class: "auth-card" });

    render(target, el("div", { class: "auth-wrap", id: "main", tabindex: "-1" }, [
      el("div", { class: "theme-float" }, [UI.themeButton()]),
      card,
    ]));

    function field(label, input, hint) {
      return el("div", { class: "field" }, [
        el("label", {}, label), input,
        hint ? el("div", { class: "hint" }, hint) : null,
      ]);
    }
    function stopTimer() { if (timer) clearInterval(timer); timer = null; }

    /* One place keeps the screen and whatever it was mid-way through, so every move that
       changes what this card is — sign in, registering, the code, the admin's queue — is a
       move a reload can survive. Drafts are dropped where the thing they describe is done:
       a sent message, a confirmed address, a signed-in account, a signed-out device. */
    function saveScreen() {
      /* "Sign in" is where everybody starts, so it is not worth remembering: keeping it would
         leave a key behind after Start again had cleared the person's own details out. */
      draftSave("auth", { mode: mode === "login" ? null : mode, form });
      /* A code kept on this device is not the same as a code still worth waiting for: the
         one that was sent an hour ago may have expired while the person was in the other app,
         so the screen that comes back never counts down at them. It names the address, and
         offers a new code as soon as they are ready for it. */
      draftSave("verify", mode === "verify"
                ? Object.assign({}, verifyData, { just_sent: false }) : null);
      draftSave("waiting", mode === "waiting" ? waitData : null);
    }

    /* "Start again" for whoever finds a form already filled in — a shared phone, or their own
       half-written attempt at the wrong account. It is their data to throw away, so the
       button throws it away and redraws the card clean. */
    function startAgain() {
      ["auth", "verify", "waiting", "reset"].forEach(draftDrop);
      form = null; keptForm = null; verifyData = null; waitData = null; restored = false;
      mode = "login";
      draw();
      toast("The form is empty again");
    }

    function draw() {
      stopTimer();
      saveScreen();
      card.innerHTML = "";
      card.appendChild(el("div", { class: "logo" }, [
        el("img", { class: "brand-img", src: logoUrl(), alt: "Gathering Place" }),
        el("div", { class: "tag" }, "Courses, attendance & community for YSA gathering places"),
      ]));
      // only the screens that took something back say so; the sign-in tab kept nothing
      if (restored && mode !== "login") {
        card.appendChild(el("div", { class: "keep-note" }, [
          "We kept what you had already typed on this device, so you could come back to it. "
          + "Your password and any code were not kept, and the two statements you agree to at "
          + "the foot of the form are yours to tick again. ",
          el("button", { class: "linkbtn", type: "button", onclick: startAgain }, "Start again"),
        ]));
      }
      if (mode === "waiting") { card.appendChild(waitingScreen()); foot(card); return; }
      if (mode === "verify") { card.appendChild(verifyScreen()); foot(card); return; }
      card.appendChild(el("div", { class: "tabs" }, [
        el("button", { class: mode === "login" ? "active" : "", onclick: () => { mode = "login"; draw(); } }, "Sign in"),
        el("button", { class: mode === "signup" ? "active" : "", onclick: () => { mode = "signup"; draw(); } }, "Create account"),
      ]));
      card.appendChild(mode === "login" ? loginForm() : signupForm());
      foot(card);
    }

    /* Who runs this, and what they promised about the record. Three links, one line and the
       two sentences of small print, all of it read from /api/legal so the footer cannot
       disagree with the policy — least of all about whether this is a Church site, or about
       whether the person who wrote the software holds an office in the programme. */
    function foot(host) {
      // The sentence shown for the moment before /api/legal answers. It says the truth it is
      // about to be replaced with, rather than a title that has to be corrected later.
      const line = el("div", {}, "Built and run by a Young Single Adult student of "
                                 + "this gathering place.");
      const fill = () => {
        const b = Legal.business();
        if (b.organisation) {
          line.textContent = `${b.organisation} · ${b.unit}. ` +
                             `Built and run by ${b.responsible_person}.`;
        }
      };
      fill();
      Legal.load().then(fill).catch(() => { /* the links still work; the line stays plain */ });
      host.appendChild(el("div", { class: "auth-foot" }, [
        el("div", { class: "docs" }, Object.keys(Legal.TITLES).map(k =>
          el("a", { href: "#/" + k }, Legal.TITLES[k]))),
        line,
        Legal.smallPrint(),
      ]));
    }

    function showWaiting(data) { waitData = data; stopTimer(); mode = "waiting"; draw(); }

    /* The screen a person sees while the portal admin decides. The card's own message
       from the server is the paragraph — we don't rewrite it here. */
    function waitingScreen() {
      const d = waitData || {};
      const byMail = d.email_expected !== false;
      const steps = el("ol", { class: "wait-steps" },
        (byMail
          ? ["The portal admin reviews your registration.",
             "An email reaches you the moment it is approved.",
             "Sign in with the same email and password."]
          : ["The portal admin reviews your registration.",
             "Return to sign in with these details to see the decision."]
        ).map((line, i) => waitStep(i + 1, line)));
      const req = Array.isArray(d.requested) ? d.requested : [];
      return el("div", { class: "waiting" }, [
        el("div", { class: "mark" }, [icon(byMail ? "mail" : "clock", 26)]),
        el("h3", {}, "Your registration is with the portal admin"),
        el("p", {}, d.message || "Your registration has been sent for approval."),
        req.length ? el("div", { class: "card", style: "margin-top:16px;text-align:left" },
          req.map(r => el("div", { class: "list-item" }, [
            el("div", { class: "grow" }, [
              el("div", { class: "title" }, r.stake_name || ""),
              el("div", { class: "meta" }, roleLabel(r.role) + " · " + (r.kind === "district" ? "district" : "stake")),
            ]),
            el("span", { html: statusPill(r.status) }),
          ]))) : null,
        steps,
        el("div", { style: "margin-top:20px" }, [
          el("button", { class: "btn secondary", onclick: () => { mode = "login"; draw(); } }, "Back to sign in"),
        ]),
      ]);
    }
    function waitStep(n, text) {
      return el("li", {}, [el("span", { class: "n" }, String(n)), el("div", {}, text)]);
    }

    // ---- the second gate: the code that proves the address ----
    /* The account already exists and is unusable until this goes through, so the screen
       offers exactly two moves: enter the code, or ask for another one. */
    function verifyScreen() {
      const d = verifyData || {};
      const byMail = d.email_expected !== false;
      const digits = el("input", { class: "code-input", inputmode: "numeric", maxlength: "6",
                                   placeholder: "000000", autocomplete: "one-time-code",
                                   "aria-label": "Six-digit confirmation code" });
      const line = el("div", { class: "sent-to" });
      const reveal = el("div");
      const again = el("button", { class: "linkbtn", type: "button", onclick: resend });
      const note = el("div", { class: "hint", style: "text-align:center;margin-top:10px" });
      const btn = el("button", { class: "btn", onclick: submit }, [icon("check", 17), "Confirm my email"]);

      function paintLine() {
        line.innerHTML = "";
        line.appendChild(document.createTextNode(
          d.just_sent ? "Code sent to " : "We sent a code to "));
        line.appendChild(el("b", {}, d.email || ""));
        line.appendChild(document.createTextNode(!byMail ? "."
          : d.just_sent ? ` — it expires in ${d.ttl || 30} minutes.`
                        : ". Lost it? Ask for a new one below."));
      }
      function paintReveal(code) {
        reveal.innerHTML = "";
        if (code) d.dev_code = code;
        if (!d.dev_code) return;
        reveal.appendChild(el("div", { class: "field", style: "margin-top:12px" }, [
          el("label", {}, "Your code"),
          el("div", { class: "code-chip" }, d.dev_code),
        ]));
      }
      function countdown(seconds) {
        stopTimer();
        let left = seconds;
        again.disabled = true;
        const tick = () => {
          again.textContent = left > 0 ? `Send a new code in ${left}s` : "Send a new code";
          again.disabled = left > 0;
          if (left <= 0) { stopTimer(); return; }
          left -= 1;
        };
        tick();
        timer = setInterval(tick, 1000);
      }

      digits.addEventListener("input", () => {
        const v = digits.value.replace(/\D/g, "");
        digits.value = v;
        note.textContent = "";
        if (v.length === 6) submit();          // a pasted or fully-typed code needs no button
      });
      digits.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

      async function submit() {
        const code = digits.value.trim();
        if (code.length !== 6) { note.textContent = "The code is six digits."; return; }
        btn.disabled = true; again.disabled = true;
        try {
          const r = await API.post("/api/auth/verify-email", { email: d.email, code });
          onVerified(r);
        } catch (e) {
          btn.disabled = false;
          note.textContent = e.message;
          digits.select();
          UI.announce(e.message);
        }
      }
      async function resend() {
        try {
          const r = await API.post("/api/auth/resend-code", { email: d.email });
          if (r.dev_code) paintReveal(r.dev_code);
          note.textContent = r.message || "";
          countdown(RESEND_WAIT);
        } catch (e) { note.textContent = e.message; }
      }

      paintLine();
      paintReveal();
      /* A code issued a moment ago is not offered again for half a minute; arriving here
         from a refused sign-in, where nothing has been sent this visit, offers it at once. */
      countdown(d.just_sent ? RESEND_WAIT : 0);
      return el("div", { class: "verify" }, [
        el("div", { class: "mark" }, [icon(byMail ? "mail" : "key", 26)]),
        el("h3", { style: "margin-bottom:4px" }, "Confirm your email address"),
        el("p", { class: "muted", style: "font-size:var(--t-ui);line-height:1.6;margin-bottom:14px" },
          d.message || (byMail
            ? "A six-digit code went to the address you registered with. Enter it and " +
              "your details go to the portal admin."
            : "No mailbox is connected to this portal yet, so a code is shown here when " +
              "you ask for one.")),
        line, digits, reveal, note, btn,
        el("div", { class: "again" }, [again]),
        el("div", { class: "hint", style: "margin-top:12px" },
          "Wrong address? Register again with the right one — the administrator can remove " +
          "the account that is waiting here."),
      ]);
    }

    /* What happens once an address is proved: the founder of an empty portal is signed
       straight in; everyone else is handed to the administrator's queue. */
    function onVerified(r) {
      if (r.token) {
        API.setSession(r.token, r.user || { email: r.email, full_name: r.name });
        API.get("/api/auth/me").then(u => { API.setUser(u); App.afterLogin(); })
          .catch(() => App.afterLogin());
        return;
      }
      /* Nothing else to write down: showWaiting keeps this screen's own draft, so reloading
         the waiting screen still says who is waiting and what the server told them. */
      showWaiting(r);
    }

    // ---- sign in ----
    function loginForm() {
      const email = el("input", { type: "email", placeholder: "you@example.org", autocomplete: "username" });
      const pass = el("input", { type: "password", placeholder: "Your password", autocomplete: "current-password" });
      const keep = el("input", { type: "checkbox", id: "ck-keep" });
      const btn = el("button", { class: "btn", onclick: submit }, [icon("logout", 17), "Sign in"]);
      async function submit() {
        btn.disabled = true;
        try {
          const r = await API.post("/api/auth/login",
            { email: email.value, password: pass.value, remember: keep.checked });
          API.setSession(r.token, r.user, keep.checked);
          toast("Welcome back, " + String((r.user && r.user.full_name) || "").split(" ")[0]);
          App.afterLogin();
        } catch (e) {
          btn.disabled = false;
          /* Two refusals explain themselves as screens rather than as a wrong password:
             an address that has never been confirmed, and an account still with the
             administrator. Whether a letter is coming is the server's to say, and it does. */
          if (e.status === 403 && /confirm the email/i.test(e.message)) {
            verifyData = { email: email.value.trim(), message: e.message, ttl: 30,
                           just_sent: false,
                           /* Only the server's own wording says whether a letter is on its
                              way; "the code we sent" is that sentence. */
                           email_expected: /code we sent/i.test(e.message) };
            stopTimer(); mode = "verify"; draw();
          } else if (e.status === 403 && /approv|active/i.test(e.message)) {
            showWaiting({ message: e.message, email: email.value.trim(), requested: [],
                          email_expected: /email/i.test(e.message) });
          } else {
            toast(e.message, "err");
          }
        }
      }
      pass.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      return el("div", {}, [
        field("Email", email), field("Password", UI.passWrap(pass)),
        el("div", { class: "keep-row" }, [
          el("label", { class: "keep", for: keep.id }, [keep, "Remember this device"]),
          el("button", { class: "linkbtn", onclick: forgot }, "Forgot password?"),
        ]),
        /* The trade is said out loud, because the box is a security decision and a
           checked box is invisible to whoever else picks up the phone. */
        el("div", { class: "keep-note" },
          "On a phone or computer other people use, leave this unchecked — the portal " +
          "then forgets you when this tab closes. Ticked, it keeps you signed in here."),
        btn,
      ]);
    }

    // ---- password reset (two-step modal) ----
    /* The same interruption, one step in. A person who left to read the code in their mail
       came back to a dialog that had closed and had to start over — and a reset code is only
       good for fifteen minutes, so the second attempt often failed before it began. What is
       kept here is the address and which step they had reached. The code and the new password
       are never written down, and coming back to step two is not a way of spending a stale
       code by accident: the box is empty and the portal answers plainly when it is refused. */
    function forgot() {
      const keptReset = draftRead("reset") || {};
      // without an address there is nothing to bring back: step one is the only way in
      let step = (keptReset.step === 2 && keptReset.email) ? 2 : 1;
      const saveReset = () => draftSave("reset", { email: email.value, step });
      const email = el("input", { type: "email", placeholder: "you@example.org",
                                  autocomplete: "username", value: keptReset.email || "" });
      email.addEventListener("input", saveReset);
      const step2 = el("div", { style: "display:none" });
      const body = el("div", {}, [
        el("div", { id: "fp-step1" }, [
          field("Account email", email),
          el("button", { class: "btn", onclick: async () => {
            try {
              const r = await API.post("/api/auth/forgot-password", { email: email.value });
              showStep2(r);
            } catch (e) { toast(e.message, "err"); }
          }}, [icon("mail", 17), "Send reset code"]),
        ]),
        step2,
      ]);
      const m = modal({ title: "Reset your password", sub: "We'll issue a 6-digit code that expires in 15 minutes.", body });

      // back to the first step is also how somebody asks for a second code
      function backToStep1() {
        step = 1;
        step2.style.display = "none";
        step2.innerHTML = "";
        body.querySelector("#fp-step1").style.display = "";
        email.focus();
        saveReset();
      }

      function showStep2(res) {
        const r = res || {};
        step = 2; saveReset();
        body.querySelector("#fp-step1").style.display = "none";
        step2.style.display = "block";
        const code = el("input", { placeholder: "6-digit code", inputmode: "numeric", maxlength: "6" });
        const np = el("input", { type: "password", placeholder: "New password (min 8 chars)",
                                 autocomplete: "new-password" });
        const cp = el("input", { type: "password", placeholder: "Type the new password again",
                                 autocomplete: "new-password" });
        step2.innerHTML = "";
        /* Where the code came from is the server's sentence to say, not ours: a real
           mailbox, a dev reveal and a blind reply all read differently. */
        if (r.dev_code) step2.appendChild(el("div", { class: "field" }, [
          el("label", {}, "Your reset code"), el("div", { class: "code-chip" }, r.dev_code)]));
        else if (r.message) step2.appendChild(el("div", { class: "muted",
          style: "font-size:var(--t-meta);line-height:1.5;margin:-2px 0 12px" }, r.message));
        step2.appendChild(field("Reset code", code));
        step2.appendChild(field("New password", UI.passWrap(np)));
        step2.appendChild(field("Confirm new password", UI.passWrap(cp)));
        step2.appendChild(el("button", { class: "btn", onclick: async () => {
          if (np.value.length < 8)
            return toast("A new password needs at least 8 characters", "err");
          if (!UI.passAgree(np, cp, "new passwords")) return;
          try {
            await API.post("/api/auth/reset-password",
              { email: email.value, code: code.value, new_password: np.value });
            draftDrop("reset");
            m.close(); toast("Password updated — sign in with your new password");
            mode = "login"; draw();
          } catch (e) { toast(e.message, "err"); }
        }}, [icon("lock", 17), "Set new password"]));
        step2.appendChild(el("div", { class: "keep-note", style: "margin-top:12px" }, [
          el("button", { class: "linkbtn", type: "button", onclick: backToStep1 },
            "Ask for a new code"),
        ]));
      }

      // this device was left mid-reset, so the dialog opens where they left it
      if (step === 2) {
        showStep2({ message: `You had already asked for a code for ${keptReset.email} on this `
                           + "device. If the one you were sent has gone stale, ask for a new "
                           + "one below." });
      }
    }

    // ---- directory search picker (public endpoint) ----
    /* The line under a tenant's name says what kind it is and where it is. It never
       says which clock it keeps: every tenant here runs on Accra time, so printing
       "Accra" on all forty-five of them reads as one city holding them all. */
    function tenantSub(t) {
      const word = (t.places === 1 ? "gathering place" : "gathering places");
      const parts = [t.label || (t.org_kind === "district" ? "District" : "Stake"),
                     `${t.places || 0} ${word}`];
      if (t.address) parts.push(t.address);
      return parts.join(" · ");
    }

    /* A searchable list of approved tenants, with an All/Stakes/Districts filter. */
    function makeSearchPicker(opt) {
      opt = opt || {};
      let q = "", kind = "", picked = null, results = [], seq = 0, timer = null;

      const input = el("input", { type: "search", placeholder: opt.placeholder || "Start typing a name",
        oninput: () => { q = input.value; clearTimeout(timer); timer = setTimeout(run, 250); } });

      const chipBar = el("div", { class: "chips" });
      const kinds = [{ key: "", label: "All" }, { key: "stake", label: "Stakes" }, { key: "district", label: "Districts" }];
      const btns = kinds.map(d => el("button", {
        class: "chip" + (d.key === kind ? " on" : ""), type: "button",
      }, d.label));
      btns.forEach((b, i) => b.addEventListener("click", () => {
        kind = kinds[i].key;
        btns.forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        run();
      }));
      btns.forEach(b => chipBar.appendChild(b));

      const list = el("div", { class: "picker" });
      const pickWrap = el("div");
      const controls = el("div", {}, [input, chipBar]);

      function run() {
        const my = ++seq;
        list.innerHTML = "";
        list.appendChild(el("div", { class: "picker-empty" }, "Loading…"));
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (kind) params.set("kind", kind);
        API.get("/api/directory?" + params.toString())
          .then(rows => { if (my !== seq) return; results = Array.isArray(rows) ? rows : []; paint(); })
          .catch(() => { if (my !== seq) return; results = []; paint(true); });
      }

      function paint(error) {
        list.innerHTML = "";
        if (error) { list.appendChild(el("div", { class: "picker-empty" }, "The directory isn't available right now.")); return; }
        if (!results.length) { list.appendChild(el("div", { class: "picker-empty" }, "No match yet — check the spelling or widen the filter.")); return; }
        results.forEach(t => list.appendChild(el("button", {
          class: "picker-item" + (picked && picked.id === t.id ? " on" : ""), type: "button",
          onclick: () => choose(t),
        }, [
          el("div", { class: "kind" }, [icon(t.org_kind === "district" ? "pin" : "home", 15)]),
          el("div", { style: "flex:1;min-width:0" }, [
            el("div", { class: "nm" }, t.name),
            el("div", { class: "sub" }, tenantSub(t)),
          ]),
        ])));
      }

      function choose(t) {
        picked = t;
        controls.style.display = "none";
        list.style.display = "none";
        pickWrap.innerHTML = "";
        pickWrap.appendChild(el("div", { class: "picked" }, [
          icon(t.org_kind === "district" ? "pin" : "home", 16),
          el("div", { class: "grow" }, t.name),
          el("button", { class: "linkbtn", type: "button", onclick: clearPick }, "Change"),
        ]));
        if (opt.onPick) opt.onPick(t);
      }
      function clearPick() {
        picked = null;
        controls.style.display = "";
        list.style.display = "";
        pickWrap.innerHTML = "";
        paint();
        if (opt.onClear) opt.onClear();
      }

      const node = el("div", {}, [controls, list, pickWrap]);
      run();
      return { node, get: () => (picked ? picked.id : null) };
    }

    // ---- sign up ----
    /* The form keeps its values between redraws of the intent block, so choosing
       "district" does not wipe the name already typed above it. */
    let form = null;

    function signupForm() {
      // Anything this device already typed goes back into the form before it is drawn, so a
      // reload mid-registration is an inconvenience rather than forty seconds of retyping.
      // keptForm never holds a password: the draft store refuses to write one.
      form = form || Object.assign({ name: "", email: "", password: "", confirm: "",
                                     phone: "", whatsapp: "", intent: "student", invite: "",
                                     role: "student", companion: "", gender: "", member: "",
                                     ward: null, stakeName: "", stakeKind: "stake",
                                     stakeAddr: "" }, keptForm || {});
      const name = el("input", { placeholder: "Full name", autocomplete: "name", value: form.name });
      const email = el("input", { type: "email", placeholder: "you@example.org",
                                  autocomplete: "email", value: form.email });
      const pass = el("input", { type: "password", placeholder: "Min 8 characters",
                                 autocomplete: "new-password", value: form.password });
      const again = el("input", { type: "password", placeholder: "Type it again",
                                  autocomplete: "new-password", value: form.confirm });
      const phone = UI.phoneField({ label: "Phone", autocomplete: "tel" });
      const whatsapp = UI.phoneField({ label: "WhatsApp", autocomplete: "tel",
        note: "Only if you use WhatsApp for class messages. Same number is fine." });
      phone.set(form.phone); whatsapp.set(form.whatsapp);
      [name, email, pass].forEach(i => i.addEventListener("input", remember));
      phone.input.addEventListener("input", remember);
      whatsapp.input.addEventListener("input", remember);

      /* Two questions a roster and an ID badge cannot be cut without, asked once here
         rather than left for a profile page most people never open. "I'd rather not say"
         is a complete answer: it leaves the record empty, and an empty record is never
         read as a no when a class is planned. */
      const gender = el("select", { onchange: remember }, [
        el("option", { value: "" }, "Choose one"),
        el("option", { value: "M", selected: form.gender === "M" ? "selected" : null }, "Male"),
        el("option", { value: "F", selected: form.gender === "F" ? "selected" : null }, "Female"),
      ]);
      const member = el("select", { onchange: remember }, [
        el("option", { value: "" }, "Choose one"),
        el("option", { value: "yes", selected: form.member === "yes" ? "selected" : null }, "Yes"),
        el("option", { value: "no", selected: form.member === "no" ? "selected" : null }, "No"),
        el("option", { value: "prefer", selected: form.member === "prefer" ? "selected" : null },
          "I'd rather not say"),
      ]);

      const intent = el("select", { onchange: () => { remember(); renderIntent(); } }, [
        el("option", { value: "student" }, "I'm joining a class as a student"),
        el("option", { value: "join_stake" }, "I belong to a stake or district"),
        el("option", { value: "register_stake" }, "I'm setting up a new stake or district"),
      ]);
      intent.value = form.intent;
      const extra = el("div");
      const consent = Legal.consentRows();

      // per-intent references, reassigned by buildJoin / buildRegister
      let joinPicker, joinInvite, joinRole, joinRoleField, joinCompanion, joinCompanionField,
          joinWard;
      let regName, regKind, regAddr;

      function remember() {
        form.name = name.value; form.email = email.value; form.password = pass.value;
        form.confirm = again.value;
        form.intent = intent.value;
        form.phone = phone.get(); form.whatsapp = whatsapp.get();
        form.gender = gender.value; form.member = member.value;
        if (joinInvite) form.invite = joinInvite.value;
        if (joinRole) form.role = joinRole.value;
        if (joinCompanion) form.companion = joinCompanion.value;
        if (joinWard) form.ward = joinWard.payload();
        if (regName) form.stakeName = regName.value;
        if (regKind) form.stakeKind = regKind.value;
        if (regAddr) form.stakeAddr = regAddr.value;
        saveScreen();
      }

      function renderIntent() {
        extra.innerHTML = "";
        // A student joins a class by joining the stake or district that runs it, so
        // the first intent reuses the same picker with the role already decided.
        if (form.intent === "join_stake") buildJoin(false);
        else if (form.intent === "student") buildJoin(true);
        else if (form.intent === "register_stake") buildRegister();
      }

      function buildJoin(studentOnly) {
        joinPicker = makeSearchPicker({ placeholder: "Stake or district name",
          onPick: t => joinWard.load(t.id),
          // Back to the search box means no tenant picked, so there is no ward list to
          // show — the box goes back to taking the ward's words.
          onClear: () => joinWard.load(null) });
        joinInvite = el("input", { placeholder: "Invite code from your leader", value: form.invite });
        joinInvite.addEventListener("input", () => {
          // A code names a tenant the browser has not seen a list for, so the ward is
          // written out and the stake puts it on its own list.
          remember();
          joinWard.load(joinInvite.value.trim() ? null : joinPicker.get());
        });
        joinWard = UI.wardField({ label: "Ward or branch (optional)" });
        if (form.ward) {
          if (form.ward.ward_name) joinWard.set(form.ward.ward_name);
          else if (form.ward.ward_id) joinWard.set(null, form.ward.ward_id);
        }
        const pickedStake = joinPicker.get();
        joinWard.load(pickedStake && !joinInvite.value.trim() ? pickedStake : null);
        ["input", "change"].forEach(ev => joinWard.node.addEventListener(ev, remember));
        joinRole = el("select", { onchange: () => { remember(); syncCompanion(); } }, [
          el("option", { value: "student" }, "Student"),
          el("option", { value: "instructor" }, "Instructor"),
          el("option", { value: "service_missionary" }, "YSA Service Missionary"),
        ]);
        joinRole.value = form.role;
        joinCompanion = el("input", { placeholder: "Companion, e.g. Sister Hansen",
                                      value: form.companion });
        joinCompanion.addEventListener("input", remember);
        joinCompanionField = field("Companion name", joinCompanion,
          "You and your companion share one account and one profile picture.");
        joinRoleField = field("Role", joinRole);
        if (studentOnly) joinRoleField.style.display = "none";

        extra.appendChild(field("Search your stake or district", joinPicker.node));
        extra.appendChild(el("div", { class: "hint",
          style: "margin:-6px 0 12px" }, "Searching sends a request the portal admin confirms. An invite code from your leader opens the seat right away."));
        extra.appendChild(field("Invite code (optional)", joinInvite));
        extra.appendChild(joinWard.node);
        extra.appendChild(joinRoleField);
        extra.appendChild(joinCompanionField);
        syncCompanion();
      }
      function syncCompanion() {
        joinCompanionField.style.display = joinRole.value === "service_missionary" ? "" : "none";
      }

      function buildRegister() {
        regName = el("input", { placeholder: "e.g. Achimota Ghana Stake", value: form.stakeName });
        regName.addEventListener("input", remember);
        regAddr = el("input", { placeholder: "e.g. East Legon, Accra", value: form.stakeAddr });
        regAddr.addEventListener("input", remember);
        regKind = el("select", { onchange: remember }, [
          el("option", { value: "stake" }, "Stake"),
          el("option", { value: "district" }, "District"),
        ]);
        regKind.value = form.stakeKind;
        extra.appendChild(field("Name", regName));
        extra.appendChild(field("Stake or district", regKind,
          "Both are a tenant of their own, with their own people, rooms and classes."));
        extra.appendChild(field("Town or area", regAddr,
          "The area it covers, shown in the directory so people pick the right one. "
          + "Exact meeting addresses belong to the gathering places you add after this."));
        extra.appendChild(el("div", { class: "hint",
          style: "margin:2px 0 4px" }, "On a brand-new portal this first account becomes its admin and signs straight in."));
      }

      // Only keys that apply to the chosen intent are sent.
      function buildPayload() {
        const v = intent.value;
        // "a student" is a join with the role fixed, so the server sees one intent.
        const joining = v === "join_stake" || v === "student";
        const p = { email: email.value.trim(), password: pass.value,
                    full_name: name.value.trim(), intent: joining ? "join_stake" : v };
        put(p, "phone", phone.get());
        put(p, "whatsapp", whatsapp.get());
        if (gender.value) p.gender = gender.value;
        // "I'd rather not say" sends neither yes nor no: the record stays empty, which is
        // that person's answer rather than a missing one.
        if (member.value === "yes") p.church_member = true;
        else if (member.value === "no") p.church_member = false;
        if (joining) {
          p.role = v === "student" ? "student" : joinRole.value;
          const code = joinInvite.value.trim();
          if (code) p.invite_code = code.toUpperCase();      // invite takes precedence over a searched stake
          else { const id = joinPicker.get(); if (id) p.stake_id = id; }
          if (p.role === "service_missionary") put(p, "companion_name", joinCompanion.value);
          // Only an answer that names a ward is sent. Leaving the box on "None recorded"
          // is the same as not saying: nothing is written on the new account.
          const ward = joinWard.payload();
          if (ward.ward_id) p.ward_id = ward.ward_id;
          else if (ward.ward_name) p.ward_name = ward.ward_name;
        } else if (v === "register_stake") {
          p.stake_name = regName.value.trim();
          p.stake_kind = regKind.value;
          put(p, "stake_address", regAddr.value);
        }
        return consent.apply(p);
      }
      function put(obj, k, val) { if (val && String(val).trim()) obj[k] = String(val).trim(); }

      const btn = el("button", { class: "btn", onclick: submit }, [icon("userplus", 17), "Create account"]);
      async function submit() {
        if (!consent.ready()) {
          // The two ticks are the whole lawful basis for the record about to be made.
          toast("Please confirm the two statements at the foot of the form", "err");
          consent.node.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        const p = buildPayload();
        if (!p.full_name) return toast("Please give your full name", "err");
        if (!gender.value) return toast("Please say whether you are male or female", "err");
        if (!member.value) return toast("Please answer the membership question — " +
                                        "“I'd rather not say” is an answer", "err");
        if (!p.email) return toast("Please enter your email", "err");
        if (!p.password || p.password.length < 8) return toast("Password needs at least 8 characters", "err");
        if (!UI.passAgree(pass, again)) return;
        if (p.intent === "join_stake" && !p.invite_code && !p.stake_id)
          return toast("Search for your stake or district, or enter an invite code", "err");
        // "not listed" with an empty box is half an answer: the ward it names is nothing.
        if (p.intent === "join_stake" && joinWard.incomplete())
          return toast("Write your ward's name, or choose “None recorded”", "err");
        if (p.intent === "register_stake" && !p.stake_name)
          return toast("Give the stake or district a name", "err");

        btn.disabled = true;
        try {
          const r = await API.post("/api/auth/signup", p);
          form.password = "";
          form.confirm = "";
          if (r.token) {
            // Founder of an empty portal: signed straight in. Fetch the real profile
            // so the shell knows this account is the portal admin.
            API.setSession(r.token, { email: r.email, full_name: r.name });
            try { API.setUser(await API.get("/api/auth/me")); } catch (e) { /* keep the placeholder */ }
            App.afterLogin();
            return;
          }
          if (r.verify_required) {
            verifyData = { email: r.email, message: r.message, dev_code: r.dev_code,
                           email_expected: r.email_expected, just_sent: true,
                           ttl: r.code_ttl_minutes || 30 };
            stopTimer(); mode = "verify"; draw();
            return;
          }
          // and the waiting screen is kept as its own draft, so a reload mid-approval
          // still names the account and shows what the portal said about it
          showWaiting(r);
        } catch (e) {
          toast(e.message, "err");
          btn.disabled = false;
        }
      }

      renderIntent();
      return el("div", {}, [
        field("Full name", name), field("Email", email),
        field("Password", UI.passWrap(pass)),
        field("Confirm password", UI.passWrap(again)),
        el("div", { class: "row" }, [phone.node, whatsapp.node]),
        el("div", { class: "row" }, [
          field("Male or female", gender),
          field("Member of the Church?", member,
            "“I'd rather not say” is an answer of its own."),
        ]),
        field("I want to…", intent), extra, consent.node, btn,
      ]);
    }

    draw();
  }

  return { mount };
})();
