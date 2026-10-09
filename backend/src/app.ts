import express, { type NextFunction, type Request, type Response } from "express";
import { asc, eq, isNull } from "drizzle-orm";
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

app.get("/api/tasks/:id/audit-logs", async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  // Every Task has a Creation Entry, so no rows means unknown; deleted Tasks keep their rows.
  const logs = id.success
    ? await db.select().from(auditLogs).where(eq(auditLogs.taskId, id.data)).orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
    : [];
  if (logs.length === 0) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(logs);
});

app.use((err: { status?: number; message: string }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});
