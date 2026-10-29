export const ACTION_STATUSES = ["to_study", "todo", "done", "dropped"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  to_study: "À étudier",
  todo: "À faire",
  done: "Terminé",
  dropped: "Abandonné",
};
