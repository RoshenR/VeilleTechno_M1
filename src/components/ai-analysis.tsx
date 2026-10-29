import type { StoredAnalysis } from "@/domain/ai";
import { formatDateTime } from "./labels";

export function AiAnalysis({ analysis }: { analysis: StoredAnalysis }) {
  const facts = analysis.relevance.filter((r) => r.type === "fact");
  const inferences = analysis.relevance.filter((r) => r.type === "inference");
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 p-3 text-sm">
      <p className="text-xs font-medium text-primary">
        Analyse IA · {analysis.provider} · {formatDateTime(analysis.generated_at)} · fondée sur {analysis.basis === "title_only" ? "le titre seul" : "l’extrait"}
      </p>
      {analysis.summary && <p>{analysis.summary}</p>}
      {facts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Faits issus de la source</p>
          <ul className="list-inside list-disc">
            {facts.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      {inferences.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Interprétation pour le projet (inférences)</p>
          <ul className="list-inside list-disc">
            {inferences.map((f, i) => (
              <li key={i}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.suggested_action && (
        <p>
          <span className="text-xs font-medium text-muted-foreground">Piste d’action : </span>
          {analysis.suggested_action}
        </p>
      )}
      {analysis.evidence.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Citations vérifiées dans la source</p>
          {analysis.evidence.map((e, i) => (
            <blockquote key={i} className="border-l-2 pl-2 text-muted-foreground italic">
              {e.quote}
            </blockquote>
          ))}
        </div>
      )}
      {analysis.limitations.length > 0 && <p className="text-xs text-muted-foreground">Limites : {analysis.limitations.join(" ")}</p>}
    </div>
  );
}
