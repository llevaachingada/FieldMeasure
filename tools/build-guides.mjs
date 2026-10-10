#!/usr/bin/env node
/**
 * Builds the printable guides in docs/guides/ from their Markdown sources.
 *
 *   npm run guides        (or: node tools/build-guides.mjs)
 *
 *   docs/guides/QUICK-START.md -> docs/guides/Field-Measure-Quick-Start.pdf  (for the crews)
 *   docs/guides/AI-GUIDE.md    -> docs/guides/Field-Measure-AI-Guide.pdf     (for the owner)
 *
 * The Markdown is the source of truth (GitHub and AI agents read it); the PDF is for printing,
 * emailing and the handoff. Re-run this after editing a guide and commit both files.
 *
 * No new dependencies: a small converter for the Markdown these guides use (headings,
 * paragraphs, bold, inline code, links, images, lists, tables, code blocks), printed by the
 * Chromium that Playwright already installs (`npx playwright install chromium`, or set
 * PW_CHROMIUM_PATH to a Chromium binary).
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const GUIDES = join(ROOT, 'docs', 'guides');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const JOBS = [
  {
    source: 'QUICK-START.md',
    out: 'Field-Measure-Quick-Start.pdf',
    kicker: 'For the crews',
  },
  {
    source: 'AI-GUIDE.md',
    out: 'Field-Measure-AI-Guide.pdf',
    kicker: 'For whoever looks after the app',
  },
];

// ---------------------------------------------------------------------------------------------
// Markdown -> HTML (the subset the guides use)
// ---------------------------------------------------------------------------------------------

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

function markdownToHtml(md, baseDir) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let h1Done = false;

  const isBlockStart = (l) =>
    /^(#{1,3} |```|\||> |- |\d+\. |!\[|---\s*$)/.test(l) || l.trim() === '';

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1 && !h1Done) {
        h1Done = true; // the title is rendered by the cover block
      } else {
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      }
      i += 1;
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (image) {
      const src = pathToFileURL(resolve(baseDir, image[2])).href;
      out.push(`<figure><img src="${src}" alt="${escapeHtml(image[1])}"></figure>`);
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        '<table><thead><tr>' +
          cells(head).map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>',
      );
      continue;
    }

    if (line.startsWith('> ')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^(- |(\d+)\. )/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const start = ordered ? Number(listMatch[2]) : 1;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(ordered ? /^\d+\. (.*)$/ : /^- (.*)$/);
        if (m) {
          items.push(m[1]);
          i += 1;
        } else if (/^\s{2,}\S/.test(l) && items.length) {
          items[items.length - 1] += ' ' + l.trim();
          i += 1;
        } else {
          break;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
      out.push(`<${tag}${startAttr}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !(para.length && isBlockStart(lines[i]))) {
      if (lines[i].trim() === '') break;
      para.push(lines[i++].trim());
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

const fontUrl = (f) => pathToFileURL(join(ROOT, 'public', 'fonts', f)).href;
const LOGO = pathToFileURL(join(ROOT, 'public', 'branding', 'vangarde-full.png')).href;

function page(title, kicker, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@font-face { font-family: Archivo; src: url('${fontUrl('Archivo.woff2')}') format('woff2'); font-weight: 100 900; }
@font-face { font-family: JBM; src: url('${fontUrl('JetBrainsMono.woff2')}') format('woff2'); font-weight: 100 800; }
@page { size: Letter; margin: 0.6in 0.65in 0.7in; }
:root { --ink: #14181d; --muted: #5b6470; --rule: #d9dee4; --accent: #e8650a; --soft: #f4f6f8; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Archivo, 'Segoe UI', Arial, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.45; margin: 0; }
.cover { display: flex; align-items: center; justify-content: space-between; gap: 24px;
  border-bottom: 3px solid var(--accent); padding-bottom: 14px; margin-bottom: 18px; }
.cover .kicker { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
.cover h1 { font-size: 22pt; line-height: 1.15; margin: 4px 0 0; }
.cover img { height: 46px; }
.meta { font-size: 8.5pt; color: var(--muted); margin-top: 4px; }
h2 { font-size: 14pt; margin: 20px 0 6px; padding-top: 6px; border-top: 1px solid var(--rule); break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14px 0 4px; break-after: avoid; }
p { margin: 6px 0; }
ol, ul { margin: 6px 0 6px 0; padding-left: 22px; }
li { margin: 3px 0; }
strong { font-weight: 700; }
a { color: #0b5cad; text-decoration: none; word-break: break-all; }
code { font-family: JBM, Consolas, monospace; font-size: 8.8pt; background: var(--soft); padding: 1px 4px; border-radius: 3px; }
pre { background: #0f1317; color: #e8ecef; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap;
  font-size: 8.4pt; line-height: 1.4; break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: inherit; }
figure { margin: 8px 0 10px; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 3.6in; border: 1px solid var(--rule); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9.4pt; break-inside: auto; }
th, td { border: 1px solid var(--rule); padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: var(--soft); }
tr { break-inside: avoid; }
blockquote { margin: 8px 0; padding: 6px 10px; border-left: 3px solid var(--accent); background: var(--soft); }
hr { border: none; border-top: 1px solid var(--rule); margin: 14px 0; }
</style></head><body>
<header class="cover">
  <div>
    <div class="kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Field Measure ${escapeHtml(VERSION)} · ${new Date().toISOString().slice(0, 10)}</div>
  </div>
  <img src="${LOGO}" alt="VANGARDE">
</header>
${body}
</body></html>`;
}

// ---------------------------------------------------------------------------------------------

const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const work = mkdtempSync(join(tmpdir(), 'fm-guides-'));
try {
  for (const job of JOBS) {
    const src = join(GUIDES, job.source);
    const md = readFileSync(src, 'utf8');
    const title = (md.match(/^# (.*)$/m) ?? [, job.source])[1];
    for (const m of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const img = resolve(dirname(src), m[1]);
      if (!existsSync(img)) throw new Error(`${job.source}: missing image ${m[1]}`);
    }
    const htmlFile = join(work, job.out.replace(/\.pdf$/, '.html'));
    writeFileSync(htmlFile, page(title, job.kicker, markdownToHtml(md, dirname(src))));
    const tab = await browser.newPage();
    await tab.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    await tab.pdf({
      path: join(GUIDES, job.out),
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8px;color:#5b6470;padding:0 0.65in;display:flex;justify-content:space-between;font-family:Arial">
        <span>${escapeHtml(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: '0.6in', bottom: '0.7in', left: '0.65in', right: '0.65in' },
    });
    await tab.close();
    console.log(`Wrote docs/guides/${job.out}`);
  }
} finally {
  await browser.close();
}
