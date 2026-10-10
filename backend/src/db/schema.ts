import { pgEnum, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { STATUS_FLOW } from "../domain";

export const taskStatus = pgEnum("task_status", STATUS_FLOW);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: taskStatus("status").notNull().default("to_do"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// No FK: Audit Log must outlive the Task row.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  taskId: uuid("task_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action", { enum: ["create", "status_change", "delete"] }).notNull(),
  fromStatus: taskStatus("from_status"),
  toStatus: taskStatus("to_status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
