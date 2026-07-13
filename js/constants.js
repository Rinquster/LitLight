// js/constants.js

"use strict";

export const THEME_PRESETS = {
  light: {
    bg: "#ffffff",
    text: "#000000",
  },
  dark: {
    bg: "#202124",
    text: "#e8eaed",
  },
};

export const DEFAULT_SETTINGS = {
  fontFamily: "Lato",
  fontSize: 16,
  textWidth: 800,
  lineHeight: 1.6,
  lastChapter: 1,
};

export const MEDIA_TYPES = {
  IMAGE: "image",
};

export const CHAPTER_FILES_PATTERN = /^\d+\.html$/;
export const MAX_CHAPTERS = 150;

export const CSS_VARS = [
  "--bg-color",
  "--text-color",
  "--sidebar-bg",
  "--sidebar-text",
  "--settings-bg",
  "--settings-text",
  "--toolbar-bg",
  "--btn-bg",
  "--btn-text",
  "--btn-hover",
  "--btn-active",
  "--border-color",
  "--link-color",
  "--link-hover",
  "--highlight-bg",
  "--progress-bg",
  "--progress-fill",
  "--player-bg",
  "--player-border",
  "--hint-text-color",
];

export const MEDIA_CONFIG_PATH = "./config/media-rules.json";
export const AGE_GATE_CONFIRMED_KEY = 'ageGateConfirmed';
export const AGE_GATE_CONFIRMED_TIMESTAMP = 'ageGateConfirmedTimestamp';
export const AGE_GATE_SESSION_DURATION = 24 * 60 * 60 * 1000;
