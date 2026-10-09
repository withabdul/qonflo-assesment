import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../src/app";
import { db, pool } from "../src/db";
import { auditLogs } from "../src/db/schema";
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

describe("GET /api/tasks/:id/audit-logs", () => {
  type Log = { id: number; actor: string; action: string; fromStatus: string | null; toStatus: string };
  const logsOf = (id: string) => fetch(`${base}/api/tasks/${id}/audit-logs`);

  it("returns the Creation Entry for a new Task", async () => {
    const created = await post("/api/tasks", { title: "Logged", actor: "jane.smith" });
    const task = (await created.json()) as { id: string };
    const res = await logsOf(task.id);
    expect(res.status).toBe(200);
    const logs = (await res.json()) as Log[];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor: "jane.smith", action: "create", fromStatus: null, toStatus: "to_do" });
  });

  it("returns entries oldest first, ties broken by id", async () => {
    const created = await post("/api/tasks", { title: "Ordered", actor: "john.doe" });
    const task = (await created.json()) as { id: string };
    // Seeded directly: the status endpoint is a separate ticket; both rows share createdAt so only id orders them.
    const at = new Date("2030-01-01T00:00:00Z");
    await db.insert(auditLogs).values([
      { taskId: task.id, actor: "budi.santoso", action: "status_change", fromStatus: "to_do", toStatus: "pending", createdAt: at },
      { taskId: task.id, actor: "john.doe", action: "status_change", fromStatus: "pending", toStatus: "in_progress", createdAt: at },
    ]);
    const logs = (await (await logsOf(task.id)).json()) as Log[];
    expect(logs.map((l) => l.toStatus)).toEqual(["to_do", "pending", "in_progress"]);
    expect(logs[1]).toMatchObject({ actor: "budi.santoso", fromStatus: "to_do" });
  });

  it("returns 404 for an unknown Task", async () => {
    expect((await logsOf(crypto.randomUUID())).status).toBe(404);
  });

  it("returns 404 for a malformed id", async () => {
    expect((await logsOf("not-a-uuid")).status).toBe(404);
  });
});
