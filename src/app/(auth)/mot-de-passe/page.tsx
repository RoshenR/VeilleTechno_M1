import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Récupérer l’accès</h1>
      <p className="text-sm text-muted-foreground">Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.</p>
      <AuthForm action={requestPasswordReset} fields={["email"]} submitLabel="Envoyer le lien" />
      <Link href="/connexion" className="text-sm underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
