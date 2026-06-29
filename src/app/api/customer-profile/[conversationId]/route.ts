import { NextRequest, NextResponse } from "next/server";
import { getConversationById, getCustomerProfile, updateCustomerProfile } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);
  if (!getConversationById(id)) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  return NextResponse.json({ profile: getCustomerProfile(id) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = Number(conversationId);
  if (!getConversationById(id)) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as {
    customer_name?: string | null;
    project_type?: string | null;
    city?: string | null;
    budget?: string | null;
    measurements?: string | null;
    visit_date?: string | null;
    notes?: string | null;
  } | null;
  return NextResponse.json({ profile: updateCustomerProfile(id, body || {}) });
}
