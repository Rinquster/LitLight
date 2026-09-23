// js/color-picker.js
//
// Окно выбора цвета: превью, HEX и RGB, ползунок оттенка и квадрат
// насыщенность/яркость. Создаётся сразу при конструировании, закрывается
// по крестику, «Отмене», Escape или клику мимо; «Применить» отдаёт цвет в onApply.

import Utils from "./utils.js";

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function parseHex(hex) {
  const raw = String(hex ?? "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split("").map((part) => Number.parseInt(part + part, 16));
    return { r, g, b };
  }
  const full = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!full) return null;
  return {
    r: Number.parseInt(full[1].slice(0, 2), 16),
    g: Number.parseInt(full[1].slice(2, 4), 16),
    b: Number.parseInt(full[1].slice(4, 6), 16),
  };
}

class CustomColorPicker {
  constructor({ label, color, onApply, onClose } = {}) {
    this.label = label || "Выбор цвета";
    this.color = normalizeHex(color) || "#ffffff";
    this.onApply = onApply || (() => {});
    this.onClose = onClose || (() => {});
    this.hsl = rgbToHsl(parseHex(this.color));
    this.abort = new AbortController();
    this.activePointerId = null;
    this.render();
  }

  render() {
    this.node = document.createElement("div");
    this.node.className = "custom-color-picker";
    this.node.setAttribute("role", "dialog");
    this.node.setAttribute("aria-modal", "true");
    this.node.setAttribute("aria-label", this.label);
    this.node.innerHTML = `
      <div class="color-picker-header">
        <h4>${Utils.escapeHtml(this.label)}</h4>
        <button class="close-picker" type="button" data-close aria-label="Закрыть">×</button>
      </div>
      <div class="color-picker-body">
        <div class="color-preview" data-preview></div>
        <div class="color-value-row">
          <label>HEX<input class="color-value-input" data-hex readonly></label>
          <label>RGB<output class="color-rgb-output" data-rgb></output></label>
        </div>
        <div class="hsl-controls">
          <div class="h-slider-container">
            <label for="custom-hue-slider">Оттенок (H)</label>
            <input id="custom-hue-slider" class="hue-slider" data-hue type="range" min="0" max="360" value="${this.hsl.h}">
            <span class="hue-value" data-hue-value>${this.hsl.h}°</span>
          </div>
          <div class="sl-canvas-container">
            <label>Насыщенность / Яркость</label>
            <canvas class="sl-canvas" data-sl width="200" height="200" role="img" aria-label="Насыщенность и яркость"></canvas>
          </div>
        </div>
        <div class="color-picker-actions">
          <button class="cancel-btn" type="button" data-cancel>Отмена</button>
          <button class="apply-btn" type="button" data-apply>Применить</button>
        </div>
      </div>
    `;
    document.body.append(this.node);
    this.preview = this.node.querySelector("[data-preview]");
    this.hexInput = this.node.querySelector("[data-hex]");
    this.rgbOutput = this.node.querySelector("[data-rgb]");
    this.hueSlider = this.node.querySelector("[data-hue]");
    this.hueValue = this.node.querySelector("[data-hue-value]");
    this.canvas = this.node.querySelector("[data-sl]");
    this.ctx = this.canvas.getContext("2d");
    this.bind();
    this.update();
    this.position();
    requestAnimationFrame(() => this.node.classList.add("open", "positioned"));
  }

