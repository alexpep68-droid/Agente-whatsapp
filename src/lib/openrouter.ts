import OpenAI from "openai";
import type { Message } from "./db";

let client: OpenAI | null = null;

export class AiProviderError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "AiProviderError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

function getClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Falta OPENROUTER_API_KEY en .env.local");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return client;
}

function friendlyAiError(err: unknown) {
  const error = err as { status?: number; code?: string; message?: string; error?: { message?: string; code?: string } };
  const message = error?.error?.message || error?.message || "No se pudo responder con IA.";
  const code = error?.error?.code || error?.code;
  const lower = message.toLowerCase();
  const looksLikeLimit =
    error?.status === 402 ||
    error?.status === 429 ||
    lower.includes("quota") ||
    lower.includes("limit") ||
    lower.includes("rate") ||
    lower.includes("credits") ||
    lower.includes("insufficient") ||
    lower.includes("balance");

  if (looksLikeLimit) {
    return new AiProviderError("IA pausada por limite, saldo o cuota del proveedor.", { status: error?.status, code });
  }
  return new AiProviderError(`IA pausada por error del proveedor: ${message}`, { status: error?.status, code });
}

export async function generateReply(systemPrompt: string, history: Message[]) {
  const statePrompt = conversationStatePrompt(history);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(statePrompt ? [{ role: "system" as const, content: statePrompt }] : []),
    ...history.map((message) => ({
      role: message.role === "user" ? "user" as const : "assistant" as const,
      content: message.content,
    })),
  ];

  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await getClient().chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      messages,
      temperature: 0.4,
    });
  } catch (err) {
    throw friendlyAiError(err);
  }

  const reply = response.choices[0]?.message?.content?.trim() || "Dejame derivarte con un asesor humano.";
  if (!statePrompt || !looksLikeRepeatedWelcome(reply)) return reply;

  try {
    response = await getClient().chat.completions.create({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      messages: [
        ...messages,
        {
          role: "system",
          content:
            "La respuesta anterior parecia reiniciar el chat con una bienvenida. Corrigela: responde solo al ultimo mensaje del cliente, continua el proceso ya iniciado y no repitas el saludo inicial ni la lista de proyectos.",
        },
      ],
      temperature: 0.3,
    });
  } catch (err) {
    throw friendlyAiError(err);
  }

  return response.choices[0]?.message?.content?.trim() || "Dejame derivarte con un asesor humano.";
}

function conversationStatePrompt(history: Message[]) {
  const previous = history.slice(0, -1);
  const alreadyAssisted = previous.some((message) => message.role === "assistant" || message.role === "human");
  const welcomeAlreadySent = previous.some((message) => looksLikeRepeatedWelcome(message.content));
  if (!alreadyAssisted && !welcomeAlreadySent) return "";

  return [
    "Estado automatico del chat:",
    "- Esta conversacion ya tiene historial. No la trates como un primer contacto.",
    "- No repitas el saludo inicial, la lista de tipos de proyecto ni el mensaje de bienvenida si ya se envio antes.",
    "- Responde al ultimo mensaje del cliente continuando el contexto anterior.",
    "- Si el cliente ya envio medidas, fotos, catalogo revisado, ubicacion o cierre, avanza con el siguiente paso logico.",
    "- Si el cliente solo agradece o dice que revisara, responde breve y da seguimiento natural, sin volver a pedir todo desde cero.",
  ].join("\n");
}

function looksLikeRepeatedWelcome(text: string) {
  const clean = text.toLowerCase();
  const hasWelcome = clean.includes("gracias por contactar") || clean.includes("bienvenido");
  const asksProject = clean.includes("en que proyecto") || clean.includes("en qué proyecto");
  const listsServices =
    clean.includes("cocina integral") &&
    clean.includes("closet") &&
    (clean.includes("centro de entretenimiento") || clean.includes("mueble de bano") || clean.includes("mueble de baño"));
  return (hasWelcome && asksProject) || (hasWelcome && listsServices) || (asksProject && listsServices);
}
