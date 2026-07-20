import * as cheerio from "cheerio";
import type { CreateJobInput, MigrationManifest, MigrationPage } from "./domain.js";
import { assertSourceUrl } from "./security.js";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const documentExtensions = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "rtf", "txt", "zip", "7z"]);

function canonicalUrl(url: URL): string {
  url.hash = "";
  return url.href;
}

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizedDestinationPath(path: string): string {
  const urlPath = path.startsWith("http://") || path.startsWith("https://") ? new URL(path).pathname : path;
  const segments = urlPath.split("/").filter(Boolean).map((part) => slug(part.replace(/\.(?:stml|html?)$/i, ""))).filter(Boolean);
  return `/${segments.join("/") || "index"}`;
}

function destinationPath(url: URL): string {
  if (url.pathname === "/" || /\/default\.[a-z]+$/i.test(url.pathname) || /\/index\.[a-z]+$/i.test(url.pathname)) return "/index";
  const parts = url.pathname.split("/").filter(Boolean).map((part) => slug(part.replace(/\.[a-z0-9]+$/i, ""))).filter(Boolean);
  return `/${parts.join("/") || "index"}`;
}


function resolveReference(raw: string, base: URL): string | undefined {
  const value = raw.trim();
  if (value === "" || /^(?:data|blob|javascript|mailto|tel):/i.test(value)) return undefined;
  try { return canonicalUrl(new URL(value, base)); } catch { return undefined; }
}

function extensionOf(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname).split("/").pop() || "";
    return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  } catch { return ""; }
}

function sourceAssets($: cheerio.CheerioAPI, pageUrl: URL, input: CreateJobInput): string[] {
  const assets = new Set<string>();
  const add = (raw: string | undefined, kind: "image" | "document" | "media" | "script-style") => {
    const resolved = raw ? resolveReference(raw, pageUrl) : undefined;
    if (!resolved) return;
    const path = new URL(resolved).pathname.toLowerCase();
    if (path.endsWith(".ico") || /(?:^|\/)favicon(?:[.-]|$)/i.test(path)) return;
    if (kind === "image" && !input.options.includeImages) return;
    if (kind === "document" && !input.options.includeDocuments) return;
    if (kind === "script-style" && !input.options.includeScriptsAndStyles) return;
    assets.add(resolved);
  };
  $("img[src],img[data-src]").each((_, element) => {
    add($(element).attr("src"), "image");
    add($(element).attr("data-src"), "image");
  });
  $("img[srcset],source[srcset]").each((_, element) => {
    for (const candidate of ($(element).attr("srcset") || "").split(",")) add(candidate.trim().split(/\s+/)[0], "image");
  });
  $("video[src],video[poster],audio[src],track[src],embed[src],object[data],source[src]").each((_, element) => {
    add($(element).attr("src") || $(element).attr("poster") || $(element).attr("data"), "media");
  });
  $("link[href],script[src]").each((_, element) => add($(element).attr("href") || $(element).attr("src"), "script-style"));
  $("a[href]").each((_, element) => {
    const raw = $(element).attr("href");
    const resolved = raw ? resolveReference(raw, pageUrl) : undefined;
    if (resolved && documentExtensions.has(extensionOf(resolved))) add(raw, "document");
  });
  return [...assets];
}

export async function crawl(input: CreateJobInput, onProgress: (count: number) => Promise<void>): Promise<MigrationManifest> {
  const start = assertSourceUrl(input.sourceUrl);
  const mappings = input.options.pageMappings || [];
  const approvedPaths = new Map<string, { destinationPath: string; title?: string }>();
  for (const mapping of mappings) {
    const source = assertSourceUrl(mapping.sourceUrl);
    if (canonicalHost(source.hostname) !== canonicalHost(start.hostname)) throw new Error(`Mapped page is outside the source host: ${source.href}`);
    approvedPaths.set(canonicalUrl(source), { destinationPath: normalizedDestinationPath(mapping.destinationPath), title: mapping.title });
  }
  const pending = mappings.length > 0 ? [...approvedPaths.keys()] : [canonicalUrl(start)];
  const seen = new Set<string>();
  const pages: MigrationPage[] = [];
  const failures: MigrationManifest["failures"] = [];
  while (pending.length > 0 && pages.length < input.maxPages) {
    const current = pending.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const url = assertSourceUrl(current);
    if (canonicalHost(url.hostname) !== canonicalHost(start.hostname)) continue;
    let response: Response;
    try {
      response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (pages.length === 0 && current === start.href) throw error;
      failures.push({ sourceUrl: current, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) {
      failures.push({ sourceUrl: current, error: `HTTP ${response.status} ${response.headers.get("content-type") || "unknown content type"}` });
      continue;
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const assets = sourceAssets($, url, input);
    $("script,style,noscript").remove();
    const links: string[] = [];
    $("a[href]").each((_, element) => {
      try {
        const target = new URL($(element).attr("href")!, url);
        const targetUrl = canonicalUrl(target);
        links.push(targetUrl);
        if (mappings.length === 0 && canonicalHost(target.hostname) === canonicalHost(start.hostname) && !seen.has(targetUrl)) pending.push(targetUrl);
      } catch { /* Ignore invalid source links. */ }
    });
    pages.push({
      sourceUrl: url.href,
      destinationPath: approvedPaths.get(canonicalUrl(url))?.destinationPath || destinationPath(url),
      title: approvedPaths.get(canonicalUrl(url))?.title || $("title").first().text().trim() || $("h1").first().text().trim() || url.pathname,
      html: ($("main").html() || $("body").html() || "").trim(),
      assets,
      links: [...new Set(links)],
    });
    await onProgress(pages.length);
  }
  if (pages.length === 0) throw new Error(`No HTML pages could be crawled from ${start.href}`);
  const linkMap = Object.fromEntries(pages.map((page) => [page.sourceUrl, page.destinationPath]));
  return { version: "1.0", sourceUrl: start.href, generatedAt: new Date().toISOString(), pages, linkMap, failures };
}
