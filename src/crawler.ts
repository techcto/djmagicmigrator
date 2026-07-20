import * as cheerio from "cheerio";
import type { CreateJobInput, MigrationManifest, MigrationPage } from "./domain.js";
import { assertSourceUrl } from "./security.js";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function destinationPath(url: URL): string {
  if (url.pathname === "/" || /\/default\.[a-z]+$/i.test(url.pathname) || /\/index\.[a-z]+$/i.test(url.pathname)) return "/index";
  const parts = url.pathname.split("/").filter(Boolean).map((part) => slug(part.replace(/\.[a-z0-9]+$/i, ""))).filter(Boolean);
  return `/${parts.join("/") || "index"}`;
}

export async function crawl(input: CreateJobInput, onProgress: (count: number) => Promise<void>): Promise<MigrationManifest> {
  const start = assertSourceUrl(input.sourceUrl);
  const pending = [start.href];
  const seen = new Set<string>();
  const pages: MigrationPage[] = [];
  while (pending.length > 0 && pages.length < input.maxPages) {
    const current = pending.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const url = assertSourceUrl(current);
    if (url.hostname !== start.hostname) continue;
    let response: Response;
    try {
      response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (pages.length === 0 && current === start.href) throw error;
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) continue;
    const html = await response.text();
    const $ = cheerio.load(html);
    const assets = $("img[src],link[href],script[src]").map((_, element) => {
      const ref = $(element).attr("src") || $(element).attr("href") || "";
      try { return new URL(ref, url).href; } catch { return ""; }
    }).get().filter(Boolean);
    $("script,style,noscript").remove();
    const links: string[] = [];
    $("a[href]").each((_, element) => {
      try {
        const target = new URL($(element).attr("href")!, url);
        links.push(target.href);
        if (target.hostname === start.hostname && !seen.has(target.href)) pending.push(target.href);
      } catch { /* Ignore invalid source links. */ }
    });
    pages.push({
      sourceUrl: url.href,
      destinationPath: destinationPath(url),
      title: $("title").first().text().trim() || $("h1").first().text().trim() || url.pathname,
      html: ($("main").html() || $("body").html() || "").trim(),
      assets: [...new Set(assets)],
      links: [...new Set(links)],
    });
    await onProgress(pages.length);
  }
  if (pages.length === 0) throw new Error(`No HTML pages could be crawled from ${start.href}`);
  return { version: "1.0", sourceUrl: start.href, generatedAt: new Date().toISOString(), pages };
}
