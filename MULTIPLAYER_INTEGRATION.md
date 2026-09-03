# Escape the Horde — Multiplayer Phase 2 Integration Guide

## Overview

`net-multiplayer.js` is a drop-in replacement for `net.js` that adds **shared zombie simulation** to your co-op game. Instead of each player running their own zombie horde, the host runs all AI and broadcasts state to guests.

**What Changed:**
- Host-authoritative zombie simulation (only host runs `updateZombies()`)
- Delta compression (only changed zombies are sent)
- Keyframe sync every second (recovery from packet loss)
- Damage claiming (guests claim hits, host applies them)
- Host migration (if host drops, lowest remaining ID becomes new host)

---

## Integration Steps

### 1. **Update index.html**

Replace the `<script src="net.js">` line with:

```html
<script src="net-multiplayer.js"></script>
```

### 2. **Gate Zombie AI Behind Host Check**

In `game.js`, find the main game loop (around line ~4900 where `updateZombies()` is called):

**Before:**
```javascript
function animate() {
  // ...
  if (H.running) {
    updateZombies(dt);
    updateWaves(dt);
  }
  // ...
}
```

**After:**
```javascript
function animate() {
  // ...
  if (H.running) {
    // Only the host runs zombie AI
    if (NET.state.isHost || !NET.state.on) {
      updateZombies(dt);
      updateWaves(dt);
    }
  }
  // ...
}
```

**Why?** Guests rely entirely on the host's snapshots. Running local AI would diverge and cause desyncs.

### 3. **Hook Damage Application**

In `game.js`, find where `hurtZombie()` is called (typically in raycast hit detection):

**Before:**
```javascript
function fire() {
  // ... raycast code ...
  if (hit) {
    const dmg = w.dmg * (isHeadshot ? w.head : 1);
    hurtZombie(hitZombieIndex, dmg, isHeadshot);
  }
}
```

**After:**
```javascript
function fire() {
  // ... raycast code ...
  if (hit) {
    const dmg = w.dmg * (isHeadshot ? w.head : 1);
    NET.claimDamage(hitZombieIndex, dmg, isHeadshot);
  }
}
```

**Why?** Instead of directly damaging, claim the hit with the host. The host will apply it and sync back.

### 4. **Expose Helper Functions to NET**

The multiplayer code needs to call a few game functions. Add these exports to the end of game.js (inside the HORDE namespace):

```javascript
// Around line 4950, add to window.HORDE:
H.zombieById = function(idx) {
  return H.zombies ? H.zombies[idx] : null;
};

H.hurtZombie = function(idx, dmg, isHeadshot) {
  const z = H.zombies ? H.zombies[idx] : null;
  if (!z || !z.alive) return;
  // Your existing hurtZombie logic
  z.hp -= dmg;
  if (z.hp <= 0) {
    z.alive = false;
    H.score += z.type ? H.ZTYPES[z.type].score : 100;
  }
};
```

---

## How It Works (Analogy)

Think of it like a **chess tournament with a referee**:

- **Host** = Referee. Moves all the pieces (zombies), watches the board, rules on disputes.
- **Guest players** = Competitors. They move their own piece (player avatar), announce shots ("I hit pawn E4!"), and wait for the referee to confirm.
- **Broadcasts** = Official scoreboard updates. Twice per second the referee posts the full board state.
- **Keyframes** = Detailed scoreboard every second (in case someone missed an update).

---

## Message Flow Diagram

```
PLAYER A (Host)          NETWORK           PLAYER B (Guest)
=====================================================

Running:
  updateZombies()
  buildSnapshot()      --z_delta--->    onZombieDelta()
                                        updateRemoteZombie()
                                        render zombie

Player B shoots:
                      <--dmg_claim--    claimDamage()
                                        (pending)

Host applies:
  hurtZombie(5, 40)
                      --z_delta--->    zombie 5: hp-40
                       (with new HP)   render updated
                      --dmg_ack-->     onDamageAck()
                                        (confirm hit)
```

---

## Configuration Tuning

In `net-multiplayer.js`, you can adjust these constants:

```javascript
const SEND_HZ    = 18;              // Player updates per second
const ZOMBIE_HZ  = 12;              // Zombie updates per second
const INTERP_MS  = 120;             // Interpolation delay (ms)
const DROP_MS    = 6000;            // Timeout before kick (ms)
const KEYFRAME_INTERVAL = 1000;     // Full sync every X ms
```

**Bandwidth Notes:**
- At 12 Hz with 46 zombies, worst case (all changed) ≈ 5.5 KB/sec
- With delta compression, typical ≈ 1-2 KB/sec
- Keyframes every 1 sec ensures desync recovery

---

## Testing Checklist

- [ ] Host and guest can see each other walk around
- [ ] Host and guest can shoot (tracers appear)
- [ ] Guest shoots zombie → damage applies (on both clients)
- [ ] Zombie dies on host → dies on guest after next sync
- [ ] Guest disconnects → host removes their avatar
- [ ] Host disconnects → guest becomes new host
- [ ] Wave progression syncs (new zombies appear for both)

---

## Troubleshooting

### "Zombies not syncing"
- Check that `NET.state.isHost` is `true` on one client
- Verify Supabase keys are set in `config.js`
- Check browser console for connection errors

### "Damage doesn't register"
- Ensure `NET.claimDamage()` is called instead of direct `hurtZombie()`
- Host needs to expose `H.hurtZombie()` function
- Check that damage claims are being sent (network tab in DevTools)

### "Zombies teleporting"
- Increase `INTERP_MS` (currently 120ms). Try 150-200ms.
- Reduce `ZOMBIE_HZ` if network is choppy. Try 10 Hz.
- Check packet loss with `rate_limit` in Supabase config

### "Host migration broken"
- Verify `checkHostMigration()` is called when a peer drops
- Lowest ID should always become new host
- Host status persists through Presence (see `state.isHost`)

---

## Advanced: Custom Damage Validation

If you want to prevent cheat damage claims, add server-side validation:

```javascript
// In game.js, before applying damage:
H.hurtZombie = function(idx, dmg, isHeadshot) {
  const z = H.zombies[idx];
  if (!z || !z.alive) return;
  
  // Validate: max 2x normal damage (head multiplier)
  const w = H.WEAPONS[H.gunState.cur];
  const maxDmg = w.dmg * w.head * 1.2; // 20% grace
  if (dmg > maxDmg) {
    console.warn('Damage claim rejected:', dmg, 'max:', maxDmg);
    return;
  }
  
  z.hp -= dmg;
  // ...
};
```

---

## Next Steps (Phase 3)

Consider adding:
- **Shared ammo crates** (host spawns, all see)
- **Shared doors/barricades** (state synced)
- **Chat** (Supabase or your own backend)
- **Leaderboards** (per-session kill counts)
- **Friendly fire** toggle

---

## File Summary

| File | Purpose |
|------|---------|
| `net-multiplayer.js` | Full networking + zombie sync |
| `game.js` | Add gates + expose functions |
| `index.html` | Update script src |
| `config.js` | Supabase keys (already in place) |

---

## Support

If you hit issues:
1. Check browser console for errors
2. Open DevTools → Network tab → Filter by "broadcast"
3. Verify Supabase Realtime is active
4. Check that `H` (HORDE) is fully initialized before NET loads

Good luck! 🧟‍♂️
