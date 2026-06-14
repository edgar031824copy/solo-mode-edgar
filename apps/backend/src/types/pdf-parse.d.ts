declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfData>;
  export = pdfParse;
}
