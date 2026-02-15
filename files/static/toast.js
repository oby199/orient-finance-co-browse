"use strict";
(function () {
  const container = document.createElement("div");
  container.id = "toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "true");
  container.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
  document.body.appendChild(container);

  window.showToast = function (msg, type) {
    type = type || "info";
    const el = document.createElement("div");
    el.className = "toast-msg toast-" + type;
    el.textContent = msg;
    el.style.cssText = "padding:12px 20px;border-radius:8px;background:#1e3a5f;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:90vw;";
    if (type === "error") el.style.background = "#c0392b";
    if (type === "success") el.style.background = "#27ae60";
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s";
      setTimeout(() => el.remove(), 300);
    }, 3000);
  };
})();
