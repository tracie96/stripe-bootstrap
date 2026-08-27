# stripe-connect-express-microservice

An event-driven, production-grade microservice boilerplate for multi-party marketplaces. Handles asynchronous creator onboarding, automated application fee cuts, and secure raw-buffer webhook validation using Node.js, Express, and TypeScript.

## Features

- **Strict TypeScript Setup**: Modern, compiled architecture using `tsx` for high-velocity local execution.
- **Connect Express Onboarding**: Generates multi-party marketplace account tokens and onboarding redirection handshakes.
- **Automated Fee-Split Checkouts**: Implements Stripe Destination Charges to take platform cuts and distribute net operations safely.
- **Secure Asynchronous Webhooks**: Out-of-the-box configuration processing raw incoming buffers for exact cryptographic `stripe-signature` verification checks.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Stripe account](https://dashboard.stripe.com/register) with Connect enabled
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (for local webhook forwarding)

### Installation

```bash
git clone https://github.com/tracie96/stripe-bootstrap.git
cd stripe-bootstrap
npm install
cp .env.example .env
```

Fill in your Stripe keys in `.env`:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Development

```bash
# Terminal 1 — start the server
npm run dev

# Terminal 2 — forward webhooks to your local server
npm run stripe:listen
```

The service starts at `http://localhost:4242`.

### API Docs (Swagger)

Interactive API documentation is available at:

```
http://localhost:4242/api-docs
```

Use **Try it out** on any endpoint to send requests from the browser. The raw OpenAPI spec is at `/api-docs.json`.

> **Note:** The webhook endpoint requires a valid `stripe-signature` header and raw body — test it locally with `npm run stripe:listen`, not Swagger UI.

### Production Build

```bash
npm run build
npm start
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/v1/connect/accounts` | Create a Connect Express account |
| `POST` | `/v1/connect/account-links` | Generate an onboarding link |
| `GET` | `/v1/connect/accounts/:accountId/status` | Check onboarding status |
| `POST` | `/v1/checkout/sessions` | Create a destination-charge checkout |
| `POST` | `/v1/webhook` | Stripe webhook handler |

### Create a Connect Account

```bash
curl -X POST http://localhost:4242/v1/connect/accounts \
  -H "Content-Type: application/json" \
  -d '{"email": "seller@example.com"}'
```

Response:

```json
{ "accountId": "acct_..." }
```

### Generate Onboarding Link

```bash
curl -X POST http://localhost:4242/v1/connect/account-links \
  -H "Content-Type: application/json" \
  -d '{"accountId": "acct_..."}'
```

Response:

```json
{ "url": "https://connect.stripe.com/setup/..." }
```

Redirect the seller to `url` to complete KYC and bank setup.

### Create a Split-Payment Checkout

```bash
curl -X POST http://localhost:4242/v1/checkout/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "connectedAccountId": "acct_...",
    "amount": 5000,
    "currency": "usd",
    "productName": "Consulting session"
  }'
```

The platform fee is calculated from `PLATFORM_FEE_BPS` (default 10%). For a $50.00 charge, the platform keeps $5.00 and the connected account receives $45.00 minus Stripe processing fees.

Response:

```json
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/...",
  "applicationFeeAmount": 500
}
```

## Architecture

```
Client (browser/app)
        │
        ▼
  Express Server (:4242)
        │
        ├── POST /v1/connect/accounts      → stripe.accounts.create (Express)
        ├── POST /v1/connect/account-links → stripe.accountLinks.create
        ├── POST /v1/checkout/sessions     → stripe.checkout.sessions.create
        │                                      (destination charge + app fee)
        └── POST /v1/webhook                 → stripe.webhooks.constructEvent
                                               (raw body verification)
        │
        ▼
  Stripe API
```

## Webhook Events

The webhook handler processes these events out of the box:

- `account.updated` — seller onboarding progress
- `checkout.session.completed` — successful checkout
- `payment_intent.succeeded` — confirmed payment

Extend the `switch` block in `src/controllers/stripe.controller.ts` to handle additional events.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret from Stripe CLI or Dashboard |
| `PORT` | No | Server port (default `4242`) |
| `STRIPE_CONNECT_REFRESH_URL` | No | URL when onboarding link expires |
| `STRIPE_CONNECT_RETURN_URL` | No | URL after onboarding completes |
| `PLATFORM_FEE_BPS` | No | Platform fee in basis points (default `1000` = 10%) |

## Project Structure

```
stripe-connect-express-microservice/
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── config/
    │   └── stripe.ts          # Stripe client + env config
    ├── controllers/
    │   └── stripe.controller.ts
    ├── middleware/
    │   └── rawBody.ts         # Raw buffer capture for webhooks
    ├── routes/
    │   └── stripe.routes.ts
    └── app.ts
```

## Built by

Made with ☕ and slightly too much Stripe docs-reading by **[Tracy Anele](https://github.com/tracie96)** — shipping a Connect scaffold so you don’t have to wrestle raw webhook buffers at 2am.

If this saved you a weekend of “why is `stripe-signature` failing?”, come say hi (or star the repo) on GitHub: [github.com/tracie96](https://github.com/tracie96)

## License

MIT — Copyright (c) 2026 Tracy Anele
