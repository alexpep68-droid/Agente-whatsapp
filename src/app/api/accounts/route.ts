import { NextRequest, NextResponse } from "next/server";
import { createAccount, listAccounts } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ accounts: listAccounts() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  return NextResponse.json({ account: createAccount(name) });
}
