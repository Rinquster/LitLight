// js/settings-manager.js

import Utils from "./utils.js";
import { DEFAULT_SETTINGS } from "./constants.js";

class SettingsManager {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupControls();
    this.applySettings();
    console.log("✅ SettingsManager initialized");
  }

  loadSettings() {
    try {
      const saved = Utils.loadFromStorage("readerSettings", {});
      this.settings = { 
        ...DEFAULT_SETTINGS,
        ...saved 
      };
    } catch (error) {
      console.warn("Error loading settings:", error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    Utils.saveToStorage("readerSettings", this.settings);
  }

  setupControls() {
    const fontSelect = document.getElementById("font-family");
    if (fontSelect) {
      fontSelect.value = this.settings.fontFamily;
      fontSelect.addEventListener("change", (e) => {
        this.setFontFamily(e.target.value);
      });
    }

    this.setupSliderControl(
      "font-size",
      (value) => `${value}px`,
      (value) => this.setFontSize(value),
      this.settings.fontSize
    );

    this.setupSliderControl(
      "text-width",
      (value) => `${value}px`,
      (value) => this.setTextWidth(value),
      this.settings.textWidth
    );

    this.setupSliderControl(
      "line-height",
      (value) => value.toFixed(1),
      (value) => this.setLineHeight(value),
      this.settings.lineHeight
    );

    document.querySelectorAll(".line-height-preset-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const value = parseFloat(e.target.dataset.value);
        this.setLineHeight(value);
        this.updateSliderValue("line-height", value);
        this.updateActivePresetButtons();
      });
    });

    this.updateActivePresetButtons();
    this.setupSettingsPanel();
  }

  setupSliderControl(sliderId, formatValue, onChange, initialValue) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-value`);

    if (!slider || !valueDisplay) {
      console.warn(`Slider or value display not found for: ${sliderId}`);
      return;
    }

    slider.value = initialValue;
    valueDisplay.textContent = formatValue(initialValue);

    const updateValue = (value) => {
      const formatted = sliderId === "line-height" 
        ? parseFloat(value).toFixed(1)
        : formatValue(value);
      valueDisplay.textContent = formatted;
      onChange(value);
    };

    slider.addEventListener("input", (e) => {
      const value = sliderId === "line-height" 
        ? parseFloat(e.target.value)
        : parseInt(e.target.value, 10);
      updateValue(value);
    });

    updateValue(initialValue);
  }

  updateSliderValue(sliderId, value) {
    const slider = document.getElementById(sliderId);
    if (slider) {
      slider.value = value;
      const valueDisplay = document.getElementById(`${sliderId}-value`);
      if (valueDisplay) {
        if (sliderId === "line-height") {
          valueDisplay.textContent = value.toFixed(1);
        } else if (sliderId === "font-size" || sliderId === "text-width") {
          valueDisplay.textContent = `${value}px`;
        }
      }
    }
  }

  updateActivePresetButtons() {
    document.querySelectorAll(".line-height-preset-btn").forEach((btn) => {
      const value = parseFloat(btn.dataset.value);
      const isActive = Math.abs(value - this.settings.lineHeight) < 0.05;
      btn.classList.toggle("active", isActive);
    });
  }

  setupSettingsPanel() {
    const settingsToggle = document.getElementById("settings-toggle");
    const closeSettings = document.getElementById("close-settings");
    const overlay = document.getElementById("overlay");
    const settingsPanel = document.getElementById("settings-panel");

    if (settingsToggle) {
      settingsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleSettings();
      });
    }

    if (closeSettings) {
      closeSettings.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeSettings();
      });
    }

    if (overlay) {
      overlay.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeSettings();
      });
    }
  }

  toggleSettings() {
    const settingsPanel = document.getElementById("settings-panel");
    const overlay = document.getElementById("overlay");

    if (!settingsPanel || !overlay) return;

    if (settingsPanel.classList.contains("open")) {
      this.closeSettings();
    } else {
      this.openSettings();
    }
  }

  openSettings() {
    const settingsPanel = document.getElementById("settings-panel");
    const overlay = document.getElementById("overlay");
    const sidebar = document.getElementById("sidebar");

    if (settingsPanel && overlay) {
      if (sidebar) sidebar.classList.remove("open");
      settingsPanel.classList.add("open");
      overlay.classList.add("visible");
    }
  }

  closeSettings() {
    const settingsPanel = document.getElementById("settings-panel");
    const overlay = document.getElementById("overlay");

    if (settingsPanel && overlay) {
      settingsPanel.classList.remove("open");
      overlay.classList.remove("visible");
    }
  }

  applySettings() {
    this.applyFontFamily();

    const root = document.documentElement;
    root.style.setProperty("--font-size", `${this.settings.fontSize}px`);
    root.style.setProperty("--line-height", this.settings.lineHeight.toString());
    root.style.setProperty("--text-width", `${this.settings.textWidth}px`);

    document.body.style.fontSize = `${this.settings.fontSize}px`;
    document.body.style.lineHeight = this.settings.lineHeight.toString();

    console.log("✅ Applied settings:", this.settings);
  }

  applyFontFamily() {
    const fontFamily = this.settings.fontFamily;

    const existingStyle = document.getElementById("dynamic-font-style");
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = "dynamic-font-style";
    style.textContent = `
      body, .chapter-content, .reading-area, .settings-content {
        font-family: '${fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .settings-select, code, pre {
        font-family: 'SourceCodePro', '${fontFamily}', monospace;
      }
    `;

    document.head.appendChild(style);
    document.documentElement.style.setProperty(
      "--font-family",
      `'${fontFamily}', sans-serif`
    );
  }

  setLineHeight(value) {
    value = parseFloat(value);
    if (this.settings.lineHeight === value) return;
    this.settings.lineHeight = value;
    this.applySettings();
    this.saveSettings();
    console.log(`📐 Line-height set to: ${value}`);
  }

  setFontFamily(fontFamily) {
    if (this.settings.fontFamily === fontFamily) return;
    this.settings.fontFamily = fontFamily;
    this.applyFontFamily();
    this.saveSettings();
  }

  setFontSize(fontSize) {
    fontSize = parseInt(fontSize, 10);
    if (this.settings.fontSize === fontSize) return;
    this.settings.fontSize = fontSize;
    this.applySettings();
    this.saveSettings();
  }

  setTextWidth(width) {
    width = parseInt(width, 10);
    if (this.settings.textWidth === width) return;
    this.settings.textWidth = width;
    this.applySettings();
    this.saveSettings();
  }

  setLastChapter(chapter) {
    chapter = parseInt(chapter, 10);
    if (this.settings.lastChapter === chapter) return;
    this.settings.lastChapter = chapter;
    this.saveSettings();
  }

  getSettings() {
    return { ...this.settings };
  }
}

export default SettingsManager;