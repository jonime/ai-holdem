/** HTML creation forms are optional; bodyless and JSON callers remain anonymous. */
export async function readCreationHostName(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded" && contentType !== "multipart/form-data") return undefined;
  try {
    const name = (await request.formData()).get("hostName");
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}
