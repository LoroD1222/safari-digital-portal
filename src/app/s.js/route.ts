// The Safari Digital snippet for client websites that aren't on Vercel (WordPress etc.):
//   <script src="https://PORTAL/s.js" data-key="FORM_KEY" defer></script>
// 1. Counts page views (anonymous, no cookies) → /api/track
// 2. Sends a copy of every inquiry form submitted on the site → /api/inquiries
// 3. Remembers utm_* / fbclid from the landing page so inquiries show which ad they came from.
const SCRIPT = String.raw`(function () {
  var me = document.currentScript; if (!me) return;
  var key = me.getAttribute("data-key"); if (!key) return;
  var base = new URL(me.src).origin;
  var store = window.sessionStorage;

  // Ad tracking from the landing URL, kept for the whole visit.
  try {
    var q = new URLSearchParams(location.search), keep = {}, any = false;
    ["utm_source", "utm_medium", "utm_campaign", "fbclid"].forEach(function (k) { var v = q.get(k); if (v) { keep[k] = v; any = true; } });
    if (any) store.setItem("sd_utm", JSON.stringify(keep));
  } catch (e) {}

  // Page view
  try {
    var body = JSON.stringify({ k: key, p: location.pathname, r: document.referrer || "" });
    if (navigator.sendBeacon) navigator.sendBeacon(base + "/api/track", new Blob([body], { type: "text/plain" }));
    else fetch(base + "/api/track", { method: "POST", body: body, keepalive: true, mode: "no-cors" });
  } catch (e) {}

  // Forms
  function cookie(n) { var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : undefined; }
  function labelOf(el) {
    var t = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("autocomplete")];
    if (el.id) { var l = document.querySelector('label[for="' + el.id + '"]'); if (l) t.push(l.textContent); }
    var p = el.closest("label"); if (p) t.push(p.textContent);
    return t.filter(Boolean).join(" ").toLowerCase();
  }
  function prettyLabel(el) {
    var l = el.id && document.querySelector('label[for="' + el.id + '"]');
    var s = (l && l.textContent) || el.placeholder || el.getAttribute("aria-label") || el.name || "";
    return s.replace(/[\*:\s]+$/g, "").replace(/form_fields\[|\]|your-|wpforms\[fields\]\[/g, "").trim();
  }
  var RULES = [
    ["email", /e-?mail/], ["phone", /phone|whats ?app|tel|mobile|simu/], ["first", /first ?name|fname|given/], ["last", /last ?name|lname|surname|family/],
    ["name", /name|jina/], ["travellers", /travell?ers|people|guests|adults|pax|persons|group size|how many/],
    ["travel_dates", /date|arriv|depart|when|month|travel ?period/], ["country", /country|nationality|from where/],
    ["interested_in", /tour|safari|package|interest|trip|itinerar|destination|program/], ["message", /message|comment|inquir|enquir|question|request|details|notes|ujumbe/]
  ];
  var sent = {};
  document.addEventListener("submit", function (ev) {
    try {
      var f = ev.target; if (!f || f.tagName !== "FORM") return;
      if (f.hasAttribute("data-sd-ignore") || f.getAttribute("role") === "search" || f.querySelector('input[type="password"]')) return;
      if ((f.action || "").indexOf("/api/inquiries") >= 0) return; // already posts to the portal
      var d = {}, extra = [];
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name && !el.id) return;
        var type = (el.type || "").toLowerCase();
        if (["hidden", "submit", "button", "password", "file", "reset"].indexOf(type) >= 0) return;
        if ((type === "checkbox" || type === "radio") && !el.checked) return;
        var v = (el.value || "").trim(); if (!v) return;
        var desc = labelOf(el), field = type === "email" ? "email" : type === "tel" ? "phone" : null;
        if (!field) for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(desc)) { field = RULES[i][0]; break; }
        if (field && !d[field]) d[field] = v.slice(0, 2000);
        else extra.push((prettyLabel(el) || "Field") + ": " + v.slice(0, 500));
      });
      if (!d.name && (d.first || d.last)) d.name = [d.first, d.last].filter(Boolean).join(" ");
      if (!d.email && !d.phone) return; // not an inquiry (e.g. a search box)
      if (!d.name) d.name = d.email ? d.email.split("@")[0] : "Website visitor";
      var msg = [d.message].concat(extra).filter(Boolean).join("\n");
      var fp = [d.name, d.email, d.phone, msg].join("|");
      if (sent[fp] && Date.now() - sent[fp] < 15000) return; sent[fp] = Date.now();
      var utm = {}; try { utm = JSON.parse(store.getItem("sd_utm") || "{}"); } catch (e) {}
      var payload = {
        key: key, name: d.name, email: d.email, phone: d.phone, country: d.country, interested_in: d.interested_in,
        travel_dates: d.travel_dates, travellers: d.travellers,
        message: (msg ? msg + "\n\n" : "") + "Sent from: " + location.hostname + location.pathname,
        utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign, fbclid: utm.fbclid,
        fbc: cookie("_fbc"), fbp: cookie("_fbp")
      };
      fetch(base + "/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
    } catch (e) {}
  }, true);
})();`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
