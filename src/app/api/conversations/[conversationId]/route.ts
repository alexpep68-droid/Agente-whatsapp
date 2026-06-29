import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationById, setConversationLabel, setPipelineStage, type PipelineStage } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const body = (await req.json().catch(() => null)) as { label?: string | null; pipeline_stage?: PipelineStage } | null;
  if (Object.prototype.hasOwnProperty.call(body || {}, "label")) {
    setConversationLabel(Number(conversationId), body?.label?.trim() || null);
  }
  if (body?.pipeline_stage) {
    setPipelineStage(Number(conversationId), body.pipeline_stage);
  }
  return NextResponse.json({ ok: true, conversation: getConversationById(Number(conversationId)) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  deleteConversation(Number(conversationId));
  return NextResponse.json({ ok: true });
}
