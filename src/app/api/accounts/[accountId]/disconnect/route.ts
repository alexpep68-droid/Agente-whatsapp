import { NextRequest, NextResponse } from "next/server";
import { requestAccountRestart, setAccountState } from "@/lib/db";

interface Ctx {
  params: Promise<{ accountId: string }>;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { accountId } = await params;
  const id = Number(accountId);
  setAccountState(id, { status: "disconnected", qr_string: null, phone: null });
  requestAccountRestart(id);
  return NextResponse.json({ ok: true });
}
