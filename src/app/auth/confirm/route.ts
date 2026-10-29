import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Email links (sign-up confirmation, password recovery) land here with a token_hash or a PKCE code.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/veille";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/veille"; // same-site only

  const supabase = await createClient();
  const { error } =
    tokenHash && type ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash }) : code ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("missing token") };
  return NextResponse.redirect(new URL(error ? "/connexion?erreur=lien" : next, request.url));
}
