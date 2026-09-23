// js/theme-manager.js

import Utils from "./utils.js";
import { THEME_PRESETS } from "./constants.js?v=20260924-2";
import CustomColorPicker from "./color-picker.js?v=20260924-3";

const PRESET_NAMES = ["light", "dark", "custom"];

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

function isValidHex(hex) {
  return Boolean(parseHex(hex));
}

// Смешивает два цвета: ratio = 0 → первый, 1 → второй.
function mix(hexA, hexB, ratio) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const amount = Utils.clamp(ratio, 0, 1);
  const channel = (start, end) => Math.round(start + (end - start) * amount);
  return `#${[channel(a.r, b.r), channel(a.g, b.g), channel(a.b, b.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

// Светлый или тёмный фон: порог яркости 155.
function colorMode(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return "dark";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 155 ? "light" : "dark";
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

// Цвет подписи HEX на кнопке выбора цвета: того же оттенка, но контрастный её фону.
function colorButtonTextColor(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return "var(--btn-text)";
  const hsl = rgbToHsl(rgb);
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  const inverseLightness = 100 - hsl.l;
  let lightness = brightness > 155
    ? Math.min(inverseLightness, 18)
    : Math.max(inverseLightness, 88);
  if (Math.abs(lightness - hsl.l) < 45) {
    lightness = brightness > 155 ? 12 : 92;
  }
  return `hsl(${hsl.h} ${hsl.s}% ${lightness}%)`;
}

class ThemeManager {
  constructor() {
    this.PRESETS = {
      light: { ...THEME_PRESETS.light },
      dark: { ...THEME_PRESETS.dark },
    };
    this.LINK_COLORS = {
      light: { base: "#1a73e8", hover: "#0d62d9" },
      dark: { base: "#8ab4f8", hover: "#aecbfa" },
    };
    this.currentPreset = "light";
    this.customColors = { ...THEME_PRESETS.light };
    this.isApplying = false;
    this.metaThemeColor = null;
    this.colorPicker = null;
    this.init();
  }

  init() {
    this.metaThemeColor = document.getElementById("theme-color-meta");
    if (!this.metaThemeColor) {
      this.metaThemeColor = document.createElement("meta");
      this.metaThemeColor.name = "theme-color";
      this.metaThemeColor.id = "theme-color-meta";
      document.head.appendChild(this.metaThemeColor);
    }
    this.loadSavedState();
    this.applyTheme();
    this.setupEventListeners();
    this.updateThemeSwitcherLocation();
    console.log("✅ ThemeManager initialized");
  }

  loadSavedState() {
    const savedPreset = Utils.loadFromStorage("themePreset", "dark");
    const savedColors = Utils.loadFromStorage(
      "themeColors",
      THEME_PRESETS.dark,
    );

    // У стандартных тем цвета всегда из пресета (так старые сохранения светлой
    // темы получают текущую палитру); сохранённые цвета — только у своей темы.
    this.currentPreset = PRESET_NAMES.includes(savedPreset) ? savedPreset : "dark";
    this.customColors =
      this.currentPreset === "custom"
        ? {
            bg: isValidHex(savedColors?.bg) ? savedColors.bg : THEME_PRESETS.dark.bg,
            text: isValidHex(savedColors?.text) ? savedColors.text : THEME_PRESETS.dark.text,
          }
        : { ...this.PRESETS[this.currentPreset] };
    console.log("📝 Loaded theme:", { preset: this.currentPreset, colors: this.customColors });
  }

  saveState() {
    Utils.saveToStorage("themePreset", this.currentPreset);
    Utils.saveToStorage("themeColors", this.customColors);
  }

  applyTheme() {
    if (this.isApplying) return;
    this.isApplying = true;

    try {
      document.documentElement.setAttribute("data-theme", this.currentPreset);
      document.body.setAttribute("data-theme", this.currentPreset);
      this.applyMainColors();
      this.updateIcons();
      this.updateColorPreviews();
      this.updatePresetButtons();
      this.updateMetaThemeColor();
      this.saveState();

      console.log(
        `🎨 Applied theme preset: ${this.currentPreset}, colors:`,
        this.customColors,
      );
    } catch (error) {
      console.error("Error applying theme:", error);
    } finally {
      this.isApplying = false;
    }
  }

  updateMetaThemeColor() {
    if (!this.metaThemeColor) return;
    const bgColor = this.customColors.bg;
    if (bgColor && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(bgColor)) {
      this.metaThemeColor.setAttribute("content", bgColor);
    }
  }

  isThemeLight() {
    return colorMode(this.customColors.bg) === "light";
  }

  // Все цвета интерфейса выводятся из фона и текста смешиванием фона
  // с белым (тёмная тема) или чёрным (светлая).
  applyMainColors() {
    const root = document.documentElement;
    const { bg, text } = this.customColors;
    const isDark = colorMode(bg) === "dark";
    const link = isDark ? this.LINK_COLORS.dark : this.LINK_COLORS.light;
    const surface = isDark ? mix(bg, "#ffffff", 0.08) : mix(bg, "#000000", 0.04);
    const border = isDark ? mix(bg, "#ffffff", 0.22) : mix(bg, "#000000", 0.16);

    const vars = {
      "--bg-color": bg,
      "--text-color": text,
      "--sidebar-bg": surface,
      "--sidebar-text": text,
      "--toolbar-bg": isDark ? mix(bg, "#ffffff", 0.05) : mix(bg, "#000000", 0.03),
      "--toolbar-border": border,
      "--settings-bg": surface,
      "--settings-text": text,
      "--btn-bg": isDark ? mix(bg, "#ffffff", 0.12) : mix(bg, "#000000", 0.05),
      "--btn-text": text,
      "--btn-hover": isDark ? mix(bg, "#ffffff", 0.15) : mix(bg, "#000000", 0.08),
      "--btn-active": isDark ? mix(bg, "#ffffff", 0.22) : mix(bg, "#000000", 0.13),
      "--border-color": border,
      "--link-color": link.base,
      "--link-hover": link.hover,
      "--highlight-bg": isDark ? "rgba(138, 180, 248, 0.2)" : "rgba(26, 115, 232, 0.1)",
      "--overlay": isDark ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)",
      "--progress-bg": isDark ? mix(bg, "#ffffff", 0.13) : mix(bg, "#000000", 0.05),
      "--progress-fill": link.base,
      "--hint-text-color": isDark ? "#ffb74d" : "#d35400",
      "--code-bg": this.adjustColor(bg, isDark ? 0.05 : -0.04),
    };

    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }

  adjustColor(color, amount) {
    // Нормализация до 6-значного HEX
    let hex = color.replace("#", "");
    if (hex.length === 3) {
      hex = hex.split("").map(c => c + c).join("");
    }
    if (hex.length !== 6) return color;

    const num = parseInt(hex, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;

    const adjustment = Math.round(amount * 255);
    r = Utils.clamp(r + adjustment, 0, 255);
    g = Utils.clamp(g + adjustment, 0, 255);
    b = Utils.clamp(b + adjustment, 0, 255);

    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  updateIcons() {
    const isBgDark = colorMode(this.customColors.bg) === "dark";
    let themeIconClass = this.currentPreset === "dark" || (this.currentPreset === "custom" && isBgDark) ? "show-sun" : "show-moon";
    this.updateThemeIconByClass(themeIconClass);
  }

  updateThemeIconByClass(themeIconClass) {
    const themeIconSvg = document.getElementById("theme-icon");
    if (!themeIconSvg) return;
    themeIconSvg.classList.remove("show-sun", "show-moon");
    themeIconSvg.classList.add(themeIconClass);
  }

  // Кнопка выбора цвета залита самим цветом и подписана его HEX-кодом.
  updateColorPreviews() {
    for (const type of ["bg", "text"]) {
      const button = document.getElementById(`${type}-color-picker`);
      if (!button) continue;
      const color = this.customColors[type];
      button.dataset.color = color;
      button.style.setProperty("--color-picker-bg", color);
      button.style.setProperty("--color-picker-text", colorButtonTextColor(color));
      const preview = button.querySelector(".color-preview");
      if (preview) preview.style.backgroundColor = color;
      const value = button.querySelector(".color-value");
      if (value) value.textContent = color.toUpperCase();
    }
  }

  updatePresetButtons() {
    document.querySelectorAll(".theme-preset-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themePreset === this.currentPreset);
    });
  }

  setupEventListeners() {
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePreset();
      });
    }

    document.querySelectorAll(".theme-preset-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.applyPreset(btn.dataset.themePreset);
      });
    });

    const bgPicker = document.getElementById("bg-color-picker");
    const textPicker = document.getElementById("text-color-picker");
    if (bgPicker) {
      bgPicker.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCustomColorPicker("bg");
      });
    }
    if (textPicker) {
      textPicker.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCustomColorPicker("text");
      });
    }

    window.addEventListener("resize", () => this.updateThemeSwitcherLocation());
  }

  togglePreset() {
    if (this.currentPreset === "custom") {
      const newPreset = colorMode(this.customColors.bg) === "dark" ? "light" : "dark";
      this.applyPreset(newPreset);
    } else {
      const newPreset = this.currentPreset === "light" ? "dark" : "light";
      this.applyPreset(newPreset);
    }
  }

  applyPreset(preset) {
    if (!this.PRESETS[preset]) return;
    this.currentPreset = preset;
    this.customColors = { ...this.PRESETS[preset] };
    this.applyTheme();
  }

  openCustomColorPicker(type) {
    this.colorPicker?.close();
    const picker = new CustomColorPicker({
      label: type === "bg" ? "Цвет фона" : "Цвет текста",
      color: this.customColors[type],
      onApply: (color) => this.setCustomColor(type, color),
      onClose: () => {
        if (this.colorPicker === picker) this.colorPicker = null;
      },
    });
    this.colorPicker = picker;
  }

  setCustomColor(type, color) {
    if (!color || this.customColors[type] === color) return;
    this.customColors[type] = color;

    const matchesLight = this.colorsMatch(this.customColors, this.PRESETS.light);
    const matchesDark = this.colorsMatch(this.customColors, this.PRESETS.dark);
    if (matchesLight) this.currentPreset = "light";
    else if (matchesDark) this.currentPreset = "dark";
    else this.currentPreset = "custom";

    this.applyTheme();
  }

  colorsMatch(colors1, colors2) {
    const normalize = (color) => color.toLowerCase().replace(/#/g, "").padStart(6, "0");
    return normalize(colors1.bg) === normalize(colors2.bg) && normalize(colors1.text) === normalize(colors2.text);
  }

  updateThemeSwitcherLocation() {
    const themeSwitcher = document.querySelector(".theme-switcher");
    const mobileThemeSwitcher = document.querySelector(".mobile-theme-switcher");
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeSwitcher || !mobileThemeSwitcher || !themeToggle) return;

    if (window.innerWidth <= 768) {
      if (themeToggle.parentNode !== mobileThemeSwitcher) mobileThemeSwitcher.appendChild(themeToggle);
    } else {
      if (themeToggle.parentNode !== themeSwitcher) themeSwitcher.appendChild(themeToggle);
    }
  }

  getCurrentPreset() { return this.currentPreset; }
  getCustomColors() { return { ...this.customColors }; }
}

export default ThemeManager;