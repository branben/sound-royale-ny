# AGENTS.md IMPROVEMENT SUGGESTIONS

Based on analysis of current AGENTS.md, here are recommendations:

## Issues Identified:
1. **Outdated Information**: File counts don't match current project state
2. **Missing MCP Access**: No guidance on how to use installed MCP servers
3. **Generic Commands**: Missing specific project commands
4. **Incomplete MCP Tools Section**: Not leveraging installed servers

## Specific Improvements:

### 1. Update File Counts
- src/components/ui: Should show actual count (49 files, not 50)
- Add src/hooks, src/services, src/types directories
- backend files: Update with actual Python file counts

### 2. Add MCP Server Instructions
Since you have: serena, context7, sequential-thinking, mcp-fetch

Add section:
```markdown
## MCP SERVERS

### Available MCP Servers
- **serena**: Code analysis and symbolic editing (dashboard: http://127.0.0.1:24284)
- **context7**: Latest library documentation and examples  
- **sequential-thinking**: Complex task planning and analysis
- **mcp-fetch**: HTTP/web fetch capabilities

### Usage Examples
```bash
# Access Serena tools
echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "find_symbol", "arguments": {"name_pattern": "GameContext"}}}' | serena-slim

# Access Context7 docs
echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "resolve_library_id", "arguments": {"libraryName": "react"}}}' | npx @upstash/context7-mcp
```

### 3. Add Project-Specific Commands
```bash
npm run test:e2e          # E2E Playwright tests
npm run type-check        # TypeScript type checking
python manage.py makemigrations  # Django migrations
```

### 4. Enhanced Code Analysis Section
Use Serena to analyze:
- Symbol relationships between files
- Complex architectural patterns
- Dependency analysis

### 5. Missing Key Information
- Environment setup requirements
- Audio processing pipeline details
- Testing strategies