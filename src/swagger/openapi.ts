import { config } from "../config/stripe";

export const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Stripe Connect Custom Microservice",
    version: "1.0.0",
    description:
      "API for Stripe Connect Custom onboarding (platform-owned forms), split-payment checkouts, and webhooks. Use **Try it out** to send requests directly from this UI.",
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: "Local development",
    },
  ],
  tags: [
    { name: "Health", description: "Service health checks" },
    { name: "Connect", description: "Stripe Connect Custom account onboarding" },
    { name: "Checkout", description: "Destination-charge checkout sessions" },
    { name: "Webhook", description: "Stripe webhook handler (use Stripe CLI for local testing)" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/connect/accounts": {
      post: {
        tags: ["Connect"],
        summary: "Create a Connect Custom account",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    example: "seller@example.com",
                    description: "Optional email for the connected account",
                  },
                  country: {
                    type: "string",
                    example: "US",
                    default: "US",
                    description: "Two-letter country code for the connected account",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Account created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accountId: { type: "string", example: "acct_1234567890" },
                  },
                },
              },
            },
          },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/connect/accounts/{accountId}/onboarding": {
      put: {
        tags: ["Connect"],
        summary: "Submit seller onboarding (platform-owned forms)",
        description:
          "Updates a Custom Connect account with seller profile, payout bank details, and terms acceptance. Data is collected in your UI and sent to Stripe via API.",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string", example: "acct_1234567890" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["businessType", "individual", "bankAccount", "acceptTerms"],
                properties: {
                  businessType: { type: "string", enum: ["individual"], example: "individual" },
                  acceptTerms: { type: "boolean", example: true },
                  individual: {
                    type: "object",
                    properties: {
                      firstName: { type: "string", example: "Jane" },
                      lastName: { type: "string", example: "Doe" },
                      email: { type: "string", format: "email", example: "seller@example.com" },
                      phone: { type: "string", example: "+14155552671" },
                      ssnLast4: { type: "string", example: "0000", description: "US test mode: use 0000" },
                      dob: {
                        type: "object",
                        properties: {
                          day: { type: "integer", example: 1 },
                          month: { type: "integer", example: 1 },
                          year: { type: "integer", example: 1990 },
                        },
                      },
                      address: {
                        type: "object",
                        properties: {
                          line1: { type: "string", example: "123 Main St" },
                          city: { type: "string", example: "San Francisco" },
                          state: { type: "string", example: "CA" },
                          postalCode: { type: "string", example: "94111" },
                          country: { type: "string", example: "US" },
                        },
                      },
                    },
                  },
                  bankAccount: {
                    type: "object",
                    properties: {
                      routingNumber: { type: "string", example: "110000000" },
                      accountNumber: { type: "string", example: "000123456789" },
                      country: { type: "string", example: "US" },
                      currency: { type: "string", example: "usd" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Onboarding data submitted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accountId: { type: "string", example: "acct_1234567890" },
                    chargesEnabled: { type: "boolean", example: false },
                    payoutsEnabled: { type: "boolean", example: false },
                    detailsSubmitted: { type: "boolean", example: true },
                    requirements: {
                      type: "object",
                      properties: {
                        currentlyDue: { type: "array", items: { type: "string" } },
                        eventuallyDue: { type: "array", items: { type: "string" } },
                        pastDue: { type: "array", items: { type: "string" } },
                        disabledReason: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/connect/account-sessions": {
      post: {
        tags: ["Connect"],
        summary: "Create an embedded onboarding session",
        description:
          "Fallback for identity verification when API-only onboarding leaves document requirements. Returns a `clientSecret` for Stripe Connect.js.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accountId"],
                properties: {
                  accountId: {
                    type: "string",
                    example: "acct_1234567890",
                    description: "Connect account ID from POST /v1/connect/accounts",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Embedded onboarding session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    clientSecret: {
                      type: "string",
                      example: "acs_client_secret_...",
                      description: "Pass to Connect.js fetchClientSecret on your frontend",
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/connect/account-links": {
      post: {
        tags: ["Connect"],
        summary: "Generate an onboarding link (redirect)",
        description: "Returns a URL that redirects the seller to Stripe-hosted onboarding.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accountId"],
                properties: {
                  accountId: {
                    type: "string",
                    example: "acct_1234567890",
                    description: "Connect account ID from POST /v1/connect/accounts",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Onboarding URL generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: {
                      type: "string",
                      format: "uri",
                      example: "https://connect.stripe.com/setup/s/acct_...",
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/connect/accounts/{accountId}/status": {
      get: {
        tags: ["Connect"],
        summary: "Check onboarding status",
        parameters: [
          {
            name: "accountId",
            in: "path",
            required: true,
            schema: { type: "string", example: "acct_1234567890" },
          },
        ],
        responses: {
          "200": {
            description: "Account status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accountId: { type: "string", example: "acct_1234567890" },
                    chargesEnabled: { type: "boolean", example: false },
                    payoutsEnabled: { type: "boolean", example: false },
                    detailsSubmitted: { type: "boolean", example: false },
                    requirements: {
                      type: "object",
                      properties: {
                        currentlyDue: { type: "array", items: { type: "string" }, example: [] },
                        eventuallyDue: { type: "array", items: { type: "string" }, example: [] },
                        pastDue: { type: "array", items: { type: "string" }, example: [] },
                        disabledReason: { type: "string", nullable: true, example: null },
                      },
                    },
                  },
                },
              },
            },
          },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/checkout/sessions": {
      post: {
        tags: ["Checkout"],
        summary: "Create a destination-charge checkout session",
        description:
          "Creates a Checkout session with an application fee. Amount is in the smallest currency unit (e.g. cents for USD).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["connectedAccountId", "amount"],
                properties: {
                  connectedAccountId: {
                    type: "string",
                    example: "acct_1234567890",
                  },
                  amount: {
                    type: "integer",
                    example: 5000,
                    description: "Amount in cents",
                  },
                  currency: {
                    type: "string",
                    example: "usd",
                    default: "usd",
                  },
                  productName: {
                    type: "string",
                    example: "Consulting session",
                    default: "Marketplace purchase",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkout session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionId: { type: "string", example: "cs_test_..." },
                    url: {
                      type: "string",
                      format: "uri",
                      example: "https://checkout.stripe.com/c/pay/cs_test_...",
                    },
                    applicationFeeAmount: {
                      type: "integer",
                      example: 500,
                      description: "Platform fee in cents",
                    },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "4XX": { $ref: "#/components/responses/StripeError" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/v1/webhook": {
      post: {
        tags: ["Webhook"],
        summary: "Stripe webhook handler",
        description:
          "Receives signed Stripe events. **Not testable from Swagger UI** — use `npm run stripe:listen` to forward events locally.",
        parameters: [
          {
            name: "stripe-signature",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Stripe webhook signature header",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        responses: {
          "200": {
            description: "Event received",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    received: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  components: {
    responses: {
      BadRequest: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      StripeError: {
        description: "Stripe API error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      InternalError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "accountId is required" },
        },
      },
    },
  },
};
