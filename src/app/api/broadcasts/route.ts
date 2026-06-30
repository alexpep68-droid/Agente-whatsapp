import { NextRequest, NextResponse } from "next/server";
import { enqueueBroadcast, type ConversationMode, type PipelineStage } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    accountId?: number;
    message?: string;
    label?: string | null;
    pipelineStage?: PipelineStage | null;
    mode?: ConversationMode | null;
  } | null;

  const accountId = Number(body?.accountId);
  const message = body?.message?.trim() || "";
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Escribe el mensaje de la transmision" }, { status: 400 });
  }

  try {
    const result = await enqueueBroadcast(accountId, {
      message,
      label: body?.label?.trim() || null,
      pipelineStage: body?.pipelineStage || null,
      mode: body?.mode || null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "No se pudo crear la transmision";
    return NextResponse.json({ error: messageText }, { status: 400 });
  }
}
