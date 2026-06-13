# Agent Orchestrator — M1 16GB Implementation Plan

> **Plan ID:** `SR-PLAN-001`
> **Source:** `agent-orchestrator-architecture.md` (Kimi workspace)
> **Hardware:** Apple M1, 16GB Unified Memory, 68GB/s bandwidth
> **Created:** 2026-06-09
> **Status:** Ready for implementation

---

## 1. Problem Frame & Scope

### What we're building

A local-first multi-agent orchestration system that runs entirely on an M1 Mac with 16GB unified memory. The system uses MLX-optimized models served through Ollama, connected to the Knowledge Core Obsidian vault via an MCP tool layer.

### What we're NOT building (deferred)

| Item | Reason | Target phase |
|---|---|---|
| Qwen3.6-27B orchestrator | Needs 16-18GB alone — impossible on 16GB | Post-hardware upgrade |
| 5 concurrent specialized agents | Needs 48GB+ | Post-hardware upgrade |
| Qdrant vector database | Heavy — FTS5 suffices for v1 | Phase 4 |
| OmniRoute MCP gateway | Overkill for local-only routing | Hybrid cloud phase |
| 128k context windows | Exceeds 16GB with 7B model loaded | Post-hardware upgrade |

### Hardware budget

```
macOS + dev tools (IDE, terminal, browser)  ~6 GB
Orchestrator (Qwen2.5-7B 4-bit)             ~5.3 GB
Memory agent (SmolLM2-1.7B)                 ~1.3 GB
MCP server + Python runtime                 ~0.5 GB
Context window (32k tokens)                 ~3 GB
──────────────────────────────────────────────────
Peak usage:                                 ~16.1 GB
Headroom:                                   ~0 GB (tight — close browser before session)
```

**⚠️ Operational note:** Close Chrome, Slack, and other memory-heavy apps before starting an orchestrator session. With a clean macOS state (~4 GB), headroom is 2 GB. With a loaded desktop (~6 GB), you're at the limit.

### Core constraints

1. **One model at a time for heavy work.** The orchestrator is always loaded. Specialist models are swapped in on-demand (1-3s swap time).
2. **Context window capped at 32k tokens.** Sufficient for most planning and research tasks.
3. **No cloud dependency.** Everything runs local, private, offline.
4. **Obsidian vault is the source of truth.** All agent outputs, plans, and state live in the vault.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     AGENT ORCHESTRATOR (M1 16GB)                  │
│                                                                   │
│  ┌─────────────┐     ┌──────────────────┐     ┌───────────────┐  │
│  │ Ollama       │────▶│ Orchestrator     │────▶│ MCP Server    │  │
│  │ (model host) │     │ Qwen2.5-7B       │     │ (FastMCP)     │  │
│  │              │     │ System prompt:    │     │               │  │
│  │ Loaded:      │     │ "You are GAIA,   │     │ Tools:        │  │
│  │ • qwen2.5:7b │     │  the polecat..." │     │ • vault_*     │  │
│  │ • smollm2:1b │     └────────┬─────────┘     │ • code_*      │  │
│  │              │              │                │ • web_*       │  │
│  │ Swap pool:   │     ┌────────▼─────────┐     │ • git_*       │  │
│  │ • qwen2.5-   │     │ Task Router       │     │ • gaia_*      │  │
│  │   coder:7b   │     │                   │     └───────┬───────┘  │
│  │ • phi3.5:3b  │     │ Routes to:        │             │          │
│  └─────────────┘     │ • Self (planning)  │    ┌────────▼───────┐  │
│                       │ • Coder specialist│    │ Knowledge Core │  │
│                       │ • Writer special. │    │ (Obsidian)     │  │
│                       │ • Memory agent    │    │                │  │
│                       └──────────────────┘    │ 00-Inbox/      │  │
│                                               │ 01-Projects/   │  │
│  ┌──────────────────┐                         │ 02-Agents/     │  │
│  │ Memory Agent      │                         │ 03-Skills/      │  │
│  │ SmolLM2-1.7B     │                         │ 04-Reference/  │  │
│  │ (always-on)      │                         │ 05-Daily/      │  │
│  │                  │                         └────────────────┘  │
│  │ • Inbox triage   │                                             │
│  │ • Auto-tagging   │                                             │
│  │ • Daily summary  │                                             │
│  └──────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Model Selection & Memory Budget

### Primary models

