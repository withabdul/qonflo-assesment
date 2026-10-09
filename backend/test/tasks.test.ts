import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { auditLogs } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";

let server: Server;
let base: string;

beforeAll(async () => {
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../drizzle") });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await pool.end();
});

const post = (path: string, body: unknown) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/users", () => {
  it("returns the fixed Actor list", async () => {
    const res = await fetch(base + "/api/users");
    expect(res.status).toBe(200);
    const users = (await res.json()) as string[];
    expect(users.length).toBeGreaterThan(0);
    expect(users).toContain("john.doe");
  });
});

describe("POST /api/tasks", () => {
  it("creates a to_do Task that appears in the list", async () => {
    const title = `Task ${crypto.randomUUID()}`;
    const res = await post("/api/tasks", { title: `  ${title}  `, actor: "john.doe" });
    expect(res.status).toBe(201);
    const task = (await res.json()) as { id: string; title: string; status: string };
    expect(task.status).toBe("to_do");
    expect(task.title).toBe(title);

    const list = (await (await fetch(base + "/api/tasks")).json()) as { id: string }[];
    expect(list.some((t) => t.id === task.id)).toBe(true);
  });

  it("rejects an empty or whitespace title with 400", async () => {
    for (const title of ["", "   "]) {
      const res = await post("/api/tasks", { title, actor: "john.doe" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBeString();
    }
  });

  it("rejects an unknown Actor with 400", async () => {
    const res = await post("/api/tasks", { title: "x", actor: "nobody.here" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing body with 400", async () => {
    const res = await fetch(base + "/api/tasks", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

const put = (path: string, body: unknown) =>
  fetch(base + path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const newTask = async () => {
  const res = await post("/api/tasks", { title: `T ${crypto.randomUUID()}`, actor: "john.doe" });
  return ((await res.json()) as { id: string }).id;
};

// No audit-log read endpoint exists yet, so logs are read straight from the table.
const logsOf = (taskId: string) => db.select().from(auditLogs).where(eq(auditLogs.taskId, taskId));

const statusOf = async (id: string) => {
  const list = (await (await fetch(base + "/api/tasks")).json()) as { id: string; status: string }[];
  return list.find((t) => t.id === id)?.status;
};

describe("PUT /api/tasks/:id/status", () => {
  it("advances one step and writes exactly one status_change log with from/to", async () => {
    const id = await newTask();
    const res = await put(`/api/tasks/${id}/status`, { status: "pending", actor: "jane.smith" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("pending");
    expect(await statusOf(id)).toBe("pending");

    const logs = (await logsOf(id)).filter((l) => l.action === "status_change");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor: "jane.smith", fromStatus: "to_do", toStatus: "pending" });
  });

  it("walks the full flow to done, then rejects any change from done with 409", async () => {
    const id = await newTask();
    for (const s of ["pending", "in_progress", "done"]) {
      expect((await put(`/api/tasks/${id}/status`, { status: s, actor: "john.doe" })).status).toBe(200);
    }
    const before = (await logsOf(id)).length;
    const res = await put(`/api/tasks/${id}/status`, { status: "in_progress", actor: "john.doe" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBeString();
    expect((await logsOf(id)).length).toBe(before);
  });

  it("rejects a skip with 409 and no new log", async () => {
    const id = await newTask();
    const before = (await logsOf(id)).length;
    const res = await put(`/api/tasks/${id}/status`, { status: "done", actor: "john.doe" });
    expect(res.status).toBe(409);
    expect(await statusOf(id)).toBe("to_do");
    expect((await logsOf(id)).length).toBe(before);
  });

  it("rejects a backward move with 409 and no new log", async () => {
    const id = await newTask();
    await put(`/api/tasks/${id}/status`, { status: "pending", actor: "john.doe" });
    const before = (await logsOf(id)).length;
    const res = await put(`/api/tasks/${id}/status`, { status: "to_do", actor: "john.doe" });
    expect(res.status).toBe(409);
    expect((await logsOf(id)).length).toBe(before);
  });

  it("treats the same Status as an Idempotent Update: 200, no new log", async () => {
    const id = await newTask();
    const before = (await logsOf(id)).length;
    const res = await put(`/api/tasks/${id}/status`, { status: "to_do", actor: "john.doe" });
    expect(res.status).toBe(200);
    expect((await logsOf(id)).length).toBe(before);
  });

  it("rejects an invalid Status or unknown Actor with 400", async () => {
    const id = await newTask();
    expect((await put(`/api/tasks/${id}/status`, { status: "nope", actor: "john.doe" })).status).toBe(400);
    expect((await put(`/api/tasks/${id}/status`, { status: "pending", actor: "nobody.here" })).status).toBe(400);
    expect((await put(`/api/tasks/${id}/status`, {})).status).toBe(400);
  });

  it("returns 404 for a missing Task, including a malformed id", async () => {
    const body = { status: "pending", actor: "john.doe" };
    expect((await put(`/api/tasks/${crypto.randomUUID()}/status`, body)).status).toBe(404);
    expect((await put(`/api/tasks/not-a-uuid/status`, body)).status).toBe(404);
  });

  it("serializes concurrent identical requests into a single log", async () => {
    const id = await newTask();
    const body = { status: "pending", actor: "john.doe" };
    const results = await Promise.all(Array.from({ length: 5 }, () => put(`/api/tasks/${id}/status`, body)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await logsOf(id)).filter((l) => l.action === "status_change")).toHaveLength(1);
  });
});
