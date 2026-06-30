import { NextRequest, NextResponse } from "next/server";
import { createMercadoPagoPreference } from "@/lib/mercadopago";
import { createPaymentLink, enqueueOutbox, getConversationById, insertMessage, setPipelineStage } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    conversationId?: number;
    title?: string;
    amount?: number;
    note?: string;
  } | null;

  const conversationId = Number(body?.conversationId);
  const title = body?.title?.trim() || "Pago ALMALU";
  const amount = Number(body?.amount);
  const note = body?.note?.trim() || "";

  if (!conversationId) return NextResponse.json({ error: "Selecciona una conversacion" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Ingresa un monto valido" }, { status: 400 });

  const conversation = await getConversationById(conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversacion no encontrada" }, { status: 404 });

  try {
    const preference = await createMercadoPagoPreference({ conversationId, title, amount, note });
    if (!preference.initPoint) throw new Error("Mercado Pago no devolvio link de pago");

    const paymentLink = await createPaymentLink({
      account_id: conversation.account_id,
      conversation_id: conversation.id,
      preference_id: preference.preferenceId,
      title,
      amount,
      currency: "MXN",
      init_point: preference.initPoint,
      status: "pending",
    });

    const formattedAmount = amount.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
    const content = [
      "Te comparto el link de pago por Mercado Pago:",
      "",
      `Concepto: ${title}`,
      `Monto: ${formattedAmount}`,
      note ? `Nota: ${note}` : "",
      "",
      preference.initPoint,
    ]
      .filter(Boolean)
      .join("\n");

    const messageId = await insertMessage(conversation.id, "human", content);
    await enqueueOutbox(conversation.account_id, conversation.id, conversation.phone, content);
    await setPipelineStage(conversation.id, "Cotización enviada");

    return NextResponse.json({ ok: true, paymentLink, messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo crear el cobro";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
