---
title: Context, Cardinality, and Dimensionality
impact: CRITICAL
tags: logging, context, cardinality, dimensionality
---

## Context, Cardinality, and Dimensionality

**Impact: CRITICAL**

Wide events must be context-rich with high cardinality and high dimensionality. This enables you to answer questions you haven't anticipated yet - the "unknown unknowns" that traditional logging misses.

### High Cardinality

High cardinality means a field can have millions or billions of unique values. User IDs, request IDs, and transaction IDs are high cardinality fields. Your logging must support querying against any specific value of these fields.

### High Dimensionality

High dimensionality means your events have many fields (20-100+). More dimensions mean more questions you can answer without redeploying code.

### Always Include Business Context

Include business-specific context, not just technical details. User subscription tier, cart value, feature flags, account age - this context helps prioritize issues and understand business impact.

### Always Include Environment Characteristics

Include environment and deployment information in every wide event. This context is essential for correlating issues with deployments, identifying region-specific problems, and understanding the runtime environment.

**Environment fields to include:**
- commit_hash
- version
- deployment_id
- region
- availability_zone
- instance_id
- environment
