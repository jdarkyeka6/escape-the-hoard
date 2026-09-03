# Exact Changes Needed in game.js

## Summary
Three main changes:
1. Gate zombie AI behind host check
2. Redirect damage to NET.claimDamage()
3. Export helper functions to window.HORDE

---

## Change 1: Gate Zombie AI (Search for `updateZombies` call)

**Location:** Find the main animation loop (around line 4900-4920)

**BEFORE:**
```javascript
function animate () {
  const dt = Math.min(1/30, (performance.now() - tPrev) / 1000);
  tPrev = performance.now();

  if (H.running) {
    updatePlayer(dt);
    updateZombies(dt);
    updateWaves(dt);
    updateKnockback(dt);
  }
  // ... rest of loop
}
```

**AFTER:**
```javascript
function animate () {
  const dt = Math.min(1/30, (performance.now() - tPrev) / 1000);
  tPrev = performance.now();

  if (H.running) {
    updatePlayer(dt);
    // Only host runs zombie AI; guests rely on network sync
    if (NET.state.isHost || !NET.state.on) {
      updateZombies(dt);
      updateWaves(dt);
    }
  }
  // ... rest of loop
}
```

---

## Change 2: Redirect Damage to Network

**Location:** Find the `fire()` function (around line 1500-1700)

Search for where a zombie gets hit. It will look like:

**BEFORE:**
```javascript
function fire () {
  // ... aim calculation ...
  
  // Find what we hit
  const origin = new T.Vector3(camX, camY, camZ);
  const direction = // ... aim direction ...;
  const raycaster = new T.Raycaster(origin, direction);
  
  // Check hits
  H.zombies.forEach((z, idx) => {
    if (!z || !z.alive) return;
    
    // Raycast hit
    const dmg = w.dmg * (isHeadshot ? w.head : 1);
    
    // OLD: Direct damage
    z.hp -= dmg;
    if (z.hp <= 0) {
      z.alive = false;
      H.score += z.type ? H.ZTYPES[z.type].score : 100;
    }
  });
  
  // Network: send tracer only
  if (NET.onLocalShot) {
    NET.onLocalShot(origin, hitPoint, H.gunState.cur);
  }
}
```

**AFTER:**
```javascript
function fire () {
  // ... aim calculation ... (UNCHANGED)
  
  // Find what we hit
  const origin = new T.Vector3(camX, camY, camZ);
  const direction = // ... aim direction ...;
  const raycaster = new T.Raycaster(origin, direction);
  
  // Check hits
  H.zombies.forEach((z, idx) => {
    if (!z || !z.alive) return;
    
    // Raycast hit
    const dmg = w.dmg * (isHeadshot ? w.head : 1);
    
    // NEW: Claim damage through network
    if (NET.claimDamage) {
      NET.claimDamage(idx, dmg, isHeadshot);
    } else {
      // Fallback: single-player direct damage
      z.hp -= dmg;
      if (z.hp <= 0) {
        z.alive = false;
        H.score += z.type ? H.ZTYPES[z.type].score : 100;
      }
    }
  });
  
  // Network: send tracer
  if (NET.onLocalShot) {
    NET.onLocalShot(origin, hitPoint, H.gunState.cur);
  }
}
```

---

## Change 3: Export Helper Functions

**Location:** At the very end of game.js (right before the final closing `}());`)

**ADD this code:**

```javascript
// =============== MULTIPLAYER HELPERS ===============
// These functions allow NET.js to interact with the game engine

H.zombieById = function(idx) {
  // Get a zombie by its array index
  if (!H.zombies || idx >= H.zombies.length) return null;
  return H.zombies[idx];
};

H.hurtZombie = function(idx, dmg, isHeadshot) {
  // Apply damage to a specific zombie
  // Called by host when it receives damage claims from guests
  const z = H.zombies ? H.zombies[idx] : null;
  if (!z || !z.alive) return;
  
  z.hp -= dmg;
  
  if (z.hp <= 0) {
    z.alive = false;
    // Award score
    if (z.type && H.ZTYPES[z.type]) {
      H.score += H.ZTYPES[z.type].score;
    } else {
      H.score += 100;
    }
    // Play death sound if available
    if (H.Sfx && H.Sfx.zDie) {
      H.Sfx.zDie();
    }
  }
};

// ===================================================
```

---

## Alternative: Minimal Change (Least Invasive)

If you want to make **only** the zombie AI gate change and handle damage differently, do this:

1. **Only add Change 1** (gate the AI)
2. **Skip Change 2** (damage)
3. **Add this minimal damage hook:**

In the `fire()` function, right after calculating damage:

```javascript
const dmg = w.dmg * (isHeadshot ? w.head : 1);

// NEW: one line
if (NET.claimDamage) NET.claimDamage(idx, dmg, isHeadshot);

// OLD code continues
z.hp -= dmg; // hosts do this immediately, guests do nothing
```

This way:
- Hosts damage immediately (single-player experience)
- Guests send the claim and wait
- Guests see the updated HP in the next zombie sync

---

## Validation Checklist

After making these changes:

```javascript
// In browser console, try these commands:

// Should be true (one of you)
NET.state.isHost

// Should have peers
NET.state.peers.size

// Should have zombies
HORDE.zombies.length

// Calling damage directly (test only)
HORDE.hurtZombie(0, 50, false)
```

---

## If Something Breaks

1. **Zombies don't spawn**: Check that `NET.state.isHost` is true on one client
2. **Game won't start**: Verify Change 1 doesn't have a typo in the if condition
3. **Damage doesn't sync**: Confirm Change 3 exports exist and Change 2 calls `NET.claimDamage`

You can always comment out Change 1 to test single-player damage:
```javascript
// if (NET.state.isHost || !NET.state.on) {
  updateZombies(dt);
  updateWaves(dt);
// }
```

---

## Line Number Guide

These are approximate line numbers (will vary slightly):

- `function animate()` call with `updateZombies()`: ~4910
- `function fire()` with damage logic: ~1600
- `H.scene = ...` and other H setup: ~4950+
- End of file: last `}());` before closing

Use Ctrl+F to search for the function names rather than relying on line numbers.
