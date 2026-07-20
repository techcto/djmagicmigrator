# DJ Magic Migrator

DJ Magic Migrator is a CMS-neutral crawl and migration service. The current release enables the **CMS** destination; WordPress and Drupal adapters remain planned until the CMS contract is proven.

## Architecture

```text
AI client -> Migrator MCP/REST API -> Redis queue -> crawler worker
                                                -> migration manifest
                                                -> CMS API or CMS MCP
```

The migrator owns crawling, normalized lowercase paths, page/asset relationships, bounded jobs, progress, and retries. The CMS adapter owns native websites, folders, backing HTML, STML pages, permissions, history, and rollback.

For local Docker development, use `http://host.docker.internal` as the CMS base URL. A deployed worker such as Fargate should use the publicly reachable CMS URL. Private Fargate service subnets require outbound internet access through NAT so the worker can crawl public sites and call public CMS installations.

## API

`POST /api/v1/jobs` accepts:

```json
{
  "sourceUrl": "https://example.com",
  "targetName": "example-site-import",
  "maxPages": 10,
  "destination": {
    "platform": "cms",
    "transport": "api",
    "baseUrl": "https://cms.example.com",
    "secretArn": "arn:aws:secretsmanager:...:secret:cms-api-token"
  },
  "options": {
    "referenceTemplateUrl": "https://reference.example.com",
    "includeDocuments": true,
    "allowPartial": false,
    "pageMappings": [
      {
        "sourceUrl": "https://example.com/about/default.aspx",
        "destinationPath": "/about/index",
        "title": "About"
      }
    ]
  }
}
```

`pageMappings` is the preferred production input. It supplies the approved sitemap-derived source-to-destination map, so the worker crawls exactly those pages and knows every final path before the CMS writes anything. Without it, the service discovers same-site links starting at `sourceUrl`; discovery is useful for pilots, but it is not a replacement for an approved migration sitemap.

The crawler inventories page-relative images, responsive image candidates, documents, media, scripts, and styles. Favicons are deliberately excluded. Documents are included only when `includeDocuments` is enabled, which supports a deliberate second document phase for large migrations.

Approved-map jobs are fail-closed: if any mapped page cannot be crawled, the worker does not start the CMS import unless `allowPartial` is explicitly enabled.

Use `GET /api/v1/jobs/{id}` for progress. The same operations are exposed through `/mcp` as `start-site-import`, `get-site-import`, and `cancel-site-import`.

For local development, `DJMAGIC_DESTINATION_TOKEN` supplies the CMS bearer API token. In AWS, use `DJMAGIC_DESTINATION_SECRET_ARN`; credentials are resolved only by the worker and are not persisted in job records.

## CMS destination contract

The worker sends the normalized manifest to `POST /api/v2/website-imports` with `Authorization: Bearer <CMS API token>`. MCP transport calls `import-website-manifest` with the same payload. CMS then uses its native import service to create the website, assets, STML, audit history, and rollback manifest.

The manifest remains version `1.0` for compatibility and also carries a complete `linkMap`, crawl `failures`, and each page's asset/link inventory. The CMS remains the authoritative writer: it performs the second link-replacement pass, stores assets in sibling `images`, `documents`, and `media` folders, preserves history, and reconciles unresolved source-domain references. Repairs to an existing edited site belong in the CMS repair workflow rather than an overwrite from this service.

## AI skill contract

AI decides the source, target, bounds, and exception policy. It starts and monitors a migration through Migrator MCP. The crawler remains deterministic; the model does not create thousands of files one call at a time. Future skills can use the same pattern for page/form creation, analytics audits, accessibility checks, and content reporting.
