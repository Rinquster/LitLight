// js/reading-progress-tracker.js

import Utils from "./utils.js";

class ReadingProgressTracker {
  constructor() {
    this.STORAGE_KEY = "readingProgress";
    this.progressData = {};
    this.currentBookId = null;
    this.saveDebounced = Utils.debounce(() => this.saveProgress(), 1000);
  }

  init(bookId) {
    this.currentBookId = bookId;
    this.loadAllProgress();
    console.log("✅ ReadingProgressTracker initialized for:", bookId);
  }

  loadAllProgress() {
    this.progressData = Utils.loadFromStorage(this.STORAGE_KEY, {});
  }

  saveProgress() {
    Utils.saveToStorage(this.STORAGE_KEY, this.progressData);
  }

  saveProgressNow() {
    // принудительное сохранение без задержки
    this.saveProgress();
  }

  updateProgress(chapterNumber, scrollPercent) {
    if (!this.currentBookId) return;
    this.progressData[this.currentBookId] = {
      chapter: chapterNumber,
      scrollPercent: Math.round(scrollPercent),
      timestamp: Date.now(),
    };
    this.saveDebounced();
  }

  getProgress(bookId) {
    bookId = bookId || this.currentBookId;
    return this.progressData[bookId] || null;
  }

  hasProgress(bookId) {
    bookId = bookId || this.currentBookId;
    const progress = this.progressData[bookId];
    if (!progress) return false;
    return progress.chapter > 0 || progress.scrollPercent > 3;
  }

  clearProgress(bookId) {
    bookId = bookId || this.currentBookId;
    delete this.progressData[bookId];
    this.saveProgress();
  }

  startTracking(readingAreaSelector = ".reading-area") {
    const readingArea = document.querySelector(readingAreaSelector);
    if (!readingArea) return;

    this.stopTracking();

    this._scrollHandler = Utils.debounce(() => {
      const scrollTop = readingArea.scrollTop;
      const clientHeight = readingArea.clientHeight;
      const scrollHeight = readingArea.scrollHeight;
      const maxScroll = scrollHeight - clientHeight;

      let percent = 0;
      if (maxScroll > 0) {
        percent = (scrollTop / maxScroll) * 100;
        percent = Math.min(100, Math.max(0, percent));
      }

      const currentChapter = window.readingApp?.bookLoader?.currentChapter ?? 1;
      this.updateProgress(currentChapter, percent);
    }, 500);

    readingArea.addEventListener("scroll", this._scrollHandler);
    console.log("📊 Scroll tracking started");

    // Сохраняем прогресс при скрытии вкладки и перед закрытием
    window.addEventListener("visibilitychange", () => {
      if (document.hidden) this.saveProgressNow();
    });
    window.addEventListener("beforeunload", () => this.saveProgressNow());
  }

  stopTracking() {
    if (this._scrollHandler) {
      const readingArea = document.querySelector(".reading-area");
      if (readingArea) {
        readingArea.removeEventListener("scroll", this._scrollHandler);
      }
      this._scrollHandler = null;
    }
  }

  showResumeModal(progress, chapterTitles, hasPreface) {
    return new Promise((resolve) => {
      const chapterTitle =
        chapterTitles[progress.chapter] ||
        (progress.chapter === 0 ? "Предисловие" : `Глава ${progress.chapter}`);

      const timeAgo = this.formatTimeAgo(progress.timestamp);

      const existing = document.getElementById("resume-reading-modal");
      if (existing) existing.remove();

      const modal = document.createElement("div");
      modal.id = "resume-reading-modal";
      modal.className = "resume-modal";
      modal.innerHTML = `
                <div class="resume-modal-overlay"></div>
                <div class="resume-modal-content">
                    <h2>Продолжить чтение?</h2>
                    <p class="resume-modal-info">Вы уже читали данное произведение и остановились на:</p>
                    <div class="resume-modal-progress">
                        <div class="resume-chapter-name">${Utils.escapeHtml(chapterTitle)}</div>
                        <div class="resume-progress-bar-container">
                            <div class="resume-progress-bar" style="width: ${progress.scrollPercent}%"></div>
                        </div>
                        <div class="resume-progress-text">Прочтено: ${progress.scrollPercent}%</div>
                        <div class="resume-time-ago">${timeAgo}</div>
                    </div>
                    <div class="resume-modal-buttons">
                        <button class="resume-btn resume-btn-start" id="resume-start-btn">Открыть начало</button>
                        <button class="resume-btn resume-btn-continue" id="resume-continue-btn">Продолжить с этого места</button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      requestAnimationFrame(() => {
        modal.classList.add("visible");
      });

      const cleanup = () => {
        modal.classList.remove("visible");
        setTimeout(() => modal.remove(), 300);
      };

      document.getElementById("resume-start-btn").addEventListener("click", () => {
        cleanup();
        const startChapter = hasPreface ? 0 : 1;
        resolve({ action: "start", chapter: startChapter, scrollPercent: 0 });
      });

      document.getElementById("resume-continue-btn").addEventListener("click", () => {
        cleanup();
        resolve({ action: "continue", chapter: progress.chapter, scrollPercent: progress.scrollPercent });
      });

      modal.querySelector(".resume-modal-overlay").addEventListener("click", () => {
        cleanup();
        resolve({ action: "continue", chapter: progress.chapter, scrollPercent: progress.scrollPercent });
      });

      const keyHandler = (e) => {
        if (e.key === "Escape") {
          cleanup();
          const startChapter = hasPreface ? 0 : 1;
          resolve({ action: "start", chapter: startChapter, scrollPercent: 0 });
          document.removeEventListener("keydown", keyHandler);
        }
      };
      document.addEventListener("keydown", keyHandler);
    });
  }

  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} дн. назад`;

    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${day}.${month}.${date.getFullYear()}`;
  }
}

export default ReadingProgressTracker;