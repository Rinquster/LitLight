// js/hint-injector.js
//
// Подсказки к тексту главы из books/<id>/hint-rules.json:
//  - правило { chapter, text, hint } ищется в первом <p>/<blockquote> главы,
//    чей textContent содержит text (точно, иначе после схлопывания пробелов);
//  - оборачивается только первое вхождение и только внутри одного текстового узла;
//  - подсказка — <u data-hint>, тултип по наведению, фокусу, клику и Enter/пробелу.
// Ненайденные якоря передаются в reportWarning, если он задан.

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizeSpaces(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

class HintInjector {
  constructor({ rules, reportWarning } = {}) {
    this.rules = rules || [];
    this.reportWarning = reportWarning || (() => {});
    this.tooltip = null;
    this.activeNode = null;
    this.scrollContainer = null;
    this.boundClose = (event) => {
      if (event.key === "Escape") this.hideTooltip();
    };
    this.boundOutsidePointer = (event) => {
      if (!this.tooltip) return;
      if (event.target === this.activeNode || this.tooltip.contains(event.target)) return;
      this.hideTooltip();
    };
    this.boundReposition = () => this.repositionTooltip();
  }

  apply(chapterNumber, container) {
    const rules = this.rules.filter((rule) => Number(rule.chapter) === Number(chapterNumber));
    for (const rule of rules) {
      const wrapped = this.wrapFirstMatch(container, rule);
      if (!wrapped) {
        this.reportWarning({
          type: "hint",
          id: rule.id || rule.text,
          chapter: chapterNumber,
          anchor: rule.text,
        });
      }
    }
    this.bindTooltips(container);
  }

  wrapFirstMatch(container, rule) {
    const textContainers = Array.from(container.querySelectorAll("p, blockquote"));
    const exactContainer = textContainers.find((item) => item.textContent.includes(rule.text));
    const target =
      exactContainer ||
      textContainers.find((item) => normalizeSpaces(item.textContent).includes(normalizeSpaces(rule.text)));
    if (!target) return false;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeValue.includes(rule.text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const node = walker.nextNode();
    if (!node) return false;
    const index = node.nodeValue.indexOf(rule.text);
    const before = node.nodeValue.slice(0, index);
    const match = node.nodeValue.slice(index, index + rule.text.length);
    const after = node.nodeValue.slice(index + rule.text.length);
    const hint = document.createElement("u");
    hint.dataset.hint = rule.hint;
    hint.tabIndex = 0;
    hint.setAttribute("role", "button");
    hint.setAttribute("aria-label", `Есть подсказка: ${match}`);
    hint.textContent = match;
    const fragment = document.createDocumentFragment();
    if (before) fragment.append(document.createTextNode(before));
    fragment.append(hint);
    if (after) fragment.append(document.createTextNode(after));
    node.replaceWith(fragment);
    return true;
  }

  bindTooltips(container) {
    this.scrollContainer = container.closest(".reading-area");
    container.querySelectorAll("u[data-hint]").forEach((node) => {
      node.addEventListener("mouseenter", () => this.showTooltip(node));
      node.addEventListener("mouseleave", () => this.hideTooltip());
      node.addEventListener("focus", () => this.showTooltip(node));
      node.addEventListener("blur", () => this.hideTooltip());
      node.addEventListener("click", (event) => {
        event.preventDefault();
        this.showTooltip(node);
      });
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.showTooltip(node);
        }
        if (event.key === "Escape") this.hideTooltip();
      });
    });
    document.addEventListener("keydown", this.boundClose);
    document.addEventListener("pointerdown", this.boundOutsidePointer);
    window.addEventListener("resize", this.boundReposition);
    this.scrollContainer?.addEventListener("scroll", this.boundReposition, { passive: true });
  }

  showTooltip(node) {
    this.hideTooltip();
    const tooltip = document.createElement("div");
    tooltip.className = "hint-tooltip";
    tooltip.id = `hint-tooltip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = node.dataset.hint;
    document.body.append(tooltip);
    this.tooltip = tooltip;
    this.activeNode = node;
    node.setAttribute("aria-describedby", tooltip.id);
    this.repositionTooltip();
  }

  repositionTooltip() {
    if (!this.tooltip || !this.activeNode?.isConnected) {
      this.hideTooltip();
      return;
    }
    const rect = this.activeNode.getBoundingClientRect();
    const toolbarBottom = document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 0;
    if (rect.bottom < toolbarBottom || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      this.hideTooltip();
      return;
    }
    const margin = window.innerWidth <= 520 ? 10 : 12;
    const gap = 10;
    const maxWidth = Math.max(
      180,
      Math.min(window.innerWidth - margin * 2, window.innerWidth <= 768 ? window.innerWidth * 0.82 : 460),
    );
    this.tooltip.style.maxWidth = `${maxWidth}px`;
    this.tooltip.style.maxHeight = "";
    this.tooltip.style.overflowY = "";
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const safeTop = Math.max(margin, toolbarBottom + margin);
    const safeBottom = window.innerHeight - margin;
    const spaceAbove = rect.top - safeTop - gap;
    const spaceBelow = safeBottom - rect.bottom - gap;
    const placeAbove = spaceAbove >= tooltipRect.height || spaceAbove > spaceBelow;
    const availableHeight = Math.max(120, placeAbove ? spaceAbove : spaceBelow);
    const height = Math.min(tooltipRect.height, availableHeight);
    if (tooltipRect.height > availableHeight) {
      this.tooltip.style.maxHeight = `${availableHeight}px`;
      this.tooltip.style.overflowY = "auto";
    }
    const left = clamp(
      rect.left + rect.width / 2 - tooltipRect.width / 2,
      margin,
      window.innerWidth - tooltipRect.width - margin,
    );
    const rawTop = placeAbove ? rect.top - height - gap : rect.bottom + gap;
    const top = clamp(rawTop, safeTop, safeBottom - height);
    this.tooltip.dataset.placement = placeAbove ? "top" : "bottom";
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    this.activeNode?.removeAttribute("aria-describedby");
    this.tooltip?.remove();
    this.tooltip = null;
    this.activeNode = null;
  }

  destroy() {
    this.hideTooltip();
    document.removeEventListener("keydown", this.boundClose);
    document.removeEventListener("pointerdown", this.boundOutsidePointer);
    window.removeEventListener("resize", this.boundReposition);
    this.scrollContainer?.removeEventListener("scroll", this.boundReposition);
  }
}

export default HintInjector;
