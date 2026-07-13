// js/app.js

import Utils from "./utils.js";
import ThemeManager from "./theme-manager.js";
import SettingsManager from "./settings-manager.js";
import BookLoader from "./book-loader.js";
import MediaInjector from "./media-injector.js";
import ReadingProgressTracker from "./reading-progress-tracker.js";

class ReadingApp {
  constructor() {
    this.themeManager = null;
    this.settingsManager = null;
    this.bookLoader = null;
    this.mediaInjector = null;
    this.isInitialized = false;
    this.initializationError = null;
    this.progressTracker = null;
    this.requestedChapter = 1;
    this.initStarted = false;
    this.isChapterLoading = false;
    this.chapterLoadToken = 0;
  }

  showChapterLoadingOverlay() {
    const overlay = document.getElementById("chapter-loading-overlay");
    if (overlay) {
      overlay.style.display = "flex";
      this.isChapterLoading = true;
    }
  }

  hideChapterLoadingOverlay() {
    const overlay = document.getElementById("chapter-loading-overlay");
    if (overlay) {
      overlay.style.display = "none";
      this.isChapterLoading = false;
    }
  }

  showAgeGateModal() {
    return new Promise((resolve) => {
      const modal = document.getElementById("age-gate-modal");
      if (!modal) {
        console.warn("Age gate modal not found in DOM");
        resolve(false);
        return;
      }

      this.hideChapterLoadingOverlay();
      modal.style.display = "flex";

      const acceptBtn = document.getElementById("age-gate-accept");
      const declineBtn = document.getElementById("age-gate-decline");

      if (!acceptBtn || !declineBtn) {
        console.warn("Age gate buttons not found");
        resolve(false);
        return;
      }

      const cleanup = () => {
        modal.style.display = "none";
      };

      acceptBtn.addEventListener(
        "click",
        () => {
          cleanup();
          Utils.saveToStorage("ageGateConfirmed", true);
          Utils.saveToStorage("ageGateConfirmedTimestamp", Date.now());
          resolve(true);
        },
        { once: true },
      );

      declineBtn.addEventListener(
        "click",
        () => {
          cleanup();
          resolve(false);
        },
        { once: true },
      );
    });
  }

  async init() {
    if (this.initStarted) return;
    this.initStarted = true;

    this.showChapterLoadingOverlay();

    const urlParams = new URLSearchParams(window.location.search);
    this.bookId = urlParams.get("id");

    const chapterParam = urlParams.get("chapter");
    this.requestedChapter =
      chapterParam !== null ? parseInt(chapterParam) : null;

    if (!this.bookId) {
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      const bookSegmentIndex = pathParts.indexOf("book");
      if (bookSegmentIndex !== -1 && pathParts[bookSegmentIndex + 1]) {
        this.bookId = decodeURIComponent(pathParts[bookSegmentIndex + 1]);
      }
    }

    if (!this.bookId) {
      this.bookId = await this.getRememberedBookId();
    }

    if (!this.bookId) {
      window.location.replace("./index.html");
      return;
    }

    console.log(
      `📚 Starting Reading App for book: ${this.bookId}, chapter from URL: ${this.requestedChapter}`,
    );

    try {
      const infoResponse = await fetch(`./books/${this.bookId}/info.json`);
      if (infoResponse.ok) {
        const bookInfo = await infoResponse.json();
        this.needAgeGate = bookInfo.showAgeGate ?? bookInfo.ageRating >= 18;
        this.ageRating = bookInfo.ageRating || 0;
      } else {
        this.needAgeGate = false;
        this.ageRating = 0;
      }
    } catch (error) {
      this.needAgeGate = false;
      this.ageRating = 0;
    }

    const ageConfirmed = Utils.loadFromStorage("ageGateConfirmed", false);
    const ageTimestamp = Utils.loadFromStorage("ageGateConfirmedTimestamp", 0);
    const now = Date.now();
    const sessionValid = now - ageTimestamp < 24 * 60 * 60 * 1000;

    if (this.needAgeGate && !(ageConfirmed && sessionValid)) {
      const accepted = await this.showAgeGateModal();

      if (!accepted) {
        window.location.href = "./index.html";
        return;
      }

      this.showChapterLoadingOverlay();
    }

    await this.continueInitialization();
  }

