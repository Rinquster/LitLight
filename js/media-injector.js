// js/media-injector.js

import Utils from "./utils.js";
import { MEDIA_TYPES } from "./constants.js";

class MediaInjector {
  constructor() {
    this.mediaRules = [];
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await this.loadMediaRules();
    this.initialized = true;
    console.log("✅ MediaInjector initialized");
  }

  async loadMediaRules() {
    try {
      const config = await Utils.loadJSON("./config/media-rules.json");
      if (config && config.media) {
        this.mediaRules = config.media;
        console.log(`📦 Loaded ${this.mediaRules.length} media rules`);
      } else {
        console.log("No media rules found");
      }
    } catch (error) {
      console.warn("Error loading media rules:", error);
    }
  }

  async injectMedia(html, chapterNumber) {
    if (this.mediaRules.length === 0) return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    for (const rule of this.mediaRules) {
      await this.applyRule(doc, rule);
    }

    return doc.body.innerHTML;
  }

  postProcessInsteadMedia(containerElement) {
    if (!containerElement) return;

    const fallbackParagraphs = containerElement.querySelectorAll(
      "[data-media-fallback]",
    );

    if (fallbackParagraphs.length === 0) return;

    console.log(
      `🔄 Post-processing ${fallbackParagraphs.length} instead-media element(s)`,
    );

    fallbackParagraphs.forEach((paragraph) => {
      const mediaId = paragraph.getAttribute("data-media-fallback");
      const mediaElement = containerElement.querySelector(
        `[data-media-instead="${mediaId}"]`,
      );

      if (!mediaElement) {
        console.warn(`⚠️ Media container not found for "${mediaId}"`);
        paragraph.removeAttribute("data-media-fallback");
        return;
      }

      const images = mediaElement.querySelectorAll("img");

      if (images.length === 0) {
        mediaElement.style.display = "";
        paragraph.remove();
        return;
      }

      let loadedCount = 0;
      let errorCount = 0;
      const totalImages = images.length;

      const checkComplete = () => {
        if (loadedCount + errorCount < totalImages) return;

        if (errorCount > 0) {
          console.log(`⚠️ ${errorCount} image(s) failed, keeping original`);
          mediaElement.remove();
          paragraph.removeAttribute("data-media-fallback");
        } else {
          console.log(`✅ All ${totalImages} image(s) loaded, swapping`);
          mediaElement.style.visibility = "";
          mediaElement.style.height = "";
          mediaElement.style.overflow = "";
          paragraph.remove();
        }
      };

      images.forEach((img) => {
        let settled = false;

        const onSuccess = () => {
          if (settled) return;
          settled = true;
          loadedCount++;
          checkComplete();
        };

        const onFailure = () => {
          if (settled) return;
          settled = true;
          errorCount++;
          checkComplete();
        };

        if (img.complete) {
          img.naturalHeight > 0 ? onSuccess() : onFailure();
        } else {
          img.addEventListener("load", () => {
            img.naturalHeight > 0 ? onSuccess() : onFailure();
          });
          img.addEventListener("error", onFailure);

          setTimeout(() => {
            if (!settled) {
              console.log(`⚠️ Image timed out`);
              onFailure();
            }
          }, 10000);
        }
      });
    });
  }

  async applyRule(doc, rule) {
    console.log(`🔍 Looking for anchor: "${rule.anchor.substring(0, 50)}..."`);

    const targetElement = this.findAnchorElementByText(doc, rule.anchor);

    if (!targetElement) {
      console.warn(
        `❌ Media rule anchor not found: "${rule.anchor}"`,
      );
      return;
    }

    console.log(
      `✅ Found anchor element: <${targetElement.tagName.toLowerCase()}>`,
    );

    if (rule.type === MEDIA_TYPES.IMAGE) {
      const mediaElement = await this.createImageElement(rule);

      if (!mediaElement) {
        console.warn(`❌ Failed to create media element for rule:`, rule);
        return;
      }

      if (rule.position === "instead") {
        this.applyInsteadPosition(targetElement, mediaElement, rule);
      } else if (rule.position === "before") {
        targetElement.parentNode.insertBefore(mediaElement, targetElement);
      } else {
        targetElement.parentNode.insertBefore(
          mediaElement,
          targetElement.nextSibling,
        );
      }
    } else {
      console.warn(`Unsupported media type: ${rule.type}`);
    }
  }

