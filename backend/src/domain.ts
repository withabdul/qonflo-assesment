// Pure domain rules: no HTTP, no database. Everything else imports its vocabulary from here.

export const ACTORS = ["john.doe", "jane.smith", "budi.santoso"] as const;
export type Actor = (typeof ACTORS)[number];

// The array order is the only allowed flow: one step forward at a time.
export const STATUS_FLOW = ["to_do", "pending", "in_progress", "done"] as const;
export type Status = (typeof STATUS_FLOW)[number];

export type Transition = "noop" | "advance" | "invalid";

export function transition(from: Status, to: Status): Transition {
  if (from === to) return "noop";
  return STATUS_FLOW.indexOf(to) === STATUS_FLOW.indexOf(from) + 1 ? "advance" : "invalid";
}

export class NotFoundError extends Error {
  constructor() {
    super("Task not found");
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: Status, to: Status) {
    super(`Cannot change status from ${from} to ${to}`);
  }
}
