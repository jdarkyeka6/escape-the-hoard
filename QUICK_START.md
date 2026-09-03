# Quick Start: Enable Multiplayer in 5 Minutes

## The Three-Step Process

### Step 1: Replace the networking file
Copy `net-multiplayer.js` to your hosting directory and update `index.html`:

**In index.html, change:**
```html
<script src="net.js"></script>
```

**To:**
```html
<script src="net-multiplayer.js"></script>
```

### Step 2: Add the gate (30 seconds)

In `game.js`, find this line (search for "updateZombies"):
```javascript
if (H.running) {
  updateZombies(dt);
  updateWaves(dt);
```

Replace with:
```javascript
if (H.running) {
  if (NET.state.isHost || !NET.state.on) {
    updateZombies(dt);
    updateWaves(dt);
  }
```

That's it. Single line change.

### Step 3: Wire up damage (2 minutes)

Find the `fire()` function. Look for where it damages zombies (search for "z.hp -="):

**OLD:**
```javascript
z.hp -= dmg;
```

**NEW:**
```javascript
if (NET.claimDamage) {
  NET.claimDamage(idx, dmg, isHeadshot);
} else {
  z.hp -= dmg;
}
```

### Step 4: Export helpers (1 minute)

At the very end of `game.js`, before the final `}());`, add:

```javascript
H.zombieById = function(idx) {
  return H.zombies ? H.zombies[idx] : null;
};

H.hurtZombie = function(idx, dmg, head) {
  const z = H.zombies[idx];
  if (!z || !z.alive) return;
  z.hp -= dmg;
  if (z.hp <= 0) {
    z.alive = false;
    H.score += (H.ZTYPES[z.type] || {score:100}).score;
  }
};
```

---

## Test It

1. Open the game in two browser windows/tabs
2. Window 1: Click "HOST"
3. Window 2: Paste the invite link (or manually enter the room code)
4. Both should see each other walk around
5. Shoot a zombie in Window 1 → it dies in Window 2

---

## If It Doesn't Work

**Checklist:**
- [ ] Supabase keys in `config.js`? 
- [ ] Syntax error in your changes? (Check browser console)
- [ ] Both windows joined the same room?
- [ ] First one clicked "HOST", second clicked "JOIN"?

**Debug Commands** (paste in browser console):

```javascript
// Should show connection status
NET.state.on             // true if connected
NET.state.isHost         // true if you're the host
NET.state.peers.size     // should show 1 if another player connected

// Should show your room
NET.state.room           // "SHED", "TOWN", etc.

// See all game objects
HORDE.zombies.length     // how many zombies
HORDE.scene.children.length  // all 3D objects
```

---

## What's Different From Single-Player

| Aspect | Single-Player | Multiplayer (Host) | Multiplayer (Guest) |
|--------|---|---|---|
| Zombies spawn | Local AI | Host AI | Receive updates |
| You shoot | Instant damage | Instant damage | Send claim, wait |
| You see | Your view | Your view + others | Your view + others |
| Zombies you see | Accurate | Accurate | Slightly delayed (120ms) |

---

## Common Questions

**Q: Can I play single-player still?**
Yes! If no one clicks "HOST", the `!NET.state.on` check keeps everything working locally.

**Q: Do I need a server?**
No! Supabase handles it. Just add your keys to `config.js`.

**Q: Can 3+ people join?**
Yes. Everyone sees everyone, and the host runs all zombies.

**Q: What if the host closes the game?**
Guests automatically become the new host (lowest ID wins).

**Q: Why are zombies slightly delayed?**
That's the `INTERP_MS = 120` value. It smooths out network jitter. You can lower it if you want less delay (but more jitter).

---

## Advanced Tweaking

Once it works, you can tune performance in `net-multiplayer.js`:

```javascript
const SEND_HZ    = 18;              // 18 = 18 times per second
const ZOMBIE_HZ  = 12;              // 12 = 12 times per second
const INTERP_MS  = 120;             // 120ms = display delay
```

- **More frequent updates** = smoother but more bandwidth
- **Less frequent** = choppier but uses less data
- **Higher INTERP_MS** = smoother motion but longer delay

---

## Next Level: Verify With Network Inspector

1. Open DevTools (F12)
2. Go to Network tab
3. Filter: "broadcast"
4. Shoot a zombie
5. You should see messages like:
   - `pos` (your position)
   - `shot` (your bullet)
   - `z_delta` (zombie updates from host)
   - `dmg_ack` (host confirmed your damage)

If you see these, multiplayer is working!

---

## Still Stuck?

The integration guide has more detail:
- Read `MULTIPLAYER_INTEGRATION.md` for concepts
- Read `GAME_JS_CHANGES.md` for exact code examples
- Check browser console for JavaScript errors

Most issues are typos in the changes or Supabase keys not set. Double-check both!
