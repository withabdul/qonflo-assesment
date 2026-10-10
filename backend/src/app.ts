// HTTP boundary only: parse input, call a use case, map the result and errors to status codes.
import express, { type NextFunction, type Request, type Response } from "express";
import * as z from "zod";
import { ACTORS, InvalidTransitionError, NotFoundError, STATUS_FLOW } from "./domain";
import { advanceStatus, createTask, deleteTask, listAuditLogs, listTaskAuditLogs, listTasks } from "./tasks";

class ValidationError extends Error {}

const Actor = z.enum(ACTORS, { error: "Unknown actor" });
const CreateTask = z.object({ title: z.string().trim().min(1, "Title must not be empty"), actor: Actor });
const DeleteTask = z.object({ actor: Actor });
const ChangeStatus = z.object({ status: z.enum(STATUS_FLOW, { error: "Invalid status" }), actor: Actor });

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message);
  return parsed.data;
}

// A malformed id cannot match any Task; checking here avoids a Postgres uuid cast error.
function parseId(id: unknown): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new NotFoundError();
  return parsed.data;
}

export const app = express();
app.use(express.json());

app.get("/api/users", (_req, res) => {
  res.json(ACTORS);
});

app.get("/api/tasks", async (_req, res) => {
  res.json(await listTasks());
});

app.post("/api/tasks", async (req, res) => {
  const { title, actor } = parseBody(CreateTask, req.body);
  res.status(201).json(await createTask(title, actor));
});

app.put("/api/tasks/:id/status", async (req, res) => {
  const { status, actor } = parseBody(ChangeStatus, req.body);
  res.json(await advanceStatus(parseId(req.params.id), status, actor));
});

app.delete("/api/tasks/:id", async (req, res) => {
  const { actor } = parseBody(DeleteTask, req.body ?? {});
  await deleteTask(parseId(req.params.id), actor);
  res.status(204).end();
});

app.get("/api/audit-logs", async (_req, res) => {
  res.json(await listAuditLogs());
});

app.get("/api/tasks/:id/audit-logs", async (req, res) => {
  res.json(await listTaskAuditLogs(parseId(req.params.id)));
});

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    err instanceof ValidationError ? 400
    : err instanceof NotFoundError ? 404
    : err instanceof InvalidTransitionError ? 409
    : (err.status ?? 500);
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});