  applyInsteadPosition(targetParagraph, mediaElement, rule) {
    const mediaId = rule.id || `media-${Date.now()}`;

    mediaElement.style.visibility = "hidden";
    mediaElement.style.height = "0";
    mediaElement.style.overflow = "hidden";
    mediaElement.setAttribute("data-media-instead", mediaId);

    targetParagraph.setAttribute("data-media-fallback", mediaId);
    targetParagraph.parentNode.insertBefore(mediaElement, targetParagraph);
  }

  findAnchorElementByText(doc, searchText) {
    const elements = doc.querySelectorAll("p, blockquote");
    for (const element of elements) {
      if (element.textContent.includes(searchText)) {
        return element;
      }
    }
    return null;
  }

  async createImageElement(rule) {
    const imagePaths = rule.src;
    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      console.error("No image sources provided in rule:", rule);
      return null;
    }

    const container = Utils.createElement("div", "media-container", {
      "data-media-id": rule.id || `media-${Date.now()}`,
      "data-type": rule.type,
    });

    if (rule.width) container.style.width = rule.width;
    if (rule.height) container.style.height = rule.height;

    const loadPromises = imagePaths.map((path, index) => {
      return this.loadImageElement(path, rule, index);
    });

    const imageElements = await Promise.all(loadPromises);
    let hasValidImages = false;

    imageElements.forEach((img, index) => {
      if (img) {
        container.appendChild(img);
        hasValidImages = true;
        if (index < imageElements.length - 1) {
          const spacer = Utils.createElement("div");
          spacer.style.height = "1rem";
          container.appendChild(spacer);
        }
      }
    });

    if (hasValidImages && rule.caption) {
      const captionEl = Utils.createElement("div", "media-caption");
      captionEl.textContent = rule.caption;
      container.appendChild(captionEl);
    }

    return hasValidImages ? container : null;
  }

  async loadImageElement(path, rule, index) {
    const normalizedPath = this.normalizePath(path);

    const img = Utils.createElement("img", "media-image", {
      src: normalizedPath,
      alt: rule.alt || `Изображение ${rule.id || "unknown"} - ${index + 1}`,
      ...(rule.position !== "instead" && { loading: "lazy" }),
    });

    if (rule.width) img.style.width = rule.width;
    if (rule.height) img.style.height = rule.height;

    img.onerror = () => {
      console.error(`❌ Failed to load image: ${normalizedPath}`);
      img.style.display = "none";

      const errorSpan = Utils.createElement("span");
      errorSpan.textContent = `[Ошибка загрузки изображения: ${path}]`;
      errorSpan.style.color = "var(--error-color, red)";
      errorSpan.style.fontSize = "0.8em";

      img.parentNode?.insertBefore(errorSpan, img.nextSibling);
    };

    return img;
  }

  setBookRules(rules) {
    this.mediaRules = rules || [];
    console.log(
      `📦 MediaInjector set with ${this.mediaRules.length} rules for current book`,
    );
  }

  normalizePath(path) {
    if (!path) return "";

    let normalized = path.trim();

    if (
      normalized.startsWith("http://") ||
      normalized.startsWith("https://") ||
      normalized.startsWith("data:")
    ) {
      return normalized;
    }

    const bookId = window.readingApp?.bookId || "unknown-book";

    if (!normalized.startsWith("./") && !normalized.startsWith("../")) {
      normalized = normalized.replace(/^media\//, "");
      return `./books/${bookId}/media/${normalized}`;
    }

    return normalized;
  }

  cleanup() {
    this.mediaRules = [];
    this.initialized = false;
  }
}

export default MediaInjector;