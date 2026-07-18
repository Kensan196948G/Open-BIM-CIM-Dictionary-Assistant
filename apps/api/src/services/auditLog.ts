/**
 * MVP audit trail (§3.3 audit_events): an in-memory ring buffer, replaced by
 * the Neon-backed table with Issue #12.
 *
 * Privacy by design (§8.3/§12.1): entries carry method/path/status/timing/
 * requestId only. Query strings (may contain search terms/questions), bodies,
 * IP addresses and user agents are never recorded.
 */

import type { AuditEvent } from "@obcda/contracts";

export interface AuditLog {
  record(event: AuditEvent): void;
  /** Newest first. */
  list(limit: number): AuditEvent[];
}

export class InMemoryAuditLog implements AuditLog {
  private events: AuditEvent[] = [];

  constructor(private readonly capacity = 500) {}

  record(event: AuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
  }

  list(limit: number): AuditEvent[] {
    return [...this.events].reverse().slice(0, limit);
  }
}
