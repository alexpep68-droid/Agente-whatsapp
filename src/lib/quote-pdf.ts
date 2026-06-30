interface QuoteItem {
  title: string;
  description?: string;
  amount?: string;
}

export interface AlmaluQuoteInput {
  client?: string;
  project: string;
  measurements?: string;
  design?: string;
  notes?: string;
  items: QuoteItem[];
  total: number;
  dateText: string;
  validUntilText: string;
}

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 50;
const RIGHT = 50;
const TOP = 62;
const BOTTOM = 52;
const CONTENT_W = PAGE_W - LEFT - RIGHT;

function ascii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

function pdfText(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

function wrap(text: string, maxChars: number) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class PdfPage {
  ops: string[] = [];

  text(text: string, x: number, y: number, size = 10, font = "F1", color = "0.2 0.2 0.2") {
    this.ops.push(`BT /${font} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(text)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, color = "0.86 0.87 0.89", width = 0.7) {
    this.ops.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  rect(x: number, y: number, w: number, h: number, fill = "1 1 1", stroke = "0.86 0.87 0.89") {
    this.ops.push(`${fill} rg ${stroke} RG 0.7 w ${x} ${y} ${w} ${h} re B`);
  }

  fillRect(x: number, y: number, w: number, h: number, fill: string) {
    this.ops.push(`${fill} rg ${x} ${y} ${w} ${h} re f`);
  }
}

class QuotePdf {
  pages: PdfPage[] = [];
  page = new PdfPage();
  y = PAGE_H - TOP;

  constructor(private data: AlmaluQuoteInput) {
    this.pages.push(this.page);
  }

  newPage() {
    this.footer();
    this.page = new PdfPage();
    this.pages.push(this.page);
    this.y = PAGE_H - TOP;
    this.header(false);
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM + 28) this.newPage();
  }

  header(full = true) {
    this.page.line(LEFT, this.y + 8, PAGE_W - RIGHT, this.y + 8, "0.18 0.25 0.33", 2.2);
    this.page.line(PAGE_W - 230, this.y + 8, PAGE_W - RIGHT, this.y + 8, "0.75 0.56 0.24", 2.2);
    this.page.text("ALMALU", LEFT, this.y - 28, 28, "F2", "0.12 0.16 0.2");
    this.page.text("MOBILIARIO Y DISENO INTEGRAL", LEFT, this.y - 44, 9, "F2", "0.75 0.56 0.24");
    this.page.text("COTIZACION", PAGE_W - 165, this.y - 20, 16, "F2", "0.18 0.25 0.33");
    this.page.text(`Fecha: ${this.data.dateText}`, PAGE_W - 205, this.y - 42, 9);
    this.page.text(`Valido hasta: ${this.data.validUntilText}`, PAGE_W - 205, this.y - 56, 9);
    this.page.text(`Proyecto: ${this.data.project}`, PAGE_W - 205, this.y - 70, 9);
    this.y -= full ? 105 : 92;
  }

  footer() {
    const pageNumber = this.pages.length;
    this.page.line(LEFT, 42, PAGE_W - RIGHT, 42);
    this.page.text("Almalu - Mobiliario y Diseno Integral", LEFT, 27, 7.5, "F1", "0.45 0.5 0.55");
    this.page.text(`Pagina ${pageNumber}`, PAGE_W - 92, 27, 7.5, "F1", "0.45 0.5 0.55");
  }

  section(title: string) {
    this.ensure(38);
    this.page.fillRect(LEFT, this.y - 17, 3, 20, "0.75 0.56 0.24");
    this.page.text(title, LEFT + 12, this.y - 12, 13, "F2", "0.12 0.16 0.2");
    this.y -= 32;
  }

  specs() {
    const specs = [
      ["Cliente", this.data.client || ""],
      ["Medidas / espacio", this.data.measurements || ""],
      ["Diseno de referencia", this.data.design || ""],
    ].filter(([, value]) => value);
    if (!specs.length) return;
    const rowHeights = specs.map(([, value]) => Math.max(28, wrap(value, 56).length * 13 + 12));
    const height = rowHeights.reduce((sum, item) => sum + item, 0);
    this.ensure(height + 20);
    this.page.rect(LEFT, this.y - height, CONTENT_W, height, "0.97 0.98 0.98");
    let rowY = this.y - 20;
    specs.forEach(([label, value], index) => {
      this.page.text(`${label}:`, LEFT + 15, rowY, 10, "F2", "0.18 0.25 0.33");
      wrap(value, 56).forEach((line, lineIndex) => {
        this.page.text(line, LEFT + 160, rowY - lineIndex * 13, 10);
      });
      rowY -= rowHeights[index];
      if (index < specs.length - 1) this.page.line(LEFT + 12, rowY + 10, PAGE_W - RIGHT - 12, rowY + 10);
    });
    this.y -= height + 18;
  }

  concepts() {
    this.section("DETALLE DE FABRICACION E INSTALACION");
    this.ensure(44);
    this.page.fillRect(LEFT, this.y - 26, CONTENT_W, 28, "0.18 0.25 0.33");
    this.page.text("DESCRIPCION DEL CONCEPTO / PROYECTO", LEFT + 10, this.y - 16, 9, "F2", "1 1 1");
    this.page.text("IMPORTE", PAGE_W - 118, this.y - 16, 9, "F2", "1 1 1");
    this.y -= 28;

    for (const item of this.data.items) {
      const lines = [...wrap(item.title, 52), ...wrap(item.description || "", 58)];
      const height = Math.max(48, lines.length * 13 + 24);
      this.ensure(height + 6);
      this.page.rect(LEFT, this.y - height, CONTENT_W, height, "1 1 1");
      this.page.text(item.title, LEFT + 10, this.y - 18, 10, "F2");
      let lineY = this.y - 34;
      wrap(item.description || "", 72).forEach((line) => {
        this.page.text(line, LEFT + 10, lineY, 9.5);
        lineY -= 13;
      });
      this.page.text(item.amount || "Incluido", PAGE_W - 127, this.y - 22, 9.5);
      this.y -= height + 4;
    }

    this.ensure(42);
    this.page.rect(LEFT, this.y - 34, CONTENT_W, 34, "0.99 0.99 0.99", "0.18 0.25 0.33");
    this.page.text("Total Neto Autorizado:", PAGE_W - 265, this.y - 22, 11, "F2", "0.18 0.25 0.33");
    this.page.text(money(this.data.total), PAGE_W - 152, this.y - 22, 12, "F2", "0.75 0.56 0.24");
    this.y -= 54;
  }

  payments() {
    const advance = Math.round(this.data.total * 60) / 100;
    const settlement = Math.round(this.data.total * 40) / 100;
    this.section("ESTRUCTURA DE PAGOS");
    this.ensure(92);
    this.page.fillRect(LEFT, this.y - 26, CONTENT_W, 28, "0.18 0.25 0.33");
    this.page.text("FASE DE PAGO", LEFT + 10, this.y - 16, 9, "F2", "1 1 1");
    this.page.text("PORCENTAJE", LEFT + 245, this.y - 16, 9, "F2", "1 1 1");
    this.page.text("MONTO", PAGE_W - 134, this.y - 16, 9, "F2", "1 1 1");
    this.y -= 28;
    [
      ["Anticipo de Fabricacion", "60%", advance],
      ["Liquidacion contra Entrega", "40%", settlement],
    ].forEach(([phase, percent, amount]) => {
      this.page.rect(LEFT, this.y - 32, CONTENT_W, 32, "1 1 1");
      this.page.text(String(phase), LEFT + 10, this.y - 20, 10, "F2");
      this.page.text(String(percent), LEFT + 265, this.y - 20, 10);
      this.page.text(money(Number(amount)), PAGE_W - 154, this.y - 20, 10, "F2");
      this.y -= 32;
    });
    this.y -= 16;
  }

  notes() {
    const bullets = [
      this.data.notes || "",
      "La cotizacion incluye suministro de materiales, fabricacion, transporte e instalacion, salvo que se indique lo contrario.",
      "Colores, acabados y herrajes se confirman antes de iniciar fabricacion.",
      "El tiempo de entrega final se pactara tras la confirmacion del anticipo y la rectificacion tecnica de medidas.",
    ].filter(Boolean);
    this.section("TERMINOS Y CONDICIONES");
    const lines = bullets.flatMap((bullet) => wrap(`- ${bullet}`, 82));
    const height = Math.max(70, lines.length * 13 + 22);
    this.ensure(height + 20);
    this.page.rect(LEFT, this.y - height, CONTENT_W, height, "1 1 1");
    let lineY = this.y - 18;
    lines.forEach((line) => {
      this.page.text(line, LEFT + 14, lineY, 9);
      lineY -= 13;
    });
    this.y -= height + 24;
    this.ensure(30);
    this.page.text("Gracias por la oportunidad de cotizar con Almalu.", 185, this.y, 8.5, "F1", "0.55 0.6 0.65");
  }

  build() {
    this.header();
    this.section("ESPECIFICACIONES DEL ESPACIO Y DISENO");
    this.specs();
    this.concepts();
    this.payments();
    this.notes();
    this.footer();
    return buildPdf(this.pages.map((page) => page.ops.join("\n")));
  }
}

function buildPdf(pageContents: string[]) {
  const objects: string[] = [];
  const add = (value: string) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = add("<< /Type /Catalog /Pages 2 0 R >>");
  void catalogId;
  add("");
  const fontRegularId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  for (const content of pageContents) {
    const contentId = add(`<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    contentIds.push(contentId);
    pageIds.push(pageId);
  }
  void contentIds;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export function generateAlmaluQuotePdf(data: AlmaluQuoteInput) {
  return new QuotePdf(data).build();
}
