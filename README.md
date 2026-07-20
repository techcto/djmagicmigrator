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
    "referenceTemplateUrl": "https://reference.example.com"
  }
}
```

Use `GET /api/v1/jobs/{id}` for progress. The same operations are exposed through `/mcp` as `start-site-import`, `get-site-import`, and `cancel-site-import`.

For local development, `DJMAGIC_DESTINATION_TOKEN` supplies the CMS bearer API token. In AWS, use `DJMAGIC_DESTINATION_SECRET_ARN`; credentials are resolved only by the worker and are not persisted in job records.

## CMS destination contract

The worker sends the normalized manifest to `POST /api/v2/website-imports` with `Authorization: Bearer <CMS API token>`. MCP transport calls `import-website-manifest` with the same payload. CMS then uses its native import service to create the website, assets, STML, audit history, and rollback manifest.

## AI skill contract

AI decides the source, target, bounds, and exception policy. It starts and monitors a migration through Migrator MCP. The crawler remains deterministic; the model does not create thousands of files one call at a time. Future skills can use the same pattern for page/form creation, analytics audits, accessibility checks, and content reporting.
