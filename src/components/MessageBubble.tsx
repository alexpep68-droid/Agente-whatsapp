"use client";

import type { Message } from "./types";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function timeLabel(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function messageTextWithLinks(text: string) {
  return text.split(URL_PATTERN).map((part, index) => {
    if (!/^https?:\/\/[^\s]+$/.test(part)) return part;
    return (
      <a
        className="break-all text-blue-600 underline underline-offset-2 hover:text-blue-800"
        href={part}
        key={`${part}-${index}`}
        rel="noreferrer"
        target="_blank"
      >
        {part}
      </a>
    );
  });
}

export function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.role !== "user";
  const color = message.role === "assistant" ? "bg-emerald-100" : message.role === "human" ? "bg-amber-100" : "bg-white";
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[68%] rounded-md border border-black/5 px-3 py-2 shadow-sm ${color}`}>
        {message.media_url && message.media_type === "image" ? (
          <a href={message.media_url} target="_blank" rel="noreferrer">
            <img
              alt={message.content || "Imagen recibida"}
              className="mb-2 max-h-80 w-full rounded object-contain"
              src={message.media_url}
            />
          </a>
        ) : null}
        {message.media_url && message.media_type === "video" ? (
          <video className="mb-2 max-h-80 w-full rounded" controls src={message.media_url} />
        ) : null}
        {message.media_url && message.media_type === "audio" ? (
          <audio className="mb-2 w-full" controls src={message.media_url} />
        ) : null}
        {message.media_url && !["image", "video", "audio"].includes(message.media_type || "") ? (
          <a
            className="mb-2 block rounded border border-zinc-300 bg-white/70 px-3 py-2 text-sm font-semibold text-emerald-800"
            href={message.media_url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir archivo recibido
          </a>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{messageTextWithLinks(message.content)}</p>
        <div className="mt-1 text-right text-[11px] text-zinc-500">{timeLabel(message.created_at)}</div>
      </div>
    </div>
  );
}
