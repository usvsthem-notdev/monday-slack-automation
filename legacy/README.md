# Legacy Code Archive

This folder contains the old automation code that was replaced by the new single-app architecture in v5.0.0.

## Contents

- `automation.js` - Original automation app with duplicate Slack Bolt instance
- This code is kept for reference but is no longer used in production

## Why Moved to Legacy

1. **Duplicate Functionality:** Had duplicate Slack commands already in `src/server.js`
2. **Confusion:** Created ambiguity about which app was actually running
3. **Maintenance:** Harder to maintain two separate Slack apps
4. **Performance:** The new architecture is more efficient

## If You Need This Code

You can still run the legacy automation with:
```bash
npm run legacy
```

But it's recommended to use the new `src/server.js` architecture.

## Safe to Delete

Once you've confirmed the new architecture works perfectly, this entire folder can be deleted.

---
*Archived: October 17, 2025*
*Replacement: src/server.js*
