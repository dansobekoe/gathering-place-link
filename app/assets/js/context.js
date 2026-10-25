/* Portal context: which stake is being worked on, what the signed-in person may do
   there, and the unread-message badge the sidebar shows.

   A portal admin is not a member of any stake, so their stake list comes from the
   admin API instead of /api/my-stakes — that is what lets an admin open any stake
   without joining it first. */
const Ctx = (() => {
  const KEY = "gp_stake";
  /* What this tab worked out about the person, kept for the life of the tab so a reload
     does not have to ask the portal again before it can draw anything. It is erased on
     sign-out, because the next person to hold the phone is not the last one. */
  const STORE = "gp_ctx";
  const UNREAD_KEY = "gp_unread";
  const KEEP_FOR = 12 * 60 * 60 * 1000;

  /* Kept in the same storage as the sign-in it describes: a remembered device holds
     both on disk, an unremembered one holds both in the tab. */
  function shelf() {
    try { return API.sessionStore(); } catch { return sessionStorage; }
  }

  function remembered() {
    try {
      const raw = JSON.parse(shelf().getItem(STORE) || "null");
      if (!raw || !Array.isArray(raw.stakes) || !raw.at) return null;
      if (Date.now() - raw.at > KEEP_FOR) return null;
      return { user: API.getUser() || {}, stakes: raw.stakes,
               joined: raw.joined || [], fetchedAt: raw.at };
    } catch { return null; }
  }
  function rememberedUnread() {
    try {
      const raw = JSON.parse(shelf().getItem(UNREAD_KEY) || "null");
      if (!raw || typeof raw.total !== "number" || !raw.at) return null;
      if (Date.now() - raw.at > KEEP_FOR) return null;
      return raw;
    } catch { return null; }
  }
  let state = remembered();          // { user, stakes, fetchedAt }
  let pending = null;                // in-flight promise, so parallel mounts share one call
  let unreadState = rememberedUnread() || { total: 0, stakes: [], at: 0 };

  /* The same three tiers the server enforces (see deps.py):
     admin   — the portal admin, and only them: paperwork, who belongs, the invite code
     manage  — the people who run a place day to day: admin and service missionaries
     monitor — the people who watch over it: admin, presidents, missionaries
     A president is a leader, not an approver: he sees everything and changes nothing. */
  function roleFlags(role, isAdmin) {
    const leader = role === "stake_president" || role === "district_president";
    const missionary = role === "service_missionary";
    const admin = !!isAdmin;
    const manage = admin || missionary;
    const monitor = manage || leader;
    return {
      role,
      label: ROLE_LABELS[role] || (isAdmin ? "Portal Admin" : "Member"),
      admin, manage, monitor, leader,
      governor: monitor,          // legacy name for "sees the whole tenant"
      president: role === "stake_president",
      districtPresident: role === "district_president",
      missionary,
      instructor: role === "instructor",
      student: role === "student",
    };
  }
  const ROLE_LABELS = {
    super_admin: "Portal Admin", stake_president: "Stake President",
    district_president: "District President",
    service_missionary: "YSA Service Missionary", instructor: "Instructor", student: "Student",
  };

  async function load(force) {
    if (force) return pull();
    if (state) {
      /* The profile can arrive after the context was first worked out: a device that
         held the token but not the profile, or a picture that was just uploaded. The
         context holds the person as they are now, not as they were when the tab
         opened — otherwise the greeting says "there" and the avatar stays empty. */
      freshen();
      /* Answered at once, even when it is older than a minute: a click must never wait
         for a question this screen already has an answer to. The same question is put
         to the portal behind the screen, and the correction lands for the next visit. */
      if (Date.now() - state.fetchedAt > 60000) pull().catch(() => { /* keep what we have */ });
      return state;
    }
    return pull();
  }

  function pull() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const user = API.getUser() || {};
        /* Asked together, not one after the other. Each question costs the same half
           second on a tunnel, and on an admin's account one of them used to wait for
           the other to finish before it even started. */
        const [mine, all] = await Promise.all([
          API.get("/api/my-stakes"),
          user.is_super_admin ? API.get("/api/admin/stakes") : Promise.resolve(null),
        ]);
        const joined = mine
          .filter(s => s.stake_status === "active" && s.member_status === "active")
          .map(s => ({ ...roleFlags(s.role, false),
                       id: s.stake_id, name: s.stake_name,
                       label: s.label || "Stake", kind: s.org_kind || "stake",
                       pending: false }));
        let stakes = joined;
        if (all) {
          /* Everything except a stake put away for good. A stake that is suspended, or
             still waiting to be approved, has to stay reachable: its places, rooms and
             terms are managed from these pages, and the one person who can put a
             suspension right is the admin — who would otherwise find the tab gone and no
             way back in. */
          stakes = all.filter(s => s.status !== "archived").map(s => ({
            ...roleFlags("super_admin", true),
            id: s.id, name: s.name,
            label: s.label || (s.org_kind === "district" ? "District" : "Stake"),
            kind: s.org_kind || "stake", status: s.status, pending: false }));
        }
        state = { user, stakes, joined, fetchedAt: Date.now() };
        try {
          shelf().setItem(STORE, JSON.stringify({ stakes, joined, at: state.fetchedAt }));
        } catch { /* a full tab still works for this visit */ }
        return state;
      } finally {
        // Never keep a failure. Left in place, every later call would be handed this same
        // rejected promise and the portal would stay broken until a hard reload.
        pending = null;
      }
    })();
    return pending;
  }

  /* The person on the device is the person the shell must show.

     The context is remembered from a moment ago, and in that moment the profile can have
     changed: a picture just uploaded, a name just corrected, or a whole other person
     signed in on a shared phone. So the profile is read again here and folded in, and
     the shell never greets somebody who is not the one holding the token. */
  function freshen() {
    const live = API.getUser();
    if (!state || !live || !live.id) return;
    if (!state.user || state.user.id !== live.id
        || state.user.photo_url !== live.photo_url) {
      state = { ...state, user: live };
    }
  }

  function current() {
    freshen();
    return state;
  }

  /* The stake this portal session is pointed at. Remembered per person so switching
     a stake survives navigation, and validated so a deleted stake never strands us.
     The choice is worked out from a state already in hand, without a promise, so a
     screen can be painted in the same tick a person taps. */
  function stakeOf(s) {
    if (!s || !s.stakes.length) return null;
    const saved = +(localStorage.getItem(KEY) || 0);
    return s.stakes.find(x => x.id === saved) || s.stakes[0];
  }

  async function stake(force) {
    const s = await load(force);
    return stakeOf(s);
  }

  function setStake(id) {
    localStorage.setItem(KEY, String(id));
  }

  function clear() { state = null; unreadState = { total: 0, stakes: [], at: 0 };
    localStorage.removeItem(KEY);
    [localStorage, sessionStorage].forEach(store => {
      try { store.removeItem(STORE); store.removeItem(UNREAD_KEY); }
      catch { /* nothing kept there */ }
    }); }

  /* -------- permissions for the stake currently in view -------- */
  /* Flags for one stake by id — used by the older pages that still work from a
     stake id. A portal admin is never a member, so they govern whatever they view. */
  async function flags(stakeId) {
    const s = await load();
    if (s.user.is_super_admin) return roleFlags("super_admin", true);
    const hit = s.stakes.find(x => x.id === +stakeId);
    return hit || roleFlags(null, false);
  }

  /* What a page may offer in this stake, keyed to the same names the server's dashboard
     returns in its `can` map (see app/dashboard.py) and the guards in deps.py, so a
     button that is shown is a button that will be accepted.
     Paperwork — settings, the roster, rotating a code, approvals — is the admin's alone.
     Running the place — places, rooms, terms, anyone's class — is admin plus the
     missionaries. A teacher runs one thing only: the classes they open themselves.
     Watching — analytics, records, contact lists — also covers the presidents. */
  function can(stakeInfo, what) {
    if (!stakeInfo) return false;
    switch (what) {
      case "govern":      return stakeInfo.monitor;        // sees the whole tenant
      case "settings":    return stakeInfo.admin;          // branding, check-in windows
      case "invite":      return stakeInfo.admin;          // rotate the code
      case "viewInvite":  return stakeInfo.manage;         // read it
      case "members":     return stakeInfo.admin;          // add / remove / appoint people
      case "approvals":   return stakeInfo.admin;          // confirm join requests
      case "places":      return stakeInfo.manage;         // places and rooms
      case "terms":       return stakeInfo.manage;         // academic terms
      case "courses":     return stakeInfo.manage;         // edit or archive anyone's class
      case "newCourse":   return stakeInfo.manage || stakeInfo.instructor;  // open a class
      case "claim":       return stakeInfo.manage || stakeInfo.instructor;
      case "attendance":  return stakeInfo.manage || stakeInfo.instructor;
      case "enrol":       return stakeInfo.student || stakeInfo.manage;
      case "analytics":   return stakeInfo.monitor;
      case "downloads":   return stakeInfo.monitor || stakeInfo.manage;
      case "message":     return true;                     // own class / own students
      case "broadcast":   return stakeInfo.monitor;        // a whole role, or the tenant
      case "contacts":    return stakeInfo.monitor || stakeInfo.instructor;
      default:            return false;
    }
  }

  /* -------- unread badge -------- */
  async function unread(force) {
    if (!API.getToken()) return unreadState;
    if (!force && Date.now() - unreadState.at < 20000) return unreadState;
    try {
      const r = await API.get("/api/messages/unread");
      unreadState = { total: r.total, stakes: r.stakes, at: Date.now() };
      saveUnread();
    } catch { /* keep the last known count */ }
    return unreadState;
  }
  function saveUnread() {
    try { shelf().setItem(UNREAD_KEY, JSON.stringify(unreadState)); }
    catch { /* a full tab still shows the count for this visit */ }
  }
  function unreadNow() { return unreadState; }
  function markRead(n) {
    unreadState.total = Math.max(0, unreadState.total - n);
    unreadState.at = Date.now();
    saveUnread();
  }
  function resetUnread() { unreadState = { total: 0, stakes: [], at: 0 }; saveUnread(); }

  return { load, current, stake, stakeOf, setStake, clear, can, flags, unread, unreadNow,
           markRead, resetUnread, ROLE_LABELS, roleFlags };
})();
