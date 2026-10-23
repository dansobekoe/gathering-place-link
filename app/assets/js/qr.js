/* QR helpers: render (qrcodejs) + camera scan (jsQR). No build step. */
const QR = (() => {
  /* The drawn code is a picture with no words of its own, and the vendor leaves its
     <img> without a description. `label` names it for a screen reader in words that say
     what it is for, because "qr-code-9f2c" — its data — is not an answer. */
  function render(host, text, size = 190, label = "QR code") {
    host.innerHTML = "";
    new QRCode(host, {                       // eslint-disable-line no-new
      text, width: size, height: size,
      colorDark: "#0f172a", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", label);
    const img = host.querySelector("img");
    if (img) img.alt = "";
  }

  /* The decoder is a quarter of a megabyte and the check-in camera is the only thing
     that reads a code, so the shell does not carry it — it arrives when a scan starts.
     The service worker keeps it after the first visit, so only the first scan pays for
     the download, and it loads alongside the camera prompt rather than after it. */
  let jsqrLoading = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (!jsqrLoading) {
      jsqrLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "assets/js/vendor/jsqr.js";
        s.onload = resolve;
        s.onerror = () => { jsqrLoading = null; reject(new Error("decoder failed to load")); };
        document.head.appendChild(s);
      });
    }
    return jsqrLoading;
  }

  /* Four different things can stop the camera and each needs a different fix from the
     person holding the phone, so "camera unavailable" is not an answer. The browser
     hands us e.name; the in-app check has to come first because WhatsApp and Instagram
     hide mediaDevices entirely and a link opened from chat is the common case here. */
  function cameraHelp(e) {
    const ua = navigator.userAgent || "";
    if (/WhatsApp|Instagram|Facebook|Messenger|Snapchat|TikTok/i.test(ua))
      return "Apps like WhatsApp block their own camera. Open this link in Chrome or Safari and try again.";
    if (!window.isSecureContext)
      return "A camera needs a secure web address. Use the https:// link your leader shared, not an IP address.";
    switch (e && e.name) {
      case "NotAllowedError": case "SecurityError":
        return "Camera permission was declined. Tap the lock in the address bar, allow the camera, then try again.";
      case "NotFoundError": case "DevicesNotFoundError":
        return "No camera found on this device — type the 6-digit code instead.";
      case "NotReadableError": case "TrackStartError":
        return "Another app is holding the camera. Close your video-call or camera app, then try again.";
      case "OverconstrainedError":
        return "This camera can't be used — type the 6-digit code instead.";
      default:
        return "The camera didn't start. Try again, or type the 6-digit code below.";
    }
  }

  // Streams the rear camera into `video` and reports decoded text via onDetect.
  // Returns a stop() that releases the camera.
  async function startScanner(video, onDetect, onErr) {
    let stream = null, timer = null, stopped = false;
    const decoder = loadJsQR();
    decoder.catch(() => {
      if (stopped) return;
      stop();
      onErr && onErr("The scanner couldn't download. Check your connection and try again — or type the 6-digit code below.");
    });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      stopped = true;
      onErr && onErr(cameraHelp());
      return () => {};
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // ideal, not exact: plenty of laptops and in-app webviews have no rear lens,
        // and failing here would cost a student the class.
        video: { facingMode: { ideal: "environment" } }, audio: false,
      });
    } catch (e) {
      stopped = true;
      onErr && onErr(cameraHelp(e));
      return () => {};
    }
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    try { await video.play(); } catch (e) { /* autoplay blocked; frames still decode */ }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    /* Decoding full-resolution frames pins a mid-range phone: the preview stutters and
       codes get missed. 640px is far more than a projected QR needs. */
    const MAX_EDGE = 640;
    let last = "", lastAt = 0, dark = 0;
    timer = setInterval(() => {
      if (stopped) return;
      if (!window.jsQR) return;          // the decoder is still arriving
      if (!video.videoWidth) {
        // The stream opened but no picture has arrived. Say so after a few seconds
        // rather than leaving the person staring at a black box that looks broken.
        if (++dark > 28) {
          stop();
          onErr && onErr("The camera started but sent no picture. Close this page, reopen it and try again — or type the 6-digit code below.");
        }
        return;
      }
      dark = 0;
      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(frame.data, frame.width, frame.height);
      if (!found || !found.data) return;
      if (found.data === last && Date.now() - lastAt < 3000) return; // debounce repeats
      last = found.data; lastAt = Date.now();
      onDetect(found.data);
    }, 220);

    function stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    return stop;
  }

  return { render, startScanner };
})();
