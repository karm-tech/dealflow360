// Which approvals a quotation needs, who may act on them, and what the chain
// does after each decision.

import { APPROVAL_STATUS, ROLES, USER_STATUS } from "./constants.js";

// Bands live in the database so routing can be retuned without a deploy.
// A quotation with no overage matches nothing and needs no approval.
export async function findBand(db, score) {
  if (score <= 0) return null;

  const bands = await db.approvalRule.findMany({
    where: { isActive: true },
    orderBy: { sequence: "asc" },
  });

  return (
    bands.find(
      (band) =>
        score >= band.minOveragePoints &&
        (band.maxOveragePoints === null || score < band.maxOveragePoints),
    ) || null
  );
}

export function rolesForBand(band) {
  if (!band) return [];
  const roles = [];
  if (band.requiresManager) roles.push(ROLES.SALES_MANAGER);
  if (band.requiresFinance) roles.push(ROLES.FINANCE);
  return roles;
}

// A step belongs to a role, so any active holder may take it. The person who
// raised the quotation is never one of them.
export function approverWhere(role, excludeUserId) {
  return {
    role,
    status: USER_STATUS.ACTIVE,
    ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
  };
}

export async function countApprovers(db, role, excludeUserId) {
  return db.user.count({ where: approverWhere(role, excludeUserId) });
}

// Drops any role with nobody left to act, so a manager who raised the deal is
// escalated past rather than left waiting on themselves.
export async function buildChain(db, roles, repId) {
  const chain = [];

  for (const role of roles) {
    const approverCount = await countApprovers(db, role, repId);
    if (approverCount > 0) {
      chain.push({ role, approverCount });
    }
  }

  return chain;
}

// Turns the chain into rows: the first is live, the rest wait their turn.
export function stepRowsFor(chain) {
  return chain.map((entry, index) => ({
    sequence: index + 1,
    role: entry.role,
    status: index === 0 ? APPROVAL_STATUS.PENDING : APPROVAL_STATUS.WAITING,
  }));
}

// True when this person may act on the step now. Role must match, the step must
// still be live, and nobody approves a deal they raised themselves.
export function canActOnStep(step, quotation, user) {
  if (!step || step.status !== APPROVAL_STATUS.PENDING) return false;
  if (user.id === quotation.repId) return false;
  return user.role === step.role || user.role === ROLES.ADMIN;
}

export function currentStep(steps) {
  return steps.find((step) => step.status === APPROVAL_STATUS.PENDING) || null;
}
