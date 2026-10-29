import { DetailSheet } from "@/components/detail-sheet";

// Same layout as the detail: header, facts block, one project block.
export default function Loading() {
  return (
    <DetailSheet titleId="panel-loading">
      <div aria-busy="true" className="animate-pulse space-y-6">
        <p id="panel-loading" className="sr-only">
          Chargement du détail…
        </p>
        <div className="space-y-3">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-7 w-4/5 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-8 w-40 rounded-lg bg-muted" />
            <div className="h-8 w-28 rounded-lg bg-muted" />
          </div>
        </div>
        <div className="surface h-40" />
        <div className="surface h-56" />
      </div>
    </DetailSheet>
  );
}
