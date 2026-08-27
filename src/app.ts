import path from "path";
import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/stripe";
import { rawBodyMiddleware } from "./middleware/rawBody";
import stripeRoutes, { webhookRouter } from "./routes/stripe.routes";
import { openapiSpec } from "./swagger/openapi";

const app = express();
const publicDir = path.join(__dirname, "../public");

app.use(express.static(publicDir));
app.get("/test", (_req, res) => {
  res.sendFile(path.join(publicDir, "test.html"));
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get("/api-docs.json", (_req, res) => {
  res.json(openapiSpec);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(
  "/v1/webhook",
  express.raw({ type: "application/json", verify: rawBodyMiddleware }),
  webhookRouter
);

app.use(express.json());
app.use("/v1", stripeRoutes);

app.listen(config.port, () => {
  console.log(`Stripe Connect microservice listening on http://localhost:${config.port}`);
  console.log(`Swagger UI available at http://localhost:${config.port}/api-docs`);
  console.log(`Connect test UI available at http://localhost:${config.port}/test`);
});
