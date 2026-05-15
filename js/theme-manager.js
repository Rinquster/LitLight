// js/theme-manager.js

import Utils from "./utils.js";
import { THEME_PRESETS } from "./constants.js";
import CustomColorPicker from "./color-picker.js";

class ThemeManager {
  constructor() {
    this.PRESETS = {
      light: { ...THEME_PRESETS.light },
      dark: { ...THEME_PRESETS.dark },
    };
    this.LINK_COLORS = {
      light: { base: "#1a5fb4", hover: "#0d47a1" },
      dark: { base: "#8ab4f8", hover: "#aecbfa" },
    };
    this.currentPreset = "light";
    this.customColors = { ...THEME_PRESETS.light };
    this.isApplying = false;
    this.metaThemeColor = null;
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

    this.currentPreset = savedPreset;
    this.customColors = savedColors;
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
    return !Utils.isDarkColor(this.customColors.bg);
  }

  applyMainColors() {
    const root = document.documentElement;
    const { bg: bgColor, text: textColor } = this.customColors;

    root.style.setProperty("--bg-color", bgColor);
    root.style.setProperty("--text-color", textColor);

    const isBgDark = Utils.isDarkColor(bgColor);
    const isThemeLight = this.isThemeLight();

    const adjust = (color, amount) => this.adjustColor(color, amount);

    root.style.setProperty("--sidebar-bg", adjust(bgColor, isBgDark ? 0.05 : -0.05));
    root.style.setProperty("--sidebar-text", adjust(textColor, isBgDark ? 0.2 : -0.2));
    root.style.setProperty("--settings-bg", adjust(bgColor, isBgDark ? 0.05 : -0.05));
    root.style.setProperty("--settings-text", textColor);
    root.style.setProperty("--toolbar-bg", adjust(bgColor, isBgDark ? 0.03 : -0.03));

    const btnBg = adjust(bgColor, isBgDark ? 0.1 : -0.1);
    root.style.setProperty("--btn-bg", btnBg);
    root.style.setProperty("--btn-text", textColor);
    root.style.setProperty("--btn-hover", adjust(btnBg, 0.1));
    root.style.setProperty("--btn-active", adjust(btnBg, 0.15));

    root.style.setProperty("--border-color", adjust(bgColor, isBgDark ? 0.15 : -0.15));
    root.style.setProperty("--toolbar-border", adjust(bgColor, isBgDark ? 0.1 : -0.1));

    if (isThemeLight) {
      root.style.setProperty("--link-color", this.LINK_COLORS.light.base);
      root.style.setProperty("--link-hover", this.LINK_COLORS.light.hover);
    } else {
      root.style.setProperty("--link-color", this.LINK_COLORS.dark.base);
      root.style.setProperty("--link-hover", this.LINK_COLORS.dark.hover);
    }

    const highlightColor = isBgDark
      ? "rgba(138, 180, 248, 0.2)"
      : "rgba(26, 115, 232, 0.1)";
    root.style.setProperty("--highlight-bg", highlightColor);

    root.style.setProperty("--progress-bg", adjust(bgColor, isBgDark ? 0.1 : -0.1));
    root.style.setProperty(
      "--progress-fill",
      isThemeLight ? this.LINK_COLORS.light.base : this.LINK_COLORS.dark.base,
    );

    root.style.setProperty("--hint-text-color", isBgDark ? "#ffb74d" : "#d35400");
    root.style.setProperty("--code-bg", adjust(bgColor, isBgDark ? 0.05 : -0.04));
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
    const isBgDark = Utils.isDarkColor(this.customColors.bg);
    let themeIconClass = this.currentPreset === "dark" || (this.currentPreset === "custom" && isBgDark) ? "show-sun" : "show-moon";
    this.updateThemeIconByClass(themeIconClass);
  }

  updateThemeIconByClass(themeIconClass) {
    const themeIconSvg = document.getElementById("theme-icon");
    if (!themeIconSvg) return;
    themeIconSvg.classList.remove("show-sun", "show-moon");
    themeIconSvg.classList.add(themeIconClass);
  }

  updateColorPreviews() {
    const bgPicker = document.getElementById("bg-color-picker");
    const textPicker = document.getElementById("text-color-picker");
    if (bgPicker) {
      bgPicker.dataset.color = this.customColors.bg;
      const preview = bgPicker.querySelector(".color-preview");
      if (preview) preview.style.backgroundColor = this.customColors.bg;
    }
    if (textPicker) {
      textPicker.dataset.color = this.customColors.text;
      const preview = textPicker.querySelector(".color-preview");
      if (preview) preview.style.backgroundColor = this.customColors.text;
    }
  }

  updatePresetButtons() {
    document.querySelectorAll(".theme-preset-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === this.currentPreset);
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
        this.applyPreset(btn.dataset.theme);
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
      const newPreset = Utils.isDarkColor(this.customColors.bg) ? "light" : "dark";
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
    const currentColor = this.customColors[type];
    const targetElement = document.getElementById(`${type}-color-picker`);
    const picker = new CustomColorPicker({
      target: targetElement,
      currentColor: currentColor,
      onSelect: (color) => this.setCustomColor(type, color),
      position: "center",
    });
    picker.open();
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