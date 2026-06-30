import { NextRequest, NextResponse } from "next/server";
import { cancelReminder } from "@/lib/store";

interface Ctx {
  params: Promise<{ reminderId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { reminderId } = await params;
  await cancelReminder(Number(reminderId));
  return NextResponse.json({ ok: true });
}
