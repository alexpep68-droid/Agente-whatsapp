import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/store";

export async function GET(req: NextRequest) {
  const accountId = Number(req.nextUrl.searchParams.get("accountId"));
  if (!accountId) return NextResponse.json({ error: "accountId requerido" }, { status: 400 });
  return NextResponse.json({ conversations: await listConversations(accountId) });
}