| Role | Model | Size (4-bit) | Load time | When loaded |
|---|---|---|---|---|
| **Orchestrator** | `qwen2.5:7b-instruct-q4_K_M` | ~5.3 GB | Always | Permanently |
| **Memory agent** | `smollm2:1.7b-instruct-q4_0` | ~1.3 GB | Always | Permanently |
| **Coding specialist** | `qwen2.5-coder:7b-instruct-q4_K_M` | ~5.3 GB | ~2s | On-demand (swapped with orchestrator) |
| **Writing specialist** | `phi3.5:3.8b-mini-instruct-q4_K_M` | ~2.9 GB | ~1s | On-demand (coexists with memory agent) |
| **Research (self)** | Same as orchestrator with different system prompt | — | — | No swap needed |

### Why this works on 16GB

- **Two permanent models**: orchestrator (5.3GB) + memory (1.3GB) = 6.6GB
- **Coding specialist swaps with orchestrator**: unload orchestrator → load coder (both ~5.3GB, no net change)
- **Writing specialist is small**: 2.9GB, can coexist with orchestrator + memory = 9.5GB peak
- **Total peak**: 9.5GB models + 4GB OS + 2GB context = ~15.5GB — fits with 0.5GB headroom

### Model swap strategy

**Ollama limitation:** Ollama loads one model at a time into GPU memory by default. Running two models simultaneously (orchestrator + memory agent) requires one of these strategies:

**Chosen strategy: Two Ollama instances (separate ports)**
- Instance 1 (port 11434): orchestrator (Qwen2.5-7B) — always loaded
- Instance 2 (port 11435): memory agent (SmolLM2-1.7B) — always loaded
- Models stay loaded in their respective processes — no swap needed between them
- Specialist models (coder, writer) are loaded by Instance 1, temporarily evicting the orchestrator

**Alternative considered:** Single instance with API-driven swap — simpler but adds 1-3s latency for every memory agent operation. Rejected because the memory agent runs continuously.

```
                    ┌─────────────────────┐
                    │  Orchestrator loaded │
                    │  (qwen2.5:7b, 5.3GB) │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼────────┐ ┌────▼─────┐ ┌────────▼────────┐
     │ Planning task    │ │ Coding   │ │ Writing task    │
     │ (no swap)       │ │ task     │ │                 │
     │                  │ │          │ │ Load phi3.5:3b  │
     │ Use orchestrator │ │ Unload   │ │ (2.9GB, +1s)   │
     │ system prompt    │ │ orch.    │ │                 │
     │ for planning     │ │ Load     │ │ No unload of    │
     │                  │ │ coder    │ │ orchestrator    │
     │                  │ │ (5.3GB,  │ │                 │
     │                  │ │ ~2s)     │ │                 │
     └──────────────────┘ └──────────┘ └─────────────────┘
```

---

## 4. Implementation Units (U-IDs)

### Phase 1: Foundation (U-001 → U-004)

#### U-001: Ollama setup with MLX-optimized models

**Depends on:** Nothing
**Estimate:** 30 min

- Install Ollama for macOS
- Pull models: `qwen2.5:7b-instruct-q4_K_M`, `smollm2:1.7b-instruct-q4_0`, `qwen2.5-coder:7b-instruct-q4_K_M`, `phi3.5:3.8b-mini-instruct-q4_K_M`
- Verify each model loads and responds to basic prompts
- Verify model swap speed (unload/load cycle)

**Test scenario:** Run `ollama run qwen2.5:7b` → send "What is the capital of France?" → expect "Paris" in <3s.

#### U-002: MCP server foundation (FastMCP)

**Depends on:** U-001 (Ollama available for testing)
**Estimate:** 2 hours

- Install `mcp` and `fastmcp` Python packages
- Create `backend/gaia/mcp_server.py` — FastMCP server with tool scaffolding
- Register vault tools from `vault_tools.py` as MCP tools
- Register code execution tool (wrap `subprocess`)
- Register web search tool (wrap `requests` + DuckDuckGo or similar)
- Configure MCP client connection to the server
- Verify tool discovery: list tools, call `vault_search` with test query

**Test scenario:** Start MCP server → client calls `vault_search("GAIA")` → returns matching note paths.

#### U-003: vault_tools.py MCP integration

**Depends on:** U-002 (MCP server exists)
**Estimate:** 1 hour