  async getRememberedBookId() {
    let rememberedBookId = null;

    try {
      rememberedBookId = sessionStorage.getItem("lastSelectedBookId");
    } catch (error) {
      console.warn("Failed to read remembered book:", error);
    }

    if (!rememberedBookId) return null;

    try {
      const response = await fetch("./books/index.json");
      if (!response.ok) return null;

      const indexData = await response.json();
      const bookIds = (indexData.books || [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.id))
        .filter(Boolean);

      return bookIds.includes(rememberedBookId) ? rememberedBookId : null;
    } catch (error) {
      console.warn("Failed to validate remembered book:", error);
      return null;
    }
  }

  resolveStartChapter(requestedChapter) {
    requestedChapter = parseInt(requestedChapter);

    const hasPreface = this.bookLoader?.chapterFiles.some(
      (c) => c.number === 0,
    );
    const defaultChapter = hasPreface ? 0 : 1;

    if (!Number.isFinite(requestedChapter) || requestedChapter < 0) {
      return defaultChapter;
    }

    if (requestedChapter === 0) {
      return hasPreface ? 0 : 1;
    }

    const maxChapter = this.bookLoader?.chapterFiles.length
      ? this.bookLoader.chapterFiles[this.bookLoader.chapterFiles.length - 1]
          .number
      : 1;

    if (requestedChapter > maxChapter) {
      return maxChapter;
    }

    return requestedChapter;
  }

  async continueInitialization() {
    if (this.isInitialized) return;

    try {
      this.themeManager = new ThemeManager();
      this.settingsManager = new SettingsManager();

      this.progressTracker = new ReadingProgressTracker();
      this.progressTracker.init(this.bookId);
      window.readingApp = this;

      this.bookLoader = new BookLoader();
      const bookLoaded = await this.bookLoader.init(this.bookId);

      if (!bookLoaded) {
        throw new Error(`Failed to load book: ${this.bookId}`);
      }

      this.mediaInjector = new MediaInjector();
      this.mediaInjector.setBookRules(this.bookLoader.mediaRules);

      window.mediaInjector = this.mediaInjector;

      this.setupUI();
      this.setupScrollProgressIndicator();

      const chapterToOpen = await this.determineStartChapter();

      console.log(`📖 Loading initial chapter: ${chapterToOpen.chapter} (scroll: ${chapterToOpen.scrollPercent}%)`);
      await this.goToChapter(chapterToOpen.chapter, {
        updateProgress: chapterToOpen.scrollPercent <= 0,
      });

      if (chapterToOpen.scrollPercent > 0) {
        this.scrollToPercent(chapterToOpen.scrollPercent);
      }

      this.progressTracker.startTracking(".reading-area");

      this.isInitialized = true;
      console.log("✅ Reading App fully initialized!");
    } catch (error) {
      console.error("❌ Failed to initialize app:", error);
      this.showErrorState(error);
      this.hideChapterLoadingOverlay();
    }
  }

