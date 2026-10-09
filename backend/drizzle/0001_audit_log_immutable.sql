CREATE FUNCTION "audit_logs_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_logs is immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_update_delete"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate"
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_reject_change"();
