/* =========================================================================
   ESCAPE THE HORDE — co-op networking, phase 1
   Loads AFTER game.js and talks to it through window.HORDE.

   ---------------------------------------------------------------------
   WHAT THIS DOES AND DOES NOT DO

   Does:  a shared room, everybody's position and aim, remote player bodies
          that walk and animate, tracers when someone else fires, join and
          leave handling, a name over each head.

   Does NOT (yet): shared zombies. Every client still runs its own horde, so
          you will each be fighting your own wave. That is phase 2 and it is
          the hard half — see the note at the bottom of this file.

   ---------------------------------------------------------------------
   WHY IT IS BUILT LIKE THIS

   Two channels of traffic with completely different needs:

   * Who is in the room — rare, must be reliable, must survive a refresh.
     That is Supabase Realtime PRESENCE. It keeps a roster for you and tells
     everyone when someone joins or drops.

   * Where everyone is — constant, and worthless the moment it is stale.
     That is BROADCAST. Fire and forget, no history, no persistence.

   Sending position twenty times a second and rendering it the instant it
   lands would look terrible, because packets arrive unevenly. So each remote
   player keeps its last two known states and the renderer draws it slightly
   in the past, sliding between them. It is the same reason live TV runs on a
   short delay: a small, constant lag is invisible, whereas an inconsistent
   one is not.
   ========================================================================= */
'use strict';
window.NET = (function () {

const H = window.HORDE;
const T = window.THREE;
if (!H || !T) { console.warn('[net] game not loaded'); return {}; }

/* ------------------------------------------------------------ configure me
   Project settings -> API in the Supabase dashboard. The anon key is meant to
   be public — it is the publishable one, not the service role key. Never put
   the service role key in a file the browser downloads. */
const CFG = window.HORDE_CONFIG || {};
const SUPABASE_URL = CFG.supabaseUrl || 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = CFG.supabaseAnonKey || 'YOUR-ANON-KEY';
const configured = SUPABASE_URL.indexOf('YOUR-PROJECT') === -1;

const SEND_HZ    = 18;        // position updates per second
const INTERP_MS  = 120;       // how far in the past remotes are drawn
const DROP_MS    = 6000;      // silence before we assume someone crashed

const state = {
  on: false, room: null, id: null, name: null,
  client: null, channel: null,
  peers: new Map(),           // id -> peer record
  sendT: 0, seq: 0,
  isHost: false, started: false,
  onRoster: null,             // UI callback, set from index.html
};

/* ----------------------------------------------------------------- avatar
   Deliberately not the zombie model: in a dark street at forty metres you
   need to tell a team mate from a walker in one glance, so the silhouette is
   upright, the palette is high-visibility, and there is a name above it. */
const bodyGeo = new T.BoxGeometry(1, 1, 1);
const AV_COLS = [0x4ea8de, 0xe8b04b, 0x6fd66f, 0xd96f9a, 0xb07fe0, 0x59d6c8];

function makeAvatar (name, colIdx) {
  const col = AV_COLS[colIdx % AV_COLS.length];
  const g = new T.Group();
  const kit  = new T.MeshLambertMaterial({ color: col });
  const dark = new T.MeshLambertMaterial({ color: 0x2b2f38 });
  const skin = new T.MeshLambertMaterial({ color: 0xb98a63 });

  const put = (mat, x, y, z, sx, sy, sz) => {
    const m = new T.Mesh(bodyGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const torso = put(kit,  0, 1.15, 0, 0.52, 0.72, 0.30);
  const head  = put(skin, 0, 1.68, 0, 0.28, 0.30, 0.28);
  put(dark, 0, 1.80, 0, 0.31, 0.10, 0.31);              // helmet
  const armL = put(kit, -0.36, 1.22, 0, 0.16, 0.62, 0.16);
  const armR = put(kit,  0.36, 1.22, 0, 0.16, 0.62, 0.16);
  const legL = put(dark, -0.15, 0.42, 0, 0.19, 0.84, 0.19);
  const legR = put(dark,  0.15, 0.42, 0, 0.19, 0.84, 0.19);

  // a glow so you can find each other across the map at night
  const beacon = H.glowSprite ? H.glowSprite(col, 2.4, 0.45) : null;
  if (beacon) { beacon.position.y = 1.95; g.add(beacon); }

  g.add(makeNameTag(name, col));
  H.scene.add(g);
  return { g, torso, head, armL, armR, legL, legR, col };
}

function makeNameTag (name, col) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 6;
  x.strokeStyle = 'rgba(0,0,0,.85)';
  x.strokeText(name, 128, 34);
  x.fillStyle = '#' + col.toString(16).padStart(6, '0');
  x.fillText(name, 128, 34);
  const tex = new T.CanvasTexture(c);
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true,
                                                depthTest: false, toneMapped: false }));
  s.scale.set(2.0, 0.5, 1);
  s.position.y = 2.35;
  s.renderOrder = 50;
  return s;
}

