// Compatibility exports preserve the existing Jev API.
export * from "@/lib/systemone/types";
import { SystemOneResponseError } from "@/lib/systemone/types";

export class TypesafeResponseError extends SystemOneResponseError {
  override name = "TypesafeResponseError";
}