  async determineStartChapter() {
    const hasPreface = this.bookLoader.chapterFiles.some((c) => c.number === 0);
    const defaultStart = hasPreface ? 0 : 1;

    // Если глава была явно запрошена в URL, используем её
    if (this.requestedChapter !== null) {
      const resolved = this.resolveStartChapter(this.requestedChapter);
      console.log(`📍 URL chapter requested: ${resolved}`);
      return { chapter: resolved, scrollPercent: 0 };
    }

    const progress = this.progressTracker.getProgress(this.bookId);

    // Проверяем, есть ли реальный прогресс (не нулевой на первой главе)
    if (progress && this.progressTracker.hasProgress(this.bookId)) {
      // Игнорируем прогресс, если это первая глава с 0% – считаем, что чтение не начато
      if (progress.chapter === 1 && progress.scrollPercent === 0) {
        console.log("ℹ️ Progress on chapter 1 with 0%, ignoring resume modal");
        return { chapter: defaultStart, scrollPercent: 0 };
      }

      this.hideChapterLoadingOverlay();

      const result = await this.progressTracker.showResumeModal(
        progress,
        this.bookLoader.chapterTitles,
        hasPreface,
      );

      this.showChapterLoadingOverlay();

      console.log(`🔄 Resume modal result: action=${result.action}, chapter=${result.chapter}, scroll=${result.scrollPercent}%`);

      const resolvedChapter = this.resolveStartChapter(result.chapter);

      if (result.action === "continue") {
        return {
          chapter: resolvedChapter,
          scrollPercent: result.scrollPercent,
        };
      } else {
        return { chapter: resolvedChapter, scrollPercent: 0 };
      }
    }

    // Нет сохранённого прогресса – начинаем сначала
    console.log(`📍 No previous progress found, starting at chapter ${defaultStart}`);
    return { chapter: defaultStart, scrollPercent: 0 };
  }

  scrollToPercent(percent) {
    const readingArea = document.querySelector(".reading-area");
    if (!readingArea) return;

    setTimeout(() => {
      const safePercent = Utils.clamp(parseFloat(percent) || 0, 0, 100);
      const scrollHeight = readingArea.scrollHeight;
      const clientHeight = readingArea.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;
      const targetScroll = (safePercent / 100) * maxScroll;

      readingArea.scrollTo({
        top: targetScroll,
        behavior: "auto",
      });

      console.log(`📍 Scrolled to ${safePercent}% (${Math.round(targetScroll)}px)`);
    }, 100);
  }

  async goToChapter(chapterNumber, options = {}) {
    if (!this.bookLoader) return;

    const loadToken = ++this.chapterLoadToken;
    this.showChapterLoadingOverlay();

    try {
      chapterNumber = parseInt(chapterNumber);

      if (!Number.isFinite(chapterNumber)) {
        chapterNumber = this.bookLoader.chapterFiles[0]?.number ?? 1;
      }

      // Проверка существования главы, если нет – переход на ближайшую существующую
      const chapterExists = this.bookLoader.chapterFiles.some(
        (c) => c.number === chapterNumber,
      );

      if (!chapterExists) {
        if (chapterNumber === 0) {
          chapterNumber = this.bookLoader.chapterFiles[0]?.number ?? 1;
        } else {
          const availableChapters = this.bookLoader.chapterFiles.map(
            (c) => c.number,
          );
          chapterNumber = Math.max(...availableChapters);
        }
      }

      // Обновляем URL
      const url = new URL(window.location);
      url.searchParams.set("id", this.bookId);
      url.searchParams.set("chapter", chapterNumber);
      window.history.replaceState({}, "", url);

      console.log(`📥 Loading HTML for chapter ${chapterNumber}`);
      let html = await this.bookLoader.loadChapter(chapterNumber);

      if (loadToken !== this.chapterLoadToken) return;

      if (chapterNumber > 0 && this.mediaInjector) {
        const mediaRules = this.bookLoader.getMediaRulesForChapter(chapterNumber);
        this.mediaInjector.setBookRules(mediaRules);
        html = await this.mediaInjector.injectMedia(html, chapterNumber);
      }

      if (loadToken !== this.chapterLoadToken) return;

      const contentElement = document.getElementById("chapter-content");
      if (contentElement) {
        contentElement.innerHTML = html;

        if (this.mediaInjector && chapterNumber > 0) {
          this.mediaInjector.postProcessInsteadMedia(contentElement);
        }

        this.centerSpecialElements();

        this.bookLoader.currentChapter = chapterNumber;
        this.bookLoader.updateNavigationUI();

        document.querySelector(".reading-area")?.scrollTo(0, 0);

        this.setupParagraphHighlighting();
        this.setupChapterActionHandlers();

        if (this.progressTracker && options.updateProgress !== false) {
          this.progressTracker.updateProgress(chapterNumber, 0);
        }
      }
    } finally {
      if (loadToken === this.chapterLoadToken) {
        this.hideChapterLoadingOverlay();
      }
    }
  }

