# BytePlus access check — 2026-10-12

The supplied `dola-seed-2-1-turbo-260628` diagnostic is an upstream `UnsupportedModel` rejection from the CodingPlan endpoint, wrapped by the router as HTTP 503. It does not establish an authentication failure or an expired subscription for that model.

The configured BytePlus provider uses `https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions`. BytePlus's standard ModelArk model catalog is distinct from CodingPlan eligibility. Clearing local cooldown cannot change model eligibility.

Changes: classify this diagnostic as **Model incompatible with CodingPlan**, show a specific dashboard action, clarify the provider notice, and add **byteplus/ark-code-latest**, the documented console-selected CodingPlan model alias. No automatic switch to the separately billed standard API was made.

A fresh live test of **byteplus/seed-2-0-pro-260328** returned `InvalidSubscription`: the configured account has no valid CodingPlan subscription or it has expired. This is a separate account issue. See [byteplus-access-check.json](byteplus-access-check.json).

The documented `byteplus/ark-code-latest` alias was also tested against the current connection and returned `UnsupportedModel`. Adding a documented alias does not establish account access. No working BytePlus model is confirmed; review subscription status and models enabled in the BytePlus console. Evidence: [byteplus-codingplan-check.json](byteplus-codingplan-check.json).

Verification: 27 focused tests passed; ESLint returned no errors (one existing registry export-style warning). Production compilation and packaging succeeded and the running dashboard was restarted with the changes.

Official reference: https://docs.byteplus.com/en/docs/modelark/coding-plan-personal-plan-overview?redirect=1
