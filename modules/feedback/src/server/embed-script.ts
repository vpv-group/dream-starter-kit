/**
 * The loader a site pastes in (`<script src=".../api/mod/feedback/embed.js">`).
 * Vanilla, no dependencies, safe to include twice. It mounts iframes of
 * /embed/feedback…, resizes them from `postMessage` events sent by that
 * origin only, and offers a changelog badge + side panel.
 *
 *   DreamFeedback.render({ selector, tab?: "feedback"|"roadmap"|"changelog", board?, theme? })
 *   DreamFeedback.open({ tab?, board? })            // side panel
 *   DreamFeedback.changelogBadge({ selector })      // dot when there's news
 *   <div data-dream-feedback data-tab="roadmap"></div>   // auto-mounted
 *   <button data-dream-changelog-badge>What's new</button>
 */
export function buildEmbedScript(base: string, enabled: boolean): string {
  const origin = JSON.stringify(base.replace(/\/$/, ""));
  if (!enabled) {
    return `console.warn("[DreamFeedback] The feedback widget is turned off for this site (Feedback settings → Widget).");\n`;
  }
  return `(function () {
  "use strict";
  if (window.DreamFeedback) return;
  var BASE = ${origin};
  var SEEN_KEY = "dream-feedback:changelog-seen";

  function path(tab) {
    return tab === "roadmap" ? "/roadmap" : tab === "changelog" ? "/changelog" : "";
  }
  function src(o) {
    var q = [];
    if (o.board) q.push("board=" + encodeURIComponent(o.board));
    if (o.theme) q.push("theme=" + encodeURIComponent(o.theme));
    if (o.panel) q.push("panel=1");
    return BASE + "/embed/feedback" + path(o.tab) + (q.length ? "?" + q.join("&") : "");
  }
  function frame(o) {
    var f = document.createElement("iframe");
    f.src = src(o);
    f.title = o.title || "Feedback";
    f.setAttribute("data-dream-feedback-frame", "");
    f.setAttribute("allow", "clipboard-write");
    f.style.cssText = "width:100%;border:0;display:block;color-scheme:normal;height:" + (o.height || 560) + "px";
    return f;
  }
  function el(selector) {
    return typeof selector === "string" ? document.querySelector(selector) : selector;
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== BASE || !e.data || typeof e.data !== "object") return;
    var frames = document.querySelectorAll("iframe[data-dream-feedback-frame]");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.contentWindow !== e.source) continue;
      if (e.data.type === "dream-feedback:resize" && !f.hasAttribute("data-fixed")) {
        var h = Math.max(200, Math.min(Number(e.data.height) || 0, 20000));
        f.style.height = h + "px";
      } else if (e.data.type === "dream-feedback:close") {
        close();
      }
    }
  });

  function render(o) {
    o = o || {};
    var host = el(o.selector);
    if (!host) { console.warn("[DreamFeedback] no element for", o.selector); return null; }
    var f = frame(o);
    host.innerHTML = "";
    host.appendChild(f);
    return f;
  }

  var panel = null;
  function close() {
    if (panel) { panel.remove(); panel = null; document.removeEventListener("keydown", onKey); }
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function open(o) {
    o = o || {};
    close();
    panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", o.title || "Feedback");
    panel.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:flex-end;background:rgba(0,0,0,.3)";
    panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
    var box = document.createElement("div");
    box.style.cssText = "position:relative;width:min(440px,100vw);height:100%;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.15)";
    var x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.textContent = "\\u00d7";
    x.style.cssText = "position:absolute;top:8px;right:10px;z-index:1;width:32px;height:32px;border:0;border-radius:6px;background:rgba(0,0,0,.06);font-size:20px;line-height:1;cursor:pointer";
    x.addEventListener("click", close);
    var f = frame({ tab: o.tab, board: o.board, theme: o.theme, panel: true, title: o.title });
    f.setAttribute("data-fixed", "");
    f.style.height = "100%";
    box.appendChild(x);
    box.appendChild(f);
    panel.appendChild(box);
    document.body.appendChild(panel);
    document.addEventListener("keydown", onKey);
    if (o.tab === "changelog") markSeen();
  }

  function seen() { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (e) {}
    var dots = document.querySelectorAll("[data-dream-feedback-dot]");
    for (var i = 0; i < dots.length; i++) dots[i].remove();
  }
  function changelogBadge(o) {
    o = o || {};
    var host = el(o.selector);
    if (!host) return;
    host.addEventListener("click", function (e) { e.preventDefault(); open({ tab: "changelog", theme: o.theme, title: "What's new" }); });
    fetch(BASE + "/api/mod/feedback/embed/latest")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.latest) return;
        var last = seen();
        if (last && last >= d.latest) return;
        var dot = document.createElement("span");
        dot.setAttribute("data-dream-feedback-dot", "");
        dot.setAttribute("aria-label", "New updates");
        dot.style.cssText = "display:inline-block;width:8px;height:8px;margin-left:6px;border-radius:50%;background:#ef4444;vertical-align:middle";
        host.appendChild(dot);
      })
      .catch(function () {});
  }

  function auto() {
    var nodes = document.querySelectorAll("[data-dream-feedback]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.tagName === "IFRAME" || n.getAttribute("data-mounted")) continue;
      n.setAttribute("data-mounted", "");
      render({ selector: n, tab: n.getAttribute("data-tab"), board: n.getAttribute("data-board"), theme: n.getAttribute("data-theme") });
    }
    var badges = document.querySelectorAll("[data-dream-changelog-badge]");
    for (var j = 0; j < badges.length; j++) {
      var b = badges[j];
      if (b.getAttribute("data-mounted")) continue;
      b.setAttribute("data-mounted", "");
      changelogBadge({ selector: b, theme: b.getAttribute("data-theme") });
    }
  }

  window.DreamFeedback = { render: render, open: open, close: close, changelogBadge: changelogBadge };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
})();
`;
}
