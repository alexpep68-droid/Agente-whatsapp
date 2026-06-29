import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/db";

export async function GET(req: NextRequest) {
  const accountId = Number(req.nextUrl.searchParams.get("accountId"));
  if (!accountId) return NextResponse.json({ error: "accountId requerido" }, { status: 400 });
  return NextResponse.json({ conversations: listConversations(accountId) });
}
