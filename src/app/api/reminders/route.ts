import { NextRequest, NextResponse } from "next/server";
import { createReminder, listReminders } from "@/lib/store";

export async function GET(req: NextRequest) {
  const conversationId = Number(req.nextUrl.searchParams.get("conversationId"));
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Conversacion invalida" }, { status: 400 });
  }
  return NextResponse.json({ reminders: await listReminders(conversationId) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    accountId?: number;
    conversationId?: number;
    message?: string;
    dueAt?: number;
  } | null;

  const accountId = Number(body?.accountId);
  const conversationId = Number(body?.conversationId);
  const dueAt = Number(body?.dueAt);
  const message = body?.message?.trim() || "";

  if (!Number.isFinite(accountId) || accountId <= 0 || !Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "Escribe el mensaje del recordatorio" }, { status: 400 });
  if (!Number.isFinite(dueAt) || dueAt <= Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ error: "Elige una fecha futura" }, { status: 400 });
  }

  try {
    const reminder = await createReminder(accountId, conversationId, message, dueAt);
    return NextResponse.json({ ok: true, reminder });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "No se pudo crear el recordatorio";
    return NextResponse.json({ error: messageText }, { status: 400 });
  }
}
