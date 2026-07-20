import type { DestinationAdapter } from "./types.js";
import { cmsAdapter } from "./cms.js";

export function adapterFor(platform: string): DestinationAdapter {
  if (platform === "cms") return cmsAdapter;
  throw new Error(`${platform} destination support is planned but not implemented; validate Solodev first`);
}
