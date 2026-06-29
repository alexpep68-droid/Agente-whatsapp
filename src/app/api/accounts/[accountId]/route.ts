import { NextRequest, NextResponse } from "next/server";
import { getAccountById, updateAccountSettings } from "@/lib/db";

interface Ctx {
  params: Promise<{ accountId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { accountId } = await params;
  const account = getAccountById(Number(accountId));
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { accountId } = await params;
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    system_prompt?: string;
    ai_enabled?: boolean;
  } | null;
  const account = updateAccountSettings(Number(accountId), body ?? {});
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  return NextResponse.json({ account });
}
