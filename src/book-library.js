const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { unzipSync } = require("fflate");

const MAX_SOURCE = 24 * 1024 * 1024;
const MAX_UNPACKED = 40 * 1024 * 1024;
const MAX_TEXT = 16 * 1024 * 1024;
const MAX_FILES = 800;

function decodeEntities(text) {
  return String(text).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#")) {
      const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code) : " ";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[key] || whole;
  });
}

function plainText(html) {
  return decodeEntities(String(html).replace(/<\/?(?:p|div|section|article|h[1-6]|li|br)\b[^>]*>/gi, "\n")
    .replace(/<(script|style|svg|nav)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")).replace(/[\t\r ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

function splitChapter(text, chapter) {
  const chunks = [];
  const clean = text.replace(/\u0000/g, "").trim();
  for (let start = 0; start < clean.length; start += 1500) {
    const part = clean.slice(start, start + 1700).trim();
    if (part) chunks.push({ chapter, text: part });
  }
  return chunks;
}

function xmlAttrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((match) => [match[1], decodeEntities(match[3])]));
}

function resolveArchivePath(base, href) {
  const relative = decodeURIComponent(href.split(/[?#]/)[0]);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(base), relative));
  if (resolved.startsWith("../") || resolved.startsWith("/") || resolved === "..") throw new Error("invalid_epub_path");
  return resolved;
}

function parseEpub(bytes, fallbackTitle) {
  let count = 0;
  let total = 0;
  const zip = unzipSync(bytes, { filter(entry) {
    if (++count > MAX_FILES || !Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) throw new Error("invalid_epub");
    if (/\\|(^|\/)\.\.(\/|$)|^\/|:/.test(entry.name)) throw new Error("invalid_epub_path");
    total += entry.originalSize;
    if (total > MAX_UNPACKED) throw new Error("epub_too_large");
    return /\.(?:xml|opf|xhtml|html|htm)$/i.test(entry.name);
  } });
  const container = Buffer.from(zip["META-INF/container.xml"] || []).toString("utf8");
  const rootTag = /<rootfile\b[^>]*>/i.exec(container)?.[0];
  const opfPath = rootTag && xmlAttrs(rootTag)["full-path"];
  if (!opfPath || !zip[opfPath]) throw new Error("invalid_epub");
  const opf = Buffer.from(zip[opfPath]).toString("utf8");
  const title = decodeEntities(/<(?:dc:)?title\b[^>]*>([\s\S]*?)<\/(?:dc:)?title>/i.exec(opf)?.[1] || fallbackTitle).replace(/<[^>]*>/g, "").trim().slice(0, 120);
  const manifest = new Map();
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const attrs = xmlAttrs(match[0]);
    if (attrs.id && attrs.href && /(?:xhtml|html)/i.test(attrs["media-type"] || "")) manifest.set(attrs.id, attrs.href);
  }
  const chunks = [];
  let textLength = 0;
  let index = 0;
  for (const match of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const href = manifest.get(xmlAttrs(match[0]).idref);
    if (!href) continue;
    const content = zip[resolveArchivePath(opfPath, href)];
    if (!content) continue;
    const html = Buffer.from(content).toString("utf8");
    const heading = plainText(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1] || "").slice(0, 100);
    const chapter = heading || `第 ${++index} 章`;
    const text = plainText(html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ""));
    textLength += text.length;
    if (textLength > MAX_TEXT) throw new Error("book_too_large");
    chunks.push(...splitChapter(text, chapter));
  }
  if (!chunks.length) throw new Error("empty_book");
  return { title, chunks };
}

function parseBookFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SOURCE) throw new Error("invalid_book_file");
  const bytes = fs.readFileSync(file);
  const fallbackTitle = path.basename(file, path.extname(file)).slice(0, 120);
  const ext = path.extname(file).toLowerCase();
  let parsed;
  if (ext === ".epub") parsed = parseEpub(bytes, fallbackTitle);
  else if (ext === ".txt") {
    const utf8 = new TextDecoder("utf-8", { fatal: true });
    let text;
    try { text = utf8.decode(bytes); } catch { text = new TextDecoder("gb18030").decode(bytes); }
    if (text.length > MAX_TEXT) throw new Error("book_too_large");
    parsed = { title: fallbackTitle, chunks: splitChapter(text, "正文") };
  } else throw new Error("unsupported_book");
  if (!parsed.chunks.length) throw new Error("empty_book");
  return { id: crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 24),
    title: parsed.title, format: ext.slice(1), chunks: parsed.chunks, importedAt: Date.now() };
}

