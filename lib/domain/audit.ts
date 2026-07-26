import type { Prisma } from "@prisma/client";

type AuditInput = {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  source: string;
  actorId?: string | null;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  reason?: string | null;
};

function auditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function createAuditLog(tx: Prisma.TransactionClient, input: AuditInput) {
  return tx.auditLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      source: input.source,
      actorId: input.actorId,
      beforeJson: auditJson(input.beforeJson),
      afterJson: auditJson(input.afterJson),
      reason: input.reason,
    },
  });
}
