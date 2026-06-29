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
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
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

  return response.choices[0]?.message?.content?.trim() || "Dejame derivarte con un asesor humano.";
}
