"use client";

import { useEffect, useRef, useState } from "react";
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

function isAutomaticMediaLabel(message: Message) {
  const text = message.content.trim();
  if (!message.media_url) return false;
  return [
    "[Imagen recibida]",
    "[Imagen enviada]",
    "[Audio recibido]",
    "[Audio enviado]",
    "[Video recibido]",
    "[Video enviado]",
  ].includes(text);
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: string) {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <div className="mb-2 min-w-64 rounded-full border border-black/10 bg-white/75 px-3 py-2 shadow-sm">
      <audio
        ref={audioRef}
        src={src}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <div className="flex items-center gap-3">
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
          onClick={togglePlayback}
          type="button"
        >
          {playing ? "II" : "Play"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            aria-label="Avance del audio"
            className="h-2 w-full cursor-pointer accent-emerald-600"
            max={duration || 0}
            min={0}
            onChange={(event) => seek(event.target.value)}
            step="0.1"
            type="range"
            value={duration ? currentTime : 0}
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
        <a
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          download
          href={src}
        >
          Descargar
        </a>
      </div>
    </div>
  );
}

export function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.role !== "user";
  const color = message.role === "assistant" ? "bg-emerald-100" : message.role === "human" ? "bg-amber-100" : "bg-white";
  const visibleText = isAutomaticMediaLabel(message) ? "" : message.content;
  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[68%] rounded-md border border-black/5 px-3 py-2 shadow-sm ${color}`}>
        {message.media_url && message.media_type === "image" ? (
          <a href={message.media_url} target="_blank" rel="noreferrer">
            <img
              alt={visibleText || "Imagen"}
              className="mb-2 max-h-80 w-full rounded object-contain"
              src={message.media_url}
            />
          </a>
        ) : null}
        {message.media_url && message.media_type === "video" ? (
          <video className="mb-2 max-h-80 w-full rounded" controls src={message.media_url} />
        ) : null}
        {message.media_url && message.media_type === "audio" ? (
          <AudioPlayer src={message.media_url} />
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
        {visibleText ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{messageTextWithLinks(visibleText)}</p> : null}
        <div className="mt-1 text-right text-[11px] text-zinc-500">{timeLabel(message.created_at)}</div>
      </div>
    </div>
  );
}
