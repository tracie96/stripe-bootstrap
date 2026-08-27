import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(secretKey, {
  apiVersion: "2024-04-10",
  typescript: true,
});

export const config = {
  port: Number(process.env.PORT) || 4242,
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  connectRefreshUrl: process.env.STRIPE_CONNECT_REFRESH_URL ?? "http://localhost:3000/connect/refresh",
  connectReturnUrl: process.env.STRIPE_CONNECT_RETURN_URL ?? "http://localhost:3000/connect/return",
  platformFeeBps: Number(process.env.PLATFORM_FEE_BPS) || 1000,
};

export function calculatePlatformFee(amountCents: number): number {
  return Math.round((amountCents * config.platformFeeBps) / 10_000);
}
