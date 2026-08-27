import { Router } from "express";
import {
  createAccountLink,
  createAccountSession,
  createCheckoutSession,
  createConnectAccount,
  getAccountStatus,
  getPublicConfig,
  handleWebhook,
  submitSellerOnboarding,
} from "../controllers/stripe.controller";

const router = Router();

router.post("/connect/accounts", createConnectAccount);
router.put("/connect/accounts/:accountId/onboarding", submitSellerOnboarding);
router.get("/config/public", getPublicConfig);
router.post("/connect/account-links", createAccountLink);
router.post("/connect/account-sessions", createAccountSession);
router.get("/connect/accounts/:accountId/status", getAccountStatus);
router.post("/checkout/sessions", createCheckoutSession);

export const webhookRouter = Router();
webhookRouter.post("/", handleWebhook);

export default router;