  setupParagraphHighlighting() {
    const contentElement = document.getElementById("chapter-content");
    if (!contentElement) return;

    const paragraphs = contentElement.querySelectorAll("p");

    paragraphs.forEach((paragraph) => {
      if (!this.isParagraphHighlightable(paragraph)) {
        paragraph.classList.add("no-highlight");
        return;
      }

      paragraph.classList.add("highlightable");

      paragraph.addEventListener("click", () => {
        const currentlyHighlighted =
          contentElement.querySelector("p.highlighted");

        if (paragraph.classList.contains("highlighted")) {
          paragraph.classList.remove("highlighted");
        } else {
          if (currentlyHighlighted) {
            currentlyHighlighted.classList.remove("highlighted");
          }
          paragraph.classList.add("highlighted");
        }
      });
    });
  }

  isParagraphHighlightable(paragraph) {
    const text = paragraph.textContent.trim();

    if (
      !text ||
      text === "" ||
      text === "***" ||
      text === "---" ||
      text === "* * *" ||
      text === "- - -"
    ) {
      return false;
    }

    if (
      paragraph.querySelector("img, audio, video, iframe, .media-container")
    ) {
      return false;
    }

    return true;
  }

  centerSpecialElements() {
    const contentElement = document.getElementById("chapter-content");
    if (!contentElement) return;

    const paragraphs = contentElement.querySelectorAll("p");
    paragraphs.forEach((p) => {
      const text = p.textContent.trim();

      if (
        text === "***" ||
        text === "---" ||
        text === "* * *" ||
        text === "- - -"
      ) {
        p.style.textAlign = "center";
        p.style.fontWeight = "bold";
        p.style.opacity = "0.7";
        p.style.margin = "2rem 0";
        p.style.fontSize = "1.2em";
        p.style.userSelect = "none";
        p.classList.add("divider-paragraph");
      }

      const cleanText = text.replace(/\*/g, "").replace(/-/g, "").trim();
      if (cleanText === "" && (text.includes("*") || text.includes("-"))) {
        p.style.textAlign = "center";
        p.classList.add("divider-paragraph");
      }
    });

    const h2Elements = contentElement.querySelectorAll("h2");
    h2Elements.forEach((h2) => {
      h2.style.textAlign = "center";
      h2.classList.add("centered-heading");
    });
  }

  setupUI() {
    this.setupMenu();
    this.setupHomeButton();
  }

  setupMenu() {
    const menuToggle = document.getElementById("menu-toggle");
    const closeSidebar = document.getElementById("close-sidebar");
    const overlay = document.getElementById("overlay");
    const sidebar = document.getElementById("sidebar");

    if (menuToggle && sidebar) {
      menuToggle.addEventListener("click", () => {
        sidebar.classList.add("open");
        if (overlay) overlay.classList.add("visible");
        this.bookLoader?.ensureChapterTitlesLoaded?.();
      });
    }

    if (closeSidebar && sidebar) {
      closeSidebar.addEventListener("click", () => {
        sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("visible");
      });
    }

    if (overlay) {
      overlay.addEventListener("click", () => {
        if (sidebar) sidebar.classList.remove("open");
        const settingsPanel = document.getElementById("settings-panel");
        if (settingsPanel) settingsPanel.classList.remove("open");
        overlay.classList.remove("visible");
      });
    }
  }