function booksPath(root) { return path.join(root, "books"); }
function listBooks(root) {
  try { return fs.readdirSync(booksPath(root)).filter((name) => /^[a-f0-9]{24}\.json$/.test(name))
    .map((name) => { try { const book = JSON.parse(fs.readFileSync(path.join(booksPath(root), name), "utf8"));
      return { id: book.id, title: book.title, format: book.format, chunks: book.chunks.length, importedAt: book.importedAt }; } catch { return null; } })
    .filter(Boolean).sort((a, b) => b.importedAt - a.importedAt); } catch { return []; }
}
function saveBook(root, book) {
  fs.mkdirSync(booksPath(root), { recursive: true });
  const target = path.join(booksPath(root), `${book.id}.json`);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(`${target}.tmp`, JSON.stringify(book), { mode: 0o600 });
    fs.renameSync(`${target}.tmp`, target);
  }
  return book.id;
}
function removeBook(root, id) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error("invalid_book_id");
  fs.rmSync(path.join(booksPath(root), `${id}.json`));
}

function terms(text) {
  const value = String(text).toLowerCase();
  const found = [...value.matchAll(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g)].flatMap(([word]) =>
    /[\u3400-\u9fff]/.test(word) ? [...word.slice(0, 100)].slice(0, -1).map((char, i) => char + word[i + 1]) : [word]);
  return [...new Set(found)].filter((word) => !/^(?:什么|怎么|如何|请问|知道|一个|这本|这部|的是|时候)$/.test(word)).slice(0, 32);
}
function searchBooks(root, query, limit = 4) {
  const words = terms(query);
  if (!words.length) return [];
  const hits = [];
  const summaries = listBooks(root).slice(0, 30);
  const broadQuestion = /概括|总结|全书|整本|讲什么|主线|读后感|整体分析|这本书|这部书|summari[sz]e|overview|plot/i.test(query);
  for (const summary of summaries) {
    let book;
    try { book = JSON.parse(fs.readFileSync(path.join(booksPath(root), `${summary.id}.json`), "utf8")); } catch { continue; }
    const titleMentioned = query.includes(book.title);
    if (broadQuestion && (titleMentioned || summaries.length === 1)) {
      const seen = new Set();
      const outline = [];
      for (const chunk of book.chunks) {
        if (seen.has(chunk.chapter)) continue;
        seen.add(chunk.chapter);
        outline.push(`${chunk.chapter}: ${chunk.text.slice(0, 400)}`);
        if (outline.join("\n").length >= 7500) break;
      }
      if (outline.length) hits.push({ title: book.title, chapter: "章节抽样概览", text: outline.join("\n").slice(0, 8000), score: 100 });
      continue;
    }
    const before = hits.length;
    for (const chunk of book.chunks) {
      const hay = `${chunk.chapter} ${chunk.text}`.toLowerCase();
      const matched = words.filter((word) => hay.includes(word));
      const score = matched.length * 3 + (matched.length && titleMentioned ? 2 : 0);
      if (score > 0) hits.push({ title: book.title, chapter: chunk.chapter, text: chunk.text, score });
    }
    if (titleMentioned && hits.length === before) {
      const samples = [book.chunks[0], book.chunks[Math.floor(book.chunks.length / 2)], book.chunks.at(-1)];
      for (const chunk of new Set(samples)) if (chunk) hits.push({ title: book.title, chapter: chunk.chapter,
        text: chunk.text.slice(0, 1300), score: 1 });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { parseBookFile, parseEpub, listBooks, saveBook, removeBook, searchBooks, terms };