  bind() {
    const signal = this.abort.signal;
    this.hueSlider.addEventListener("input", (event) => {
      this.hsl.h = Number(event.target.value);
      this.color = hslToHex(this.hsl);
      this.update();
    }, { signal });
    this.canvas.addEventListener("pointerdown", (event) => this.startCanvasDrag(event), { signal });
    this.canvas.addEventListener("pointermove", (event) => this.moveCanvasDrag(event), { signal });
    this.canvas.addEventListener("pointerup", (event) => this.endCanvasDrag(event), { signal });
    this.canvas.addEventListener("pointercancel", (event) => this.endCanvasDrag(event), { signal });
    this.node.querySelector("[data-close]").addEventListener("click", () => this.close(), { signal });
    this.node.querySelector("[data-cancel]").addEventListener("click", () => this.close(), { signal });
    this.node.querySelector("[data-apply]").addEventListener("click", () => {
      this.onApply(this.color);
      this.close();
    }, { signal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    }, { signal });
    document.addEventListener("pointerdown", (event) => {
      if (!this.node.contains(event.target)) this.close();
    }, { signal });
    window.addEventListener("resize", () => this.position(), { signal });
  }

  position() {
    const padding = 20;
    const rect = this.node.getBoundingClientRect();
    const top = clamp((window.innerHeight - rect.height) / 2, padding, Math.max(padding, window.innerHeight - rect.height - padding));
    const left = clamp((window.innerWidth - rect.width) / 2, padding, Math.max(padding, window.innerWidth - rect.width - padding));
    this.node.style.top = `${top}px`;
    this.node.style.left = `${left}px`;
  }

  startCanvasDrag(event) {
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.updateFromCanvas(event);
    event.preventDefault();
  }

  moveCanvasDrag(event) {
    if (this.activePointerId !== event.pointerId) return;
    this.updateFromCanvas(event);
    event.preventDefault();
  }

  endCanvasDrag(event) {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  updateFromCanvas(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    this.hsl.s = Math.round((x / rect.width) * 100);
    this.hsl.l = Math.round(100 - (y / rect.height) * 100);
    this.color = hslToHex(this.hsl);
    this.update();
  }

  setColor(color) {
    const normalized = normalizeHex(color);
    if (!normalized) return;
    this.color = normalized;
    this.hsl = rgbToHsl(parseHex(this.color));
    this.update();
  }

  update() {
    const rgb = parseHex(this.color);
    this.preview.style.backgroundColor = this.color;
    this.hexInput.value = this.color.toUpperCase();
    this.rgbOutput.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    this.hueSlider.value = this.hsl.h;
    this.hueValue.textContent = `${this.hsl.h}°`;
    this.drawSaturationLightnessSquare();
  }

  drawSaturationLightnessSquare() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const imageData = this.ctx.createImageData(width, height);
    const data = imageData.data;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const rgb = hslToRgb({
          h: this.hsl.h,
          s: (x / (width - 1)) * 100,
          l: 100 - (y / (height - 1)) * 100,
        });
        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
        data[index + 3] = 255;
      }
    }
    this.ctx.putImageData(imageData, 0, 0);
    const cursorX = (this.hsl.s / 100) * width;
    const cursorY = ((100 - this.hsl.l) / 100) * height;
    this.ctx.beginPath();
    this.ctx.arc(cursorX, cursorY, 5, 0, Math.PI * 2);
    this.ctx.fillStyle = colorIsDark(parseHex(this.color)) ? "#ffffff" : "#000000";
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.fill();
  }

  close() {
    if (!this.node?.isConnected) return;
    this.abort.abort();
    this.node.classList.remove("open");
    window.setTimeout(() => {
      this.node?.remove();
      this.onClose();
    }, 180);
  }
}

function normalizeHex(value) {
  const rgb = parseHex(value);
  if (!rgb) return null;
  return `#${[rgb.r, rgb.g, rgb.b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const diff = max - min;
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    if (max === r) h = (g - b) / diff + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(hsl) {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const convert = (offset) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(convert(1 / 3) * 255),
    g: Math.round(convert(0) * 255),
    b: Math.round(convert(-1 / 3) * 255),
  };
}

function hslToHex(hsl) {
  const rgb = hslToRgb(hsl);
  return `#${[rgb.r, rgb.g, rgb.b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function colorIsDark(rgb) {
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 < 155;
}

export default CustomColorPicker;
