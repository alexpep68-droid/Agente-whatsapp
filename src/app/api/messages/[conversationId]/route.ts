import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { enqueueOutbox, getConversationById, getMessages, insertMessage } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  return NextResponse.json({ messages: getMessages(Number(conversationId), 100) });
}

function imageExtension(file: File) {
  if (file.name.includes(".")) return file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  return "jpg";
}

async function saveOutgoingImage(conversationId: number, file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Solo se permiten imagenes");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no debe pasar de 8 MB");
  }

  const uploadDir = path.resolve(process.cwd(), "public", "uploads", "outgoing", String(conversationId));
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.${imageExtension(file)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(uploadDir, fileName), bytes);
  return `/uploads/outgoing/${conversationId}/${fileName}`;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const convo = getConversationById(Number(conversationId));
  if (!convo) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("image");
    const caption = String(formData.get("content") || "").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona una imagen" }, { status: 400 });

    try {
      const url = await saveOutgoingImage(convo.id, file);
      const content = caption || "[Imagen enviada]";
      const media = { url, type: "image" };
      const messageId = insertMessage(convo.id, "human", content, media);
      enqueueOutbox(convo.account_id, convo.id, convo.phone, content, media);
      return NextResponse.json({ ok: true, messageId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar la imagen";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const body = (await req.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();
  if (!content) return NextResponse.json({ error: "Mensaje vacio" }, { status: 400 });

  const messageId = insertMessage(convo.id, "human", content);
  enqueueOutbox(convo.account_id, convo.id, convo.phone, content);
  return NextResponse.json({ ok: true, messageId });
}
