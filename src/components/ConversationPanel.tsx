"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_LABELS, parseLabels, serializeLabels } from "./labels";
import { MessageBubble } from "./MessageBubble";
import { ModeToggle } from "./ModeToggle";
import { PIPELINE_STAGES } from "./pipeline";
import type { Conversation, ConversationMode, CustomerProfile, Message, PipelineStage } from "./types";

function chatLabel(value: string) {
  return value.replace("@s.whatsapp.net", "").replace("@lid", "");
}

function emptyProfile(conversationId: number): CustomerProfile {
  return {
    conversation_id: conversationId,
    customer_name: null,
    project_type: null,
    city: null,
    budget: null,
    measurements: null,
    visit_date: null,
    notes: null,
    updated_at: 0,
  };
}

interface QuickReply {
  id: number;
  account_id: number;
  title: string;
  text: string;
}

interface QuickReplyDraft {
  id: number | null;
  title: string;
  text: string;
}

export function ConversationPanel({
  conversation,
  onChanged,
}: {
  conversation: Conversation | null;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [showLabels, setShowLabels] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [quickReplyDraft, setQuickReplyDraft] = useState<QuickReplyDraft | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<CustomerProfile | null>(null);
  const [pipelineStage, setPipelineStageState] = useState<PipelineStage>("Nuevo cliente");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [selectedVideoPreview, setSelectedVideoPreview] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabels(parseLabels(conversation?.label));
    setPipelineStageState(conversation?.pipeline_stage || "Nuevo cliente");
    setShowLabels(false);
    setSelectedImage(null);
    setSelectedAudio(null);
    setSelectedVideo(null);
  }, [conversation?.id, conversation?.label, conversation?.pipeline_stage]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(selectedImage);
    setSelectedImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedVideo) {
      setSelectedVideoPreview(null);
      return;
    }
    const url = URL.createObjectURL(selectedVideo);
    setSelectedVideoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedVideo]);

  useEffect(() => {
    if (!conversation) return;
    let alive = true;
    async function loadQuickReplies() {
      const res = await fetch(`/api/quick-replies?accountId=${conversation!.account_id}`);
      const json = (await res.json()) as { quickReplies?: QuickReply[] };
      if (alive) setQuickReplies(json.quickReplies || []);
    }
    void loadQuickReplies();
    return () => {
      alive = false;
    };
  }, [conversation]);

  useEffect(() => {
    if (!conversation?.id) return;
    let alive = true;
    async function loadProfile() {
      const res = await fetch(`/api/customer-profile/${conversation!.id}`);
      const json = (await res.json()) as { profile?: CustomerProfile };
      if (alive && json.profile) {
        setProfile(json.profile);
        setProfileDraft(json.profile);
      }
    }
    void loadProfile();
    return () => {
      alive = false;
    };
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation) return;
    let alive = true;
    stickToBottomRef.current = true;
    async function load() {
      const res = await fetch(`/api/messages/${conversation!.id}`);
      const json = (await res.json()) as { messages: Message[] };
      if (alive) {
        setMessages((current) => {
          const currentLast = current.at(-1);
          const nextLast = json.messages.at(-1);
          if (current.length === json.messages.length && currentLast?.id === nextLast?.id) return current;
          return json.messages;
        });
      }
    }
    void load();
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversation]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.id, messages.length]);

  function handleMessagesScroll() {
    const element = messagesRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 180;
  }

  async function changeMode(mode: ConversationMode) {
    if (!conversation) return;
    await fetch(`/api/mode/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    onChanged();
  }

  async function sendMessage(contentOverride?: string) {
    if (!conversation) return;
    const content = (contentOverride ?? draft).trim();
    const media = contentOverride ? null : selectedImage || selectedAudio || selectedVideo;
    if (!content && !media) return;
    if (!contentOverride) {
      setDraft("");
      setSelectedImage(null);
      setSelectedAudio(null);
      setSelectedVideo(null);
    }
    setShowQuickReplies(false);
    if (media) {
      const formData = new FormData();
      formData.set("media", media);
      formData.set("content", content);
      await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        body: formData,
      });
    } else {
      await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    }
    onChanged();
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    setSelectedImage(file);
    setSelectedAudio(null);
    setSelectedVideo(null);
  }

  function pickAudio(file: File | undefined) {
    if (!file) return;
    setSelectedAudio(file);
    setSelectedImage(null);
    setSelectedVideo(null);
  }

  function pickVideo(file: File | undefined) {
    if (!file) return;
    setSelectedVideo(file);
    setSelectedImage(null);
    setSelectedAudio(null);
  }

  function insertQuickReply(text: string) {
    setDraft(text);
    setShowQuickReplies(false);
  }

  function openNewQuickReply() {
    setQuickReplyDraft({ id: null, title: "", text: "" });
  }

  function openEditQuickReply(reply: QuickReply) {
    setQuickReplyDraft({ id: reply.id, title: reply.title, text: reply.text });
  }

  async function refreshQuickReplies() {
    if (!conversation) return;
    const res = await fetch(`/api/quick-replies?accountId=${conversation.account_id}`);
    const json = (await res.json()) as { quickReplies?: QuickReply[] };
    setQuickReplies(json.quickReplies || []);
  }

  async function saveQuickReply() {
    if (!conversation || !quickReplyDraft) return;
    const title = quickReplyDraft.title.trim();
    const text = quickReplyDraft.text.trim();
    if (!title || !text) return;
    if (quickReplyDraft.id) {
      await fetch(`/api/quick-replies/${quickReplyDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text }),
      });
    } else {
      await fetch("/api/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: conversation.account_id, title, text }),
      });
    }
    setQuickReplyDraft(null);
    await refreshQuickReplies();
  }

  async function removeQuickReply() {
    if (!quickReplyDraft?.id) return;
    await fetch(`/api/quick-replies/${quickReplyDraft.id}`, { method: "DELETE" });
    setQuickReplyDraft(null);
    await refreshQuickReplies();
  }

  async function saveLabels(nextLabels: string[]) {
    if (!conversation) return;
    setLabels(nextLabels);
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: serializeLabels(nextLabels) }),
    });
    onChanged();
  }

  async function changePipelineStage(stage: PipelineStage) {
    if (!conversation) return;
    setPipelineStageState(stage);
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    });
    onChanged();
  }

  async function saveProfile() {
    if (!conversation || !profileDraft) return;
    const res = await fetch(`/api/customer-profile/${conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileDraft),
    });
    const json = (await res.json()) as { profile?: CustomerProfile };
    if (json.profile) {
      setProfile(json.profile);
      setProfileDraft(json.profile);
    }
    setShowProfile(false);
  }

  function toggleLabel(name: string) {
    const nextLabels = labels.includes(name) ? labels.filter((label) => label !== name) : [...labels, name];
    void saveLabels(nextLabels);
  }

  async function removeConversation() {
    if (!conversation) return;
    await fetch(`/api/conversations/${conversation.id}`, { method: "DELETE" });
    setShowDeleteConfirm(false);
    onChanged();
  }

  if (!conversation) {
    return (
      <main className="grid flex-1 place-items-center bg-[#efe8dc] text-zinc-500">
        <div className="max-w-md text-center">
          <div className="text-5xl">WhatsApp</div>
          <p className="mt-3 text-sm">
            Los chats apareceran cuando entren mensajes nuevos. El historial anterior de WhatsApp no se sincroniza en esta version inicial.
          </p>
        </div>
      </main>
    );
  }

  const title = conversation.name || `+${chatLabel(conversation.phone)}`;
  const humanMode = conversation.mode === "HUMAN";
  const draftRows = Math.min(8, Math.max(1, draft.split("\n").length + Math.floor(draft.length / 95)));
  const draftHeight = Math.max(48, draftRows * 24 + 24);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#efe8dc]">
      <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{title}</h2>
          <p className="text-xs text-zinc-500">+{chatLabel(conversation.phone)}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="h-10 rounded-full border border-zinc-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-500"
            onChange={(event) => void changePipelineStage(event.target.value as PipelineStage)}
            value={pipelineStage}
          >
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-full border border-emerald-200 px-4 text-sm font-semibold text-emerald-800"
            onClick={() => {
              setProfileDraft(profile || emptyProfile(conversation.id));
              setShowProfile(true);
            }}
            type="button"
          >
            Ficha
          </button>
          <div className="relative">
            <button
              className="flex h-10 items-center gap-2 rounded-full border border-zinc-300 px-4 text-sm font-semibold"
              onClick={() => setShowLabels((open) => !open)}
              type="button"
            >
              <span className="inline-block h-3 w-4 rounded-sm border border-zinc-500" />
              Etiquetar chat
              <span className="text-xs">▾</span>
            </button>
            {showLabels ? (
              <div className="absolute right-0 top-12 z-30 max-h-80 w-72 overflow-y-auto rounded-md border border-zinc-200 bg-white py-2 shadow-xl">
                {CHAT_LABELS.map((label) => (
                  <button
                    key={label.name}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-zinc-50"
                    onClick={() => toggleLabel(label.name)}
                    type="button"
                  >
                    <span className={`h-3 w-5 rounded-sm ${label.color}`} />
                    <span className="min-w-0 flex-1">{label.name}</span>
                    <span className="grid h-5 w-5 place-items-center rounded border border-zinc-400 text-xs">
                      {labels.includes(label.name) ? "✓" : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ModeToggle mode={conversation.mode} onChange={changeMode} />
          <button className="h-10 rounded border border-red-200 px-3 text-sm font-semibold text-red-700" onClick={() => setShowDeleteConfirm(true)} type="button">
            Borrar
          </button>
        </div>
      </header>

      <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6" onScroll={handleMessagesScroll}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-zinc-200 bg-white p-4">
        {(selectedImage && selectedImagePreview) || selectedAudio || (selectedVideo && selectedVideoPreview) ? (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            {selectedImage && selectedImagePreview ? (
              <img alt="Imagen lista para enviar" className="h-20 w-20 rounded object-cover" src={selectedImagePreview} />
            ) : selectedVideo && selectedVideoPreview ? (
              <video className="h-20 w-20 rounded object-cover" src={selectedVideoPreview} muted />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded bg-white text-sm font-semibold text-emerald-800">
                Audio
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-emerald-900">{selectedImage?.name || selectedAudio?.name || selectedVideo?.name}</p>
              <p className="text-xs text-emerald-700">
                {selectedAudio ? "Se enviara como audio." : selectedVideo ? "Se enviara como video." : "Se enviara con el mensaje como pie de foto."}
              </p>
            </div>
            <button
              className="h-9 rounded border border-emerald-300 px-3 text-sm font-semibold text-emerald-800"
              onClick={() => {
                setSelectedImage(null);
                setSelectedAudio(null);
                setSelectedVideo(null);
              }}
              type="button"
            >
              Quitar
            </button>
          </div>
        ) : null}
        {showQuickReplies ? (
          <div className="mb-3 max-h-72 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="font-semibold">Respuestas rápidas</p>
                <p className="text-sm text-zinc-500">Inserta para editar o envía directamente.</p>
              </div>
              <button
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-lg font-bold text-white"
                onClick={openNewQuickReply}
                title="Agregar respuesta"
                type="button"
              >
                +
              </button>
            </div>
            <div className="grid gap-2 p-3 md:grid-cols-2">
              {quickReplies.map((reply) => (
                <div key={reply.id} className="rounded border border-zinc-200 p-3">
                  <p className="font-semibold">{reply.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{reply.text}</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      className="h-9 rounded border border-zinc-300 px-3 text-sm font-semibold"
                      onClick={() => openEditQuickReply(reply)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="h-9 rounded border border-zinc-300 px-3 text-sm font-semibold"
                      onClick={() => insertQuickReply(reply.text)}
                      type="button"
                    >
                      Insertar
                    </button>
                    <button
                      className="h-9 rounded bg-emerald-600 px-3 text-sm font-semibold text-white"
                      onClick={() => void sendMessage(reply.text)}
                      type="button"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              ))}
              {quickReplies.length === 0 ? (
                <div className="rounded border border-dashed border-zinc-300 p-5 text-sm text-zinc-500">
                  Aun no hay respuestas rápidas para esta cuenta.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {humanMode ? (
          <div className="flex items-end gap-3">
            <button
              className="h-12 rounded-full border border-zinc-300 px-4 font-semibold text-emerald-700"
              onClick={() => setShowQuickReplies((open) => !open)}
              type="button"
            >
              Respuestas
            </button>
            <input
              ref={imageInputRef}
              accept="image/*"
              className="hidden"
              onChange={(event) => pickImage(event.target.files?.[0])}
              type="file"
            />
            <input
              ref={audioInputRef}
              accept="audio/*"
              className="hidden"
              onChange={(event) => pickAudio(event.target.files?.[0])}
              type="file"
            />
            <input
              ref={videoInputRef}
              accept="video/mp4"
              className="hidden"
              onChange={(event) => pickVideo(event.target.files?.[0])}
              type="file"
            />
            <button
              className="h-12 rounded-full border border-zinc-300 px-4 font-semibold text-zinc-700"
              onClick={() => imageInputRef.current?.click()}
              type="button"
            >
              Imagen
            </button>
            <button
              className="h-12 rounded-full border border-zinc-300 px-4 font-semibold text-zinc-700"
              onClick={() => audioInputRef.current?.click()}
              type="button"
            >
              Audio
            </button>
            <button
              className="h-12 rounded-full border border-zinc-300 px-4 font-semibold text-zinc-700"
              onClick={() => videoInputRef.current?.click()}
              type="button"
            >
              Video
            </button>
            <textarea
              className="flex-1 resize-none rounded-[24px] border border-zinc-300 px-5 py-3 text-sm leading-relaxed outline-none transition-[height] focus:border-emerald-500"
              onChange={(event) => {
                setDraft(event.target.value);
                if (event.target.value.trim() === "/") setShowQuickReplies(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Escribe un mensaje o / para respuestas"
              style={{ height: draftHeight }}
              value={draft}
            />
            <button className="h-12 rounded-full bg-emerald-600 px-6 font-semibold text-white" onClick={() => void sendMessage()} type="button">
              Enviar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              className="h-12 rounded-full border border-emerald-200 px-4 font-semibold text-emerald-700"
              onClick={() => setShowQuickReplies((open) => !open)}
              type="button"
            >
              Respuestas
            </button>
            <div className="flex-1 rounded-full bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
              El bot responde automaticamente. Cambia a Humano para escribir libremente.
            </div>
          </div>
        )}
      </footer>
      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">Borrar conversacion</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Se borraran los mensajes guardados de {title}. Esta accion no borra el chat del telefono.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                Cancelar
              </button>
              <button className="h-10 rounded bg-red-600 px-4 text-sm font-semibold text-white" onClick={removeConversation} type="button">
                Borrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {quickReplyDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-md bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold">{quickReplyDraft.id ? "Editar respuesta" : "Nueva respuesta"}</h2>
            <div className="mt-4 space-y-3">
              <input
                className="h-11 w-full rounded border border-zinc-300 px-3 outline-none focus:border-emerald-500"
                onChange={(event) => setQuickReplyDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                placeholder="Nombre de la respuesta"
                value={quickReplyDraft.title}
              />
              <textarea
                className="h-72 w-full resize-none rounded border border-zinc-300 p-3 text-sm leading-relaxed outline-none focus:border-emerald-500"
                onChange={(event) => setQuickReplyDraft((current) => (current ? { ...current, text: event.target.value } : current))}
                placeholder="Texto de la respuesta"
                value={quickReplyDraft.text}
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div>
                {quickReplyDraft.id ? (
                  <button
                    className="h-10 rounded border border-red-200 px-4 text-sm font-semibold text-red-700"
                    onClick={() => void removeQuickReply()}
                    type="button"
                  >
                    Borrar
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold"
                  onClick={() => setQuickReplyDraft(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="h-10 rounded bg-emerald-600 px-4 text-sm font-semibold text-white"
                  onClick={() => void saveQuickReply()}
                  type="button"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showProfile && profileDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Ficha del cliente</h2>
                <p className="text-sm text-zinc-500">{title}</p>
              </div>
              <button
                className="h-9 rounded border border-zinc-300 px-3 text-sm font-semibold"
                onClick={() => setShowProfile(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block text-sm font-semibold">
                Nombre
                <input
                  className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, customer_name: event.target.value } : current))}
                  value={profileDraft.customer_name || ""}
                />
              </label>
              <label className="block text-sm font-semibold">
                Proyecto
                <select
                  className="mt-1 h-11 w-full rounded border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, project_type: event.target.value } : current))}
                  value={profileDraft.project_type || ""}
                >
                  <option value="">Seleccionar</option>
                  <option value="Cocina Integral">Cocina Integral</option>
                  <option value="Closet">Closet</option>
                  <option value="Centro de Entretenimiento">Centro de Entretenimiento</option>
                  <option value="Mueble de Baño">Mueble de Baño</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Ciudad
                <input
                  className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, city: event.target.value } : current))}
                  value={profileDraft.city || ""}
                />
              </label>
              <label className="block text-sm font-semibold">
                Presupuesto
                <input
                  className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, budget: event.target.value } : current))}
                  placeholder="Ej. $35,000 - $50,000"
                  value={profileDraft.budget || ""}
                />
              </label>
              <label className="block text-sm font-semibold">
                Medidas
                <input
                  className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, measurements: event.target.value } : current))}
                  placeholder="Ej. 2.50 m lineales"
                  value={profileDraft.measurements || ""}
                />
              </label>
              <label className="block text-sm font-semibold">
                Fecha de visita
                <input
                  className="mt-1 h-11 w-full rounded border border-zinc-300 px-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, visit_date: event.target.value } : current))}
                  type="date"
                  value={profileDraft.visit_date || ""}
                />
              </label>
              <label className="block text-sm font-semibold md:col-span-2">
                Notas
                <textarea
                  className="mt-1 h-32 w-full resize-none rounded border border-zinc-300 p-3 font-normal outline-none focus:border-emerald-500"
                  onChange={(event) => setProfileDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
                  placeholder="Detalles importantes del proyecto, materiales, dudas o seguimiento pendiente."
                  value={profileDraft.notes || ""}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded border border-zinc-300 px-4 text-sm font-semibold"
                onClick={() => setShowProfile(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="h-10 rounded bg-emerald-600 px-4 text-sm font-semibold text-white"
                onClick={() => void saveProfile()}
                type="button"
              >
                Guardar ficha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
