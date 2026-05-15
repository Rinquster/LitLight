// js/book-loader.js

import Utils from "./utils.js";

class BookLoader {
  constructor() {
    this.currentChapter = 1;
    this.bookId = null;
    this.bookInfo = null;
    this.chapterFiles = [];
    this.chapterTitles = {};
    this.mediaRules = [];
    this.hintRules = []; // оставлен для совместимости, но не используется
    this.titlesLoaded = false;
    this.titleLoadingPromise = null;
  }

  async init(bookId) {
    this.bookId = bookId;

    try {
      await this.loadBookInfo();
      this.buildChapterList();
      
      if (this.bookInfo.hasMedia !== false) {
        await this.loadMediaRules();
      } else {
        console.log(`ℹ️ Книга "${this.bookInfo.title}" не содержит медиа, пропускаем загрузку media-rules.json`);
        this.mediaRules = [];
      }

      console.log(
        `✅ BookLoader initialized for "${this.bookInfo.title}", ` +
          `generated ${this.totalChapters} chapter entries`,
      );

      this.createChapterNavigation();
      this.setupNavigation();

      this.titleLoadingPromise = this.loadChapterTitlesInBackground();

      return true;
    } catch (error) {
      console.error("❌ Failed to initialize BookLoader:", error);
      return false;
    }
  }

  async loadBookInfo() {
    const infoPath = `./books/${this.bookId}/info.json`;
    const response = await fetch(infoPath);

    if (!response.ok) {
      throw new Error(`Book info not found for ${this.bookId}`);
    }

    this.bookInfo = await response.json();
    this.bookInfo.ageRating = this.bookInfo.ageRating || 0;
    this.bookInfo.showAgeGate =
      this.bookInfo.showAgeGate ?? this.bookInfo.ageRating >= 18;

    document.title = `${this.bookInfo.title} — Читальный движок`;
    document.body.dataset.ageRating = this.bookInfo.ageRating;

    return this.bookInfo;
  }

  buildChapterList() {
    this.chapterFiles = [];

    const hasPreface = this.bookInfo.hasPreface ?? false;
    const totalChapters = this.bookInfo.totalChapters || 1;

    if (hasPreface) {
      this.chapterFiles.push({
        number: 0,
        filename: "00.html",
        exists: true,
        isPreface: true,
      });
      this.chapterTitles[0] = "Предисловие";
    }

    for (let i = 1; i <= totalChapters; i++) {
      const padded = i.toString().padStart(2, "0");
      this.chapterFiles.push({
        number: i,
        filename: `${padded}.html`,
        exists: true,
        isPreface: false,
      });
      this.chapterTitles[i] = `Глава ${i}`;
    }

    this.totalChapters = this.chapterFiles.length;
    console.log(
      `📚 Built chapter list: ${this.totalChapters} entries ` +
        `(preface: ${hasPreface}, chapters: ${totalChapters})`,
    );
  }

  async loadMediaRules() {
    const rulesPath = `./books/${this.bookId}/media-rules.json`;
    try {
      const response = await fetch(rulesPath);
      if (response.ok) {
        const data = await response.json();
        this.mediaRules = data.media || [];
        console.log(`📦 Loaded ${this.mediaRules.length} media rules`);
      } else {
        this.mediaRules = [];
      }
    } catch (error) {
      this.mediaRules = [];
    }
  }

