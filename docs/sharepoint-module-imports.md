# SharePoint Module Imports

This is the implementation runbook for migrating repeatable SharePoint list or library data into CMS modules. The design deliberately separates source-specific discovery from CMS persistence:

- `djmagicmigrator` understands SharePoint REST, paging, source fields, and declarative transformations.
- CMS accepts a normalized module manifest and performs module creation, record upserts, and asset reconciliation through native object workflows.
- Repeater templates, detail templates, category routes, and page composition remain normal CMS presentation work after the data import is verified.

Do not add a customer list name or field mapping to CMS core. Add a migrator job configuration instead.

## First deployment

The initial rollout requires both applications:

1. Deploy CMS with `POST /api/v2/module-imports` and refresh the MCP/OpenAPI sidecar so `import-module-manifest` appears.
2. Deploy `djmagicmigrator` with the `sharepoint-module` job kind and `start-sharepoint-module-import` MCP tool.
3. Verify the CMS API bearer token can call the high-level import operation.

After this rollout, a normal new SharePoint module should require a job mapping and CMS presentation templates, not another CMS release.

## Repeatable workflow

### 1. Audit the source

Before importing, record:

- exact SharePoint site URL and list/library title
- stable source identity (`UniqueId` is preferred; otherwise a documented immutable id)
- selected source fields and representative values
- OData filter and ordering, if any
- pagination behavior and total record count
- file fields, attachments, or document-library relationships
- destination module name, title field, categories, and publication policy

Inspect several source rows before designing the schema. Do not infer a schema from rendered page HTML when the underlying SharePoint list is available.

### 2. Define the mapping

Example job payload:

```json
{
  "kind": "sharepoint-module",
  "source": {
    "siteUrl": "https://tenant.example.com/sites/content",
    "listTitle": "Public Reports",
    "select": ["UniqueId", "Title", "Published", "ReportFile", "Modified"],
    "orderBy": "Modified desc",
    "pageSize": 500,
    "secretArn": "arn:aws:secretsmanager:us-east-1:123456789012:secret:sharepoint-reader"
  },
  "destination": {
    "platform": "cms",
    "transport": "mcp",
    "baseUrl": "https://cms.example.com",
    "secretArn": "arn:aws:secretsmanager:us-east-1:123456789012:secret:cms-api"
  },
  "module": {
    "name": "Public Reports",
    "type": "datatable",
    "identityField": "source_id",
    "titleField": "title",
    "fields": [
      {"source": "UniqueId", "target": "source_id", "type": "string", "required": true},
      {"source": "Title", "target": "title", "type": "string", "required": true, "transform": "trim"},
      {"source": "Published", "target": "published", "type": "boolean", "transform": "boolean"},
      {"source": "ReportFile", "target": "report_file", "type": "file"},
      {"source": "Modified", "target": "source_modified", "type": "datetime", "transform": "datetime"}
    ]
  },
  "options": {"dryRun": true, "publish": false, "allowPartial": false}
}
```

Supported transforms are `none`, `trim`, `lowercase`, `date`, `datetime`, `integer`, `boolean`, and `after-pipe`. Add a general-purpose transform only when it is reusable across sources; keep customer-specific composition in the job mapping layer.

### 3. Dry-run first

Submit the job with `options.dryRun=true`. Review:

- source rows discovered and failed
- proposed module and fields
- stable identity coverage
- records that will be created or updated
- assets that will be reused, moved, created, or rejected as ambiguous when importing into an existing module/category; a brand-new module dry-run reports its proposed schema and records before the destination folders exist
- publication state

Dry-run must finish without unexpected failures before enabling writes. Keep `allowPartial=false` unless the operator explicitly accepts a partial batch.

### 4. Import idempotently

Set `dryRun=false` and run the same payload. Reusing the same identity field updates the same record instead of creating duplicates.

Asset rules are intentionally conservative:

- an exact file in the destination folder is reused
- one exact filename elsewhere may be moved through native CMS asset logic
- duplicate filename matches are reported as conflicts; the importer does not guess
- an absent file is downloaded and registered through native CMS asset creation

Use small initial batches for a new source. Once a mapping is validated, normal SharePoint paging can process the complete source.

### 5. Build and verify presentation

Data import does not silently invent the public experience. Configure and test:

- form layout and field labels
- grid columns and ordering
- category assignments and category route anchors
- repeater and detail templates
- attachment galleries or file output
- STML placement and dynamicDiv structure
- links from existing content into the new records

Compare source and destination record counts, inspect several records including file-heavy examples, rerun the dry-run, and confirm it proposes updates rather than duplicate creates.

## Operations and troubleshooting

- REST destination: `POST /api/v2/module-imports` with `{ "manifest": ... }`.
- MCP destination tool: `import-module-manifest` with the same normalized manifest.
- MCP job entry point: `start-sharepoint-module-import`.
- Job status: `get-import-job`; cancellation: `cancel-import-job`.
- If the MCP tool is missing after a CMS release, refresh/restart the MCP sidecar so it reloads `/mcp/openapi.json`.
- If multiple CMS assets have the same filename, specify or clean the destination rather than weakening conflict checks.
- If an existing module lacks mapped fields, update the module schema deliberately before importing. The importer does not mutate mature schemas behind the operator's back.

## Checklist for each new module

- [ ] Confirm source list/library and authentication.
- [ ] Capture actual schema and sample rows.
- [ ] Select an immutable source identity.
- [ ] Define lowercase SQL-safe target fields.
- [ ] Identify files and category behavior.
- [ ] Run a dry-run and resolve all unexpected failures.
- [ ] Import a small write batch and rerun it to prove idempotency.
- [ ] Import the complete source and reconcile counts.
- [ ] Configure repeater/detail/form presentation.
- [ ] Repair incoming links and verify public routes.
- [ ] Save the mapping beside the migration project for future syncs.
