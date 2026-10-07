// Shared between the browser and the server.
//
// Each family has its own copy of the app, and PLAN in its settings picks the
// plan. Basic limits how many documents can be saved; Premium has no limits.
// The server checks the limits on every upload and edit; the app checks them
// first too, so people see a friendly message before uploading.

import { cleanName, DEFAULT_PERSON, type Doc } from "@/lib/docs";

export type PlanKey = "basic" | "premium";

export type Plan = {
  key: PlanKey;
  label: string;
  /** One-time price in rupees. */
  price: number;
  /** Most documents one person (including "Family") can have; null for no limit. */
  perPerson: number | null;
  /** Most documents in total; null for no limit. */
  total: number | null;
  updates: boolean;
};

export const PLANS: Record<PlanKey, Plan> = {
  basic: { key: "basic", label: "Basic", price: 2000, perPerson: 10, total: 50, updates: false },
  premium: { key: "premium", label: "Premium", price: 3000, perPerson: null, total: null, updates: true },
};

/** Server only. Copies set up before plans existed have no PLAN, so they stay unlimited. */
export function currentPlan(): Plan {
  return process.env.PLAN?.trim().toLowerCase() === "basic" ? PLANS.basic : PLANS.premium;
}

export function rupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Why `count` more documents for `person` can't be saved, or null if they can.
 * `replaces` are saved documents that will be deleted once the new ones are
 * saved (a newer copy, or pages joined into one PDF), so they don't count.
 */
export function limitProblem(
  plan: Plan,
  docs: Pick<Doc, "pathname" | "person">[],
  person: string,
  replaces: string[] = [],
  count = 1,
): string | null {
  const kept = docs.filter((d) => !replaces.includes(d.pathname));
  const who = cleanName(person) || DEFAULT_PERSON;
  const upgrade = "or upgrade to Premium for unlimited documents.";
  const left = (limit: number, used: number) =>
    used >= limit ? `Delete one you don't need, ${upgrade}` : `Only ${limit - used} more can be saved. Save fewer, ${upgrade}`;

  if (plan.total !== null && kept.length + count > plan.total) {
    return `The ${plan.label} plan holds up to ${plan.total} documents and ${kept.length} are saved. ${left(plan.total, kept.length)}`;
  }
  const mine = kept.filter((d) => d.person === who).length;
  if (plan.perPerson !== null && mine + count > plan.perPerson) {
    return `The ${plan.label} plan holds up to ${plan.perPerson} documents per person, and ${who} has ${mine}. ${left(plan.perPerson, mine)}`;
  }
  return null;
}