  async loadSingleChapterTitle(chapter) {
    try {
      const response = await fetch(
        `./books/${this.bookId}/chapters/${chapter.filename}`,
        { cache: "no-cache" },
      );

      if (!response.ok) {
        console.warn(`⚠️ Chapter ${chapter.number} not found on server`);
        chapter.exists = false;
        return null;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      if (chapter.number === 0) {
        const h1 = doc.querySelector("h1");
        const h2 = doc.querySelector("h2");
        return (
          h1?.textContent?.trim() || h2?.textContent?.trim() || "От автора"
        );
      } else {
        const h2 = doc.querySelector("h2");
        if (h2 && h2.textContent.trim()) {
          return h2.textContent.trim();
        }
        return `Глава ${chapter.number}`;
      }
    } catch (error) {
      console.warn(
        `⚠️ Error loading title for chapter ${chapter.number}:`,
        error,
      );
      return null;
    }
  }

  async loadChapterTitlesInBackground() {
    console.log("🔄 Starting background title loading...");

    let removedChapters = false;

    for (const chapter of [...this.chapterFiles]) {
      if (this.isTitleReallyLoaded(chapter.number)) {
        continue;
      }

      const title = await this.loadSingleChapterTitle(chapter);

      if (title === null) {
        this.removeChapterFromList(chapter.number);
        removedChapters = true;
        continue;
      }

      this.chapterTitles[chapter.number] = title;
      this.updateSingleNavItem(chapter.number, title);

      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    if (removedChapters) {
      this.totalChapters = this.chapterFiles.length;
      this.rebuildChapterNavigation();
      this.updateNavigationUI();
      console.log(
        `🔄 Cleaned up chapter list, now ${this.totalChapters} chapters`,
      );
    }

    this.titlesLoaded = true;
    console.log("✅ All chapter titles loaded in background");
  }

  removeChapterFromList(chapterNumber) {
    this.chapterFiles = this.chapterFiles.filter(
      (c) => c.number !== chapterNumber,
    );
    delete this.chapterTitles[chapterNumber];

    const navElement = document.getElementById("chapter-nav");
    if (navElement) {
      const item = navElement.querySelector(
        `.chapter-item[data-chapter="${chapterNumber}"]`,
      );
      if (item) item.remove();
    }

    console.log(`🗑️ Removed non-existent chapter ${chapterNumber} from list`);
  }

  isTitleReallyLoaded(chapterNumber) {
    const title = this.chapterTitles[chapterNumber];
    if (!title) return false;
    if (chapterNumber === 0) {
      return title !== "Предисловие";
    }
    return title !== `Глава ${chapterNumber}`;
  }

  updateSingleNavItem(chapterNumber, title) {
    const navElement = document.getElementById("chapter-nav");
    if (!navElement) return;

    const item = navElement.querySelector(
      `.chapter-item[data-chapter="${chapterNumber}"]`,
    );
    if (item) {
      const titleSpan = item.querySelector(".chapter-item-title");
      if (titleSpan) {
        titleSpan.textContent = title;
      }
    }
  }

  async loadChapter(chapterNumber) {
    chapterNumber = parseInt(chapterNumber);

    console.log(`📖 Loading chapter ${chapterNumber} of ${this.bookId}`);

    try {
      const chapterInfo = this.chapterFiles.find(
        (c) => c.number === chapterNumber,
      );

      if (!chapterInfo) {
        throw new Error(`Chapter ${chapterNumber} not found`);
      }

      const url = `./books/${this.bookId}/chapters/${chapterInfo.filename}`;
      const response = await fetch(url, { cache: "no-cache" });

      if (!response.ok) {
        chapterInfo.exists = false;
        throw new Error(`HTTP ${response.status}`);
      }

      let html = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      if (chapterNumber === 0) {
        const h1 = doc.querySelector("h1");
        const h2 = doc.querySelector("h2");
        this.chapterTitles[0] =
          h1?.textContent?.trim() || h2?.textContent?.trim() || "От автора";
      } else {
        const h2 = doc.querySelector("h2");
        if (h2 && h2.textContent.trim()) {
          this.chapterTitles[chapterNumber] = h2.textContent.trim();
        }
      }

      this.updateSingleNavItem(
        chapterNumber,
        this.chapterTitles[chapterNumber],
      );

      this.updateNavigationUI();

      // исправляем пути медиа (только для изображений, аудио не используется)
      html = html.replace(
        /(src|href)=["'](?!http|https|\/\/)([^"']*\.(png|jpg|jpeg|gif|webp))["']/gi,
        `$1="./books/${this.bookId}/media/$2"`,
      );

      return html;
    } catch (error) {
      console.error(`Error loading chapter ${chapterNumber}:`, error);
      return this.createErrorChapter(chapterNumber);
    }
  }

  getMediaRulesForChapter(chapterNumber) {
    return this.mediaRules.filter((rule) => rule.chapter === chapterNumber);
  }

  createErrorChapter(chapterNumber) {
    const chapterDisplay =
      chapterNumber === 0 ? "предисловия" : `главы ${chapterNumber}`;
    const fileName =
      chapterNumber === 0
        ? "00.html"
        : `${chapterNumber.toString().padStart(2, "0")}.html`;

    return `
            <div class="error-chapter">
                <h1 class="chapter-title">Ошибка загрузки ${chapterDisplay}</h1>
                <p class="chapter-meta">Файл books/${this.bookId}/chapters/${fileName} не найден</p>
                <div class="error-content">
                    <div class="error-actions">
                        <button onclick="window.readingApp?.goToChapter(1)" class="error-btn">
                            Перейти к главе 1
                        </button>
                        <button onclick="location.reload()" class="error-btn">
                            Обновить страницу
                        </button>
                    </div>
                </div>
            </div>
        `;
  }

  createChapterNavigation() {
    const navElement = document.getElementById("chapter-nav");
    if (!navElement) return;

    navElement.innerHTML = "";

    for (const chapter of this.chapterFiles) {
      const isActive = chapter.number === this.currentChapter;
      const title =
        this.chapterTitles[chapter.number] ||
        (chapter.number === 0 ? "Предисловие" : `Глава ${chapter.number}`);

      const item = document.createElement("a");
      item.className = `chapter-item ${isActive ? "active" : ""}`;
      item.href = "#";
      item.dataset.chapter = chapter.number;
      item.innerHTML = `<span class="chapter-item-title">${Utils.escapeHtml(title)}</span>`;

      item.addEventListener("click", (e) => {
        e.preventDefault();
        window.readingApp?.goToChapter(chapter.number);

        if (window.innerWidth < 768) {
          document.getElementById("sidebar")?.classList.remove("open");
          document.getElementById("overlay")?.classList.remove("visible");
        }
      });

      navElement.appendChild(item);
    }
  }

  rebuildChapterNavigation() {
    this.createChapterNavigation();
  }

  setupNavigation() {
    const prevBtn = document.getElementById("prev-chapter");
    const nextBtn = document.getElementById("next-chapter");

    if (prevBtn) {
      prevBtn.addEventListener("click", () => this.goToPreviousChapter());
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => this.goToNextChapter());
    }
  }

  async goToPreviousChapter() {
    const currentIndex = this.chapterFiles.findIndex(
      (c) => c.number === this.currentChapter,
    );
    if (currentIndex > 0) {
      const prevChapter = this.chapterFiles[currentIndex - 1].number;
      await window.readingApp?.goToChapter(prevChapter);
    }
  }

  async goToNextChapter() {
    const currentIndex = this.chapterFiles.findIndex(
      (c) => c.number === this.currentChapter,
    );
    if (currentIndex < this.chapterFiles.length - 1) {
      const nextChapter = this.chapterFiles[currentIndex + 1].number;
      await window.readingApp?.goToChapter(nextChapter);
    }
  }

  updateNavigationUI() {
    const prevBtn = document.getElementById("prev-chapter");
    const nextBtn = document.getElementById("next-chapter");
    const breadcrumb = document.getElementById("current-chapter-title");

    const currentIndex = this.chapterFiles.findIndex(
      (c) => c.number === this.currentChapter,
    );

    if (prevBtn) {
      prevBtn.disabled = currentIndex <= 0;

      if (currentIndex > 0) {
        const prevNumber = this.chapterFiles[currentIndex - 1].number;
        const prevTitle =
          this.chapterTitles[prevNumber] ||
          (prevNumber === 0 ? "Предисловие" : `Глава ${prevNumber}`);
        // безопасная вставка названия через textContent, сохраняя иконку
        prevBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>`;
        prevBtn.appendChild(document.createTextNode(" " + prevTitle));
      } else {
        prevBtn.textContent = "Начало";
      }
    }

    if (nextBtn) {
      nextBtn.disabled = currentIndex >= this.chapterFiles.length - 1;

      if (currentIndex < this.chapterFiles.length - 1) {
        const nextNumber = this.chapterFiles[currentIndex + 1].number;
        const nextTitle =
          this.chapterTitles[nextNumber] || `Глава ${nextNumber}`;
        nextBtn.innerHTML = ``;
        nextBtn.appendChild(document.createTextNode(nextTitle + " "));
        nextBtn.innerHTML += `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>`;
      } else {
        nextBtn.textContent = "Конец";
      }
    }

    if (breadcrumb) {
      let breadcrumbText;
      if (this.currentChapter === 0) {
        breadcrumbText = this.chapterTitles[0] || "Вступление";
      } else {
        breadcrumbText = `Глава ${this.currentChapter}`;
      }
      breadcrumb.textContent = breadcrumbText;
    }

    const navElement = document.getElementById("chapter-nav");
    if (navElement) {
      navElement.querySelectorAll(".chapter-item").forEach((item) => {
        item.classList.remove("active");
        if (parseInt(item.dataset.chapter) === this.currentChapter) {
          item.classList.add("active");
        }
      });
    }
  }

  getCurrentChapter() {
    return this.currentChapter;
  }

  getTotalChapters() {
    return this.totalChapters;
  }

  getBookInfo() {
    return this.bookInfo;
  }

  getBookId() {
    return this.bookId;
  }
}

export default BookLoader;