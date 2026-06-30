import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { enqueueOutbox, getConversationById, insertMessage } from "@/lib/store";
import { hasOnlineStorage, uploadMedia } from "@/lib/media-storage";
import { generateAlmaluQuotePdf, readJpegSize, type AlmaluQuoteInput } from "@/lib/quote-pdf";

interface QuoteBody {
  conversationId?: number;
  client?: string;
  project?: string;
  measurements?: string;
  design?: string;
  itemsText?: string;
  notes?: string;
  total?: number;
  message?: string;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseItems(itemsText: string) {
  const lines = itemsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  return lines.map((line, index) => {
    const withoutNumber = line.replace(/^\d+[\).-]?\s*/, "");
    const [title, ...rest] = withoutNumber.split(":");
    return {
      title: title?.trim() || `Concepto ${index + 1}`,
      description: rest.join(":").trim() || "Fabricacion e instalacion segun especificaciones acordadas.",
      amount: "Incluido",
    };
  });
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Cancun",
  }).format(date);
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function quoteMessage(project: string) {
  return `Estimado(a) cliente:

Le compartimos la cotizacion correspondiente a su proyecto: ${project}.

Te adjunto tu cotizacion en PDF para que puedas revisarla.

Quedamos atentos a cualquier duda o ajuste.

Atentamente,
ALMALU`;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: QuoteBody | null = null;
    let referenceImage: AlmaluQuoteInput["referenceImage"] | undefined;
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("referenceImage");
      body = {
        conversationId: Number(formData.get("conversationId")),
        client: clean(formData.get("client")),
        project: clean(formData.get("project")),
        measurements: clean(formData.get("measurements")),
        design: clean(formData.get("design")),
        itemsText: clean(formData.get("itemsText")),
        notes: clean(formData.get("notes")),
        total: Number(formData.get("total")),
      };
      if (file instanceof File && file.size > 0) {
        if (!["image/jpeg", "image/jpg"].includes(file.type.toLowerCase())) {
          return NextResponse.json({ error: "La imagen de referencia debe ser JPG o JPEG" }, { status: 400 });
        }
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json({ error: "La imagen de referencia no debe pasar de 8 MB" }, { status: 400 });
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const size = readJpegSize(buffer);
        referenceImage = { data: buffer, ...size };
      }
    } else {
      body = (await req.json().catch(() => null)) as QuoteBody | null;
    }
    const conversationId = Number(body?.conversationId);
    if (!conversationId) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 400 });

    const conversation = await getConversationById(conversationId);
    if (!conversation) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });

    const project = clean(body?.project);
    const total = Number(body?.total);
    const items = parseItems(clean(body?.itemsText));
    if (!project) return NextResponse.json({ error: "Indica el proyecto de la cotizacion" }, { status: 400 });
    if (!Number.isFinite(total) || total <= 0) return NextResponse.json({ error: "Indica un total valido" }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "Agrega al menos un concepto" }, { status: 400 });

    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 30);

    const quoteData: AlmaluQuoteInput = {
      client: clean(body?.client),
      project,
      measurements: clean(body?.measurements),
      design: clean(body?.design),
      notes: clean(body?.notes),
      referenceImage,
      items,
      total,
      dateText: formatDate(now),
      validUntilText: formatDate(validUntil),
    };

    const pdf = generateAlmaluQuotePdf(quoteData);
    const baseName = `Cotizacion_${slugify(project) || "almalu"}_${randomUUID().slice(0, 8)}`;
    const pdfName = `${baseName}.pdf`;
    const jsonName = `${baseName}.json`;

    if (!hasOnlineStorage()) {
      return NextResponse.json({ error: "Configura Supabase Storage para guardar cotizaciones" }, { status: 500 });
    }

    const pdfUrl = await uploadMedia(`quotes/${conversationId}/${pdfName}`, pdf, "application/pdf");
    let jsonUrl: string | null = null;
    try {
      const editableData = {
        ...quoteData,
        referenceImage: referenceImage ? { included: true, width: referenceImage.width, height: referenceImage.height } : undefined,
      };
      jsonUrl = await uploadMedia(
        `quotes/${conversationId}/${jsonName}`,
        Buffer.from(JSON.stringify(editableData, null, 2), "utf-8"),
        "text/plain",
      );
    } catch (err) {
      console.warn("No se pudo guardar el JSON editable de la cotizacion", err);
    }
    if (!pdfUrl) return NextResponse.json({ error: "No se pudo guardar el PDF" }, { status: 500 });

    const media = { url: pdfUrl, type: "document" };
    const content = `[Documento enviado: ${pdfName}]`;
    const messageId = await insertMessage(conversation.id, "human", content, media);
    await enqueueOutbox(conversation.account_id, conversation.id, conversation.phone, content, media);

    const message = clean(body?.message) || quoteMessage(project);

    return NextResponse.json({
      ok: true,
      messageId,
      pdfUrl,
      jsonUrl,
      fileName: pdfName,
      message,
      payments: {
        advance: total * 0.6,
        settlement: total * 0.4,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear la cotizacion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
