// tools/count-volume.mjs
//
// Объём книг: число знаков с пробелами в видимом тексте глав.
// Пишется в поле charCount файла books/<id>/info.json; библиотека показывает его
// в карточке как «456 507 зн., 11,41 а.л.» (авторский лист — 40 000 знаков).
//
//   node tools/count-volume.mjs           — пересчитать и записать;
//   node tools/count-volume.mjs --check   — только сверить, код выхода 1 при расхождениях.
//
// Считается текст глав 1…totalChapters и главы 0 (при hasPreface) без разметки.
// Не считаются: пробелы и переводы строк, которые HTML схлопывает; разрывы между
// абзацами и строками (<br>, строки внутри <pre>); служебная дата
// .chapter-publish-date; невидимые символы (мягкий перенос, символы нулевой ширины).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHARS_PER_AUTHOR_SHEET = 40000;

const BREAK = "\u0000";
const BLOCK_TAGS = /<\/?(?:p|div|h[1-6]|blockquote|li|ul|ol|table|tr|td|th|section|article|header|footer|figure|figcaption)\b[^>]*>|<br\s*\/?>/gi;
const INVISIBLE = /[­​-‍⁠﻿]/g;
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…",
  shy: "­", thinsp: " ", ensp: " ", emsp: " ",
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

// Знаки с пробелами в видимом тексте одного HTML-фрагмента.
export function visibleLength(html) {
  let text = String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<div\b[^>]*\bclass="[^"]*\bchapter-publish-date\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  // Внутри <pre> переводы строк — настоящие разрывы строк, а не пробелы.
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => BREAK + inner.replace(/\r?\n/g, BREAK) + BREAK);
  text = text.replace(BLOCK_TAGS, BREAK).replace(/<[^>]*>/g, "");
  let count = 0;
  for (const line of text.split(BREAK)) {
    const visible = decodeEntities(line).replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
    count += [...visible].length;
  }
  return count;
}

// Главы, которые показывает читалка: 0 при hasPreface и 1…totalChapters.
export function chapterNumbers(info) {
  const total = Math.max(0, Number.parseInt(info?.totalChapters ?? 0, 10) || 0);
  const numbers = info?.hasPreface === true ? [0] : [];
  for (let number = 1; number <= total; number += 1) numbers.push(number);
  return numbers;
}

export function countBook(bookDir, info) {
  const chaptersDir = join(bookDir, "chapters");
  const files = new Map();
  for (const name of readdirSync(chaptersDir).sort()) {
    const match = /^(\d+)\.html$/i.exec(name);
    if (match && !files.has(Number(match[1]))) files.set(Number(match[1]), name);
  }
  let total = 0;
  for (const number of chapterNumbers(info)) {
    // Имя файла из info.chapterFiles важнее стандартного «NN.html» — как в читалке.
    const configured = info?.chapterFiles?.[String(number)];
    const name = typeof configured === "string" && /^[^/\\]+\.html$/i.test(configured.trim())
      && existsSync(join(chaptersDir, configured.trim()))
      ? configured.trim()
      : files.get(number);
    if (name) total += visibleLength(readFileSync(join(chaptersDir, name), "utf8"));
  }
  return total;
}

// Ставит charCount в текст info.json, не трогая остальное оформление файла:
// заменяет старое значение или добавляет строку после totalChapters.
export function withCharCount(source, value) {
  let result;
  if (/"charCount"\s*:\s*\d+/.test(source)) {
    result = source.replace(/("charCount"\s*:\s*)\d+/, `$1${value}`);
  } else {
    const line = /^([ \t]*)"totalChapters"\s*:\s*[^,\n]*?(,?)[ \t]*$/m.exec(source);
    if (line) {
      const [whole, indent, comma] = line;
      result = source.replace(whole, comma
        ? `${whole}\n${indent}"charCount": ${value},`
        : `${whole.trimEnd()},\n${indent}"charCount": ${value}`);
    } else {
      const indent = /^([ \t]+)"/m.exec(source)?.[1] ?? "  ";
      result = source.replace(/\s*}\s*$/, (tail) => `,\n${indent}"charCount": ${value}${tail}`);
    }
  }
  if (JSON.parse(result).charCount !== value) throw new Error("charCount не удалось записать");
  return result;
}

export function formatCount(count) {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const booksDir = join(root, "books");
  const check = process.argv.includes("--check");
  const stale = [];
  let books = 0;
  for (const entry of readdirSync(booksDir, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const bookDir = join(booksDir, entry.name);
    const infoPath = join(bookDir, "info.json");
    if (!existsSync(infoPath) || !existsSync(join(bookDir, "chapters"))) continue;
    books += 1;
    const source = readFileSync(infoPath, "utf8");
    const info = JSON.parse(source);
    const count = countBook(bookDir, info);
    const sheets = (count / CHARS_PER_AUTHOR_SHEET).toFixed(2).replace(".", ",");
    if (check) {
      if (info.charCount !== count) stale.push(`[${entry.name}] charCount ${info.charCount ?? "нет"}, по главам ${count}`);
      continue;
    }
    if (info.charCount !== count) writeFileSync(infoPath, withCharCount(source, count));
    const was = info.charCount === count ? "" : info.charCount === undefined ? "  (записано)" : `  (было ${info.charCount})`;
    console.log(`${entry.name.padEnd(16)} ${formatCount(count).padStart(10)} зн., ${sheets} а.л.${was}`);
  }
  if (stale.length) {
    console.error(`Объём устарел у ${stale.length} книг(и) — пересчитайте: node tools/count-volume.mjs\n`);
    for (const line of stale) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
  if (check) console.log(`Объём актуален: ${books} книг(и).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
