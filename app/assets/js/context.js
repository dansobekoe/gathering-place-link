/* Portal context: which stake is being worked on, what the signed-in person may do
   there, and the unread-message badge the sidebar shows.

   A portal admin is not a member of any stake, so their stake list comes from the
   admin API instead of /api/my-stakes — that is what lets an admin open any stake
   without joining it first. */
const Ctx = (() => {
  const KEY = "gp_stake";
  let state = null;          // { user, stakes, fetchedAt }
  let pending = null;        // in-flight promise, so parallel mounts share one call
  let unreadState = { total: 0, stakes: [], at: 0 };

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
    if (state && !force && Date.now() - state.fetchedAt < 60000) return state;
    if (pending && !force) return pending;
    pending = (async () => {
      try {
        const user = API.getUser() || {};
        const mine = await API.get("/api/my-stakes");
        const joined = mine
          .filter(s => s.stake_status === "active" && s.member_status === "active")
          .map(s => ({ ...roleFlags(s.role, false),
                       id: s.stake_id, name: s.stake_name,
                       label: s.label || "Stake", kind: s.org_kind || "stake",
                       pending: false }));
        let stakes = joined;
        if (user.is_super_admin) {
          const all = await API.get("/api/admin/stakes");
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
        return state;
      } finally {
        // Never keep a failure. Left in place, every later call would be handed this same
        // rejected promise and the portal would stay broken until a hard reload.
        pending = null;
      }
    })();
    return pending;
  }

  function current() {
    return state;
  }

  /* The stake this portal session is pointed at. Remembered per person so switching
     a stake survives navigation, and validated so a deleted stake never strands us. */
  async function stake(force) {
    const s = await load(force);
    if (!s.stakes.length) return null;
    const saved = +(localStorage.getItem(KEY) || 0);
    return s.stakes.find(x => x.id === saved) || s.stakes[0];
  }

  function setStake(id) {
    localStorage.setItem(KEY, String(id));
  }

  function clear() { state = null; unreadState = { total: 0, stakes: [], at: 0 };
    localStorage.removeItem(KEY); }

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
    } catch { /* keep the last known count */ }
    return unreadState;
  }
  function markRead(n) {
    unreadState.total = Math.max(0, unreadState.total - n);
    unreadState.at = Date.now();
  }
  function resetUnread() { unreadState = { total: 0, stakes: [], at: 0 }; }

  return { load, current, stake, setStake, clear, can, flags, unread, markRead, resetUnread,
           ROLE_LABELS, roleFlags };
})();
