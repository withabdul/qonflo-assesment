// Task use cases. Each write changes the Task and its Audit Log in one transaction.
import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, tasks } from "./db/schema";
import { InvalidTransitionError, NotFoundError, transition, type Actor, type Status } from "./domain";

export const listTasks = () =>
  db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(asc(tasks.createdAt));

export function createTask(title: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(tasks).values({ title }).returning();
    await tx.insert(auditLogs).values({
      taskId: created!.id,
      actor,
      action: "create",
      fromStatus: null,
      toStatus: "to_do",
    });
    return created!;
  });
}

export function advanceStatus(id: string, status: Status, actor: Actor) {
  return db.transaction(async (tx) => {
    // Row lock serializes concurrent requests; the second one sees the new Status.
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .for("update");
    if (!task) throw new NotFoundError();

    const step = transition(task.status, status);
    if (step === "noop") return task;
    if (step === "invalid") throw new InvalidTransitionError(task.status, status);

    const [updated] = await tx
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    await tx.insert(auditLogs).values({
      taskId: id,
      actor,
      action: "status_change",
      fromStatus: task.status,
      toStatus: status,
    });
    return updated!;
  });
}

export function deleteTask(id: string, actor: Actor) {
  return db.transaction(async (tx) => {
    // The deletedAt guard makes a concurrent second delete a NotFound.
    const [task] = await tx
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .returning();
    if (!task) throw new NotFoundError();
    await tx.insert(auditLogs).values({
      taskId: task.id,
      actor,
      action: "delete",
      fromStatus: null,
      toStatus: task.status,
    });
  });
}

export function listAuditLogs() {
  // Inner join is safe: Tasks are soft-deleted, so every log row still has its Task row.
  return db
    .select({ ...getTableColumns(auditLogs), taskTitle: tasks.title })
    .from(auditLogs)
    .innerJoin(tasks, eq(tasks.id, auditLogs.taskId))
    .orderBy(asc(auditLogs.id));
}

export async function listTaskAuditLogs(id: string) {
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.taskId, id)).orderBy(asc(auditLogs.id));
  // Every Task has a Creation Entry, so no rows means unknown; deleted Tasks keep their rows.
  if (logs.length === 0) throw new NotFoundError();
  return logs;
}
