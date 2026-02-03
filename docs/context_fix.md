# Fix GameContext.tsx

## Add missing properties to GameContextType interface:
- resolveConflict: (update: (prev: GameState) => GameState) => void
- pendingActions: Map<string, any>
- setPendingActions: React.Dispatch<React.SetStateAction<Map<string, any>>>

## Fix: GameProvider value:
Add these to the context value object:
- resolveConflict
- pendingActions  
- setPendingActions

## Fix resolveConflict function:
Should take (prev: GameState) parameter, not update
```typescript
const resolveConflict = (update: (prev: GameState) => GameState) => {
  setPendingActions(prev => {
    const newActions = new Map(prev);
    const mergedActions = { ...newActions, ...update };
    setPendingActions(mergedActions);
    return update(prev);
  });
};
```

## Fix setPendingActions:
Add missing setter to context initialization
```typescript
const [pendingActions, setPendingActions] = useState<Map<string, any>>(new Map());
```

This should resolve all TypeScript errors.