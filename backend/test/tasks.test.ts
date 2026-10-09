import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../src/app";
import { db, pool } from "../src/db";
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
