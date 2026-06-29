import { NextRequest, NextResponse } from "next/server";
import { setMode, type ConversationMode } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const body = (await req.json().catch(() => null)) as { mode?: ConversationMode } | null;
  if (body?.mode !== "AI" && body?.mode !== "HUMAN") {
    return NextResponse.json({ error: "Modo invalido" }, { status: 400 });
  }
  setMode(Number(conversationId), body.mode);
  return NextResponse.json({ ok: true });
}
