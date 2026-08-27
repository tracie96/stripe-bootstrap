import { Request, Response } from "express";
import Stripe from "stripe";
import { calculatePlatformFee, config, stripe } from "../config/stripe";
import { RawBodyRequest } from "../middleware/rawBody";

type SellerAddress = {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type SellerDob = {
  day?: number;
  month?: number;
  year?: number;
};

type SellerOnboardingBody = {
  businessType?: "individual" | "company";
  businessProfile?: {
    url?: string;
    mcc?: string;
    productDescription?: string;
  };
  individual?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dob?: SellerDob;
    address?: SellerAddress;
    ssnLast4?: string;
  };
  bankAccount?: {
    routingNumber?: string;
    accountNumber?: string;
    country?: string;
    currency?: string;
  };
  statementDescriptor?: string;
  acceptTerms?: boolean;
};

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.socket.remoteAddress ?? "127.0.0.1";
}

function mapAccountRequirements(account: Stripe.Account) {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];

  return {
    currentlyDue,
    eventuallyDue: account.requirements?.eventually_due ?? [],
    pastDue,
    pendingVerification: [...new Set([...currentlyDue, ...pastDue])],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

async function syncRepresentative(
  accountId: string,
  individual: NonNullable<SellerOnboardingBody["individual"]>
): Promise<void> {
  const persons = await stripe.accounts.listPersons(accountId, { limit: 10 });
  const existing = persons.data.find((person) => person.relationship?.representative);

  const personData: Stripe.AccountCreatePersonParams = {
    first_name: individual.firstName!,
    last_name: individual.lastName!,
    email: individual.email!,
    dob: {
      day: individual.dob!.day!,
      month: individual.dob!.month!,
      year: individual.dob!.year!,
    },
    relationship: {
      representative: true,
      owner: true,
      percent_ownership: 100,
      title: "Owner",
    },
  };

  if (existing) {
    await stripe.accounts.updatePerson(accountId, existing.id, personData);
    return;
  }

  await stripe.accounts.createPerson(accountId, personData);
}

function needsRepresentative(requirements: string[]): boolean {
  return requirements.some((field) => field.startsWith("representative."));
}

export async function createConnectAccount(req: Request, res: Response): Promise<void> {
  try {
    const { email, country = "US" } = req.body as { email?: string; country?: string };

    const account = await stripe.accounts.create({
      type: "custom",
      country,
      email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    res.status(201).json({ accountId: account.id, country });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function submitSellerOnboarding(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.params;
    const body = req.body as SellerOnboardingBody;

    if (!body.acceptTerms) {
      res.status(400).json({ error: "acceptTerms must be true" });
      return;
    }

    const individual = body.individual;
    const bankAccount = body.bankAccount;
    const businessProfile = body.businessProfile;

    const hasIndividual =
      individual?.firstName &&
      individual.lastName &&
      individual.email &&
      individual.dob?.day &&
      individual.dob.month &&
      individual.dob.year &&
      individual.address?.line1 &&
      individual.address.city &&
      individual.address.state &&
      individual.address.postalCode &&
      individual.ssnLast4;

    const hasBank = bankAccount?.routingNumber && bankAccount.accountNumber;
    const hasBusinessProfile = businessProfile?.url && businessProfile.mcc;
    const statementDescriptor = body.statementDescriptor?.trim().slice(0, 22);

    if (!hasIndividual && !hasBank && !hasBusinessProfile) {
      res.status(400).json({
        error:
          "Provide individual + bankAccount + businessProfile for full onboarding, or businessProfile (url, mcc) for missing business details",
      });
      return;
    }

    if ((hasIndividual || hasBank) && (!hasIndividual || !hasBank || !hasBusinessProfile)) {
      res.status(400).json({
        error: "Full onboarding requires individual, bankAccount, and businessProfile (url, mcc)",
      });
      return;
    }

    if (hasIndividual && body.businessType !== "individual") {
      res.status(400).json({ error: "Only businessType 'individual' is supported in this test flow" });
      return;
    }

    if (hasIndividual && !statementDescriptor) {
      res.status(400).json({ error: "statementDescriptor is required (max 22 characters)" });
      return;
    }

    const update: Stripe.AccountUpdateParams = {};

    if (hasBusinessProfile) {
      update.business_profile = {
        url: businessProfile.url,
        mcc: businessProfile.mcc,
        product_description: businessProfile.productDescription,
      };
    }

    if (hasIndividual && hasBank) {
      const country = individual!.address!.country ?? bankAccount!.country ?? "US";
      const currency = bankAccount!.currency ?? "usd";

      update.business_type = "individual";
      update.individual = {
        first_name: individual!.firstName,
        last_name: individual!.lastName,
        email: individual!.email,
        phone: individual!.phone,
        dob: {
          day: individual!.dob!.day!,
          month: individual!.dob!.month!,
          year: individual!.dob!.year!,
        },
        address: {
          line1: individual!.address!.line1!,
          city: individual!.address!.city!,
          state: individual!.address!.state!,
          postal_code: individual!.address!.postalCode!,
          country,
        },
        ssn_last_4: individual!.ssnLast4,
      };
      update.settings = {
        payments: {
          statement_descriptor: statementDescriptor,
        },
      };
      update.external_account = {
        object: "bank_account",
        country: bankAccount!.country ?? country,
        currency,
        routing_number: bankAccount!.routingNumber!,
        account_number: bankAccount!.accountNumber!,
      };
    }

    update.tos_acceptance = {
      date: Math.floor(Date.now() / 1000),
      ip: getClientIp(req),
    };

    let account = await stripe.accounts.update(accountId, update);

    const pending = [
      ...(account.requirements?.currently_due ?? []),
      ...(account.requirements?.past_due ?? []),
    ];

    if (hasIndividual && needsRepresentative(pending)) {
      await syncRepresentative(accountId, individual!);
      account = await stripe.accounts.retrieve(accountId);
    }

    res.json({
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: mapAccountRequirements(account),
    });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function createAccountLink(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.body as { accountId?: string };

    if (!accountId) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: config.connectRefreshUrl,
      return_url: config.connectReturnUrl,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function createAccountSession(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.body as { accountId?: string };

    if (!accountId) {
      res.status(400).json({ error: "accountId is required" });
      return;
    }

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: { enabled: true },
      },
    });

    res.json({ clientSecret: accountSession.client_secret });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function getAccountStatus(req: Request, res: Response): Promise<void> {
  try {
    const { accountId } = req.params;

    const account = await stripe.accounts.retrieve(accountId);

    res.json({
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: mapAccountRequirements(account),
    });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function getPublicConfig(_req: Request, res: Response): Promise<void> {
  if (!config.publishableKey) {
    res.status(500).json({ error: "STRIPE_PUBLISHABLE_KEY is not configured" });
    return;
  }

  res.json({ publishableKey: config.publishableKey });
}

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { connectedAccountId, amount, currency = "usd", productName = "Marketplace purchase" } =
      req.body as {
        connectedAccountId?: string;
        amount?: number;
        currency?: string;
        productName?: string;
      };

    if (!connectedAccountId || !amount) {
      res.status(400).json({ error: "connectedAccountId and amount (in cents) are required" });
      return;
    }

    const applicationFeeAmount = calculatePlatformFee(amount);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: productName },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: connectedAccountId,
        },
      },
      success_url: `${config.connectReturnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: config.connectRefreshUrl,
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      applicationFeeAmount,
    });
  } catch (error) {
    handleStripeError(res, error);
  }
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers["stripe-signature"];
  const rawBody = (req as RawBodyRequest).rawBody;

  if (!rawBody) {
    res.status(400).json({ error: "Raw body not available — ensure webhook middleware is configured" });
    return;
  }

  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  if (!config.webhookSecret) {
    res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not configured" });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    console.error("Webhook signature verification failed:", message);
    res.status(400).json({ error: `Webhook Error: ${message}` });
    return;
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      console.log(`Account ${account.id} updated — charges_enabled: ${account.charges_enabled}`);
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Checkout completed — session: ${session.id}, payment: ${session.payment_intent}`);
      break;
    }
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`Payment succeeded — ${paymentIntent.id}, amount: ${paymentIntent.amount}`);
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}

function handleStripeError(res: Response, error: unknown): void {
  if (error instanceof Stripe.errors.StripeError) {
    console.error("Stripe error:", error.message);
    res.status(error.statusCode ?? 500).json({ error: error.message });
    return;
  }

  console.error("Unexpected error:", error);
  res.status(500).json({ error: "Internal server error" });
}
