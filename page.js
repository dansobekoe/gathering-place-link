/* The one job here is to answer a question a person cannot answer themselves: is the
   portal open right now, and if so where.
   Two fetches, no framework. `latest.js` is rewritten by the launcher on the
   administrator's laptop each time he starts it, and is asked with a fresh query string,
   because GitHub Pages hands the same file to everybody for ten minutes — a link read
   through a stale copy is a link that points at yesterday's dead tunnel. */
(function () {
  'use strict';

  var PING_MS = 9000;
  var RECHECK_S = 60;
  var TUNNEL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

  var lamp = document.getElementById('lamp');
  var head = document.getElementById('headline');
  var note = document.getElementById('note');
  var enter = document.getElementById('enter');
  var again = document.getElementById('again');
  var stamp = document.getElementById('stamp');

  var timer = null;

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    try {
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (tooOld) {
      return d.toString();
    }
  }

  function look(kind, title, body, url, dim) {
    lamp.className = 'lamp is-' + kind;
    head.textContent = title;
    note.textContent = body;
    if (url) {
      enter.href = url;
      enter.className = dim ? 'enter is-dim' : 'enter';
      enter.textContent = dim ? 'Try the portal anyway' : 'Enter the portal';
      enter.hidden = false;
    } else {
      enter.hidden = true;
      enter.removeAttribute('href');
    }
  }

  function stamped(published, checked) {
    var bits = [];
    if (published) bits.push('Link published ' + published);
    else bits.push('No link published yet');
    bits.push('checked ' + checked);
    stamp.textContent = bits.join('  ·  ');
  }

  function probe(url, then) {
    var settled = false;
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    function done(alive) {
      if (settled) return;
      settled = true;
      clearTimeout(stop);
      then(alive);
    }
    // A phone on a slow MTN connection is not evidence the portal is down, so the ask is
    // cut off — and reported as "not answering" — rather than left to hang.
    var stop = setTimeout(function () { done(false); }, PING_MS + 1500);
    if (ctrl) setTimeout(function () { try { ctrl.abort(); } catch (already) {} }, PING_MS);
    fetch(url + '/api/health', {
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      done(res.status < 500);
    }, function () {
      done(false);
    });
  }

  function report(data, checked) {
    var published = data && data.updated_at ? when(data.updated_at) : null;
    var url = data && data.url ? String(data.url) : '';

    if (!url) {
      look('off', 'The portal is not open yet',
           'When the administrator starts it, today’s link appears here on its own — '
           + 'this page never changes address, so keep it.',
           null, false);
      stamped(published, checked);
      return;
    }

    if (!TUNNEL.test(url)) {
      look('wait', 'The published link looks wrong',
           'The address on the portal’s own list is not one the portal recognises, so it '
           + 'is not offered as a door. Tell the administrator and start the portal again.',
           null, false);
      stamped(published, checked);
      return;
    }

    look('wait', 'Checking whether it answers', 'One moment.', url, true);
    probe(url, function (alive) {
      if (alive) {
        look('live', 'Open right now',
             'The portal is up. Sign in, or register and the administrator will approve '
             + 'your account.', url, false);
      } else {
        look('wait', 'A link is published, but nothing is answering',
             'The portal runs from a laptop in Accra, and it is only reachable while that '
             + 'window is open and the laptop is awake. It may simply be switched off.',
             url, true);
      }
      stamped(published, checked);
    });
  }

  function load() {
    var old = document.getElementById('payload');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var s = document.createElement('script');
    s.id = 'payload';
    s.src = 'latest.js?t=' + Date.now();
    s.onload = function () {
      var checked = new Date().toLocaleTimeString(undefined, { timeStyle: 'short' });
      report(window.GATHERING_PLACE || null, checked);
    };
    s.onerror = function () {
      var checked = new Date().toLocaleTimeString(undefined, { timeStyle: 'short' });
      look('off', 'This page could not read its own list',
           'GitHub did not answer. That is the page’s own fault to report, not the '
           + 'portal’s: check your connection and try again.', null, false);
      stamped(null, checked);
    };
    document.head.appendChild(s);
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = null;
    if (document.visibilityState === 'visible') {
      timer = setInterval(load, RECHECK_S * 1000);
    }
  }

  again.addEventListener('click', load);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') load();
    schedule();
  });

  load();
  schedule();
})();
