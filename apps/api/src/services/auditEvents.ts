/**
 * Durable change-audit trail (§3.3 audit_events / S4).
 * Records WHO changed WHAT on admin mutations — the J-SOX/ISO-grade record
 * the in-memory request trail (auditLog.ts) cannot provide. Neon-backed in
 * production; in-memory for dev/tests. Writes are best-effort: a failing
 * audit insert must not fail the admin operation itself (callers catch),
 * but the write happens before the response so it is not silently dropped.
 *
 * Privacy: summaries carry masked values only (e.g. `…abcd`) — never the
 * API key, never request bodies.
 */

import { neon } from "@neondatabase/serverless";
import { auditEvents } from "@obcda/db";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

export type AuditChange = {
  /** Access JWT email when §9.1 verification ran; "anonymous" otherwise. */
  actor: string;
  /** e.g. "ai_settings.save" | "ai_settings.clear" */
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId?: string | null;
  /** Masked/derived state only — never secrets or raw bodies. */
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
};

export type AuditChangeRecord = AuditChange & {
  id: string;
  occurredAt: string;
};

export interface AuditChangeWriter {
  record(change: AuditChange): Promise<void>;
  list(limit: number): Promise<AuditChangeRecord[]>;
}

/** Dev/test default: process-local, capacity-bounded. */
export class InMemoryAuditChangeWriter implements AuditChangeWriter {
  private readonly records: AuditChangeRecord[] = [];

  constructor(private readonly capacity: number = 500) {}

  async record(change: AuditChange): Promise<void> {
    this.records.push({
      ...change,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    if (this.records.length > this.capacity) this.records.shift();
  }

  async list(limit: number): Promise<AuditChangeRecord[]> {
    return this.records.slice(-limit).reverse();
  }
}

/** Production writer: Neon `audit_events` (migration 0001). */
export class NeonAuditChangeWriter implements AuditChangeWriter {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.db = drizzle(neon(connectionString));
  }

  async record(change: AuditChange): Promise<void> {
    await this.db.insert(auditEvents).values({
      actor: change.actor,
      action: change.action,
      targetType: change.targetType,
      targetId: change.targetId ?? null,
      requestId: change.requestId ?? null,
      beforeSummary: change.beforeSummary ?? null,
      afterSummary: change.afterSummary ?? null,
    });
  }

  async list(limit: number): Promise<AuditChangeRecord[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      requestId: row.requestId,
      beforeSummary: (row.beforeSummary ?? null) as Record<string, unknown> | null,
      afterSummary: (row.afterSummary ?? null) as Record<string, unknown> | null,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}
