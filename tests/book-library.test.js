const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { zipSync } = require("fflate");
const { parseBookFile, saveBook, listBooks, searchBooks, removeBook } = require("../src/book-library");

test("EPUB is imported in spine order, persisted, searched, and removed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-books-"));
  try {
    const file = path.join(root, "sample.epub");
    fs.writeFileSync(file, zipSync({
      "META-INF/container.xml": Buffer.from('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
      "OEBPS/content.opf": Buffer.from('<package><metadata><dc:title>星河之书</dc:title></metadata><manifest><item id="a" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="b" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'),
      "OEBPS/chapter1.xhtml": Buffer.from("<html><body><h1>第一章</h1><p>艾莉丝在森林里找到蓝色钥匙。</p></body></html>"),
      "OEBPS/chapter2.xhtml": Buffer.from("<html><body><h1>第二章</h1><p>主角乘坐飞船经过月亮。</p></body></html>"),
    }));
    const book = parseBookFile(file);
    assert.equal(book.title, "星河之书");
    assert.equal(book.chunks[0].chapter, "第二章");
    saveBook(root, book);
    assert.equal(listBooks(root)[0].title, "星河之书");
    assert.equal(searchBooks(root, "蓝色钥匙是谁找到的？")[0].chapter, "第一章");
    assert.match(searchBooks(root, "概括这本书的剧情")[0].text, /第二章/);
    removeBook(root, book.id);
    assert.deepEqual(listBooks(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("TXT import preserves content and rejects unsupported files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "alice-books-"));
  try {
    const file = path.join(root, "故事.txt");
    fs.writeFileSync(file, "秘密花园里有一只小猫。", "utf8");
    assert.match(parseBookFile(file).chunks[0].text, /小猫/);
    assert.throws(() => parseBookFile(path.join(root, "missing.pdf")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
