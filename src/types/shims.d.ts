declare module "pdfmake/src/printer" {
    class PdfPrinter {
        constructor(fonts: Record<string, { normal?: string; bold?: string; italics?: string; bolditalics?: string }>);
        createPdfKitDocument(docDefinition: any, options?: any): NodeJS.ReadableStream & { end: () => void };
    }
    export = PdfPrinter;
}

declare module "bidi-js" {
    interface Bidi {
        getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): { levels: Uint8Array; paragraphs: any[] };
        getReorderSegments(text: string, embeddingLevels: any, start?: number, end?: number): [number, number][];
        getReorderedString(text: string, embeddingLevels: any, start?: number, end?: number): string;
    }
    const factory: () => Bidi;
    export default factory;
}
