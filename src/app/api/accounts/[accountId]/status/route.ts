import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAccountById } from "@/lib/store";

interface Ctx {
  params: Promise<{ accountId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { accountId } = await params;
  const account = await getAccountById(Number(accountId));
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const shouldShowQr = !!account.qr_string && (account.status === "qr" || account.status === "connecting");
  const qrPng = shouldShowQr && account.qr_string
    ? await QRCode.toDataURL(account.qr_string, { width: 340, margin: 2 })
    : null;

  return NextResponse.json({
    status: qrPng ? "qr" : account.status,
    qrPng,
    phone: account.phone,
    updatedAt: account.updated_at,
  });
}
