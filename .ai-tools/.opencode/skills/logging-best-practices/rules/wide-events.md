---
title: Wide Events / Canonical Log Lines
impact: CRITICAL
tags: logging, wide-events, canonical-log-lines
---

## Wide Events / Canonical Log Lines

**Impact: CRITICAL**

Wide events (also called canonical log lines) are the foundation of effective logging. For each request, emit **a single context-rich event per service**. Instead of scattering 10-20 log lines throughout your request handler, consolidate everything into one comprehensive event emitted at the end of the request.

### The Pattern

Build the event throughout the request lifecycle, then emit once at completion in a `finally` block. This ensures the event is always emitted with complete context, even during failures.

### Connect Events with Request ID

Every wide event must include a unique request ID that is propagated across all service hops. This is the only way to reconstruct the full journey of a request through a distributed system.

### Emit in Finally Block

Always emit wide events in a `finally` block or equivalent. This ensures the event is emitted with complete context regardless of success or failure.

Reference: [Stripe Blog - Canonical Log Lines](https://stripe.com/blog/canonical-log-lines)
