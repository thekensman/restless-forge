/* data/subscription-presets.ts — starter subscriptions for Subscription
 * Audit's default table. Users edit/remove these freely at runtime.
 *
 * NOT year-keyed: this is a preset list, not a refreshed time series. The
 * annual refresh (docs/automation.md) spot-checks the prices against
 * current vendor pages and updates them in place; git history is the
 * record. Bundled into the tool at build time — no runtime fetch.
 *
 * Current consumer: subscription-audit.
 */

export type BillingCycle = "monthly" | "annual" | "weekly";

export interface SubscriptionPreset {
  name: string;
  /** Price per billing cycle, USD. */
  cost: number;
  cycle: BillingCycle;
  /** Rough monthly uses — seeds the "cost per use" column. */
  uses: number;
}

export const SUBSCRIPTION_PRESETS: SubscriptionPreset[] = [
  { name: "Netflix", cost: 15.49, cycle: "monthly", uses: 12 },
  { name: "Spotify", cost: 11.99, cycle: "monthly", uses: 25 },
  { name: "Amazon Prime", cost: 139, cycle: "annual", uses: 20 },
  { name: "ChatGPT Plus", cost: 20, cycle: "monthly", uses: 30 },
  { name: "Gym", cost: 45, cycle: "monthly", uses: 8 },
  { name: "iCloud+", cost: 2.99, cycle: "monthly", uses: 30 },
  { name: "YouTube Premium", cost: 13.99, cycle: "monthly", uses: 20 },
];
