"use client";

import type { Account } from "./types";

export function QRScreen({
  account,
  qrPng,
  status,
  onConnect,
}: {
  account: Account;
  qrPng: string | null;
  status: string;
  onConnect: () => void;
}) {
  return (
    <main className="grid flex-1 place-items-center bg-[#f7efe2] p-8">
      <section className="w-full max-w-3xl rounded-md border border-zinc-300 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-8">
          <div>
            <p className="text-sm font-semibold text-emerald-700">{account.name}</p>
            <h1 className="mt-3 text-3xl font-bold">Conectar numero</h1>
            <ol className="mt-8 space-y-4 text-zinc-700">
              <li>1. Abre WhatsApp en tu telefono.</li>
              <li>2. Entra a Dispositivos vinculados.</li>
              <li>3. Escanea este codigo QR.</li>
            </ol>
            <div className="mt-8 flex items-center gap-3 text-sm">
              <span className={`h-3 w-3 rounded-full ${status === "qr" ? "animate-pulse bg-amber-500" : "bg-sky-500"}`} />
              {status === "qr" ? "Esperando escaneo" : status === "connecting" ? "Conectando" : "Esperando al bot"}
            </div>
            <button className="mt-6 rounded bg-emerald-600 px-4 py-2 font-semibold text-white" onClick={onConnect} type="button">
              Generar QR
            </button>
          </div>
          <div className="grid h-[340px] w-[340px] place-items-center rounded border border-zinc-200 bg-zinc-50">
            {qrPng ? <img alt="Codigo QR de WhatsApp" className="h-[320px] w-[320px]" src={qrPng} /> : <div className="text-sm text-zinc-500">QR pendiente</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
