import express, { type NextFunction, type Request, type Response } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import * as z from "zod";
import { db } from "./db";
import { auditLogs, tasks } from "./db/schema";

export const ACTORS = ["john.doe", "jane.smith", "budi.santoso"] as const;

const CreateTask = z.object({
  title: z.string().trim().min(1, "Title must not be empty"),
  actor: z.enum(ACTORS, { error: "Unknown actor" }),
});

export const app = express();
app.use(express.json());

app.get("/api/users", (_req, res) => {
  res.json(ACTORS);
});

app.get("/api/tasks", async (_req, res) => {
  const rows = await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(asc(tasks.createdAt));
  res.json(rows);
});

app.post("/api/tasks", async (req, res) => {
  const parsed = CreateTask.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]!.message });
    return;
  }
  const { title, actor } = parsed.data;
  // Task and Creation Entry commit together or not at all.
  const task = await db.transaction(async (tx) => {
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
  res.status(201).json(task);
});

const STATUS_FLOW = ["to_do", "pending", "in_progress", "done"] as const;

const ChangeStatus = z.object({
  status: z.enum(STATUS_FLOW, { error: "Invalid status" }),
  actor: z.enum(ACTORS, { error: "Unknown actor" }),
});

app.put("/api/tasks/:id/status", async (req, res) => {
  const parsed = ChangeStatus.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]!.message });
    return;
  }
  const { status, actor } = parsed.data;
  const id = req.params.id;
  // A malformed id cannot match any Task; avoid a Postgres uuid cast error.
  if (!z.uuid().safeParse(id).success) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Row lock serializes concurrent requests; the second one sees the new Status.
  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
      .for("update");
    if (!task) return { code: 404, body: { error: "Task not found" } } as const;
    if (task.status === status) return { code: 200, body: task } as const;
    if (STATUS_FLOW.indexOf(status) !== STATUS_FLOW.indexOf(task.status) + 1) {
      return {
        code: 409,
        body: { error: `Cannot change status from ${task.status} to ${status}` },
      } as const;
    }
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
    return { code: 200, body: updated! } as const;
  });
  res.status(result.code).json(result.body);
});

app.use((err: { status?: number; message: string }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});
