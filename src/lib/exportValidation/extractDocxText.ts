/** Extract plain text from DOCX bytes for validation (no resume storage). */
export async function extractDocxPlainText(bytes: ArrayBuffer): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml) return "";
    return documentXml
      .replace(/<w:tab[^/]*\/>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\s+/g, " ").trim();
  }
}
