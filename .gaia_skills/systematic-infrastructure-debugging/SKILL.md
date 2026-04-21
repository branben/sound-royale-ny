# Systematic Infrastructure Debugging

A methodology for debugging complex infrastructure components like WebSocket mocking, API mocking, and other test infrastructure.

## Core Principles

### 1. Isolate First, Integrate Later
- Create minimal reproduction cases before attempting fixes
- Use debug test files to validate individual components
- Test infrastructure in isolation from application logic

### 2. Incremental Validation
- Test each component individually before integration
- Validate timing, navigation, and event handling separately
- Use systematic error analysis to identify root causes

### 3. Pattern Recognition and Application
- Identify working patterns from debug tests
- Apply successful patterns to fix similar issues
- Document patterns for future infrastructure work

### 4. Root Cause Focus
- Address underlying causes, not symptoms
- Use systematic debugging to trace issues to source
- Avoid superficial fixes that create regressions

## Debugging Methodology

### Phase 1: Problem Isolation
1. **Create Debug Test**: Build minimal test case that reproduces the issue
2. **Validate Infrastructure**: Test core functionality without application complexity
3. **Identify Failure Point**: Pinpoint exact location and nature of failure

### Phase 2: Root Cause Analysis
1. **Timing Analysis**: Check for race conditions, async issues
2. **Navigation Impact**: Test if page navigation affects injected code
3. **Event System**: Verify event listener management and triggering
4. **String Injection**: Check for syntax errors in injected code

### Phase 3: Incremental Fixes
1. **Fix Core Issue**: Address the identified root cause
2. **Validate Fix**: Test with debug test case
3. **Apply Pattern**: Use working approach for similar issues
4. **Expand Scope**: Test with increasingly complex scenarios

### Phase 4: Integration and Documentation
1. **Full Suite Testing**: Run all related tests
2. **Pattern Documentation**: Record successful approaches
3. **Create Reusable Templates**: Build templates for future infrastructure
4. **Update Documentation**: Share lessons learned

## Common Infrastructure Issues and Solutions

### WebSocket Mocking Issues
**Problem**: Event listeners not triggered
**Root Cause**: MockWebSocket only supported direct properties, not addEventListener
**Solution**: Implement both event listener Map and direct property support

**Problem**: WebSocket injection lost on navigation
**Root Cause**: Used page.evaluate() instead of page.addInitScript()
**Solution**: Use page.addInitScript() for persistent injection

**Problem**: Tests fail due to timing
**Root Cause**: Tests expect immediate connection but WebSocket auto-connects asynchronously
**Solution**: Add proper delays and Promise-based waiting

### API Mocking Issues
**Problem**: Route conflicts between different mocks
**Root Cause**: Multiple route handlers conflicting
**Solution**: Use consistent mocking patterns and clear route priorities

**Problem**: Mocked data format mismatch
**Root Cause**: Frontend expects snake_case but fixtures use camelCase
**Solution**: Use proper format conversion (toRoomResponse helper)

## Debug Test Templates

### WebSocket Debug Template
```typescript
test('WebSocket Infrastructure Debug', async ({ page }) => {
  await mockWebSocketConnection(page);
  
  const debugResult = await page.evaluate(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/game/');
    
    return {
      constructor: ws.constructor.name,
      readyState: ws.readyState,
      hasInjectMethod: typeof (ws as any).injectMessage === 'function',
      hasDisconnectMethod: typeof (ws as any).simulateDisconnect === 'function',
      hasReconnectMethod: typeof (ws as any).simulateReconnect === 'function'
    };
  });
  
  expect(debugResult.constructor).toBe('MockWebSocket');
  expect(debugResult.hasInjectMethod).toBe(true);
});
```

### API Mocking Debug Template
```typescript
test('API Mocking Infrastructure Debug', async ({ page }) => {
  let requestCount = 0;
  
  await page.route('**/api/rooms/**', async (route) => {
    requestCount++;
    await route.fulfill({ json: mockRoomResponse });
  });
  
  await page.goto('/room/test-room');
  expect(requestCount).toBeGreaterThan(0);
});
```

## Success Metrics

### Infrastructure Quality
- All debug tests pass consistently
- Infrastructure works across page navigation
- Event handling supports both patterns (addEventListener + direct properties)
- Timing issues resolved with proper async handling

### Test Reliability
- Tests are deterministic without flaky waits
- Tests work in isolation and integration
- Tests have clear failure messages
- Tests cover edge cases and error scenarios

### Documentation Quality
- Debugging methodology documented
- Common issues and solutions cataloged
- Reusable templates available
- Lessons learned shared with team

## Anti-Patterns to Avoid

### Don't
- Use `page.evaluate()` for persistent code injection
- Ignore timing issues in async operations
- Skip debug test creation for complex infrastructure
- Apply superficial fixes without root cause analysis
- Mix camelCase and snake_case without conversion

### Do
- Use `page.addInitScript()` for persistent injection
- Handle timing with proper async patterns
- Create debug tests for infrastructure validation
- Perform systematic root cause analysis
- Use consistent data formats with proper conversion

## Integration with GAIA

This skill complements other GAIA skills:
- **e2e-test-hygiene**: Provides infrastructure debugging methodology
- **systematic-debugging**: Focuses specifically on test infrastructure
- **verification-before-completion**: Ensures infrastructure reliability
- **agent-resilience**: Provides recovery patterns for infrastructure failures

## Case Studies

### WebSocket Mocking Implementation
**Challenge**: MockWebSocket class failing to trigger events
**Approach**: 
1. Created debug test to isolate WebSocket functionality
2. Identified event listener management issue
3. Fixed both addEventListener and direct property support
4. Added proper timing for auto-connection
5. Validated with comprehensive test suite

**Result**: 5/5 WebSocket tests passing, infrastructure ready for production

### Network Recovery Enhancement
**Challenge**: Adding WebSocket resilience to existing network tests
**Approach**:
1. Analyzed existing network recovery patterns
2. Added WebSocket-specific scenarios
3. Used systematic timing for disconnect/reconnect cycles
4. Validated message queuing during disconnection

**Result**: 8/8 network recovery tests passing, comprehensive resilience coverage

## Future Applications

This methodology applies to:
- WebSocket infrastructure development
- API mocking enhancement
- Browser automation tooling
- Test framework development
- Performance monitoring infrastructure
- Authentication testing infrastructure

## Maintenance

Regularly update this skill with:
- New debugging patterns discovered
- Common infrastructure issues and solutions
- Improved templates and methodologies
- Lessons learned from infrastructure projects
