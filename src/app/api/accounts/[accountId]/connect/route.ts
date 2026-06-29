import { NextRequest, NextResponse } from "next/server";
import { requestAccountRestart, setAccountState } from "@/lib/store";

interface Ctx {
  params: Promise<{ accountId: string }>;
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { accountId } = await params;
  const id = Number(accountId);
  await setAccountState(id, { status: "connecting" });
  await requestAccountRestart(id);
  return NextResponse.json({ ok: true });
}
