import { httpStatusForProviderStatus, sendProviderStatusPayload } from "../src/routes/providers.js";

const statuses = ["missing_key", "catalog_fallback", "network_error", "invalid_key", "billing_credits", "rate_limited", "unverified", "unavailable", "healthy"] as const;
console.log("provider route statuses");
for (const status of statuses) {
  console.log(`${status}: http=${httpStatusForProviderStatus(status)}`);
}

let statusCode = 0;
let body: any;
sendProviderStatusPayload({
  status(code: number) {
    statusCode = code;
    return { json(payload: unknown) { body = payload; } };
  },
}, {
  provider: "groq",
  configured: true,
  healthy: false,
  status: "catalog_fallback",
  source: "catalog_fallback",
  models: [{ id: "llama-3.3-70b-versatile" }],
  canChat: false,
  chatVerified: false,
  canListModels: true,
});

console.log(`model-list HTTP status=${statusCode}`);
console.log(`healthy=${body.healthy} canChat=${body.canChat} chatVerified=${body.chatVerified} canListModels=${body.canListModels} modelCount=${body.modelCount}`);
if (statusCode !== 206 || body.healthy !== false || body.canChat !== false || body.chatVerified !== false || body.canListModels !== true) {
  throw new Error("provider route semantics smoke failed");
}
console.log("smoke:provider-route-semantics passed");
