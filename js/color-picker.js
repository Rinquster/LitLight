// js/color-picker.js

import Utils from "./utils.js";

class CustomColorPicker {
  constructor(options = {}) {
    this.options = {
      target: options.target,
      currentColor: options.currentColor || "#ffffff",
      onSelect: options.onSelect || (() => {}),
      position: options.position || "center",
    };

    this.color = this.options.currentColor;
    this.hsl = this.rgbToHsl(this.hexToRgb(this.color));
    this.canvasMouseDown = false;
    this.init();
  }

  init() {
    this.createPopup();
    this.setupEventListeners();
    this.updateCanvasAndSlider();
    this.positionPopup();
  }

  createPopup() {
    this.popup = document.createElement("div");
    this.popup.className = "custom-color-picker";
    this.popup.innerHTML = `
            <div class="color-picker-header">
                <h4>Выбор цвета</h4>
                <button class="close-picker" aria-label="Закрыть">×</button>
            </div>
            <div class="color-picker-body">
                <div class="color-preview" style="background-color: ${this.color}"></div>
                <div class="hsl-controls">
                    <div class="h-slider-container">
                        <label>Оттенок (H)</label>
                        <input type="range" class="hue-slider" min="0" max="360" value="${this.hsl.h}" orient="vertical">
                        <span class="hue-value">${this.hsl.h}°</span>
                    </div>
                    <div class="sl-canvas-container">
                        <label>Насыщенность / Яркость</label>
                        <canvas class="sl-canvas" width="200" height="200"></canvas>
                    </div>
                </div>
                <div class="color-presets">
                    <div class="preset-title">Быстрые цвета:</div>
                    <div class="preset-grid">
                        <button class="color-preset" style="background-color: #ffffff" data-color="#ffffff"></button>
                        <button class="color-preset" style="background-color: #f8f9fa" data-color="#f8f9fa"></button>
                        <button class="color-preset" style="background-color: #e9ecef" data-color="#e9ecef"></button>
                        <button class="color-preset" style="background-color: #dee2e6" data-color="#dee2e6"></button>
                        <button class="color-preset" style="background-color: #ced4da" data-color="#ced4da"></button>
                        <button class="color-preset" style="background-color: #000000" data-color="#000000"></button>
                        <button class="color-preset" style="background-color: #212529" data-color="#212529"></button>
                        <button class="color-preset" style="background-color: #343a40" data-color="#343a40"></button>
                        <button class="color-preset" style="background-color: #495057" data-color="#495057"></button>
                        <button class="color-preset" style="background-color: #6c757d" data-color="#6c757d"></button>
                        <button class="color-preset" style="background-color: #1e88e5" data-color="#1e88e5"></button>
                        <button class="color-preset" style="background-color: #43a047" data-color="#43a047"></button>
                    </div>
                </div>
                <div class="color-picker-actions">
                    <button class="cancel-btn">Отмена</button>
                    <button class="apply-btn">Применить</button>
                </div>
            </div>
        `;

    document.body.appendChild(this.popup);
    this.slCanvas = this.popup.querySelector(".sl-canvas");
    this.hueSlider = this.popup.querySelector(".hue-slider");
    this.hueValueSpan = this.popup.querySelector(".hue-value");
    this.preview = this.popup.querySelector(".color-preview");
  }

  positionPopup() {
    const popupRect = this.popup.getBoundingClientRect();
    const padding = 20;

    let top = (window.innerHeight - popupRect.height) / 2;
    let left = (window.innerWidth - popupRect.width) / 2;

    top = Math.max(
      padding,
      Math.min(top, window.innerHeight - popupRect.height - padding),
    );
    left = Math.max(
      padding,
      Math.min(left, window.innerWidth - popupRect.width - padding),
    );

    this.popup.style.top = `${top}px`;
    this.popup.style.left = `${left}px`;

    setTimeout(() => {
      this.popup.classList.add("positioned");
    }, 10);
  }