  setupHomeButton() {
    const homeButton = document.getElementById("home-button");
    if (homeButton) {
      homeButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = "./index.html";
      });
    }
  }

  setupChapterActionHandlers() {
    const contentElement = document.getElementById("chapter-content");
    if (!contentElement) return;

    contentElement.querySelectorAll("[data-reader-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.readerAction;

        if (action === "go-first") {
          const firstChapter = this.bookLoader?.chapterFiles[0]?.number ?? 1;
          this.goToChapter(firstChapter);
        } else if (action === "reload") {
          location.reload();
        }
      });
    });
  }

  setupScrollProgressIndicator() {
    const readingArea = document.querySelector(".reading-area");
    const progressBar = document.getElementById("reading-progress-bar");
    const progressValue = document.getElementById("reading-progress-value");

    if (!readingArea || !progressBar || !progressValue) return;

    const updateProgress = () => {
      const scrollTop = readingArea.scrollTop;
      const clientHeight = readingArea.clientHeight;
      const scrollHeight = readingArea.scrollHeight;
      const maxScrollTop = scrollHeight - clientHeight;

      let scrollPercentage = 0;
      if (maxScrollTop > 0) {
        scrollPercentage = (scrollTop / maxScrollTop) * 100;
        scrollPercentage = Math.min(100, Math.max(0, scrollPercentage));
      }

      progressBar.style.setProperty("--progress-width", `${scrollPercentage}%`);
      progressValue.textContent = `${Math.round(scrollPercentage)}%`;
    };

    const debouncedUpdate = Utils.debounce(updateProgress, 10);
    readingArea.addEventListener("scroll", debouncedUpdate);
    updateProgress();
  }

  showErrorState(error) {
    this.hideChapterLoadingOverlay();
    const contentElement = document.getElementById("chapter-content");
    if (!contentElement) return;

    const errorChapter = Utils.createElement("div", "error-chapter");

    const title = Utils.createElement("h1", "chapter-title");
    title.textContent = "Ошибка запуска приложения";

    const meta = Utils.createElement("p", "chapter-meta");
    meta.textContent = error.message || "Неизвестная ошибка";

    const content = Utils.createElement("div", "error-content");
    const hint = document.createElement("p");
    hint.textContent = "Приложение не смогло запуститься. Попробуйте:";

    const actions = Utils.createElement("div", "error-actions");
    const reloadButton = Utils.createElement("button", "error-btn");
    reloadButton.type = "button";
    reloadButton.textContent = "Обновить страницу";
    reloadButton.addEventListener("click", () => location.reload());

    const clearButton = Utils.createElement("button", "error-btn");
    clearButton.type = "button";
    clearButton.textContent = "Очистить данные и обновить";
    clearButton.addEventListener("click", () => {
      localStorage.clear();
      location.reload();
    });

    actions.append(reloadButton, clearButton);

    const detailsWrapper = Utils.createElement("div", "error-details");
    detailsWrapper.style.marginTop = "1rem";
    detailsWrapper.style.fontSize = "0.8rem";
    detailsWrapper.style.color = "#666";

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Детали ошибки";
    const pre = document.createElement("pre");
    pre.style.textAlign = "left";
    pre.style.marginTop = "0.5rem";
    pre.textContent = error.stack || error.toString();

    details.append(summary, pre);
    detailsWrapper.appendChild(details);
    content.append(hint, actions, detailsWrapper);
    errorChapter.append(title, meta, content);
    contentElement.replaceChildren(errorChapter);
  }

  cleanup() {
    if (this.mediaInjector) {
      this.mediaInjector.cleanup();
    }
    if (this.progressTracker) {
      this.progressTracker.stopTracking();
    }
    this.isInitialized = false;
    delete window.readingApp;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("📄 DOM loaded, starting app...");

  if (!window.readingAppInstance) {
    window.readingAppInstance = new ReadingApp();

    setTimeout(() => {
      window.readingAppInstance.init().catch((error) => {
        console.error("App initialization failed:", error);
        window.readingAppInstance.showErrorState(error);
        window.readingAppInstance.hideChapterLoadingOverlay();
      });
    }, 100);
  }
});

window.addEventListener("beforeunload", () => {
  if (window.readingApp) {
    window.readingApp.progressTracker?.saveProgressNow?.();
  }
});
