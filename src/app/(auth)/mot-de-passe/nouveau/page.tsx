import { updatePassword } from "../../actions";
import { AuthForm } from "../../auth-form";

export const metadata = { title: "Nouveau mot de passe" };

export default function NewPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Choisir un nouveau mot de passe</h1>
      <AuthForm action={updatePassword} fields={["new-password"]} submitLabel="Enregistrer" />
    </div>
  );
}
