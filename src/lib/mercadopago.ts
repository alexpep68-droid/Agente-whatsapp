interface CreatePreferenceInput {
  conversationId: number;
  title: string;
  amount: number;
  note?: string;
}

interface MercadoPagoPreferenceResponse {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

export async function createMercadoPagoPreference(input: CreatePreferenceInput) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta configurar MERCADOPAGO_ACCESS_TOKEN");
  }

  const baseUrl = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const externalReference = `conversation:${input.conversationId}:${Date.now()}`;
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          title: input.title,
          description: input.note || input.title,
          quantity: 1,
          currency_id: "MXN",
          unit_price: input.amount,
        },
      ],
      external_reference: externalReference,
      back_urls: baseUrl
        ? {
            success: `${baseUrl}/?payment=success`,
            failure: `${baseUrl}/?payment=failure`,
            pending: `${baseUrl}/?payment=pending`,
          }
        : undefined,
      notification_url: baseUrl ? `${baseUrl}/api/mercadopago/webhook` : undefined,
      metadata: {
        conversation_id: input.conversationId,
        note: input.note || "",
      },
    }),
  });

  const json = (await response.json().catch(() => null)) as MercadoPagoPreferenceResponse | { message?: string } | null;
  if (!response.ok || !json || !("id" in json)) {
    const message = json && "message" in json ? json.message : "No se pudo crear el link de pago";
    throw new Error(message || "No se pudo crear el link de pago");
  }

  return {
    preferenceId: json.id,
    initPoint: json.init_point || json.sandbox_init_point || "",
    externalReference,
  };
}