  setupEventListeners() {
    this.hueSlider.addEventListener("input", (e) => {
      this.hsl.h = parseInt(e.target.value);
      this.color = this.hslToHex(this.hsl);
      this.updatePreview();
      this.updateHueValueDisplay();
      this.drawSaturationLightnessSquare();
    });

    this.slCanvas.addEventListener("mousedown", (e) => {
      this.handleCanvasInteraction(e);
      this.canvasMouseDown = true;
    });

    document.addEventListener("mousemove", (e) => {
      if (this.canvasMouseDown) {
        this.handleCanvasInteraction(e);
      }
    });

    document.addEventListener("mouseup", () => {
      this.canvasMouseDown = false;
    });

    this.slCanvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.handleCanvasInteraction(e.touches[0]);
      this.canvasMouseDown = true;
    });

    document.addEventListener("touchmove", (e) => {
      if (this.canvasMouseDown) {
        e.preventDefault();
        this.handleCanvasInteraction(e.touches[0]);
      }
    });

    document.addEventListener("touchend", () => {
      this.canvasMouseDown = false;
    });

    const presets = this.popup.querySelectorAll(".color-preset");
    presets.forEach((preset) => {
      preset.addEventListener("click", () => {
        const color = preset.dataset.color;
        this.setColor(color);
      });
    });

    this.popup
      .querySelector(".close-picker")
      .addEventListener("click", () => this.close());
    this.popup
      .querySelector(".cancel-btn")
      .addEventListener("click", () => this.close());
    this.popup.querySelector(".apply-btn").addEventListener("click", () => {
      this.options.onSelect(this.color);
      this.close();
    });

    document.addEventListener("click", (e) => {
      if (
        this.popup &&
        !this.popup.contains(e.target) &&
        e.target !== this.options.target
      ) {
        this.close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.popup.parentNode) {
        this.close();
      }
    });
  }

  handleCanvasInteraction(e) {
    const rect = this.slCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, this.slCanvas.width));
    const clampedY = Math.max(0, Math.min(y, this.slCanvas.height));

    const s = Math.round((clampedX / this.slCanvas.width) * 100);
    const l = Math.round(100 - (clampedY / this.slCanvas.height) * 100);

    this.hsl.s = s;
    this.hsl.l = l;
    this.color = this.hslToHex(this.hsl);

    this.updatePreview();
    this.updateSliders();
  }

  drawSaturationLightnessSquare() {
    const ctx = this.slCanvas.getContext("2d");
    const width = this.slCanvas.width;
    const height = this.slCanvas.height;

    ctx.clearRect(0, 0, width, height);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        const s = (x / (width - 1)) * 100;
        const l = 100 - (y / (height - 1)) * 100;

        const rgb = this.hslToRgb({ h: this.hsl.h, s: s, l: l });

        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const cursorX = (this.hsl.s / 100) * width;
    const cursorY = ((100 - this.hsl.l) / 100) * height;

    ctx.beginPath();
    ctx.arc(cursorX, cursorY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = Utils.isDarkColor(this.color) ? "white" : "black";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fill();
  }

  updateCanvasAndSlider() {
    this.updateHueValueDisplay();
    this.updateSliders();
  }

  updatePreview() {
    if (this.preview) {
      this.preview.style.backgroundColor = this.color;
    }
  }

  updateHueValueDisplay() {
    if (this.hueValueSpan) {
      this.hueValueSpan.textContent = `${this.hsl.h}°`;
    }
  }

  updateSliders() {
    if (this.hueSlider) {
      this.hueSlider.value = this.hsl.h;
    }
    this.updateHueValueDisplay();
    this.drawSaturationLightnessSquare();
  }

  setColor(color) {
    const rgb = this.hexToRgb(color);
    if (!rgb) return;

    this.color = color;
    this.hsl = this.rgbToHsl(rgb);
    this.updatePreview();
    this.updateCanvasAndSlider();
  }

  hslToRgb(hsl) {
    let h = hsl.h / 360;
    let s = hsl.s / 100;
    let l = hsl.l / 100;

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  hexToRgb(hex) {
    return Utils.hexToRgb(hex);
  }

  rgbToHsl(rgb) {
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let h,
      s,
      l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      let d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }

      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  hslToHex(hsl) {
    let h = hsl.h / 360;
    let s = hsl.s / 100;
    let l = hsl.l / 100;

    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (c) => {
      const hex = Math.round(c * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  open() {
    this.popup.style.display = "block";
    this.positionPopup();
    setTimeout(() => {
      this.popup.classList.add("open");
    }, 10);
  }

  close() {
    this.popup.classList.remove("open");
    setTimeout(() => {
      if (this.popup.parentNode) {
        this.popup.parentNode.removeChild(this.popup);
      }
    }, 300);
  }
}

export default CustomColorPicker;