import { afterAll, beforeAll, expect, it } from "bun:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";
import { db, pool } from "../src/db";

const taskId = crypto.randomUUID();

beforeAll(async () => {
  await migrate(db, { migrationsFolder: join(import.meta.dir, "../drizzle") });
  await pool.query(
    "INSERT INTO audit_logs (task_id, actor, action, to_status) VALUES ($1, 'john.doe', 'create', 'to_do')",
    [taskId],
  );
});

afterAll(() => pool.end());

it("rejects UPDATE on audit_logs at the database", async () => {
  await expect(
    pool.query("UPDATE audit_logs SET actor = 'mallory' WHERE task_id = $1", [taskId]),
  ).rejects.toThrow(/immutable/i);
});

it("rejects DELETE on audit_logs at the database", async () => {
  await expect(pool.query("DELETE FROM audit_logs WHERE task_id = $1", [taskId])).rejects.toThrow(
    /immutable/i,
  );
});

it("rejects TRUNCATE on audit_logs at the database", async () => {
  await expect(pool.query("TRUNCATE audit_logs")).rejects.toThrow(/immutable/i);
});
