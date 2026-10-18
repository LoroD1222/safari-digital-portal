"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export type FormState = { error?: string; done?: boolean };

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  const password = (form.get("password") as string) ?? "";
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match. Try again or reset your password." };
  redirect("/");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  if (!email) return { error: "Enter the email you sign in with." };

  const origin = await siteOrigin();
  const supabase = await createClient();
  // Same answer whether or not the account exists, so emails can't be guessed.
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  return { done: true };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const password = (form.get("password") as string) ?? "";
  const confirm = (form.get("confirm") as string) ?? "";
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "This reset link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "We couldn't update your password. " + error.message };
  redirect("/");
}
