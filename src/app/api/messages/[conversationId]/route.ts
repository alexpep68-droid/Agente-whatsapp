import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { enqueueOutbox, getConversationById, getMessages, insertMessage } from "@/lib/store";
import { hasOnlineStorage, uploadMedia } from "@/lib/media-storage";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  return NextResponse.json({ messages: await getMessages(Number(conversationId), 100) });
}

function mediaExtension(file: File) {
  if (file.name.includes(".")) return file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("mpeg")) return "mp3";
  if (file.type.includes("ogg")) return "ogg";
  if (file.type.includes("webm")) return "webm";
  if (file.type.startsWith("video/") && file.type.includes("mp4")) return "mp4";
  if (file.type.includes("mp4")) return "m4a";
  return "jpg";
}

function isDocument(file: File) {
  const type = file.type.toLowerCase();
  return (
    type === "application/pdf" ||
    type === "application/msword" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "text/csv" ||
    type === "text/plain" ||
    type === "application/zip"
  );
}

function mediaTypeFor(file: File) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (isDocument(file)) return "document";
  throw new Error("Solo se permiten imagenes, videos, audios o documentos");
}

async function saveOutgoingMedia(conversationId: number, file: File) {
  const mediaType = mediaTypeFor(file);
  if (mediaType === "image" && file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no debe pasar de 8 MB");
  }
  if (mediaType === "audio" && file.size > 16 * 1024 * 1024) {
    throw new Error("El audio no debe pasar de 16 MB");
  }
  if (mediaType === "video" && file.size > 32 * 1024 * 1024) {
    throw new Error("El video no debe pasar de 32 MB");
  }
  if (mediaType === "document" && file.size > 32 * 1024 * 1024) {
    throw new Error("El documento no debe pasar de 32 MB");
  }

  const fileName = `${Date.now()}-${randomUUID()}.${mediaExtension(file)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (hasOnlineStorage()) {
    const url = await uploadMedia(`outgoing/${conversationId}/${fileName}`, bytes, file.type);
    if (url) return { url, type: mediaType };
  }

  const uploadDir = path.resolve(process.cwd(), "public", "uploads", "outgoing", String(conversationId));
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, fileName), bytes);
  return { url: `/uploads/outgoing/${conversationId}/${fileName}`, type: mediaType };
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const convo = await getConversationById(Number(conversationId));
  if (!convo) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("media") || formData.get("image");
    const caption = String(formData.get("content") || "").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona una imagen, video, audio o documento" }, { status: 400 });

    try {
      const media = await saveOutgoingMedia(convo.id, file);
      const content =
        caption ||
        (media.type === "audio"
          ? "[Audio enviado]"
          : media.type === "video"
            ? "[Video enviado]"
            : media.type === "document"
              ? `[Documento enviado: ${file.name}]`
              : "[Imagen enviada]");
      const messageId = await insertMessage(convo.id, "human", content, media);
      await enqueueOutbox(convo.account_id, convo.id, convo.phone, content, media);
      return NextResponse.json({ ok: true, messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el archivo";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const body = (await req.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return NextResponse.json({ error: "Mensaje vacio" }, { status: 400 });

  const messageId = await insertMessage(convo.id, "human", content);
  await enqueueOutbox(convo.account_id, convo.id, convo.phone, content);
  return NextResponse.json({ ok: true, messageId });
}
