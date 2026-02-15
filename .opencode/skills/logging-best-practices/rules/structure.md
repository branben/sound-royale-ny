---
title: Structure and Format
impact: HIGH
tags: logging, json, structured-logging, schema, middleware
---

## Structure and Format

**Impact: HIGH**

Structured logging with consistent formats enables efficient querying and analysis. The right structure transforms logs from text files into queryable data.

### Use a Single Logger Throughout the Codebase

Use one logger instance configured at application startup and import it everywhere. This ensures consistent formatting, log levels, and output destinations across all modules.

### Use Middleware for Consistent Wide Events

Implement wide event collection as middleware that wraps all request handlers. The middleware initializes the event, captures timing, handles emission in the finally block, and makes the event accessible to handlers for enrichment.

### Use JSON Format

Use JSON as your logging format. JSON is universally supported, enables nested objects for complex context, works across all programming languages, and is easily parsed.

### Maintain Consistent Schema

Use consistent field names across all services. If one service uses `user_id` and another uses `userId`, querying becomes painful.

### Simplify Log Levels

Limit yourself to two log levels: `info` and `error`. The distinction between debug, trace, warn, info, notice, and critical creates confusion without adding value.

### Never Log Unstructured Strings

Every log must be structured with queryable fields. `console.log('User logged in')` is useless for debugging at scale.