/* ------------------------------------------------------------------ peers */
function addPeer (id, name, host) {
  if (state.peers.has(id) || id === state.id) return;
  const av = makeAvatar(name || 'SURVIVOR', state.peers.size + 1);
  state.peers.set(id, {
    id, name, av, host: !!host,
    prev: null, next: null,        // the two snapshots we slide between
    lastSeen: performance.now(),
    walk: 0,
  });
  H.toast(name + ' JOINED');
}

function dropPeer (id) {
  const p = state.peers.get(id);
  if (!p) return;
  H.scene.remove(p.av.g);
  state.peers.delete(id);
  H.toast((p.name || 'A SURVIVOR') + ' LEFT');
}

/* -------------------------------------------------------------- send/recv */
function localSnapshot () {
  const pl = H.player;
  return {
    i: state.id,
    n: ++state.seq,
    t: Date.now(),
    x: +pl.pos.x.toFixed(2),
    y: +(pl.pos.y - H.EYE).toFixed(2),      // send FEET, not eye height
    z: +pl.pos.z.toFixed(2),
    r: +pl.yaw.toFixed(2),
    p: +pl.pitch.toFixed(2),
    s: Math.round(Math.hypot(pl.vel.x, pl.vel.z)),
    c: pl.crouch > 0.5 ? 1 : 0,
    h: Math.round(pl.hp),
    w: H.gunState.cur,
  };
}

function onSnapshot (m) {
  if (!m || m.i === state.id) return;
  let p = state.peers.get(m.i);
  if (!p) { addPeer(m.i, m.nm || 'SURVIVOR'); p = state.peers.get(m.i); }
  if (!p) return;
  // out-of-order packets are dropped rather than rewound: with 18 updates a
  // second the next one is never far behind
  if (p.next && m.n <= p.next.n) return;
  p.prev = p.next || m;
  p.next = m;
  p.lastSeen = performance.now();
}

function onRemoteShot (m) {
  if (!m || m.i === state.id) return;
  const from = new T.Vector3(m.ax, m.ay, m.az);
  const to   = new T.Vector3(m.bx, m.by, m.bz);
  H.tracer(from, to);
  if (H.Sfx && H.Sfx.shot) {
    const w = H.WEAPONS[m.w] || H.WEAPONS[0];
    H.Sfx.shot(w.tone);
  }
}

/* --------------------------------------------------------------- per frame */
function update (dt) {
  if (!state.on || !state.channel) return;

  // outbound, throttled — the render loop runs far faster than the network
  state.sendT -= dt;
  if (state.sendT <= 0) {
    state.sendT = 1 / SEND_HZ;
    const snap = localSnapshot();
    snap.nm = state.name;
    state.channel.send({ type: 'broadcast', event: 'pos', payload: snap });
  }

  // inbound: draw everyone slightly in the past and slide between snapshots
  const now = Date.now() - INTERP_MS;
  const clock = performance.now();

  state.peers.forEach((p, id) => {
    if (clock - p.lastSeen > DROP_MS) { dropPeer(id); return; }
    if (!p.next) return;
    const a = p.prev || p.next, b = p.next;
    const span = Math.max(1, b.t - a.t);
    const k = Math.max(0, Math.min(1, (now - a.t) / span));

    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const z = a.z + (b.z - a.z) * k;

    // yaw has to take the short way round, or a peer turning past due south
    // spins a full circle on every other client
    let dr = b.r - a.r;
    while (dr >  Math.PI) dr -= Math.PI * 2;
    while (dr < -Math.PI) dr += Math.PI * 2;
    const r = a.r + dr * k;

    const av = p.av;
    av.g.position.set(x, y, z);
    av.g.rotation.y = r;

    const crouch = b.c ? 1 : 0;
    av.g.scale.y = 1 - crouch * 0.32;

    // walk cycle driven by reported speed, same trick the zombies use
    p.walk += dt * b.s * 1.4;
    const sw = Math.sin(p.walk) * Math.min(1, b.s / 6);
    av.legL.rotation.x =  sw * 0.7;
    av.legR.rotation.x = -sw * 0.7;
    av.armL.rotation.x = -sw * 0.4;
    av.armR.rotation.x =  sw * 0.4;
    av.head.rotation.x = -(b.p || 0) * 0.6;
  });
}

/* ------------------------------------------------------------------ joining */
/* Four letters, no vowels — you cannot accidentally generate a rude word, and
   nothing in it is ambiguous when read aloud. */
function makeRoomCode () {
  const L = 'BCDFGHJKLMNPQRSTVWXZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += L[(Math.random() * L.length) | 0];
  return s;
}

async function host (name) {
  return join(makeRoomCode(), name, true);
}

