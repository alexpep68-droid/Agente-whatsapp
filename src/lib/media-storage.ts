import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function storageClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function hasOnlineStorage() {
  return Boolean(storageClient() && process.env.SUPABASE_STORAGE_BUCKET);
}

export async function uploadMedia(path: string, buffer: Buffer, contentType: string) {
  const supabase = storageClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "whatsapp-media";
  if (!supabase) return null;

  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signedError) throw new Error(signedError.message);
  return data.signedUrl;
}
