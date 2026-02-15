# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e7]
      - heading "Sound Royale" [level=3] [ref=e9]
      - paragraph [ref=e10]: Enter a room code to join the battle
    - generic [ref=e11]:
      - generic [ref=e12]:
        - button "Join" [ref=e13] [cursor=pointer]:
          - img
          - text: Join
        - button "Create" [ref=e14] [cursor=pointer]:
          - img
          - text: Create
      - generic [ref=e15]:
        - textbox "0000" [ref=e16]
        - paragraph [ref=e17]: Enter 4-digit room code
      - button "Join Room" [disabled]:
        - img
        - text: Join Room
```