async function join (room, name, asHost) {
  if (state.on) return;
  if (!window.supabase) { H.toast('SUPABASE NOT LOADED'); return; }
  if (!configured) { H.toast('SET YOUR KEYS IN config.js'); return; }

  state.name = (name || 'SURVIVOR').toUpperCase().slice(0, 12);
  state.room = (room || 'STREET').toUpperCase().slice(0, 12);
  state.id = Math.random().toString(36).slice(2, 10);
  state.isHost = !!asHost;
  state.started = false;

  state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: SEND_HZ + 6 } },
  });

  state.channel = state.client.channel('horde:' + state.room, {
    config: { presence: { key: state.id }, broadcast: { self: false } },
  });

  state.channel
    .on('broadcast', { event: 'pos'  }, ({ payload }) => onSnapshot(payload))
    .on('broadcast', { event: 'shot'  }, ({ payload }) => onRemoteShot(payload))
    .on('broadcast', { event: 'start' }, ({ payload }) => onStart(payload))
    .on('presence',  { event: 'join'  }, ({ key, newPresences }) => {
      if (key === state.id) return;
      const n = newPresences && newPresences[0];
      addPeer(key, (n && n.name) || 'SURVIVOR', n && n.host);
      pushRoster();
    })
    .on('presence',  { event: 'sync'  }, () => {
      // authoritative roster: presence state is the whole room, not a delta
      const all = state.channel.presenceState();
      Object.keys(all).forEach(key => {
        if (key === state.id) return;
        const n = all[key] && all[key][0];
        addPeer(key, (n && n.name) || 'SURVIVOR', n && n.host);
      });
      pushRoster();
    })
    .on('presence',  { event: 'leave' }, ({ key }) => { dropPeer(key); pushRoster(); })
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await state.channel.track({ name: state.name, host: state.isHost, at: Date.now() });
      state.on = true;
      H.toast(state.isHost ? 'HOSTING ROOM ' + state.room : 'JOINED ROOM ' + state.room);
      pushRoster();
    });
}

function leave () {
  if (!state.on) return;
  state.peers.forEach((p, id) => dropPeer(id));
  if (state.channel) state.channel.unsubscribe();
  state.on = false; state.isHost = false; state.started = false;
  pushRoster();
  H.toast('LEFT THE ROOM');
}

/* Everyone in the room, host first. The UI redraws from this. */
function roster () {
  const list = [{ id: state.id, name: state.name, host: state.isHost, me: true }];
  state.peers.forEach(p => list.push({ id: p.id, name: p.name, host: !!p.host, me: false }));
  return list;
}

function pushRoster () {
  if (state.onRoster) state.onRoster(roster(), state);
}

/* Host presses START; everyone else drops into the run on the same tick. */
function sendStart () {
  if (!state.on || !state.isHost || !state.channel) return;
  state.started = true;
  state.channel.send({ type: 'broadcast', event: 'start', payload: { i: state.id } });
}

function onStart (m) {
  if (!m || m.i === state.id || state.started) return;
  state.started = true;
  H.toast('HOST STARTED THE RUN');
  H.restart();
}

/* called from fire() in game.js */
function onLocalShot (from, to, weaponIndex) {
  if (!state.on || !state.channel) return;
  state.channel.send({
    type: 'broadcast', event: 'shot',
    payload: { i: state.id, w: weaponIndex,
               ax:+from.x.toFixed(2), ay:+from.y.toFixed(2), az:+from.z.toFixed(2),
               bx:+to.x.toFixed(2),   by:+to.y.toFixed(2),   bz:+to.z.toFixed(2) },
  });
}

/* A hosted site makes the room code shareable: horde.vercel.app/?room=SHED
   drops your mate straight into your street with no typing. */
function roomFromUrl () {
  try { return new URLSearchParams(location.search).get('room'); }
  catch (e) { return null; }
}

function shareLink () {
  if (!state.room) return location.href;
  return location.origin + location.pathname + '?room=' + encodeURIComponent(state.room);
}

async function copyLink () {
  try {
    await navigator.clipboard.writeText(shareLink());
    H.toast('INVITE LINK COPIED');
  } catch (e) {
    H.toast(shareLink());
  }
}

return { join, host, leave, update, onLocalShot, state, roomFromUrl,
         shareLink, copyLink, configured, roster, sendStart, makeRoomCode };

/* =====================================================================
   PHASE 2 — SHARED ZOMBIES, when you get to it

   The problem: every client currently runs updateZombies() itself. Two
   machines rolling their own random numbers diverge within seconds, so you
   would each see a different horde in the same street.

   The fix is to pick one client as HOST — first into the room wins — and:

     1. Gate updateZombies(), updateWaves() and spawnZombie() behind
        `if (NET.isHost)`. Guests run no AI at all.
     2. Host broadcasts a zombie snapshot ~12 times a second: index, x, z,
        feet, yaw, state, type, alive. Forty-six zombies at that rate is the
        bulk of your bandwidth, so send only what CHANGED since the last
        snapshot and send a full keyframe once a second to resync.
     3. Guests interpolate zombies exactly like the player avatars above.
     4. Damage is claimed, not applied: a guest that hits zombie 12 sends
        {hit:12, dmg:40, head:true} and waits. Only the host calls
        hurtZombie(), and the death comes back down in the next snapshot.
        Otherwise two players shooting the same walker both kill it and the
        score doubles.
     5. Host migration: if the host drops, the lowest remaining id promotes.

   Rule of thumb for what to make authoritative: anything two players could
   disagree about profitably. Zombie health, yes. Which way a zombie is
   facing, no — near enough is fine, and guessing costs nothing.
   ===================================================================== */
})();
