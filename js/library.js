// js/library.js
import ThemeManager from "./theme-manager.js";
import Utils from "./utils.js";
import {
  AGE_GATE_CONFIRMED_KEY,
  AGE_GATE_CONFIRMED_TIMESTAMP,
  AGE_GATE_SESSION_DURATION,
} from "./constants.js";

class LibraryApp {
  constructor() {
    this.themeManager = null;
    this.books = [];
    this.booksGrid = document.getElementById("books-grid");
    this.loadingOverlay = document.getElementById("loading-overlay");
    this.ageGateModal = null;
    this.ageConfirmed = false;
  }

  async init() {
    console.log("📚 Initializing Library...");

    this.themeManager = new ThemeManager();

    this.checkAgeConfirmation();

    try {
      await this.scanBooks();
      this.render();

      if (!this.ageConfirmed) {
        this.createAgeGateModal();
      }
    } catch (error) {
      console.error("Failed to load library:", error);
      this.showError();
    } finally {
      this.hideLoadingOverlay();
    }
  }

  checkAgeConfirmation() {
    const confirmed = Utils.loadFromStorage(AGE_GATE_CONFIRMED_KEY, false);
    const timestamp = Utils.loadFromStorage(AGE_GATE_CONFIRMED_TIMESTAMP, 0);
    const now = Date.now();

    if (confirmed && now - timestamp < AGE_GATE_SESSION_DURATION) {
      this.ageConfirmed = true;
      console.log("✅ Age confirmed in this session");
    } else if (confirmed) {
      Utils.saveToStorage(AGE_GATE_CONFIRMED_KEY, false);
      Utils.saveToStorage(AGE_GATE_CONFIRMED_TIMESTAMP, 0);
      this.ageConfirmed = false;
      console.log("🔄 Age confirmation expired, need to confirm again");
    } else {
      this.ageConfirmed = false;
    }
  }

