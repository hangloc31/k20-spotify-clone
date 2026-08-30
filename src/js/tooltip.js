let tooltipEl = null;
let showTimer = null;
let currentTarget = null;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.id = "app-tooltip";
  tooltipEl.setAttribute("role", "tooltip");
  tooltipEl.setAttribute("hidden", "");
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function getText(target) {
  if (!target) return "";
  if (target.dataset.tooltip) return target.dataset.tooltip;
  const aria = target.getAttribute("aria-label");
  if (aria && target.matches('button, a, [role="button"]')) return aria;
  return "";
}

function positionTooltip(target) {
  const el = ensureTooltipEl();
  const rect = target.getBoundingClientRect();
  const gap = 8;
  const pos = target.dataset.tooltipPos || "top";
  // reset to measure
  el.style.left = "0px";
  el.style.top = "0px";
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  let top;
  let actualPos = pos;
  if (pos === "bottom") {
    top = rect.bottom + gap;
    if (top + th > vh - 8) {
      top = rect.top - th - gap;
      actualPos = "top";
    }
  } else {
    top = rect.top - th - gap;
    if (top < 8) {
      top = rect.bottom + gap;
      actualPos = "bottom";
    }
  }
  left = Math.max(8, Math.min(left, vw - tw - 8));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.dataset.pos = actualPos;
}

function showTooltip(target) {
  const text = getText(target);
  if (!text) return;
  const el = ensureTooltipEl();
  el.textContent = text;
  el.removeAttribute("hidden");
  // need layout before positioning
  requestAnimationFrame(() => positionTooltip(target));
  const id = el.id;
  if (!target.hasAttribute("aria-describedby")) {
    target.dataset.prevDescribedby = target.getAttribute("aria-describedby") || "";
    target.setAttribute("aria-describedby", id);
  }
  currentTarget = target;
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.setAttribute("hidden", "");
  if (currentTarget) {
    const prev = currentTarget.dataset.prevDescribedby;
    if (prev === "") currentTarget.removeAttribute("aria-describedby");
    else if (prev !== undefined) currentTarget.setAttribute("aria-describedby", prev);
    delete currentTarget.dataset.prevDescribedby;
    currentTarget = null;
  }
}

function scheduleShow(target) {
  clearTimeout(showTimer);
  showTimer = setTimeout(() => showTooltip(target), 300);
}

function cancelShow() {
  clearTimeout(showTimer);
  showTimer = null;
  // delay hide slightly to avoid flicker when moving between icon and tooltip
  if (tooltipEl && !tooltipEl.hasAttribute("hidden")) {
    // immediate hide if not hovering tooltip
    hideTooltip();
  }
}

export function initTooltips() {
  ensureTooltipEl();

  // Use delegation for dynamic content (search detail, section, etc.)
  document.addEventListener("mouseenter", (e) => {
    const target = e.target.closest("[data-tooltip], button[aria-label], a[aria-label]");
    if (!target) return;
    // only icon-only or explicit data-tooltip; ignore large text buttons with visible label
    const hasDataTooltip = !!target.dataset.tooltip;
    const isIconOnly = target.matches('button[aria-label], a[aria-label]') && !hasDataTooltip;
    // For player/detail buttons we rely on aria-label fallback, so allow
    if (!hasDataTooltip && !isIconOnly) return;
    // Ignore if element has visible text content that already acts as label (e.g., pill-button with text)
    if (!hasDataTooltip && target.textContent.trim().length > 0 && target.children.length === 0) {
      // text button like Follow - don't tooltip, aria-label duplicates
      const style = window.getComputedStyle(target);
      if (target.offsetWidth > 60) return;
    }
    scheduleShow(target);
  }, true);

  document.addEventListener("mouseleave", (e) => {
    const target = e.target.closest("[data-tooltip], button[aria-label], a[aria-label]");
    if (!target) return;
    cancelShow();
  }, true);

  document.addEventListener("focusin", (e) => {
    const target = e.target.closest("[data-tooltip], button[aria-label], a[aria-label]");
    if (!target) return;
    clearTimeout(showTimer);
    showTooltip(target);
  });

  document.addEventListener("focusout", (e) => {
    const target = e.target.closest("[data-tooltip], button[aria-label], a[aria-label]");
    if (!target) return;
    hideTooltip();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelShow();
      hideTooltip();
    }
  });

  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
}

// Auto-sync: when aria-label changes via JS (player), keep data-tooltip in sync if element had data-tooltip
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "attributes" && m.attributeName === "aria-label") {
      const t = m.target;
      if (t.dataset.tooltip !== undefined) {
        // if element was using data-tooltip, keep it synced to aria-label for dynamic player labels
        // but don't overwrite explicit static data-tooltip like "Home"
        // Only sync if data-tooltip was initially same as aria-label or is dynamic player control
        const isPlayerControl = t.matches("[data-player-like], [data-player-shuffle], [data-player-repeat], [data-player-mute], [data-player-play], [data-player-prev], [data-player-next]");
        if (isPlayerControl) {
          t.dataset.tooltip = t.getAttribute("aria-label") || "";
          if (currentTarget === t && tooltipEl && !tooltipEl.hasAttribute("hidden")) {
            tooltipEl.textContent = t.dataset.tooltip;
            positionTooltip(t);
          }
        }
      } else if (t.matches("[data-player-like], [data-player-shuffle], [data-player-repeat], [data-player-mute], [data-player-play], [data-player-prev], [data-player-next], [data-detail-follow]")) {
        // For elements without data-tooltip but using aria-label as tooltip, update visible tooltip
        if (currentTarget === t && tooltipEl && !tooltipEl.hasAttribute("hidden")) {
          tooltipEl.textContent = t.getAttribute("aria-label") || "";
          positionTooltip(t);
        }
      }
    }
  }
});
observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["aria-label", "data-tooltip"] });
