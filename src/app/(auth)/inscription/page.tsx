import Link from "next/link";
import { signUp } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Inscription" };

export default function SignUpPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Créer un compte</h1>
      <AuthForm action={signUp} fields={["email", "new-password"]} submitLabel="Créer mon compte" />
      <p className="text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-medium text-foreground underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