  createAgeGateModal(message = null) {
    const hasAdultContent = this.books.some((book) => book.ageRating >= 18);

    if (!hasAdultContent && !message) {
      console.log("ℹ️ No adult content found, skipping age gate");
      this.ageConfirmed = true;
      Utils.saveToStorage(AGE_GATE_CONFIRMED_KEY, true);
      Utils.saveToStorage(AGE_GATE_CONFIRMED_TIMESTAMP, Date.now());
      return;
    }

    if (document.getElementById("age-gate-modal")) {
      return;
    }

    const modalMessage =
      message ||
      "Этот сайт содержит контент, предназначенный исключительно для лиц, достигших 18 лет.\n" +
        "Входя на этот сайт, вы подтверждаете, что вам уже есть 18 лет и вы согласны с тем, что будете\n" +
        "использовать этот сайт на свой страх и риск.\n" +
        "Владелец сайта не несёт ответственности за любой ущерб, который может возникнуть в результате\n" +
        "использования этого сайта несовершеннолетними лицами.";

    const modal = document.createElement("div");
    modal.id = "age-gate-modal";
    modal.className = "age-gate-modal";
    modal.innerHTML = `
      <div class="age-gate-content">
        <h2>${message ? "Требуется подтверждение" : "Предупреждение о возрасте"}</h2>
        <p>${modalMessage.replace(/\n/g, "<br>")}</p>
        ${!message ? "<p>Если вам ещё нет 18 лет, пожалуйста, покиньте этот сайт.</p>" : ""}
        <div class="age-gate-buttons">
          <button id="age-gate-accept" class="age-gate-btn accept-btn">
            Мне уже есть 18 лет
          </button>
          <button id="age-gate-decline" class="age-gate-btn decline-btn">
            ${message ? "Закрыть" : "Мне ещё нет 18 лет"}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.ageGateModal = modal;

    let overlay = document.getElementById("overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "overlay";
      overlay.className = "overlay visible";
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add("visible");
    }

    const acceptBtn = document.getElementById("age-gate-accept");
    const declineBtn = document.getElementById("age-gate-decline");

    acceptBtn.addEventListener("click", () => {
      this.ageConfirmed = true;
      Utils.saveToStorage(AGE_GATE_CONFIRMED_KEY, true);
      Utils.saveToStorage(AGE_GATE_CONFIRMED_TIMESTAMP, Date.now());

      modal.remove();

      const overlay = document.getElementById("overlay");
      if (overlay) {
        overlay.classList.remove("visible");
      }

      this.render();
    });

    declineBtn.addEventListener("click", () => {
      modal.remove();

      const overlay = document.getElementById("overlay");
      if (overlay) {
        overlay.classList.remove("visible");
      }

      if (!message) {
        this.render();
      }
    });
  }

  async scanBooks() {
    console.log("🔍 Starting scanBooks...");

    try {
      const indexResponse = await fetch("./books/index.json");
      if (!indexResponse.ok) {
        throw new Error("Failed to load books index");
      }

      const indexData = await indexResponse.json();
      const candidateBooks = indexData.books || [];

      console.log(`📋 Found book list from index:`, candidateBooks);

      const books = [];

      for (const bookId of candidateBooks) {
        try {
          const infoPath = `./books/${bookId}/info.json`;
          console.log(`🔍 Checking: ${infoPath}`);

          const response = await fetch(infoPath);

          if (response.ok) {
            const info = await response.json();
            console.log(`✅ Found book: ${info.title} (id: ${bookId})`);

            let hasPreface = false;
            try {
              const prefaceResponse = await fetch(
                `./books/${bookId}/chapters/00.html`,
                {
                  method: "HEAD",
                },
              );
              hasPreface = prefaceResponse.ok;
            } catch {
              hasPreface = false;
            }

            books.push({
              id: bookId,
              ...info,
              coverUrl: `./books/${bookId}/${info.cover || ""}`,
              ageRating: info.ageRating || 0,
              tags: info.tags || [],
              hasPreface: hasPreface,
              writtenDate: info.writtenDate || null,
              finished: info.finished || false,
            });
          }
        } catch (error) {
          console.warn(`⚠️ Error loading book ${bookId}:`, error);
        }
      }

      this.books = books;
      console.log(
        "📚 Final books list:",
        this.books.map((b) => ({
          id: b.id,
          title: b.title,
          ageRating: b.ageRating,
          hasPreface: b.hasPreface,
          writtenDate: b.writtenDate,
          finished: b.finished,
        })),
      );
    } catch (error) {
      console.error("❌ Failed to load books index:", error);
      this.books = [];
    }
  }

  render() {
    console.log("📋 Rendering library, books:", this.books);

    if (!this.booksGrid) {
      console.error("❌ booksGrid element not found!");
      return;
    }

    if (this.books.length === 0) {
      this.booksGrid.innerHTML =
        '<div class="no-books">📚 В библиотеке пока нет книг</div>';
      return;
    }

    let html = "";
    this.books.forEach((book) => {
      console.log("📚 Processing book:", book);
      html += this.createBookCard(book);
    });

    this.booksGrid.innerHTML = html;

    const cards = this.booksGrid.querySelectorAll(".book-card");
    console.log(`🔍 Found ${cards.length} cards in DOM`);

    cards.forEach((card) => {
      const clickableElements = card.querySelectorAll(
        ".book-cover-wrapper, .book-title",
      );

      clickableElements.forEach((element) => {
        element.addEventListener(
          "click",
          function (event) {
            event.stopPropagation();

            const bookCard = element.closest(".book-card");
            const bookId = bookCard.dataset.bookId;
            const hasPreface = bookCard.dataset.hasPreface === "true";
            const ageRating = parseInt(bookCard.dataset.ageRating) || 0;

            console.log(
              "🔍 CLICK DETECTED! bookId:",
              bookId,
              "ageRating:",
              ageRating,
            );

            if (!bookId) {
              console.error("❌ No bookId found!");
              return;
            }

            if (ageRating >= 18 && !this.ageConfirmed) {
              const title =
                bookCard.querySelector(".book-title")?.textContent ||
                "этой книге";
              const message = `Для доступа к книге "${title}" необходимо подтвердить, что вам есть 18 лет.`;
              this.createAgeGateModal(message);
              return;
            }

            const url = `./book?id=${encodeURIComponent(bookId)}`;
            console.log("🔗 Redirecting to:", url);

            window.location.href = url;
          }.bind(this),
        );
      });
    });
  }

  getTagIcon() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.59 13.41L13.42 20.58C13.2343 20.766 13.0137 20.9135 12.7709 21.0141C12.5281 21.1148 12.2678 21.1666 12.005 21.1666C11.7422 21.1666 11.4819 21.1148 11.2391 21.0141C10.9963 20.9135 10.7757 20.766 10.59 20.58L3 13V3H13L20.59 10.59C20.9625 10.9647 21.1716 11.4716 21.1716 12C21.1716 12.5284 20.9625 13.0353 20.59 13.41V13.41Z" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M8 8H8.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  formatDate(dateString) {
    if (!dateString) return null;

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();

      return `${day}.${month}.${year}`;
    } catch {
      return dateString;
    }
  }

  getStatusHtml(book) {
    if (book.finished) {
      return '<span class="book-status status-finished" title="Произведение завершено">✅ Завершено</span>';
    } else {
      return '<span class="book-status status-progress" title="Произведение в процессе написания">🔄 В процессе</span>';
    }
  }

  createBookCard(book) {
    console.log("📚 Creating card for:", book.id, book.title);

    const coverHtml = book.cover
      ? `<img src="${book.coverUrl}" alt="${book.title}" class="book-cover" 
              onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22300%22%20viewBox%3D%220%200%20200%20300%22%3E%3Crect%20width%3D%22200%22%20height%3D%22300%22%20fill%3D%22%23cccccc%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-size%3D%2224%22%20fill%3D%22%23666666%22%3E${book.title.charAt(0)}%3C%2Ftext%3E%3C%2Fsvg%3E';">`
      : `<div class="book-cover-placeholder">${book.title.charAt(0)}</div>`;

    const ageBadgeClass =
      book.ageRating >= 18
        ? "age-18"
        : book.ageRating > 0
          ? `age-${book.ageRating}`
          : "";

    const ageBadge =
      book.ageRating > 0
        ? `<span class="age-badge ${ageBadgeClass}">${book.ageRating}+</span>`
        : "";

    const isBlocked = book.ageRating >= 18 && !this.ageConfirmed;
    const cardClass = isBlocked ? "book-card blocked" : "book-card";

    const tagsHtml =
      book.tags && book.tags.length > 0
        ? `<div class="book-tags">${book.tags
            .map(
              (tag) =>
                `<span class="book-tag">${this.getTagIcon()} ${Utils.escapeHtml(tag)}</span>`,
            )
            .join("")}</div>`
        : "";

    const formattedDate = this.formatDate(book.writtenDate);
    const dateHtml = formattedDate
      ? `<span class="book-date" title="Дата написания">📅 ${formattedDate}</span>`
      : "";

    const statusHtml = this.getStatusHtml(book);
    const blockOverlay = isBlocked
      ? '<div class="book-blocked-overlay"><span>🔞 18+</span></div>'
      : "";

    return `
        <div class="${cardClass}" data-book-id="${book.id}" data-age-rating="${book.ageRating || 0}" data-has-preface="${book.hasPreface || false}">
            <div class="book-cover-wrapper">
                ${coverHtml}
            </div>
            <div class="book-info">
                ${ageBadge}
                <h2 class="book-title">${Utils.escapeHtml(book.title)}</h2>
                <p class="book-author">${Utils.escapeHtml(book.author || "Автор неизвестен")}</p>
                <p class="book-description">${Utils.escapeHtml(book.description || "")}</p>
                
                ${tagsHtml}
                
                <div class="book-meta">
                    ${statusHtml}
                    ${dateHtml}
                    <span>📖 ${book.totalChapters || "?"} ${this.pluralizeChapters(book.totalChapters)}</span>
                    ${book.hasMedia ? "<span>🎵 аудио</span>" : ""}
                    ${book.hasHints ? "<span>💡 подсказки</span>" : ""}
                </div>
                ${blockOverlay}
            </div>
        </div>
    `;
  }

  pluralizeChapters(count) {
    count = parseInt(count) || 0;

    if (count % 10 === 1 && count % 100 !== 11) {
      return "глава";
    } else if (
      [2, 3, 4].includes(count % 10) &&
      ![12, 13, 14].includes(count % 100)
    ) {
      return "главы";
    } else {
      return "глав";
    }
  }

  showError() {
    if (this.booksGrid) {
      this.booksGrid.innerHTML =
        '<div class="error">❌ Ошибка загрузки библиотеки</div>';
    }
  }

  hideLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.opacity = "0";
      this.loadingOverlay.style.visibility = "hidden";
      setTimeout(() => this.loadingOverlay?.remove(), 300);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new LibraryApp();
  app.init();
});
