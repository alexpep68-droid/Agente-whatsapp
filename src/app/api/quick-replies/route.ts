import { NextRequest, NextResponse } from "next/server";
import { createQuickReply, getAccountById, listQuickReplies } from "@/lib/store";

export async function GET(req: NextRequest) {
  const accountId = Number(req.nextUrl.searchParams.get("accountId"));
  if (!accountId || !(await getAccountById(accountId))) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ quickReplies: await listQuickReplies(accountId) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { accountId?: number; title?: string; text?: string } | null;
  const accountId = Number(body?.accountId);
  const title = body?.title?.trim();
  const text = body?.text?.trim();
  if (!accountId || !(await getAccountById(accountId))) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }
  if (!title || !text) {
    return NextResponse.json({ error: "Titulo y texto son obligatorios" }, { status: 400 });
  }
  return NextResponse.json({ quickReply: await createQuickReply(accountId, { title, text }) });
}
