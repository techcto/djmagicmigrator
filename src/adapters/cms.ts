import type { DestinationAdapter } from "./types.js";
import { callDestination } from "./http.js";

export const cmsAdapter: DestinationAdapter = {
  import: (manifest, context) => callDestination(context, "/api/v2/website-imports", "import-website-manifest", {
    manifest,
    target_name: context.targetName,
    reference_template_url: context.referenceTemplateUrl,
  }),
  importModule: (manifest, context) => callDestination(
    context,
    "/api/v2/module-imports",
    "import-module-manifest",
    { manifest },
  ),
};