- Wrap `search_vault`, `read_note`, `list_directory`, `find_by_tag` as MCP tools
- Add `vault_write` tool (create/update notes with frontmatter)
- Add `vault_delete` tool (move to 06-Archive)
- Add `vault_daily` tool (read/write today's daily note)
- Add structured error handling (file not found, permission denied)

**Test scenario:** MCP client calls `vault_read("01-Projects/gaia.md")` → returns parsed markdown with frontmatter.

#### U-004: GAIA system prompt definition

**Depends on:** U-001 (Ollama ready)
**Estimate:** 1 hour

- Write orchestrator system prompt in `Knowledge Core/02-Agents/gaia-orchestrator.md`
- Define GAIA's persona: the polecat inside gas town
- Define 5-layer context loading rules
- Define task decomposition output schema (JSON)
- Define routing rules (when to swap to specialist vs. self-handle)
- Write specialist system prompts:
  - `gaia-coder.md` — coding conventions, project structure, testing requirements
  - `gaia-writer.md` — tone, style, documentation standards
  - `gaia-memory.md` — inbox processing, tagging taxonomy, linking rules

**Test scenario:** Load orchestrator with system prompt → send "Plan the implementation of a login page" → validate JSON task plan structure.

### Phase 2: Core Agent Loop (U-005 → U-007)

#### U-005a: Orchestrator context assembly

**Depends on:** U-003 (MCP tools), U-004 (system prompts)
**Estimate:** 2 hours

- Load system prompt from vault
- Build 5-layer context window:
  1. System: system prompt + constraints
  2. Project: relevant project notes from vault
  3. Retrieved: RAG results from FTS5 search
  4. Working: current task + conversation history
  5. Skills: relevant skill definitions
- Call Ollama API with assembled context
- Return raw model response

**Test scenario:** Load a complex task with 20+ vault notes → verify context assembly stays under 32k tokens.

#### U-005b: Task router

**Depends on:** U-005a (context assembly)
**Estimate:** 2 hours

- Parse task plan from orchestrator response (JSON schema validation)
- Routing rules:
  - `type: "planning"` → self-handle (same model, different system prompt)
  - `type: "coding"` → swap orchestrator for coder model on Instance 1
  - `type: "writing"` → load writer model on Instance 1 (small enough to coexist? measure first)
  - `type: "memory"` → dispatch to memory agent via Instance 2
- Handle swap failures: retry once, then self-handle with degraded prompt
- Timeout: 60s per specialist task, then fall back to orchestrator

**Test scenario:** Submit mixed task plan → verify correct model is selected for each task type.

#### U-005c: Result writer

**Depends on:** U-005b (task routing)
**Estimate:** 1 hour

- Collect results from all specialist agents
- Write structured output to vault (frontmatter: task ID, agent used, timestamp, status)
- Update task queue status (pending → completed)
- Return summary to caller (CLI output, webhook response, or inbox note)

**Test scenario:** Complete a 3-task plan (research + code + write) → verify all results written to vault with correct metadata.

#### U-005d: CLI entry point

**Depends on:** U-005c (result writer)
**Estimate:** 1 hour

- Create `scripts/gaia-agent.sh` — starts both Ollama instances + MCP server
- CLI args: `gaia-agent "<task>"` or `gaia-agent --watch` (continuous inbox monitoring)
- Read input from: CLI arg, `00-Inbox/` unprocessed items, or Linear webhook queue
- Print progress: "🔄 Loading context...", "🤖 Orchestrator planning...", "💻 Coding agent working..."

**Test scenario:** Run `./scripts/gaia-agent.sh "Research FTS5 performance"` → see progress → find result in vault.

---

### Phase 2: Core Agent Loop (U-005 → U-007)

#### U-005: Orchestrator task loop [SPLIT — see above]

**Depends on:** U-003 (MCP tools), U-004 (system prompts)
**Total estimate:** 6 hours (split into U-005a through U-005d)
**See:** U-005a (context assembly, 2h), U-005b (task router, 2h), U-005c (result writer, 1h), U-005d (CLI entry, 1h)

#### U-006: Memory agent (always-on)

**Depends on:** U-001 (Ollama), U-003 (vault tools MCP)
**Estimate:** 2 hours

- Create `backend/gaia/memory_agent.py` — background process
- On startup: scan `00-Inbox/` for unprocessed notes
- For each inbox item:
  - Read note content
  - Generate tags based on content + taxonomy
  - Generate summary (1-2 lines)
  - Suggest links to existing notes
  - Move to appropriate directory (`01-Projects/`, `04-Reference/`, etc.)
- Write daily summary to `05-Daily/`
- Rate limit: process max 5 inbox items per cycle

**Test scenario:** Drop a note in `00-Inbox/` → wait → verify it's tagged, summarized, and moved.

#### U-007: Context window manager

**Depends on:** U-005 (orchestrator needs it)
**Estimate:** 2 hours

- Create `backend/gaia/context_manager.py`
- Implement hierarchical context loading:
  - Layer 1 (System): Always loaded, fixed ~2k tokens
  - Layer 2 (Project): Loaded from vault based on active project, ~3k tokens
  - Layer 3 (Retrieved): FTS5 search results, capped at ~5k tokens
  - Layer 4 (Working): Current task + recent history, ~15k tokens
  - Layer 5 (Skills): Relevant skill docs, loaded on-demand, ~5k tokens
- Total budget: 30k tokens (leaves 2k for generation reserve)
- Implement token counting (tiktoken or simple word-based estimate)
- Implement truncation strategy: oldest messages first, then least relevant retrieved docs

**Test scenario:** Load a complex task with 20+ relevant vault notes → verify context window stays under 32k tokens → verify no OOM.

### Phase 3: Specialist Agents (U-008 → U-010)

#### U-008: Coding specialist

**Depends on:** U-005 (orchestrator loop), U-007 (context manager)
**Estimate:** 2 hours

- Implement model swap: unload orchestrator → load `qwen2.5-coder:7b`
- System prompt: coding conventions from project + GAIA coding guidelines
- Tools available: `code_read`, `code_write`, `code_execute`, `git_diff`, `git_status`
- Input: task from orchestrator (file paths, requirements, test scenarios)
- Output: code changes (diff format) OR implementation notes
- On completion: swap back to orchestrator

**Test scenario:** Orchestrator routes "Add error handling to vault_tools.py" → coder generates diff → diff applied → tests pass.

#### U-009: Writing specialist

**Depends on:** U-005 (orchestrator loop)
**Estimate:** 1.5 hours

- Implement model load: `phi3.5:3.8b` (light enough to coexist)
- System prompt: writing style guide, documentation standards
- Tools: `vault_read`, `vault_write`
- Input: topic, audience, length, style requirements
- Output: markdown document written to vault

**Test scenario:** Orchestrator routes "Write weekly summary of GAIA development" → writer produces `05-Daily/2026-06-09.md`.

#### U-010: Research specialist (self-handling)

**Depends on:** U-005 (orchestrator already does this)
**Estimate:** 1 hour

- Same model as orchestrator, different system prompt
- Tools: `vault_search`, `web_search`, `vault_read`
- Input: research question
- Output: structured research note with findings, sources, confidence scores
- No model swap needed

**Test scenario:** "Research MCP best practices for local tool servers" → produces research note with citations.

### Phase 4: Integration & Polish (U-011 → U-013)

#### U-011: GAIA CI integration

**Depends on:** U-005 (orchestrator working)
**Estimate:** 2 hours

- Wire orchestrator to Linear webhook bridge (existing `webhooks.py`)
- On new Linear issue: orchestrator reads issue → creates task plan → routes to specialists
- Write results as comments on the issue (or vault notes)
- Add `gaia_task_queue.jsonl` consumer: orchestrator polls queue, processes pending tasks
- Update CI workflow to report orchestrator status

**Test scenario:** Create Linear issue "Refactor game_engine/views.py" → orchestrator picks it up → coding agent proposes changes.

#### U-012: Health monitoring

**Depends on:** U-005 (orchestrator)
**Estimate:** 1 hour

- Add `/health` endpoint to MCP server
- Track: model load state, memory usage, task queue depth, error rate
- Write health metrics to `Knowledge Core/04-Reference/gaia-health.md`
- Alert on: OOM risk (>14GB), high error rate, queue backlog >10

#### U-013: Performance tuning

**Depends on:** All prior units
**Estimate:** 1 hour

- Profile model swap times → optimize Ollama keep-alive settings
- Profile context window loading → cache frequently accessed vault notes
- Profile token usage → adjust truncation thresholds
- Document tuning parameters in `docs/operations/gaia-tuning.md`

---

## 5. Dependency Graph

```
Phase 1 (Foundation):
  U-001 (Ollama) ─────────────────────────────────────────────┐
  U-002 (MCP server) ──── depends on U-001 ───────────────────┤
  U-003 (vault tools MCP) ─ depends on U-002 ────────────────┤
  U-004 (system prompts) ── depends on U-001 ────────────────┤
                                                               │
Phase 2 (Core Loop):                                          │
  U-005 (orchestrator) ──── depends on U-003, U-004 ─────────┤
  U-006 (memory agent) ──── depends on U-001 ────────────────┤
  U-007 (context manager) ── depends on U-005 ───────────────┤
                                                               │
Phase 3 (Specialists):                                        │
  U-008 (coding) ────────── depends on U-005, U-007 ─────────┤
  U-009 (writing) ───────── depends on U-005 ────────────────┤
  U-010 (research) ──────── depends on U-005 ────────────────┤
                                                               │
Phase 4 (Polish):                                             │
  U-011 (CI integration) ─── depends on U-005 ───────────────┤
  U-012 (monitoring) ─────── depends on U-005 ───────────────┤
  U-013 (tuning) ────────── depends on all ──────────────────┘
```

---

## 6. File Map

All repo-relative paths:

| File | Purpose | Unit |
|---|---|---|
| `backend/gaia/mcp_server.py` | FastMCP server with all tools | U-002 |
| `backend/gaia/orchestrator.py` | Main agent loop, task routing | U-005 |
| `backend/gaia/memory_agent.py` | Background inbox processor | U-006 |
| `backend/gaia/context_manager.py` | 5-layer context window management | U-007 |
| `backend/gaia/models.py` | Model registry, swap logic, Ollama API client | U-001 |
| `backend/gaia/tools/vault_tools.py` | MCP-wrapped vault operations | U-003 |
| `backend/gaia/tools/code_tools.py` | MCP-wrapped code operations | U-002 |
| `backend/gaia/tools/web_tools.py` | MCP-wrapped web search | U-002 |
| `backend/gaia/tools/git_tools.py` | MCP-wrapped git operations | U-008 |
| `scripts/gaia-agent.sh` | CLI entry point (start orchestrator, memory agent) | U-005 |
| `docs/plans/agent-orchestrator-m1.md` | This plan | — |
| `docs/operations/gaia-tuning.md` | Performance tuning guide | U-013 |

Vault paths (outside repo, in Knowledge Core):

| Path | Purpose | Unit |
|---|---|---|
| `02-Agents/gaia-orchestrator.md` | Orchestrator system prompt | U-004 |
| `02-Agents/gaia-coder.md` | Coding specialist system prompt | U-004 |
| `02-Agents/gaia-writer.md` | Writing specialist system prompt | U-004 |
| `02-Agents/gaia-memory.md` | Memory agent system prompt | U-004 |
| `04-Reference/gaia-health.md` | Health metrics log | U-012 |

---

## 7. Technical Decisions & Rationale

### Decision 1: Ollama over raw mlx-lm

**Choice:** Use Ollama as the model server instead of `mlx-lm` directly.

**Rationale:**
- Ollama handles model downloading, quantization selection, and GPU memory management
- Built-in OpenAI-compatible API (no adapter needed)
- `ollama pull` with tags like `q4_K_M` automatically selects MLX-optimized quantizations
- Model swapping via `ollama stop <model>` + `ollama run <model>` is simpler than managing MLX sessions
- Costs: 1-2 seconds additional latency vs raw MLX (acceptable)

### Decision 2: Single model, multi-persona for most tasks

**Choice:** Use Qwen2.5-7B as both orchestrator and research agent (different system prompts). Only swap to coder or writer for domain-specific tasks.

**Rationale:**
- Avoids unnecessary model swaps (7B model stays loaded)
- System prompt switching is instant vs 1-3s model swap
- Qwen2.5-7B is strong enough for planning + research
- Coder variant is genuinely better at code (worth the swap)
- Writer can use smaller model (coexists)

### Decision 3: FastMCP over raw MCP SDK

**Choice:** Use `FastMCP` (Python decorator-based) rather than raw `mcp` SDK.

**Rationale:**
- Lower boilerplate: `@mcp.tool()` vs manual JSON-RPC handlers
- Better error messages during development
- Compatible with all MCP clients
- Cost: slightly less control over transport layer (acceptable for v1)

### Decision 4: FTS5 only, no Qdrant

**Choice:** Skip Qdrant vector database in v1.

**Rationale:**
- FTS5 (SQLite full-text search) is built into Python's stdlib and costs zero RAM
- Qdrant adds 1-2GB RAM overhead — too expensive on 16GB
- FTS5 handles keyword search well enough for vault queries
- Semantic search can be added later via simple cosine similarity on embeddings if needed
- **Upgrade path:** Add Qdrant when hardware allows (Phase 4)

### Decision 5: Context window capped at 32k

**Choice:** Hard cap at 32k tokens, with 5-layer hierarchical loading.

**Rationale:**
- With 7B model loaded (~5.3GB) + OS (~4GB) + 32k context (~3GB) = ~12.3GB — safe
- 128k context would add 6-8GB to KV cache — exceeds 16GB
- 32k is sufficient for planning, research, and most coding tasks
- Hierarchical loading ensures most important context is always present

---

## 8. Automated Tests

| Test | Unit | Type | Description |
|---|---|---|---|
| Model smoke test | U-001 | Script | Send "hello" to each model, verify non-empty response |
| MCP tool discovery | U-002 | Pytest | Assert `list_tools()` returns all expected tool names |
| Vault CRUD roundtrip | U-003 | Pytest | Write note → read note → verify content → delete |
| JSON schema validation | U-005b | Pytest | Valid task plan → passes schema. Malformed → raises ValidationError |
| Task router correctness | U-005b | Pytest | Coding task → coder selected. Writing task → writer selected |
| Context window limit | U-005a | Pytest | Load 50 notes → verify tokens under 32k |
| Memory agent cycle | U-006 | Pytest | Drop note in inbox → wait → verify tagged + moved |
| Health endpoint | U-012 | Pytest | GET /health → 200, memory_used < 14GB |

## 9. Test Scenarios

| Scenario | Unit | Expected Result |
|---|---|---|
| Ollama loads all 4 models without OOM | U-001 | Each model responds in <5s without macOS swapping |
| MCP server discovers 10+ tools | U-002 | `list_tools()` returns vault_, code_, web_, git_ tools |
| vault_search finds relevant notes | U-003 | Query "GAIA" returns note paths with relevance |
| Orchestrator produces valid JSON task plan | U-004, U-005 | Plan has `tasks[]` with `type`, `agent`, `tools[]` fields |
| Memory agent processes inbox item | U-006 | Note is tagged, summarized, moved within 30s |
| Context window stays under 32k with 20 vault notes | U-007 | No OOM, no swap, truncation applied correctly |
| Coding specialist generates valid diff | U-008 | Diff applies cleanly, tests pass |
| Writing specialist produces vault note | U-009 | Note has correct frontmatter, proper markdown formatting |
| Orchestrator consumes Linear webhook task | U-011 | Task from queue → orchestrator → agent → result |
| Health endpoint reports accurate metrics | U-012 | Memory usage, model state, queue depth all correct |
| Model swap completes in <5s | U-013 | Unload + load cycle under 5 seconds |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Ollama can't run 2 instances on 16GB | Medium | High | Fallback to single-instance with API swap; memory agent runs on schedule instead of always-on |
| macOS memory pressure with dev tools open | High | Medium | Close browser/IDE before session; add memory check to CLI entry point |
| OOM during orchestration | Medium | High — crash | Strict 32k context cap, memory-aware loading, pre-flight check |
| Ollama model quality degrades vs raw MLX | Low | Medium | Ollama uses same MLX backend; verify output quality in smoke tests |
| Context window too small for complex tasks | Medium | Medium | Hierarchical loading; allow user to increase cap with warning |
| Model swap takes longer than 5s | Low | Low | Keep orchestrator loaded for most tasks; accept tradeoff |
| FTS5 insufficient for semantic queries | Medium | Low | Acceptable for v1; Qdrant upgrade path documented |
| Two Ollama instances on separate ports conflict | Low | Medium | Use explicit port flags; add port conflict detection |

---

## 11. Deferred / Out of Scope

- Qwen3.6-27B orchestrator (requires 64GB+ Mac)
- 5 concurrent specialized agents (requires 48GB+ Mac)
- Qdrant vector database (Phase 4)
- OmniRoute MCP gateway (hybrid cloud phase)
- 128k context windows (post-hardware upgrade)
- obsidian-skills integration (separate plan)
- Web UI for orchestrator dashboard (separate plan)
