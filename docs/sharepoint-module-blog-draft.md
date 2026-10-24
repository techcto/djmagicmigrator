# Turning SharePoint Lists into Native CMS Modules

Public-sector websites often contain more than pages. Parks, reports, locations, notices, directories, and other structured collections may live in SharePoint lists or document libraries. Treating those records as copied HTML makes the new site harder to manage and nearly impossible to keep synchronized.

The new module migration workflow turns those source collections into native CMS modules. A migration worker reads the real SharePoint data with paging, maps source fields into a reviewed schema, and sends a normalized manifest to CMS. CMS then uses its standard module, entry, category, and asset workflows to create or update records safely.

The workflow is designed for repeatability. Every collection has a stable source identity, so rerunning an import updates existing records instead of creating duplicates. File handling is equally cautious: known files are reused, uniquely located files can be moved through CMS history, new files are registered normally, and ambiguous duplicates stop for review.

Operators can preview the entire operation before writing. A dry-run reports the proposed schema, record changes, source failures, and asset decisions. Publication remains explicit, and source-specific field rules stay in the migration configuration instead of becoming customer-specific CMS code.

Structured data and presentation remain separate. After records are imported, teams use normal CMS capabilities to build forms, repeaters, detail templates, categories, routes, and page layouts. That keeps the public experience editable while preserving a reliable path back to the source data.

The first release supports SharePoint lists and document-style file fields imported into CMS datatable modules. More complex source relationships, authentication variants, and specialized presentation still require a reviewed mapping. The important foundation is now shared: future module migrations follow one auditable process rather than a new one-off script each time.
