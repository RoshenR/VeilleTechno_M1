import Link from "next/link";
import { signIn } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const { erreur } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Connexion</h1>
      {erreur && <p className="text-sm text-destructive">Le lien est invalide ou a expiré.</p>}
      <AuthForm action={signIn} fields={["email", "password"]} submitLabel="Se connecter" />
      <p className="text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-medium text-foreground underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
