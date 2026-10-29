import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS, type Priority } from "@/domain/ranking";
import { CONTENT_KIND_LABELS, type ContentKind } from "@/domain/sources/normalize";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "Date inconnue");
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : "jamais");

export function PublishedDate({ iso }: { iso: string | null }) {
  return iso ? <time dateTime={iso}>{formatDate(iso)}</time> : <span>Date inconnue</span>;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  action: "border-destructive/40 bg-destructive/10 text-destructive",
  verify: "border-warning/50 bg-warning/10 text-warning",
  watch: "border-primary/40 bg-primary/10 text-primary",
  explore: "border-border bg-muted text-muted-foreground",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("font-medium", PRIORITY_STYLE[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function KindBadge({ kind, prerelease }: { kind: ContentKind; prerelease?: boolean }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {CONTENT_KIND_LABELS[kind]}
      {prerelease ? " · préversion" : ""}
    </Badge>
  );
}

export function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="font-mono text-[0.7rem] font-normal">
      {children}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
      Donnée de démonstration
    </Badge>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
