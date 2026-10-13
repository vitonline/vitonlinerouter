# VitonlineRouter: first paid customers

Prepared 13 October 2026. Proposed prices and targets are experiments, not forecasts. No public launch, purchases, customer contact or billing changes are authorized by this plan.

## Recommended business

Start with a paid setup and maintenance service for small coding teams. Customers keep their own API accounts and pay providers directly. Install VitonlineRouter on their machine or infrastructure, connect supported coding tools, configure a small tested model pool, and maintain it.

Offer: “I configure and maintain one AI endpoint for your coding tools, with tested fallback, clear provider errors and spending visibility.”

Target one narrow segment first: freelance developers and agencies with 2–10 developers who already use multiple coding tools or API providers and struggle with setup, outages or tracking spend. Avoid regulated-data workloads during the pilot. Pick the geography and language where you can reach buyers personally; Arabic onboarding could differentiate the offer if interviews confirm demand.

Why this approach: LiteLLM offers a free self-hosted gateway and sells enterprise governance/support. Cloudflare offers core gateway analytics, caching and rate limiting for free. Provider count and Round Robin alone will not justify a subscription. Focus on installation, useful diagnosis, verified integrations and continuing support.

Sources checked 13 October 2026:
- [LiteLLM pricing](https://www.litellm.ai/pricing)
- [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)

## First offer and proposed pricing

| Offer | Proposed price, USD | Scope |
|---|---:|---|
| Founding customer setup | $199 once | One installation, up to two coding-tool integrations, two supported provider accounts, a tested pool of 3–5 models, one onboarding call and a configuration backup |
| Care plan | $49/month | Compatible updates, monthly health review, diagnostic report, and up to 30 minutes of support per month; response within two business days |
| Team pilot, after individual pilots work | $499 setup + $149/month | One team installation, up to five users, supported access controls and budgets, up to one support hour per month |

These prices exclude model usage, customer infrastructure and applicable taxes. Do not sell unlimited support or inference. Additional work needs an agreed scope and price. Do not advertise a team plan before its access controls and budgets are verified.

Keep a usable self-hosted/community edition. Customers pay for convenience, maintained configurations and support. A software subscription can follow once repeated requests reveal which features buyers value.

## Product requirements before the pilot

The project has automatic combos, saved test results, provider issue categories, opt-in health checks, health filtering and bounded fallback. Current evidence does not establish that every listed model works, that a hosted multi-customer service is isolated, or that every coding-tool integration is reliable.

Prioritize:
1. Fix the two known capability-selection test failures. Test streaming, tool calls, JSON responses and cancellation through the actual coding tools included in the offer.
2. Add a customer-facing “Recommended models” pool with 3–5 models that pass relevant tests. Keep the automatically populated MyDefaultProvider pool available for experimentation. Do not make hundreds of untested models the paid customer's default.
3. Show the actual model/provider selected, attempt count, failures and latency. Redact credentials and make request-content logging opt-in.
4. Verify usage accounting and spend limits, including concurrent requests and streaming. Display unknown pricing clearly and avoid promising exact savings from estimated costs.
5. Verify installation, updates, backup/restore, key revocation and rollback on a clean machine. Keep secrets out of exports and public diagnostics.
6. Review existing authentication, roles, storage and dependencies against the intended deployment. Start with isolated customer installations. A public multi-tenant gateway requires a separate isolation and security review.

The repository's root LICENSE is MIT and includes upstream attribution. Preserve its notices and review dependency licenses and provider terms before distribution or commercial deployment. A software license does not grant resale rights to provider subscriptions or quotas. Use customers' authorized accounts and supported endpoints; do not base the business on sharing your keys or selling access to free allowances.

## Six-week launch experiment

| Week | Work | Evidence needed before proceeding |
|---|---|---|
| 1 | Interview 10 potential buyers; demonstrate the existing product; ask about outages, setup time, current tools and spending | At least three describe a repeated problem and request a follow-up; record the problem in their words |
| 2 | Complete pilot-critical reliability work; write installation instructions and a simple sales page; record a two-minute demo | A clean installation and the promised integrations pass; page lists limits and exclusions clearly |
| 3 | Personally contact 20 qualified prospects through channels you can use appropriately; book five demos | At least two agree to a paid, explicitly scoped pilot; count payments, not compliments |
| 4 | Install for those pilots; document setup time, support effort, failures and customer feedback | Customers actually use the router during their work; diagnose failures without exposing keys |
| 5 | Offer the care plan; publish one customer-approved case study; approach another 20 prospects | At least one recurring payment and permission for any quoted results |
| 6 | Review renewals, support hours, revenue and product requests | Decide whether to continue, narrow the offer or change direction based on paid use |

Aim for five paying setup customers and three care-plan customers by the end of the experiment. This is a target, not an expected conversion rate. If 40 relevant conversations and several demos produce no paid pilot, revise the customer segment or problem before adding more providers.

## Sales materials

Suggested headline: “Get your AI coding tools working through one maintained endpoint.”

Demo sequence: connect a customer-owned provider, configure two coding tools, show a working tool-call request, demonstrate a controlled provider failure and fallback, then show the diagnostic and selected model. Use test data. Explain how credentials and logs are handled.

Suggested invitation for you to send: “Do you use multiple AI coding tools or providers? I’m piloting a service that installs and maintains a single endpoint with tested fallback and clear error diagnosis. The pilot is $199, with optional $49/month maintenance; provider usage is billed to your own accounts. Would a short demo be useful?”

Start with existing professional contacts, small development agencies, and relevant developer communities where commercial posts are permitted. Answer concrete setup questions and show working examples. Avoid paid advertising until you have evidence of paid conversion and renewal. No messages are sent by this plan.

## Revenue and contribution examples

Five setup customers at $199 produce $995 in one-time revenue. Three care-plan customers at $49 produce $147 in monthly recurring revenue. With 20 care-plan customers, monthly revenue is $980; this requires acquiring and retaining those customers.

Illustrative labor model: at an assumed $30/hour value for your time, a setup taking two hours consumes $60, leaving $139 before payment fees, infrastructure, taxes and other costs. A $49 care plan using its full 30-minute support allowance consumes $15 in support labor, leaving $34 before shared maintenance and other costs. Track actual hours; if support consumes the margin, improve onboarding or raise the price. Revenue is not profit.

Track customer acquisition source, demos, paid pilots, setup hours, support minutes, renewals/cancellations, observed request success, routing latency and fallback frequency. Separate upstream failures from router failures. Never publish a reliability percentage without its sample size and measurement window.

## Expansion after paid validation

After five satisfied paying pilots and meaningful renewals, prioritize the most frequently requested paid feature: team budgets, per-user access, scheduled reports, managed updates or audit exports. Then test a software subscription or customer-specific hosted deployment. Add shared hosted infrastructure only after tenant isolation, abuse controls, billing reconciliation, incident handling and support capacity are proven.

The immediate next milestone is a saleable two-provider/two-tool pilot with a small verified model pool, rather than a larger catalog.
