---
title: Common Pitfalls
impact: MEDIUM
tags: logging, anti-patterns, pitfalls
---

## Common Pitfalls

**Impact: MEDIUM**

Avoid these anti-patterns that undermine your logging effectiveness.

### Pitfall 1: Too Many Log Lines Per Request

Emitting multiple log lines per request creates noise without value. These scattered logs cannot be efficiently queried.

### Pitfall 2: Not Designing for Unknown Unknowns

Traditional logging captures "known unknowns" - issues you anticipated. But production bugs are often "unknown unknowns" - issues you never predicted. Wide events with rich context enable investigating issues you didn't anticipate.

### Pitfall 3: Missing Request Correlation

Without request IDs propagated across services, you cannot trace a request's journey. Always include the same request_id across all service hops to connect events.
