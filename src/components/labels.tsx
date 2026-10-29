import { Badge } from "@/components/ui/badge";
import { CONTENT_KIND_LABELS, PRIORITY_LABELS, type ContentKind, type Priority } from "@/domain/vocabulary";
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
// Shape + text, never colour alone.
const PRIORITY_MARK: Record<Priority, string> = { action: "▲", verify: "◆", watch: "●", explore: "○" };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", PRIORITY_STYLE[priority])}>
      <span aria-hidden className="text-[0.6rem] leading-none">
        {PRIORITY_MARK[priority]}
      </span>
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

/** Empty state: always an explanation and, when possible, a useful action. */
export function EmptyState({ title, children, icon, action }: { title: string; children?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="radar-grid rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border bg-card text-primary shadow-xs [&_svg]:size-5">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, children, eyebrow }: { title: string; description?: React.ReactNode; children?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-balance">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
