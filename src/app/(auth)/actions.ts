"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

const credentials = z.object({
  email: z.string().trim().email("Adresse e-mail invalide."),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(72),
});

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Identifiants incorrects ou compte non confirmé." };
  redirect("/veille");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/veille` } });
  if (error) return { error: /registered|exists/i.test(error.message) ? "Un compte existe déjà avec cette adresse." : "Inscription impossible pour le moment." };
  if (!data.session) return { message: "Compte créé. Confirme ton adresse via le lien reçu par e-mail, puis connecte-toi." };
  redirect("/veille");
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Adresse e-mail invalide." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await origin()}/auth/confirm?next=/mot-de-passe/nouveau` });
  // Same answer whether or not the account exists.
  return { message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé." };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = credentials.shape.password.safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "Lien expiré : refais une demande de réinitialisation." };
  redirect("/veille");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
