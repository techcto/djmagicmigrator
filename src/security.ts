import { config } from "./config.js";

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")
    || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^169\.254\./.test(host);
}

export function assertAllowedUrl(rawUrl: string, allowlist: string[]): URL {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  if (isPrivateHostname(url.hostname)) throw new Error("Private and link-local destinations are not allowed");
  if (allowlist.length > 0 && !allowlist.includes(url.hostname)) throw new Error(`Host is not allowlisted: ${url.hostname}`);
  return url;
}

export const assertSourceUrl = (url: string) => assertAllowedUrl(url, config.allowedSourceHosts);
export const assertDestinationUrl = (url: string) => assertAllowedUrl(url, config.allowedDestinationHosts);
