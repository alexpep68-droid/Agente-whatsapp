import { NextRequest, NextResponse } from "next/server";
import { deleteQuickReply, updateQuickReply } from "@/lib/db";

interface Ctx {
  params: Promise<{ quickReplyId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { quickReplyId } = await params;
  const body = (await req.json().catch(() => null)) as { title?: string; text?: string } | null;
  const title = body?.title?.trim();
  const text = body?.text?.trim();
  if (!title || !text) {
    return NextResponse.json({ error: "Titulo y texto son obligatorios" }, { status: 400 });
  }
  updateQuickReply(Number(quickReplyId), { title, text });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { quickReplyId } = await params;
  deleteQuickReply(Number(quickReplyId));
  return NextResponse.json({ ok: true });
}
