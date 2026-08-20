/* =========================================================================
   ESCAPE THE HORDE — single-player endless zombie FPS
   Three.js r128 (bundled locally, no internet needed)
   ========================================================================= */
'use strict';
(function () {

const T = THREE;

/* ---------------------------------------------------------------- config */
const MAP_HALF   = 200;      // map spans 400 x 400 world units (~metres)
const GRID_CELL  = 20;       // collision bucket size
const EYE        = 1.68;
const P_RADIUS   = 0.42;
const WALK       = 6.0;
const SPRINT     = 9.6;
const ACCEL      = 60;
const FRICTION   = 12;
const GRAVITY    = 24;
const JUMP       = 8.0;
const MAX_ZOMBIES = 46;      // hard cap on simultaneous zombies
const STEP_P = 0.70;         // how high the player can step without jumping
const STEP_Z = 0.75;         // and the zombies

/* Movement feel. AIR_CTRL is the fraction of ground acceleration you get with
   your feet off the floor: at 1.0 you could turn on a sixpence mid-jump, which
   is why the old jumps felt weightless. At 0.3 a leap commits you. */
const STAND_H   = 1.75;      // collision capsule height standing
const CROUCH_H  = 1.05;      // ...and crouched, low enough to duck a barrier
const CROUCH_EYE = 1.02;     // camera height when fully crouched
const AIR_CTRL  = 0.30;
const COYOTE    = 0.12;      // grace period to still jump after walking off
const JUMP_BUF  = 0.16;      // press space early and it fires on landing
const SLIDE_SPD = 13.0;
const SLIDE_TIME = 0.62;
const SLIDE_CD  = 0.55;

/* Eight weapons, unlocked as the waves climb so there is always a next
   reward. `pierce` = extra zombies a round punches through, `zoom` = FOV
   multiplier when aiming down sights, `pickup` = rounds per ammo crate. */
const WEAPONS = [
  { id:'pistol',  name:'M9 SIDEARM',    dmg:30,  rpm:340, mag:14,  resMax:Infinity, spread:0.010,
    auto:false, reload:1.05, pellets:1, range:130, head:2.6, kick:0.022, pierce:0,
    zoom:0.80, unlock:1,  pickup:0,   tone:'pistol' },

  { id:'smg',     name:'VEKTOR SMG',    dmg:17,  rpm:880, mag:32,  resMax:320, spread:0.026,
    auto:true,  reload:1.60, pellets:1, range:110, head:2.1, kick:0.013, pierce:0,
    zoom:0.82, unlock:2,  pickup:64,  tone:'smg' },

  { id:'shotgun', name:'BREACHER 12G',  dmg:17,  rpm:78,  mag:6,   resMax:60,  spread:0.115,
    auto:false, reload:2.30, pellets:9, range:44,  head:1.7, kick:0.058, pierce:1,
    zoom:0.88, unlock:3,  pickup:14,  tone:'shotgun' },

  { id:'carbine', name:'K-4 CARBINE',   dmg:27,  rpm:640, mag:30,  resMax:300, spread:0.015,
    auto:true,  reload:1.90, pellets:1, range:150, head:2.3, kick:0.019, pierce:0,
    zoom:0.62, unlock:5,  pickup:60,  tone:'rifle' },

  { id:'magnum',  name:'.44 MAGNUM',    dmg:98,  rpm:135, mag:6,   resMax:66,  spread:0.011,
    auto:false, reload:2.05, pellets:1, range:120, head:3.0, kick:0.062, pierce:1,
    zoom:0.72, unlock:7,  pickup:14,  tone:'magnum' },

  { id:'sniper',  name:'LONGSHOT .308', dmg:230, rpm:48,  mag:5,   resMax:45,  spread:0.002,
    auto:false, reload:2.60, pellets:1, range:320, head:3.5, kick:0.095, pierce:3,
    zoom:0.28, unlock:9,  pickup:10,  tone:'sniper', scoped:true },

  { id:'lmg',     name:'SAW-60 LMG',    dmg:23,  rpm:720, mag:100, resMax:400, spread:0.038,
    auto:true,  reload:4.00, pellets:1, range:130, head:1.9, kick:0.016, pierce:1,
    zoom:0.78, unlock:12, pickup:80,  tone:'lmg' },

  { id:'thumper', name:'THUMPER 40MM',  dmg:0,   rpm:55,  mag:4,   resMax:28,  spread:0.004,
    auto:false, reload:2.80, pellets:1, range:200, head:1,   kick:0.070, pierce:0,
    zoom:0.85, unlock:15, pickup:6,   tone:'thump',
    grenade:{ speed:52, blast:6.5, dmg:150 } },
];

/* Six strains. `stagger` is how much a bullet interrupts them (1 = fully,
   0 = barely at all) and `push` is the knockback they land on you. */
const ZTYPES = {
  green: { hp:62,   spd:1.95, dmg:11, scale:1.00, score:100,  stagger:1.00, push:0,
           skin:0x8fb06a, cloth:0x46523c, eye:0x2a2a20, glow:false,
           legSwing:0.58, armSwing:0.16, gait:3.1, label:'WALKER', rags:true },

  blue:  { hp:42,   spd:4.60, dmg:9,  scale:0.92, score:170,  stagger:1.00, push:0,
           skin:0x7fa8c4, cloth:0x2f4152, eye:0x9fe4ff, glow:false,
           legSwing:0.78, armSwing:0.30, gait:4.6, label:'SPRINTER', thin:true },

  yellow:{ hp:70,   spd:2.05, dmg:33, scale:1.05, score:260,  stagger:0.85, push:0,
           skin:0xd8c452, cloth:0x5a5228, eye:0xfff36a, glow:true,
           legSwing:0.52, armSwing:0.22, gait:2.7, label:'BILE', cracked:true },

  red:   { hp:58,   spd:2.20, dmg:26, scale:1.00, score:320,  stagger:1.00, push:0,
           skin:0x9a4a34, cloth:0x4a2a20, eye:0xff6a4a, glow:true,
           legSwing:0.64, armSwing:0.26, gait:3.4, label:'BURROWER',
           tunnel:true, tunnelSpd:6.4, claws:true },

  black: { hp:310,  spd:1.10, dmg:22, scale:1.48, score:480,  stagger:0.12, push:11,
           skin:0x4a4a52, cloth:0x1e2026, eye:0xff3b30, glow:true,
           legSwing:0.36, armSwing:0.12, gait:1.7, label:'HULK', armour:true },

  pink:  { hp:2600, spd:2.85, dmg:48, scale:2.15, score:3000, stagger:0.06, push:16,
           skin:0xd977a8, cloth:0x6a2a44, eye:0xffb0d8, glow:true,
           legSwing:0.46, armSwing:0.42, gait:1.35, label:'ABOMINATION',
           boss:true, armour:true, claws:true },
};

/* who turns up, by wave — the cumulative thresholds mirror the design table */
const SPAWN_TABLES = [
  { upTo: 5,        mix: [['green',0.90], ['blue',1.00]] },
  { upTo: 10,       mix: [['green',0.70], ['blue',0.85], ['yellow',0.95], ['red',1.00]] },
  { upTo: Infinity, mix: [['green',0.55], ['blue',0.70], ['yellow',0.85], ['red',0.95], ['black',1.00]] },
];

/* every tenth wave is a fixed roster with one boss in it */
const BOSS_ROSTER = [['green',30], ['blue',10], ['yellow',8], ['red',5], ['black',2], ['pink',1]];

/* ---------------------------------------------------------------- helpers */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const rnd   = (a,b) => a + Math.random()*(b-a);
const gauss = () => (Math.random()-Math.random());
const $     = id => document.getElementById(id);

/* ---------------------------------------------------------------- audio
   Every sound is synthesised at runtime — no audio files, so the whole
   game is a handful of local files with nothing to download. */
/* ---------------------------------------------------------------- audio
   Everything is synthesised at runtime — no audio files, so the game stays a
   handful of local files with nothing to fetch. The chain is:

       voice -> [panner] -> sfx bus -----+
                        \-> reverb send -+-> limiter -> master -> speakers

   Sounds that happen in the world are positioned, so you can hear which
   direction a growl or a collapsing wall came from. The reverb is a
   procedurally generated impulse response, which gives the streets a tail
   without shipping a single byte of audio.
   --------------------------------------------------------------------- */
const Sfx = (function () {
  let ctx = null, master, limiter, busSfx, busAmb, verb, verbSend, noiseBuf;
  let voices = 0, muted = false, volume = 0.85;
  let windGain = null, rainGain = null, droneGain = null, droneOscs = [], tension = 0;

  const T = () => ctx.currentTime;
  const rnd2 = (a, b) => a + Math.random() * (b - a);

  /* ---- buffers ---- */
  function makeNoise (sec) {
    const len = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* Impulse response: decaying noise with a few early reflections, lightly
     damped so the tail is dark rather than hissy. */
  function makeIR (sec, decay, damp) {
    const rate = ctx.sampleRate, len = (rate * sec) | 0;
    const b = ctx.createBuffer(2, len, rate);
    const taps = [0.011, 0.019, 0.031, 0.047, 0.063, 0.089];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        lp += damp * (n - lp);
        d[i] = lp;
      }
      taps.forEach((tp, k) => {
        const idx = ((tp + ch * 0.003) * rate) | 0;
        if (idx < len) d[idx] += (k % 2 ? -1 : 1) * 0.5 / (k + 1);
      });
    }
    return b;
  }

  function init () {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6;
    limiter.ratio.value = 10; limiter.attack.value = 0.003; limiter.release.value = 0.20;

    master = ctx.createGain();
    master.gain.value = volume;
    limiter.connect(master);
    master.connect(ctx.destination);

    busSfx = ctx.createGain(); busSfx.gain.value = 0.95; busSfx.connect(limiter);
    busAmb = ctx.createGain(); busAmb.gain.value = 0.55; busAmb.connect(limiter);

    verb = ctx.createConvolver();
    verb.buffer = makeIR(2.4, 3.4, 0.28);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.42;
    verb.connect(verbSend); verbSend.connect(limiter);

    noiseBuf = makeNoise(2);
    startAmbience();
  }

  /* ---- routing helpers ---- */
  function panner (x, y, z, ref, max) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';        // cheap enough for dozens of voices
    p.distanceModel = 'inverse';
    p.refDistance = ref || 5;
    p.maxDistance = max || 150;
    p.rolloffFactor = 1.15;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
    return p;
  }

  /* Build the tail of a voice: gain -> [panner] -> buses. `send` is how much
     of it goes to the reverb. */
  function out (gainNode, at, send) {
    if (at) {
      const p = panner(at[0], at[1], at[2], at[3], at[4]);
      gainNode.connect(p);
      p.connect(busSfx);
      if (send) { const sg = ctx.createGain(); sg.gain.value = send; p.connect(sg); sg.connect(verb); }
    } else {
      gainNode.connect(busSfx);
      if (send) { const sg = ctx.createGain(); sg.gain.value = send; gainNode.connect(sg); sg.connect(verb); }
    }
  }

  function budget (hold) {
    if (!ctx || muted) return false;
    if (voices > 28) return false;         // keep a busy horde from turning to mush
    voices++;
    setTimeout(() => voices--, hold || 320);
    return true;
  }

  /* filtered noise burst */
  function noise (dur, f0, f1, q, gain, type, at, send, delay) {
    if (!ctx) return;
    const t = T() + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = rnd2(0.92, 1.08);
    const flt = ctx.createBiquadFilter();
    flt.type = type || 'lowpass';
    flt.Q.value = q || 1;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt); flt.connect(g);
    out(g, at, send);
    src.start(t); src.stop(t + dur + 0.03);
  }

  /* pitched tone */
  function tone (f0, f1, dur, gain, wave, at, send, delay) {
    if (!ctx) return;
    const t = T() + (delay || 0);
    const o = ctx.createOscillator();
    o.type = wave || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    out(g, at, send);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* ---- ambience: wind, a low city drone, and a tension layer ---- */
  function startAmbience () {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.055;
    src.connect(bp); bp.connect(windGain); windGain.connect(busAmb);
    src.start();

    // slow swell so the wind is not a flat hiss
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG); lfoG.connect(windGain.gain); lfo.start();

    // rain hiss: its own filtered noise so it can rise and fall with the front
    const rsrc = ctx.createBufferSource();
    rsrc.buffer = noiseBuf; rsrc.loop = true;
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass'; rhp.frequency.value = 1400;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rsrc.connect(rhp); rhp.connect(rainGain); rainGain.connect(busAmb);
    rsrc.start();

    droneGain = ctx.createGain(); droneGain.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    droneGain.connect(lp); lp.connect(busAmb);
    [41, 41.6, 61.5].forEach(f => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.30;
      o.connect(g); g.connect(droneGain); o.start();
      droneOscs.push(o);
    });
  }

  return {
    init,
    resume () { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get muted () { return muted; },

    setVolume (v) { volume = clamp(v, 0, 1); if (master) master.gain.value = muted ? 0 : volume; },
    getVolume () { return volume; },
    toggleMute () { muted = !muted; if (master) master.gain.value = muted ? 0 : volume; return muted; },

    /* wind rises with the weather; rain adds a hiss layer on top */
    setWind (level, rain) {
      if (!windGain) return;
      windGain.gain.setTargetAtTime(level + rain * 0.05, T(), 2.0);
      if (rainGain) rainGain.gain.setTargetAtTime(rain * 0.085, T(), 2.0);
    },
    thunder (dist) {
      if (!ctx || muted) return;
      const far = clamp(dist / 3.2, 0, 1);
      const g = 0.55 * (1 - far * 0.6);
      noise(1.6 + far * 1.4, 260 - far * 140, 70, 0.6, g, 'lowpass', null, 0.9);
      tone(70 - far * 24, 26, 1.9, g * 0.55, 'sawtooth', null, 0.8);
      if (far < 0.4) noise(0.05, 6000, 3000, 0.7, 0.30, 'highpass', null, 0.4);
    },

    /* dread rises with the wave count and drops between them */
    setTension (v) {
      tension = clamp(v, 0, 1);
      if (droneGain) droneGain.gain.setTargetAtTime(0.02 + tension * 0.11, T(), 1.5);
    },

    debug () {
      if (!ctx) return null;
      const L = ctx.listener;
      const g = (a, f) => (a ? a.value : f());
      return {
        state: ctx.state,
        volume: master ? +master.gain.value.toFixed(2) : null,
        voices,
        listenerPos: [ +g(L.positionX, () => 0).toFixed(2),
                       +g(L.positionY, () => 0).toFixed(2),
                       +g(L.positionZ, () => 0).toFixed(2) ],
        listenerFwd: [ +g(L.forwardX, () => 0).toFixed(2),
                       +g(L.forwardY, () => 0).toFixed(2),
                       +g(L.forwardZ, () => 0).toFixed(2) ],
      };
    },

    /* the listener rides the camera so panning matches what you are facing */
    listener (pos, fwd, up) {
      if (!ctx) return;
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
        L.forwardX.value = fwd.x;  L.forwardY.value = fwd.y;  L.forwardZ.value = fwd.z;
        L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
      } else {
        L.setPosition(pos.x, pos.y, pos.z);
        L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    },

    /* ---- weapons: a crack, a body and a tail rather than one flat burst ---- */
    shot (kind) {
      if (!budget()) return;
      const P = {
        pistol : { crack:0.34, body:[1900,240], dur:0.20, g:0.40, sub:[190,58,0.11,0.24], send:0.32 },
        smg    : { crack:0.26, body:[2400,320], dur:0.12, g:0.30, sub:[250,90,0.06,0.14], send:0.22 },
        shotgun: { crack:0.44, body:[1100,150], dur:0.40, g:0.60, sub:[120,38,0.26,0.34], send:0.48 },
        rifle  : { crack:0.38, body:[2100,260], dur:0.17, g:0.42, sub:[210,70,0.09,0.22], send:0.36 },
        magnum : { crack:0.50, body:[1400,180], dur:0.34, g:0.58, sub:[150,44,0.22,0.32], send:0.46 },
        sniper : { crack:0.62, body:[1000,120], dur:0.52, g:0.68, sub:[120,32,0.34,0.38], send:0.60 },
        lmg    : { crack:0.30, body:[1700,240], dur:0.15, g:0.44, sub:[190,66,0.08,0.20], send:0.30 },
        thump  : { crack:0.14, body:[520,150],  dur:0.20, g:0.34, sub:[230,70,0.16,0.30], send:0.30 },
      }[kind] || {};
      if (!P.body) return;
      noise(0.010, 6000, 4000, 0.7, P.crack, 'highpass', null, 0.12);   // transient
      noise(P.dur, P.body[0], P.body[1], 0.9, P.g, 'lowpass', null, P.send);
      tone(P.sub[0], P.sub[1], P.sub[2], P.sub[3], 'triangle', null, P.send * 0.5);
    },
    casing (delay) {
      if (!ctx || muted) return;
      for (let i = 0; i < 2; i++)
        noise(0.05, 5200, 3400, 7, 0.075, 'bandpass', null, 0.25, (delay || 0.32) + i * 0.09);
    },

    dry ()    { if (budget()) noise(0.045, 3800, 2600, 8, 0.20, 'bandpass'); },
    magOut () { if (budget()) { noise(0.05, 2400, 1500, 6, 0.16, 'bandpass');
                                tone(320, 200, 0.05, 0.07, 'square'); } },
    magIn ()  { if (budget()) { noise(0.06, 1500, 900, 5, 0.22, 'bandpass');
                                tone(150, 95, 0.06, 0.12, 'square', null, 0, 0.03);
                                noise(0.04, 3000, 2200, 9, 0.12, 'bandpass', null, 0, 0.10); } },

    /* ---- flesh, bone and armour ---- */
    flesh (at, armoured) {
      if (!budget()) return;
      if (armoured) {
        noise(0.09, 3000, 1200, 4, 0.30, 'bandpass', at, 0.25);
        tone(420, 180, 0.07, 0.16, 'square', at, 0.2);
      } else {
        noise(0.10, 620, 240, 1.1, 0.34, 'lowpass', at, 0.18);
        tone(150, 70, 0.08, 0.13, 'triangle', at, 0.1);
      }
    },
    kill (at) {
      if (!budget()) return;
      tone(180, 46, 0.44, 0.20, 'sawtooth', at, 0.35);
      noise(0.26, 420, 160, 1, 0.26, 'lowpass', at, 0.3);
    },
    growl (at) {
      if (!budget()) return;
      const f = rnd2(88, 138);
      tone(f, f * rnd2(0.5, 0.72), rnd2(0.6, 1.0), 0.13, 'sawtooth', at, 0.45);
      tone(f * 1.51, f * 0.9, rnd2(0.4, 0.7), 0.05, 'square', at, 0.3);
      noise(0.34, 900, 320, 1.4, 0.05, 'bandpass', at, 0.3);
    },
    bossRoar (at) {
      if (!ctx || muted) return;
      tone(96, 52, 1.7, 0.40, 'sawtooth', at, 0.7);
      tone(63, 38, 2.1, 0.30, 'square', at, 0.7);
      tone(150, 70, 1.3, 0.14, 'sawtooth', at, 0.6, 0.18);
      noise(1.5, 700, 200, 1.2, 0.16, 'bandpass', at, 0.6);
    },
    step (at, hard) {
      if (!budget()) return;
      noise(hard ? 0.07 : 0.10, hard ? 1800 : 900, hard ? 500 : 260,
            1.3, hard ? 0.075 : 0.055, 'lowpass', at, 0.14);
    },

    /* ---- player ---- */
    hurt () {
      if (!budget()) return;
      tone(280, 58, 0.30, 0.30, 'triangle');
      noise(0.18, 400, 150, 1, 0.28, 'lowpass', null, 0.2);
    },
    heartbeat (strength) {
      if (!ctx || muted) return;
      tone(58, 32, 0.14, 0.20 * strength, 'sine');
      tone(52, 28, 0.17, 0.15 * strength, 'sine', null, 0, 0.20);
    },
    pickup () { if (budget()) { tone(680, 1180, 0.10, 0.16, 'sine');
                                tone(1180, 1560, 0.09, 0.08, 'sine', null, 0, 0.07); } },
    unlock () { if (!ctx || muted) return;
                [520, 780, 1180].forEach((f, i) =>
                  tone(f, f * 1.5, 0.20, 0.16, 'square', null, 0.3, i * 0.11)); },
    wave ()   { if (!ctx || muted) return;
                tone(300, 300, 0.20, 0.20, 'square', null, 0.5);
                tone(450, 450, 0.34, 0.20, 'square', null, 0.5, 0.20);
                noise(0.9, 700, 200, 0.8, 0.10, 'bandpass', null, 0.6); },
    dead ()   { if (!ctx || muted) return;
                tone(210, 28, 1.7, 0.36, 'sawtooth', null, 0.7);
                tone(140, 22, 2.2, 0.22, 'square', null, 0.7, 0.1);
                noise(1.4, 500, 120, 0.9, 0.14, 'lowpass', null, 0.6); },

    /* ---- world ---- */
    boom (at) {
      if (!ctx || muted) return;
      noise(0.020, 7000, 5000, 0.8, 0.60, 'highpass', at, 0.2);
      noise(0.85, 900, 90, 0.7, 0.80, 'lowpass', at, 0.85);
      tone(120, 26, 0.75, 0.46, 'sawtooth', at, 0.7);
      noise(1.1, 320, 110, 0.6, 0.18, 'lowpass', at, 0.9, 0.12);   // debris tail
    },
    build (at) { if (budget()) { tone(340, 500, 0.08, 0.16, 'square', at, 0.2);
                                 noise(0.09, 1100, 500, 1.4, 0.16, 'lowpass', at, 0.25); } },
    thud (at)  { if (budget()) { noise(0.13, 340, 150, 1.2, 0.28, 'lowpass', at, 0.3);
                                 tone(120, 74, 0.10, 0.14, 'triangle', at, 0.2); } },
    crack (at) { if (budget()) { noise(0.34, 620, 200, 0.8, 0.42, 'lowpass', at, 0.55);
                                 tone(200, 54, 0.28, 0.22, 'sawtooth', at, 0.4);
                                 noise(0.5, 900, 300, 1.1, 0.14, 'bandpass', at, 0.5, 0.08); } },
    dig (at)   { if (budget()) { noise(0.55, 380, 120, 0.8, 0.32, 'lowpass', at, 0.4);
                                 tone(84, 46, 0.45, 0.18, 'sawtooth', at, 0.3); } },
    erupt (at) { if (!ctx || muted) return;
                 noise(0.40, 700, 180, 0.9, 0.55, 'lowpass', at, 0.6);
                 tone(240, 52, 0.34, 0.30, 'sawtooth', at, 0.5);
                 noise(0.7, 420, 140, 0.7, 0.16, 'lowpass', at, 0.7, 0.10); },
  };
})();

/* pack a world position for the audio panner */
function at3 (v, ref, max) { return v ? [v.x, v.y, v.z, ref || 5, max || 150] : null; }
function atXYZ (x, y, z, ref, max) { return [x, y, z, ref || 5, max || 150]; }

/* ---------------------------------------------------------------- textures
   Drawn into offscreen canvases so nothing is loaded from disk or network. */
function makeGroundTexture () {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#37313f'; x.fillRect(0,0,256,256);
  for (let i = 0; i < 5000; i++) {
    const v = Math.random()*26 | 0;
    x.fillStyle = `rgba(${v+22},${v+20},${v+26},${Math.random()*0.5})`;
    x.fillRect(Math.random()*256, Math.random()*256, 2, 2);
  }
  x.strokeStyle = 'rgba(190,180,160,.05)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0,128); x.lineTo(256,128); x.stroke();
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(70,70);
  return tex;
}

function makeWallTexture (base, lit) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0,0,128,128);
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random()*0.16})`;
    x.fillRect(Math.random()*128, Math.random()*128, 2, 2);
  }
  // windows: a few of them still have power
  for (let ry = 10; ry < 118; ry += 26) {
    for (let cx = 10; cx < 118; cx += 26) {
      const on = Math.random() < 0.22;
      x.fillStyle = on ? lit : 'rgba(8,8,12,.85)';
      x.fillRect(cx, ry, 14, 16);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1;
      x.strokeRect(cx+.5, ry+.5, 13, 15);
    }
  }
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  return tex;
}

/* ---------------------------------------------------------------- renderer */
const canvas   = $('view');
const renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.outputEncoding = T.sRGBEncoding;

/* Filmic tone mapping. The old pipeline dumped raw linear colour on the screen,
   so bright things clipped to flat white and everything else sat in a narrow
   band of grey. ACES rolls the highlights off the way film does, which is why
   muzzle flashes now bloom warm instead of turning into paper cutouts. */
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

/* Three quality tiers. Shadow maps are the expensive part, so LOW drops them
   entirely and pulls the render resolution back to 1:1. */
const GFX_TIERS = {
  high: { label:'HIGH', shadows:true,  shadowSize:2048, ratio:2,   grain:true  },
  med:  { label:'MED',  shadows:true,  shadowSize:1024, ratio:1.5, grain:true  },
  low:  { label:'LOW',  shadows:false, shadowSize:512,  ratio:1,   grain:false },
};
let gfxLevel = 'high';

function applyQuality (level, recompile) {
  if (!GFX_TIERS[level]) level = 'high';
  gfxLevel = level;
  const q = GFX_TIERS[level];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  sun.castShadow = q.shadows;
  if (sun.shadow.mapSize.x !== q.shadowSize) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  document.body.classList.toggle('nograin', !q.grain);
  // turning shadows on or off changes the shaders, so every material has to be
  // rebuilt — only ever happens on a menu click, never mid-frame
  if (recompile) scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}

const FOG = 0x272037;
const scene = new T.Scene();
scene.background = new T.Color(FOG);
scene.fog = new T.Fog(FOG, 55, 260);

const camera = new T.PerspectiveCamera(76, innerWidth/innerHeight, 0.06, 700);

// separate scene for the held weapon so it never clips through walls
const gunScene = new T.Scene();
const gunCam   = new T.PerspectiveCamera(58, innerWidth/innerHeight, 0.01, 12);

const hemi = new T.HemisphereLight(0x7c85b8, 0x332c3a, 1.15);
scene.add(hemi);

/* The sun casts real shadows now. A directional light has no position in the
   physical sense — only a direction — so instead of parking it over the map
   and stretching one huge shadow map across 400 metres, it rides along above
   the player with a tight 75-metre box. Same trick a torch on a helmet uses:
   light only what you can actually see, at full detail. */
const sun = new T.DirectionalLight(0xffd7ab, 0.80);
const sunDir = new T.Vector3(-70, 120, 60).normalize();
const sunTarget = new T.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -75;
sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75;
sun.shadow.camera.bottom = -75;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.55;
sun.shadow.radius = 2.2;
scene.add(sun);

const playerLamp = new T.PointLight(0xffd9a0, 1.15, 30, 2);
scene.add(playerLamp);

/* ------------------------------------------------------------------ sky
   The background used to be one flat colour, which is why the skyline had no
   depth — a wall of buildings against a wall of paint. A gradient dome, a
   moon and a few hundred stars cost almost nothing and give the horizon
   somewhere to sit. The dome rides with the camera so you can never reach it. */
const skyUni = {
  topCol: { value: new T.Color(0x0a0c1e) },
  midCol: { value: new T.Color(0x272037) },
  botCol: { value: new T.Color(0x272037) },
};
const skyDome = new T.Mesh(
  new T.SphereGeometry(400, 24, 16),
  new T.ShaderMaterial({
    uniforms: skyUni,
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader:
      'varying vec3 vP;\n' +
      'void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 topCol; uniform vec3 midCol; uniform vec3 botCol; varying vec3 vP;\n' +
      'void main(){\n' +
      '  float h = normalize(vP).y;\n' +
      '  vec3 c = mix(botCol, midCol, smoothstep(-0.08, 0.14, h));\n' +
      '  c = mix(c, topCol, smoothstep(0.08, 0.70, h));\n' +
      '  gl_FragColor = vec4(c, 1.0);\n' +
      '}',
  })
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -10;
skyDome.userData.noShadow = true;
scene.add(skyDome);

const STAR_N = 900;
const starPos = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) {
  const a = Math.random() * Math.PI * 2;
  const y = Math.random() * 0.95 + 0.02;
  const r = Math.sqrt(1 - y * y);
  starPos[i*3]   = Math.cos(a) * r * 360;
  starPos[i*3+1] = y * 360;
  starPos[i*3+2] = Math.sin(a) * r * 360;
}
const starGeo = new T.BufferGeometry();
starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
const starMat = new T.PointsMaterial({ color: 0xdfe6ff, size: 1.7, sizeAttenuation: false,
                                       transparent: true, opacity: 0, depthWrite: false,
                                       fog: false, toneMapped: false });
const stars = new T.Points(starGeo, starMat);
stars.frustumCulled = false;
stars.renderOrder = -9;
scene.add(stars);

const moonMat = new T.MeshBasicMaterial({ color: 0xf6f2e2, transparent: true, opacity: 0,
                                          depthWrite: false, fog: false, toneMapped: false });
const moon = new T.Mesh(new T.CircleGeometry(13, 28), moonMat);
moon.frustumCulled = false;
moon.renderOrder = -8;
scene.add(moon);
const MOON_DIR = new T.Vector3(0.46, 0.50, -0.73).normalize();

/* one shared radial-gradient sprite texture — every glow in the game is a
   tinted, scaled copy of it, so the whole lighting bloom costs one texture */
const glowTex = (function () {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,.55)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
})();

function glowSprite (color, size, opacity) {
  const s = new T.Sprite(new T.SpriteMaterial({
    map: glowTex, color: color, transparent: true, opacity: opacity === undefined ? 0.85 : opacity,
    blending: T.AdditiveBlending, depthWrite: false, fog: true, toneMapped: false,
  }));
  s.scale.set(size, size, 1);
  return s;
}

const moonGlow = glowSprite(0xbfd0ff, 92, 0);
moonGlow.renderOrder = -9;
scene.add(moonGlow);

/* ------------------------------------------------------------ day & night
   Two ways to play. NIGHT ONLY is the endless siege. CYCLE gives you five
   minutes of daylight to scavenge, build and repair with nothing hunting you,
   then five minutes of night when the waves come. Dawn burns off whatever is
   still standing. Dusk and dawn take 25 seconds so the light slides rather
   than snapping. */
const CYCLE = { day: 300, night: 300, blend: 25 };

const SKY = {
  night: { bg:0x272037, near:55, far:260, sun:0.80, sunCol:0xffd7ab,
           hemiUp:0x7c85b8, hemiDn:0x332c3a, hemi:1.15, lamp:1.15, sunY:120, sunX:-70 },
  day:   { bg:0x9db6cf, near:90, far:460, sun:1.45, sunCol:0xfff4e0,
           hemiUp:0xc2d6ec, hemiDn:0x76705f, hemi:1.70, lamp:0.00, sunY:190, sunX:60 },
};

const _skyA = new T.Color(), _skyB = new T.Color(), _skyC = new T.Color();
const _sunA = new T.Color(SKY.night.sunCol), _sunB = new T.Color(SKY.day.sunCol);
const _hUpA = new T.Color(SKY.night.hemiUp), _hUpB = new T.Color(SKY.day.hemiUp);
const _hDnA = new T.Color(SKY.night.hemiDn), _hDnB = new T.Color(SKY.day.hemiDn);
_skyA.setHex(SKY.night.bg); _skyB.setHex(SKY.day.bg);

/* t: 0 = full night, 1 = full noon */
function applySky (t) {
  const L = (a, b) => a + (b - a) * t;
  _skyC.copy(_skyA).lerp(_skyB, t);
  scene.background = _skyC;
  scene.fog.color.copy(_skyC);
  scene.fog.near = L(SKY.night.near, SKY.day.near) * (0.35 + wx.fogMul * 0.65);
  scene.fog.far  = L(SKY.night.far,  SKY.day.far)  * wx.fogMul;
  if (wx.dark > 0.001) _skyC.multiplyScalar(1 - wx.dark * 0.55);
  sun.intensity = L(SKY.night.sun, SKY.day.sun) * (1 - wx.dark);
  sun.color.copy(_sunA).lerp(_sunB, t);
  sunDir.set(L(SKY.night.sunX, SKY.day.sunX), L(SKY.night.sunY, SKY.day.sunY), 60).normalize();
  hemi.intensity = L(SKY.night.hemi, SKY.day.hemi) * (1 - wx.dark * 0.5);
  hemi.color.copy(_hUpA).lerp(_hUpB, t);
  hemi.groundColor.copy(_hDnA).lerp(_hDnB, t);
  playerLamp.intensity = L(SKY.night.lamp, SKY.day.lamp);

  // dome: horizon matches the fog exactly so the skyline dissolves into it,
  // the zenith pulls away toward deep blue (night) or open sky (day)
  skyUni.botCol.value.copy(scene.fog.color);
  skyUni.midCol.value.copy(_skyC);
  _topC.copy(_topN).lerp(_topD, t);
  skyUni.topCol.value.copy(_skyC).lerp(_topC, 0.78 * (1 - wx.dark * 0.6));

  const night = (1 - t) * (1 - wx.dark * 0.8);
  starMat.opacity = night * 0.95;
  stars.visible = starMat.opacity > 0.02;
  moonMat.opacity = night;
  moon.visible = night > 0.02;
  moonGlow.material.opacity = night * 0.5;
  moonGlow.visible = moon.visible;
}
const _topN = new T.Color(0x090c22), _topD = new T.Color(0x3d74c4), _topC = new T.Color();

/* ------------------------------------------------------------------ weather
   Rolls a new front every few minutes. Rain is a wrapping block of line
   segments that rides with you, so a thousand drops cover the whole map for
   the price of one draw call. Fog banks pull the draw distance in; storms add
   lightning that briefly lights the whole street. */
const WEATHER = {
  clear:   { rain:0.00, fogMul:1.00, dark:0.00, wind:0.055, label:'CLEAR' },
  drizzle: { rain:0.35, fogMul:0.82, dark:0.10, wind:0.100, label:'DRIZZLE' },
  rain:    { rain:1.00, fogMul:0.58, dark:0.24, wind:0.165, label:'RAIN' },
  fogbank: { rain:0.00, fogMul:0.26, dark:0.14, wind:0.070, label:'FOG' },
  storm:   { rain:1.30, fogMul:0.46, dark:0.34, wind:0.240, label:'STORM', lightning:true },
};
const WEATHER_ODDS = [['clear',0.42], ['drizzle',0.60], ['rain',0.80], ['fogbank',0.90], ['storm',1.00]];

const RAIN_N = 1400, RAIN_BOX = 46;
const rainPos = new Float32Array(RAIN_N * 6);
const rainVel = new Float32Array(RAIN_N);
for (let i = 0; i < RAIN_N; i++) {
  rainPos[i*6]   = rnd(-RAIN_BOX, RAIN_BOX);
  rainPos[i*6+1] = rnd(0, 34);
  rainPos[i*6+2] = rnd(-RAIN_BOX, RAIN_BOX);
  rainVel[i] = rnd(26, 40);
}
const rainGeo = new T.BufferGeometry();
rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
const rainMesh = new T.LineSegments(rainGeo,
  new T.LineBasicMaterial({ color: 0xaecbe4, transparent: true, opacity: 0.34 }));
rainMesh.frustumCulled = false;
rainMesh.visible = false;
scene.add(rainMesh);

const lightning = new T.DirectionalLight(0xdfeaff, 0);
lightning.position.set(30, 120, -40);
scene.add(lightning);

const wx = { rain:0, fogMul:1, dark:0, wind:0.055 };

function rollWeather (force) {
  let pick = force;
  if (!pick) {
    const r = Math.random();
    for (let i = 0; i < WEATHER_ODDS.length; i++)
      if (r <= WEATHER_ODDS[i][1]) { pick = WEATHER_ODDS[i][0]; break; }
  }
  game.weather = pick || 'clear';
  game.weatherT = rnd(150, 300);
  const W = WEATHER[game.weather];
  if (game.state === 'play' && W.label !== 'CLEAR') toast('WEATHER — ' + W.label);
}

function updateWeather (dt) {
  game.weatherT -= dt;
  if (game.weatherT <= 0) rollWeather();

  const W = WEATHER[game.weather] || WEATHER.clear;
  const k = Math.min(1, dt * 0.16);                 // fronts move in slowly
  wx.rain   += (W.rain   - wx.rain)   * k;
  wx.fogMul += (W.fogMul - wx.fogMul) * k;
  wx.dark   += (W.dark   - wx.dark)   * k;
  wx.wind   += (W.wind   - wx.wind)   * k;
  Sfx.setWind(wx.wind, wx.rain);

  rainMesh.visible = wx.rain > 0.02;
  if (rainMesh.visible) {
    rainMesh.material.opacity = 0.10 + wx.rain * 0.30;
    const slant = 2.2 + wx.rain * 3.2;
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 6;
      let y = rainPos[o+1] - rainVel[i] * wx.rain * dt;
      let x = rainPos[o]   + slant * dt;
      if (y < -2) { y = rnd(28, 38); x = rnd(-RAIN_BOX, RAIN_BOX); rainPos[o+2] = rnd(-RAIN_BOX, RAIN_BOX); }
      if (x >  RAIN_BOX) x -= RAIN_BOX * 2;
      rainPos[o]   = x;  rainPos[o+1] = y;
      rainPos[o+3] = x - slant * 0.045;
      rainPos[o+4] = y - 0.85 - wx.rain * 0.5;      // streak length
      rainPos[o+5] = rainPos[o+2];
    }
    rainMesh.position.set(player.pos.x, 0, player.pos.z);
    rainGeo.attributes.position.needsUpdate = true;
  }

  lightning.intensity *= Math.max(0, 1 - dt * 6);
  if (W.lightning && game.state === 'play' && Math.random() < dt * 0.10) {
    lightning.intensity = rnd(2.2, 4.0);
    const dist = rnd(0.4, 3.2);
    setTimeout(() => { if (game.state === 'play') Sfx.thunder(dist); }, dist * 1000);
  }
}

function isDay () { return game.mode === 'cycle' && game.phase === 'day'; }

function goNight (announce) {
  game.phase = 'night';
  game.phaseT = CYCLE.night;
  if (announce) { banner('NIGHTFALL'); Sfx.wave(); }
  game.inBreak = true;
  game.breakT = announce ? 4 : 3.5;      // brief lull, then the wave starts
}

function goDay () {
  game.phase = 'day';
  game.phaseT = CYCLE.day;
  game.toSpawn = 0;
  game.bossQueue = null;
  banner('DAYBREAK');
  toast('THE HORDE BURNS OFF — GATHER AND BUILD');
  Sfx.unlock();
  // anything still on its feet cooks in the sun over the next few seconds
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.alive && !z.dying) z.sunT = rnd(0.4, 7);
  }
}

function updateCycle (dt) {
  if (game.mode !== 'cycle') {
    if (game.light !== 0) { game.light = 0; applySky(0); }
    return;
  }
  game.phaseT -= dt;
  if (game.phaseT <= 0) { if (game.phase === 'day') goNight(true); else goDay(); }

  const target = game.phase === 'day' ? 1 : 0;
  const rate = dt / CYCLE.blend;
  game.light = clamp(game.light + clamp(target - game.light, -rate, rate), 0, 1);
  applySky(game.light);
}

/* three-point rig: the Phong metals need a key and a rim to read as metal */
gunScene.add(new T.HemisphereLight(0x8d95b8, 0x2a2430, 0.55));
const gunKey = new T.DirectionalLight(0xfff2dc, 1.05);
gunKey.position.set(0.75, 1.15, 1.20);
gunScene.add(gunKey);
const gunRim = new T.DirectionalLight(0x9fc0ff, 0.75);
gunRim.position.set(-1.0, 0.35, -0.85);
gunScene.add(gunRim);
const gunFill = new T.DirectionalLight(0xffb37a, 0.28);
gunFill.position.set(-0.2, -1.0, 0.6);
gunScene.add(gunFill);

/* ---------------------------------------------------------------- world */
const obstacles = [];              // { x, z, hx, hz, h }
const solids    = [];              // meshes bullets collide with
const buckets   = new Map();       // "cx,cz" -> obstacle index array

function bucketKey (cx, cz) { return cx + ',' + cz; }

function addObstacle (mesh, x, z, hx, hz, y0, y1, extra) {
  // A mesh keeps an identity matrixWorld until the next render, so anything
  // built mid-frame would be raycast at the origin instead of where it stands
  // — bullets and turret fire would pass straight through a fresh wall.
  if (mesh) mesh.updateMatrixWorld();
  const o = { x, z, hx, hz, y0, y1, mesh };
  if (extra) for (const k in extra) o[k] = extra[k];
  const i = obstacles.push(o) - 1;
  o.index = i;
  if (mesh) solids.push(mesh);
  const x0 = Math.floor((x - hx + MAP_HALF) / GRID_CELL);
  const x1 = Math.floor((x + hx + MAP_HALF) / GRID_CELL);
  const z0 = Math.floor((z - hz + MAP_HALF) / GRID_CELL);
  const z1 = Math.floor((z + hz + MAP_HALF) / GRID_CELL);
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const k = bucketKey(cx, cz);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    }
}

/* shared primitives — declared before anything that builds meshes from them */
const boxGeo  = new T.BoxGeometry(1,1,1);
const cylGeo  = new T.CylinderGeometry(1, 1, 1, 14);
const coneGeo = new T.ConeGeometry(1, 1, 10);
const sphGeo  = new T.SphereGeometry(1, 8, 6);

/* Nine shared facade materials (3 looks x 3 tile densities) instead of a
   fresh texture per building — same variety on screen, a fraction of the
   GPU memory and shader compiles. */
const wallMats = [];
[['#3c3542','rgba(255,190,110,.85)'],
 ['#4a3d3c','rgba(150,200,255,.6)'],
 ['#33323f','rgba(255,150,90,.55)']].forEach(pair => {
  const base = makeWallTexture(pair[0], pair[1]);
  [[2,2],[3,4],[3,6]].forEach(rep => {
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.repeat.set(rep[0], rep[1]);
    wallMats.push(new T.MeshLambertMaterial({ map: tex }));
  });
});
const roofMat = new T.MeshLambertMaterial({ color: 0x201c26 });
const yardMat = new T.MeshLambertMaterial({ color: 0x2c2833 });
const poleMat = new T.MeshLambertMaterial({ color: 0x2a2730 });
const glassMat = new T.MeshLambertMaterial({ color: 0x1b1b22 });
const crateMat = new T.MeshLambertMaterial({ color: 0x5a4a34 });
const carMats  = [0x59323a, 0x2e4457, 0x4a4a52, 0x3f5340].map(c => new T.MeshLambertMaterial({ color:c }));

function box (mat, x, y, z, sx, sy, sz, solid) {
  const m = new T.Mesh(boxGeo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (worldBuilding) m.userData.bake = true;
  scene.add(m);
  if (solid) addObstacle(m, x, z, sx/2, sz/2, y - sy/2, y + sy/2);
  return m;
}

/* a walkable slab you can also pass beneath */
function platform (mat, x, y, z, sx, sz, thick) {
  const t = thick || 0.34;
  return box(mat, x, y - t/2, z, sx, t, sz, true);
}

/* a slope from loY up to hiY along one axis; dir +1 climbs with the axis */
function ramp (mat, x, z, loY, hiY, axis, dir, len, wide) {
  const rise = hiY - loY;
  const m = new T.Mesh(boxGeo, mat);
  const ang = Math.atan2(rise, len);
  m.position.set(x, (loY + hiY) / 2 - 0.14, z);
  if (axis === 'x') {
    m.scale.set(Math.hypot(len, rise), 0.30, wide);
    m.rotation.z = dir > 0 ? ang : -ang;
  } else {
    m.scale.set(wide, 0.30, Math.hypot(len, rise));
    m.rotation.x = dir > 0 ? -ang : ang;
  }
  if (worldBuilding) m.userData.bake = true;
  scene.add(m);
  const hx = axis === 'x' ? len/2 : wide/2;
  const hz = axis === 'x' ? wide/2 : len/2;
  addObstacle(m, x, z, hx, hz, loY, hiY, { ramp:true, axis, dir });
  return m;
}

/* railing posts + top rail: decoration only, so you can still jump off */
function railing (mat, x, y, z, sx, sz) {
  box(mat, x, y + 0.55, z, sx, 0.08, sz, false);
  const n = Math.max(2, Math.round(Math.max(sx, sz) / 1.6));
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5);
    box(mat, x + (sx > sz ? f * sx : 0), y + 0.28, z + (sz >= sx ? f * sz : 0),
        0.09, 0.55, 0.09, false);
  }
}

/* Scaffold tower. The ramp's high end sits exactly on the deck edge — if it
   stops short, the last step is taller than anyone can climb and the whole
   structure becomes decoration. */
function watchtower (x, z) {
  const legMat = yardMat, deckMat = roofMat;
  const S = 6.0, half = S/2, DECK = 4.5, L = 6.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    box(legMat, x + sx*(half-0.4), DECK/2, z + sz*(half-0.4), 0.42, DECK, 0.42, true);
  platform(deckMat, x, DECK, z, S, S);
  railing(legMat, x - half + 0.1, DECK, z, 0.1, S);
  railing(legMat, x + half - 0.1, DECK, z, 0.1, S);
  railing(legMat, x, DECK, z - half + 0.1, S, 0.1);
  ramp(deckMat, x, z + half + L/2, 0, DECK, 'z', -1, L, 2.8);
  box(legMat, x, DECK + 1.1, z, 0.9, 2.2, 0.9, false);      // lamp mast
  const bulb = new T.Mesh(new T.SphereGeometry(0.34, 8, 6),
                          new T.MeshBasicMaterial({ color:0xffcf8a }));
  bulb.position.set(x, DECK + 2.4, z); scene.add(bulb);
}

/* stacked containers with a ramp onto the low one */
/* Four shared materials, not one per crate. Two meshes can only be drawn in a
   single call if they point at the *same* material object — a new
   MeshLambertMaterial per container, even in an identical colour, is a
   different object and forces its own draw call. */
const containerMats = [0x9a5a3c, 0x3d6b7a, 0x6b7a3d, 0x7a3d55]
  .map(c => new T.MeshLambertMaterial({ color: c }));

function containerStack (x, z) {
  const mat = () => containerMats[(Math.random() * containerMats.length) | 0];
  const rot = Math.random() < 0.5;
  const W = rot ? 2.6 : 7.2, D = rot ? 7.2 : 2.6;
  box(mat(), x, 1.35, z, W, 2.7, D, true);
  if (Math.random() < 0.7) box(mat(), x + (rot ? 0 : 1.1), 4.05, z + (rot ? 1.1 : 0), W, 2.7, D, true);
  const L = 5.0;
  if (rot) ramp(roofMat, x + W/2 + L/2, z, 0, 2.7, 'x', -1, L, 2.4);
  else     ramp(roofMat, x, z + D/2 + L/2, 0, 2.7, 'z', -1, L, 2.4);
}

const roofTops = [];

/* True only while buildWorld runs, so the primitives above can tell permanent
   scenery apart from pooled meshes (blood, pickups, tracers) that were created
   earlier and must never be baked into the static batch. */
let worldBuilding = false;

/* Walk the whole scene once and opt every solid mesh into the shadow pass.
   MeshBasicMaterial is skipped on purpose — that is what the invisible
   hitboxes, lamp bulbs and muzzle flashes use, and none of them should be
   throwing a silhouette. */
function enableShadows (root) {
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (o.material.isMeshBasicMaterial || o.material.visible === false) return;
    if (o.userData.noShadow) return;      // sky dome, moon: 400m of nothing
    o.castShadow = !o.userData.noCast;
    o.receiveShadow = true;
  });
}

/* Runtime meshes miss the one-time walk above, so anything built, dropped or
   spawned mid-run opts in through here instead. */
function shadowify (obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (o.material.isMeshBasicMaterial || o.material.visible === false) return;
    if (o.userData.noShadow) return;
    o.castShadow = !o.userData.noCast;
    o.receiveShadow = true;
  });
}

function buildWorld () {
  worldBuilding = true;
  // ground
  const g = new T.Mesh(new T.PlaneGeometry(MAP_HALF*2, MAP_HALF*2),
                       new T.MeshLambertMaterial({ map: makeGroundTexture() }));
  g.rotation.x = -Math.PI/2;
  g.userData.noCast = true;      // a flat plane shadowing itself is just acne
  scene.add(g);

  // perimeter — the city is fenced in, so the horde always finds you
  const W = 9, L = MAP_HALF*2;
  const pm = new T.MeshLambertMaterial({ color:0x241f27 });
  box(pm,  0, W/2, -MAP_HALF, L, W, 4, true);
  box(pm,  0, W/2,  MAP_HALF, L, W, 4, true);
  box(pm, -MAP_HALF, W/2, 0, 4, W, L, true);
  box(pm,  MAP_HALF, W/2, 0, 4, W, L, true);

  /* Roof heights snap to fixed tiers. Random heights meant almost no two roofs
     lined up, so bridges could never span them — quantising is what turns a
     scattering of rooftops into a network you can actually cross. */
  const CELLS = 9, SIZE = 40, OFF = -(CELLS*SIZE)/2 + SIZE/2;
  for (let ix = 0; ix < CELLS; ix++) {
    for (let iz = 0; iz < CELLS; iz++) {
      const cx = OFF + ix*SIZE, cz = OFF + iz*SIZE;
      if (Math.abs(cx) < 26 && Math.abs(cz) < 26) continue;   // open plaza at spawn
      const kind = Math.random();

      if (kind < 0.62)      tieredBlock(cx, cz);
      else if (kind < 0.68) tallLandmark(cx, cz);
      else if (kind < 0.78) { containerStack(cx + rnd(-8,8), cz + rnd(-8,8));
                              if (Math.random() < 0.6) containerStack(cx + rnd(-12,12), cz + rnd(-12,12)); }
      else if (kind < 0.86) openYard(cx, cz);
      else if (kind < 0.93) watchtower(cx + rnd(-4,4), cz + rnd(-4,4));
      else junkLot(cx, cz);

      if (Math.random() < 0.30) {                              // street lamp
        const lx = cx + SIZE/2 - 2, lz = cz + SIZE/2 - 2;
        box(poleMat, lx, 3, lz, 0.35, 6, 0.35, false);
        const bulb = new T.Mesh(new T.SphereGeometry(0.4, 8, 6),
                                new T.MeshBasicMaterial({ color:0xffcf8a }));
        bulb.position.set(lx, 6.1, lz);
        scene.add(bulb);
        const halo = glowSprite(0xffc27a, 5.2, 0.55);
        halo.position.set(lx, 6.1, lz);
        scene.add(halo);
      }
    }
  }

  linkRoofs();

  // guaranteed climb right by the plaza, whatever the dice did
  watchtower(20, 20);
  containerStack(-18, 16);
  tieredBlock(-30, -34, 6);
  tieredBlock(4, -40, 9);
  worldBuilding = false;
}

/* ==================================================================== static
   batching

   Every wall, crate, railing post and roof panel used to be its own Mesh, which
   means its own draw call: the CPU stops, hands the GPU one box, waits, hands
   it the next. Roughly fifteen hundred of those a frame, doubled again now that
   shadows re-render the same scenery from the sun's point of view.

   Nothing in the city ever moves or breaks, so all of it can be welded into a
   handful of big meshes ahead of time — think posting three hundred letters
   individually versus putting them all in one parcel. Same contents, one trip.

   Two things keep this honest:

   * Meshes are grouped by CHUNK as well as by material. One mesh spanning the
     whole map would have a map-sized bounding box, so the GPU could never skip
     the half of the city behind you. Chunked, culling still works per block.
   * The original meshes stay alive in `solids` for bullet raycasts, they are
     just removed from the scene. A Mesh does not need a parent to be raycast —
     it only needs a current matrixWorld, which addObstacle already guarantees.
   ====================================================================== */
const BAKE_CHUNK = 80;

function mergeMeshes (meshes, material) {
  let vTotal = 0;
  const parts = [];
  for (let i = 0; i < meshes.length; i++) {
    const src = meshes[i].geometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(meshes[i].matrixWorld);      // also fixes normals via the normal matrix
    parts.push(g);
    vTotal += g.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv  = new Float32Array(vTotal * 2);
  let v = 0;
  for (let i = 0; i < parts.length; i++) {
    const g = parts[i];
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, v * 3);
    if (n) nor.set(n.array, v * 3);
    if (u) uv.set(u.array, v * 2);
    v += p.count;
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new T.BufferAttribute(nor, 3));
  out.setAttribute('uv',       new T.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  const m = new T.Mesh(out, material);
  m.matrixAutoUpdate = false;                   // it will never move again
  return m;
}

function bakeStatic () {
  scene.updateMatrixWorld(true);

  const groups = new Map();
  const mats = [];
  const originals = [];

  for (let i = 0; i < scene.children.length; i++) {
    const o = scene.children[i];
    if (!o.isMesh || !o.userData.bake || !o.material || Array.isArray(o.material)) continue;
    let mi = mats.indexOf(o.material);
    if (mi < 0) { mi = mats.length; mats.push(o.material); }
    const cx = Math.floor(o.position.x / BAKE_CHUNK);
    const cz = Math.floor(o.position.z / BAKE_CHUNK);
    const key = cx + '|' + cz + '|' + mi;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
    originals.push(o);
  }

  let baked = 0;
  groups.forEach((list, key) => {
    if (list.length < 2) return;                // a lone mesh gains nothing
    const mat = mats[+key.split('|')[2]];
    const m = mergeMeshes(list, mat);
    m.userData.noCast = mat.isMeshBasicMaterial;
    scene.add(m);
    baked++;
    for (let i = 0; i < list.length; i++) list[i].userData.baked = true;
  });

  // pull the originals out of the scene; solids still holds them for raycasts
  for (let i = 0; i < originals.length; i++) {
    if (originals[i].userData.baked) scene.remove(originals[i]);
    else originals[i].matrixAutoUpdate = false;
  }

  return { source: originals.length, batches: baked };
}

/* ---- building kinds ------------------------------------------------------ */

/* Roof heights are quantised to a 3m ladder. The spacing matters: bridges span
   roofs on the same rung, and ramp bridges climb exactly one rung, so a uniform
   step is what turns scattered rooftops into a connected skyline. */
const ROOF_TIERS  = [6, 9, 12, 15, 18, 21, 24, 27, 30];
const TIER_WEIGHT = [20, 18, 16, 12, 10,  8,  6,  5,  5];
const TIER_TOTAL  = TIER_WEIGHT.reduce((a, b) => a + b, 0);

function pickTier (fromIdx) {
  const lo = fromIdx || 0;
  let total = 0;
  for (let i = lo; i < TIER_WEIGHT.length; i++) total += TIER_WEIGHT[i];
  let r = Math.random() * total;
  for (let i = lo; i < ROOF_TIERS.length; i++) {
    r -= TIER_WEIGHT[i];
    if (r <= 0) return ROOF_TIERS[i];
  }
  return ROOF_TIERS[ROOF_TIERS.length - 1];
}

/* segmented parapet: cover along the edges with a gap in the middle of each
   side so bridges and fire escapes have somewhere to land */
function parapet (px, pz, w, d, h) {
  const t = 0.5, ph = 1.05, gap = 5.0;
  const seg = (sx, sz, len, along) => {
    if (len < 0.6) return;
    box(roofMat, sx, h + ph/2, sz, along === 'x' ? len : t, ph, along === 'x' ? t : len, true);
    obstacles[obstacles.length - 1].parapet = true;
  };
  const halfRun = (w - gap) / 2, halfRunZ = (d - gap) / 2;
  [-1, 1].forEach(s => {
    seg(px + s * (gap/2 + halfRun/2), pz - d/2 + t/2, halfRun, 'x');
    seg(px + s * (gap/2 + halfRun/2), pz + d/2 - t/2, halfRun, 'x');
    seg(px - w/2 + t/2, pz + s * (gap/2 + halfRunZ/2), halfRunZ, 'z');
    seg(px + w/2 - t/2, pz + s * (gap/2 + halfRunZ/2), halfRunZ, 'z');
  });
}

/* switchback fire escape up the side of a building, every junction flush */
function fireEscape (px, pz, w, h, side) {
  const ex = px + side * (w/2 + 1.4);
  const A = 3.3, LAND = 4.2, RUN = 2*A - LAND + 0.4;
  let y = 0, k = 0;
  while (y < h - 0.05 && k < 12) {
    const zNow  = pz + ((k % 2) ? -A : A);
    const zNext = pz + (((k + 1) % 2) ? -A : A);
    const next  = Math.min(y + 3.3, h);
    platform(roofMat, ex, next, zNext, LAND, LAND);
    railing(yardMat, ex + side * (LAND/2 - 0.1), next, zNext, 0.1, LAND);
    ramp(roofMat, ex, pz, y, next, 'z', zNext < zNow ? -1 : 1, RUN, 2.4);
    y = next; k++;
  }
}

/* a block with a usable roof: parapet cover, clutter, and a way up */
function tieredBlock (cx, cz, forceH) {
  const h = forceH || pickTier();
  const w = rnd(14, 19), d = rnd(14, 19);
  const px = cx + rnd(-4, 4), pz = cz + rnd(-4, 4);
  const look = (Math.random()*3 | 0) * 3;
  const dens = h > 15 ? 2 : h > 8 ? 1 : 0;
  box(wallMats[look + dens], px, h/2, pz, w, h, d, true);
  parapet(px, pz, w, d, h);

  // rooftop clutter doubles as cover
  for (let i = 0; i < 3; i++) {
    const bw = rnd(1.4, 2.6), bh = rnd(0.9, 1.8), bd = rnd(1.4, 2.6);
    box(yardMat, px + rnd(-w/2 + 2.5, w/2 - 2.5), h + bh/2,
        pz + rnd(-d/2 + 2.5, d/2 - 2.5), bw, bh, bd, true);
    obstacles[obstacles.length - 1].clutter = true;
  }
  fireEscape(px, pz, w, h, Math.random() < 0.5 ? 1 : -1);
  roofTops.push({ x:px, z:pz, y:h, hx:w/2, hz:d/2 });
}

/* tall scenery — no roof access, just skyline */
/* A tower. Previously this drew a box and walked away — no registered roof, so
   no bridge could ever reach it and no fire escape climbed it. Now it takes a
   tier off the top of the ladder and joins the network like anything else. */
function tallLandmark (cx, cz) {
  const h = pickTier(5);                       // 21m and up
  const w = rnd(12, 17), d = rnd(12, 17);
  const px = cx + rnd(-4, 4), pz = cz + rnd(-4, 4);
  const look = (Math.random()*3 | 0) * 3;
  box(wallMats[look + 2], px, h/2, pz, w, h, d, true);
  parapet(px, pz, w, d, h);

  // roof furniture: a water tank and vent housings, all climbable cover
  const tank = new T.Mesh(cylGeo, yardMat);
  tank.position.set(px + rnd(-3, 3), h + 1.5, pz + rnd(-3, 3));
  tank.scale.set(1.8, 3.0, 1.8);
  scene.add(tank);
  addObstacle(tank, tank.position.x, tank.position.z, 1.8, 1.8, h, h + 3.0, { clutter:true });
  for (let i = 0; i < 2; i++) {
    const bw = rnd(1.6, 2.8), bh = rnd(1.0, 1.9);
    box(yardMat, px + rnd(-w/2 + 3, w/2 - 3), h + bh/2,
        pz + rnd(-d/2 + 3, d/2 - 3), bw, bh, rnd(1.6, 2.8), true);
    obstacles[obstacles.length - 1].clutter = true;
  }

  fireEscape(px, pz, w, h, Math.random() < 0.5 ? 1 : -1);
  roofTops.push({ x:px, z:pz, y:h, hx:w/2, hz:d/2 });
}

/* Walled yard. Every side now has a doorway and there is a ramp onto the wall,
   so nothing can be sealed inside — the old version added a fourth wall on a
   coin flip and turned the yard into a pit that trapped the whole wave. */
function openYard (cx, cz) {
  const w = rnd(20, 30), d = rnd(20, 30), h = rnd(2.6, 3.6), t = 1.0, gap = 6.0;
  const m = yardMat;
  const runX = (w - gap) / 2, runZ = (d - gap) / 2;
  [-1, 1].forEach(s => {
    box(m, cx + s * (gap/2 + runX/2), h/2, cz - d/2, runX, h, t, true);
    box(m, cx + s * (gap/2 + runX/2), h/2, cz + d/2, runX, h, t, true);
    box(m, cx - w/2, h/2, cz + s * (gap/2 + runZ/2), t, h, runZ, true);
    box(m, cx + w/2, h/2, cz + s * (gap/2 + runZ/2), t, h, runZ, true);
  });
  // a ramp onto the wall top, so the yard is high ground rather than a trap
  ramp(roofMat, cx, cz - d/2 - 3.2, 0, h, 'z', 1, 6.0, 2.4);
  platform(roofMat, cx, h, cz - d/2, gap + 1.0, t + 1.6);
  for (let i = 0; i < 4; i++) {
    const sz2 = rnd(1.2, 2.2);
    box(crateMat, cx + rnd(-w/3, w/3), sz2/2, cz + rnd(-d/3, d/3), sz2, sz2, sz2, true);
  }
}

function junkLot (cx, cz) {
  for (let i = 0; i < 5; i++) {
    if (Math.random() < 0.55) {
      const px = cx + rnd(-14,14), pz = cz + rnd(-14,14);
      const rot = Math.random() < 0.5;
      const bw = rot ? 2.1 : 4.6, bd = rot ? 4.6 : 2.1;
      box(carMats[(Math.random()*carMats.length)|0], px, 0.75, pz, bw, 1.5, bd, true);
      box(glassMat, px, 1.75, pz, bw*0.62, 0.9, bd*0.62, false);
    } else {
      const sz2 = rnd(1.1, 2.4);
      box(crateMat, cx + rnd(-15,15), sz2/2, cz + rnd(-15,15), sz2, sz2, sz2, true);
    }
  }
}

/* ---- the rooftop network ------------------------------------------------- */

/* Is the gap between two roof edges clear? Sampling must start outside both
   buildings, otherwise every candidate collides with its own end points. */
function spanClear (x0, z0, x1, z1, ya, yb) {
  const yEnd = yb === undefined ? ya : yb;
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    // a sloped span must be tested along its own climb, not at the low end,
    // or it always reads as blocked by the taller building it is reaching for
    const y = ya + (yEnd - ya) * f;
    if (!isClear(x0 + (x1-x0)*f, z0 + (z1-z0)*f, 1.1, y + 0.5, y + 2.3)) return false;
  }
  return true;
}

/* Clear the bridge's landing zone. Parapets give it a doorway, and rooftop
   clutter gets moved out of the way — an air-conditioning unit parked in the
   entrance is the difference between a bridge and a dead end. */
function clearLanding (mx, mz, hx, hz, y) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.dead || (!o.parapet && !o.clutter)) continue;
    if (o.y0 < y - 0.7 || o.y0 > y + 0.7) continue;      // must sit on this roof
    if (Math.abs(o.x - mx) > o.hx + hx + 0.4) continue;
    if (Math.abs(o.z - mz) > o.hz + hz + 0.4) continue;
    killObstacle(o);
  }
}

/* Flat bridges between roofs at the same tier, and ramp bridges between roofs
   one tier apart, so the roofscape is a connected network you can climb. */
function linkRoofs () {
  let flat = 0, sloped = 0;
  for (let a = 0; a < roofTops.length; a++) {
    for (let b = a + 1; b < roofTops.length; b++) {
      if (flat >= 70 && sloped >= 30) return;
      const A = roofTops[a], B = roofTops[b];
      const dy = B.y - A.y;
      const dx = B.x - A.x, dz = B.z - A.z;
      const alongX = Math.abs(dx) > Math.abs(dz);
      // roofs only need to roughly face each other; block jitter is up to 8m
      if (alongX ? Math.abs(dz) > 9.5 : Math.abs(dx) > 9.5) continue;
      const gapC = Math.hypot(dx, dz);
      const inset = alongX ? A.hx + B.hx : A.hz + B.hz;
      const span = gapC - inset;
      if (span < 3 || span > 34) continue;

      // provisional; recomputed from the true edge points below
      let mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, len = span + 3.0;

      // sample from just outside each roof edge
      const ux = dx / gapC, uz = dz / gapC;
      const insA = (alongX ? A.hx : A.hz) + 0.6, insB = (alongX ? B.hx : B.hz) + 0.6;
      const ex0 = A.x + ux * insA, ez0 = A.z + uz * insA;
      const ex1 = B.x - ux * insB, ez1 = B.z - uz * insB;

      // deck sits on the gap's own midpoint so both ends land on their roofs
      mx = (ex0 + ex1) / 2; mz = (ez0 + ez1) / 2;
      len = Math.hypot(ex1 - ex0, ez1 - ez0) + 3.4;

      if (Math.abs(dy) < 0.6 && flat < 70) {                       // level walkway
        if (!spanClear(ex0, ez0, ex1, ez1, A.y)) continue;
        platform(roofMat, mx, A.y, mz, alongX ? len : 3.0, alongX ? 3.0 : len);
        obstacles[obstacles.length - 1].bridge = true;
        clearLanding(mx, mz, alongX ? len/2 : 2.0, alongX ? 2.0 : len/2, A.y);
        railing(yardMat, mx, A.y, mz + (alongX ? 1.5 : 0), alongX ? len : 0.1, alongX ? 0.1 : len);
        railing(yardMat, mx, A.y, mz - (alongX ? 1.5 : 0), alongX ? len : 0.1, alongX ? 0.1 : len);
        flat++;
      } else if (Math.abs(Math.abs(dy) - 3) < 0.8 && span >= 5 && span <= 26 && sloped < 34) {
        if (!spanClear(ex0, ez0, ex1, ez1, A.y, B.y)) continue;
        const lowY = Math.min(A.y, B.y), hiY = Math.max(A.y, B.y);
        // the slope must rise toward whichever roof is taller
        const risesWithAxis = alongX ? (dx > 0) === (dy > 0) : (dz > 0) === (dy > 0);
        ramp(roofMat, mx, mz, lowY, hiY, alongX ? 'x' : 'z',
             risesWithAxis ? 1 : -1, len, 3.0);
        obstacles[obstacles.length - 1].bridge = true;
        clearLanding(mx, mz, alongX ? len/2 : 2.1, alongX ? 2.1 : len/2, lowY);
        clearLanding(mx, mz, alongX ? len/2 : 2.1, alongX ? 2.1 : len/2, hiY);
        sloped++;
      }
    }
  }
}


/* --------------------------------------------------- collision resolution
   Think of the player as a soup can sliding across a table of shoeboxes:
   if the can overlaps a box, we shove it out along whichever side it has
   sunk into least. Cheap, and it never lets you tunnel through a wall. */
const nearby = [];
const hitInfo = { blocker: null };
const atVec = new T.Vector3();
/* Bullets used to be tested against every solid mesh in the city — roughly
   fifteen hundred of them, nine times over for a shotgun blast, plus a fresh
   1500-element array allocated per shot by solids.concat(). The obstacles are
   already sorted into a 20-metre grid for collision, so march the ray through
   that grid instead and only hand the raycaster the meshes it could plausibly
   touch. Looking up a street name in an A-to-Z rather than reading the whole
   book: same answer, a fraction of the paper.

   `rayStamp` is a visited-marker so an obstacle spanning four buckets is still
   only added once, without the cost of an indexOf per candidate. */
let rayStamp = new Int32Array(8192);
let rayEpoch = 0;
const rayHitList = [];

function solidsAlong (origin, dir, far, extra) {
  if (rayStamp.length < obstacles.length) {      // player built past the marker array
    const bigger = new Int32Array(obstacles.length * 2);
    bigger.set(rayStamp);
    rayStamp = bigger;
  }
  rayEpoch++;
  rayHitList.length = 0;
  const step = GRID_CELL * 0.5;
  const n = Math.ceil(far / step) + 1;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(i * step, far);
    const px = origin.x + dir.x * t;
    const pz = origin.z + dir.z * t;
    const cx = Math.floor((px + MAP_HALF) / GRID_CELL);
    const cz = Math.floor((pz + MAP_HALF) / GRID_CELL);
    // a 3x3 of buckets, so anything straddling a boundary is still caught
    for (let ax = cx - 1; ax <= cx + 1; ax++)
      for (let az = cz - 1; az <= cz + 1; az++) {
        const list = buckets.get(bucketKey(ax, az));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const idx = list[k];
          if (rayStamp[idx] === rayEpoch) continue;
          rayStamp[idx] = rayEpoch;
          const o = obstacles[idx];
          if (o && o.mesh && !o.dead) rayHitList.push(o.mesh);
        }
      }
  }
  if (extra) for (let i = 0; i < extra.length; i++) rayHitList.push(extra[i]);
  return rayHitList;
}

function collectNearby (x, z, pad) {
  nearby.length = 0;
  const c0 = Math.floor((x - pad + MAP_HALF) / GRID_CELL);
  const c1 = Math.floor((x + pad + MAP_HALF) / GRID_CELL);
  const r0 = Math.floor((z - pad + MAP_HALF) / GRID_CELL);
  const r1 = Math.floor((z + pad + MAP_HALF) / GRID_CELL);
  for (let cx = c0; cx <= c1; cx++)
    for (let cz = r0; cz <= r1; cz++) {
      const arr = buckets.get(bucketKey(cx, cz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const o = obstacles[arr[i]];
        if (o.dead) continue;
        if (nearby.indexOf(o) === -1) nearby.push(o);
      }
    }
  return nearby;
}

/* Push out of anything the body vertically overlaps. Boxes whose top is at or
   below the feet are floor, and boxes whose bottom is above the head are
   ceiling — you walk over the first and under the second. */
function resolve (pos, radius, feetY, height, out, step) {
  let hit = false, blocker = null;
  const tall = height || 1.75;
  const st = step === undefined ? STEP_P : step;
  const head = feetY + tall;
  const list = collectNearby(pos.x, pos.z, radius + 2);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.ramp) continue;                         // slopes are walked up, not into
    if (o.y1 <= feetY + st) continue;             // low enough to step onto, so not a wall
    if (head <= o.y0 + 0.02) continue;            // passing underneath it
    const ox = (o.hx + radius) - Math.abs(pos.x - o.x);
    if (ox <= 0) continue;
    const oz = (o.hz + radius) - Math.abs(pos.z - o.z);
    if (oz <= 0) continue;
    hit = true;
    if (!blocker || o.hp) blocker = o;            // prefer a built piece as the blocker
    if (ox < oz) pos.x += pos.x > o.x ? ox : -ox;
    else         pos.z += pos.z > o.z ? oz : -oz;
  }
  const lim = MAP_HALF - 4;
  pos.x = clamp(pos.x, -lim, lim);
  pos.z = clamp(pos.z, -lim, lim);
  if (out) out.blocker = blocker;
  return hit;
}

/* Ramps carry a sloped top surface: height rises from y0 to y1 across the
   ramp's axis, so one box replaces a whole staircase of them. */
function rampSurface (o, x, z) {
  const t = o.axis === 'x' ? (x - (o.x - o.hx)) / (2 * o.hx)
                           : (z - (o.z - o.hz)) / (2 * o.hz);
  const tt = clamp(o.dir > 0 ? t : 1 - t, 0, 1);
  return o.y0 + tt * (o.y1 - o.y0);
}

/* highest surface you can be standing on at this spot */
function groundAt (x, z, radius, fromFeet, step) {
  let g = 0;
  const reach = step === undefined ? STEP_P : step;
  const list = collectNearby(x, z, radius + 2);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (Math.abs(x - o.x) >= o.hx + radius) continue;
    if (Math.abs(z - o.z) >= o.hz + radius) continue;
    const top = o.ramp ? rampSurface(o, x, z) : o.y1;
    if (top <= fromFeet + reach && top > g) g = top;
  }
  return g;
}

function isClear (x, z, radius, y0, y1) {
  const a = y0 === undefined ? -1 : y0, b = y1 === undefined ? 1e6 : y1;
  const list = collectNearby(x, z, radius + 1);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (Math.abs(x - o.x) >= o.hx + radius) continue;
    if (Math.abs(z - o.z) >= o.hz + radius) continue;
    if (b <= o.y0 || a >= o.y1) continue;
    return false;
  }
  return true;
}

/* Fire rays outward at head height; if every direction is walled within 16m
   the spot is a sealed pocket and nothing should spawn there. Open ground
   escapes on the first ray, so the usual case costs almost nothing. */
function isEnclosed (x, z) {
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, dx = Math.cos(a), dz = Math.sin(a);
    let walled = false;
    for (let d = 2; d <= 16; d += 2) {
      if (!isClear(x + dx*d, z + dz*d, 0.55, 0.3, 1.9)) { walled = true; break; }
    }
    if (!walled) return false;                 // found a way out
  }
  return true;
}

/* ---------------------------------------------------------------- zombies */
const zombies = [];
const hitList = [];      // meshes the raycaster tests each shot

/* ---------------------------------------------------------------------------
   Zombie rig. A jointed hierarchy — hips carry the torso, the torso carries
   the head and both shoulders, each shoulder carries an elbow, each thigh a
   knee — so limbs bend at the joint instead of swinging as rigid planks.
   Hit detection uses two invisible proxy boxes rather than the visual meshes,
   which keeps the hitbox honest while the model gets as detailed as it likes.
   --------------------------------------------------------------------------- */
function buildZombie () {
  const skinMat  = new T.MeshLambertMaterial({ color: ZTYPES.green.skin });
  const clothMat = new T.MeshLambertMaterial({ color: 0x46523c });
  const darkMat  = new T.MeshLambertMaterial({ color: 0x2b3128 });
  const boneMat  = new T.MeshLambertMaterial({ color: 0xd9d2be });
  const eyeMat   = new T.MeshBasicMaterial({ color: 0x2a2a20 });

  const put = (parent, mat, x,y,z, sx,sy,sz, rx,ry,rz) => {
    const m = new T.Mesh(boxGeo, mat);
    m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    if (rx||ry||rz) m.rotation.set(rx||0, ry||0, rz||0);
    parent.add(m); return m;
  };
  const grp = (parent, x,y,z) => {
    const g2 = new T.Group(); g2.position.set(x,y,z); parent.add(g2); return g2;
  };

  const g = new T.Group();

  /* ---- hips ---- */
  const hips = grp(g, 0, 0.94, 0);
  const pelvis = put(hips, clothMat, 0, 0, 0, 0.44, 0.26, 0.30);
  put(hips, clothMat, 0, -0.14, 0, 0.46, 0.10, 0.32);          // belt

  /* ---- torso ---- */
  const torsoG = grp(hips, 0, 0.06, 0);
  const abdomen = put(torsoG, clothMat, 0, 0.14, 0, 0.46, 0.32, 0.30);
  const chest   = put(torsoG, clothMat, 0, 0.44, 0, 0.60, 0.40, 0.34);
  const collar  = put(torsoG, clothMat, 0, 0.60, 0, 0.52, 0.10, 0.30);
  put(torsoG, skinMat, 0, 0.30, 0.17, 0.30, 0.16, 0.04);        // exposed ribs
  put(torsoG, skinMat, 0, 0.20, 0.17, 0.24, 0.12, 0.04);
  const neck = put(torsoG, skinMat, 0, 0.66, 0.01, 0.15, 0.13, 0.15);

  /* ---- head ---- */
  const headG = grp(torsoG, 0, 0.72, 0);
  const cranium = put(headG, skinMat, 0, 0.10, 0, 0.32, 0.30, 0.34);
  put(headG, skinMat, 0, 0.22, 0.02, 0.30, 0.08, 0.32);          // scalp
  const brow = put(headG, skinMat, 0, 0.13, 0.16, 0.34, 0.07, 0.06);
  const jaw  = put(headG, skinMat, 0, -0.06, 0.05, 0.26, 0.12, 0.24);
  put(headG, boneMat, 0, 0.005, 0.135, 0.20, 0.035, 0.03);       // teeth
  put(headG, darkMat, 0, 0.02, -0.10, 0.16, 0.10, 0.10);         // open maw
  const eyeL = put(headG, eyeMat, -0.075, 0.13, 0.155, 0.07, 0.05, 0.03);
  const eyeR = put(headG, eyeMat,  0.075, 0.13, 0.155, 0.07, 0.05, 0.03);
  const headHit = put(headG, eyeMat, 0, 0.12, 0.02, 0.40, 0.38, 0.42);
  headHit.material = new T.MeshBasicMaterial({ visible: false });
  headHit.userData.part = 'head';

  /* ---- arms: shoulder -> elbow -> hand ---- */
  function buildArm (side) {
    const sh = grp(torsoG, side * 0.34, 0.52, 0);
    put(sh, clothMat, 0, -0.02, 0, 0.21, 0.21, 0.23);            // deltoid
    put(sh, skinMat,  0, -0.20, 0, 0.15, 0.32, 0.16);            // upper arm
    const el = grp(sh, 0, -0.36, 0);
    put(el, skinMat, 0, -0.16, 0, 0.13, 0.30, 0.14);             // forearm
    const hand = grp(el, 0, -0.34, 0);
    put(hand, skinMat, 0, -0.05, 0.01, 0.14, 0.15, 0.11);
    for (let f = 0; f < 3; f++)
      put(hand, skinMat, (f - 1) * 0.045, -0.14, 0.03, 0.035, 0.11, 0.05, 0.5);
    return { sh, el, hand };
  }
  const armLG = buildArm(-1), armRG = buildArm(1);

  /* ---- legs: thigh -> knee -> foot ---- */
  function buildLeg (side) {
    const th = grp(hips, side * 0.14, -0.06, 0);
    put(th, clothMat, 0, -0.20, 0, 0.21, 0.40, 0.23);
    const kn = grp(th, 0, -0.42, 0);
    put(kn, clothMat, 0, -0.18, 0, 0.18, 0.36, 0.19);
    put(kn, darkMat,  0, -0.39, 0.06, 0.20, 0.10, 0.30);         // boot
    return { th, kn };
  }
  const legLG = buildLeg(-1), legRG = buildLeg(1);

  /* ---- body hit proxy: one honest box over chest, belly and hips ---- */
  const bodyHit = put(torsoG, eyeMat, 0, 0.16, 0, 0.72, 1.06, 0.46);
  bodyHit.material = new T.MeshBasicMaterial({ visible: false });
  bodyHit.userData.part = 'body';

  /* ---- per-strain features, built once and toggled on spawn ---- */
  const rags = new T.Group(); torsoG.add(rags);
  [[-0.30,0.24,0.16,0.26],[0.26,0.16,0.16,0.20],[0.04,0.06,-0.17,0.30],[-0.10,0.02,0.17,0.22]]
    .forEach(r => {
      const m = put(rags, clothMat, r[0], r[1], r[2], 0.18, r[3], 0.04);
      m.rotation.z = rnd(-0.35, 0.35);
    });

  const cracks = new T.Group(); torsoG.add(cracks);
  const crackMat = new T.MeshLambertMaterial({ color: 0x7a6620 });
  [[0,0.44,0.18],[-0.20,0.28,0.18],[0.18,0.16,0.18],[-0.26,0.50,0.10]].forEach(c => {
    const m = put(cracks, crackMat, c[0], c[1], c[2], 0.07, 0.24, 0.03);
    m.rotation.z = rnd(-0.7, 0.7);
  });
  const headCrack = put(cracks, crackMat, 0.06, 0.84, 0.16, 0.05, 0.18, 0.03, 0, 0, 0.4);

  // claws stay parented to the hands so they swing with the arms; the array
  // is only a handle for toggling them per strain
  const clawParts = [];
  const clawMat = new T.MeshLambertMaterial({ color: 0xe2dac6 });
  [armLG, armRG].forEach(arm => {
    for (let i = 0; i < 3; i++) {
      const c = new T.Mesh(coneGeo, clawMat);
      c.scale.set(0.038, 0.26, 0.038);
      c.position.set((i - 1) * 0.045, -0.26, 0.05);
      c.rotation.x = 0.35;
      arm.hand.add(c);
      clawParts.push(c);
    }
  });

  const plates = new T.Group(); torsoG.add(plates);
  const plateMat = new T.MeshLambertMaterial({ color: 0x2a2d34 });
  const rivetMat = new T.MeshLambertMaterial({ color: 0x8a9098 });
  put(plates, plateMat, 0, 0.46, 0.20, 0.62, 0.44, 0.10);
  put(plates, plateMat, 0, 0.16, 0.19, 0.50, 0.22, 0.08);
  [-1, 1].forEach(side => {
    put(plates, plateMat, side * 0.36, 0.60, 0, 0.28, 0.16, 0.32);
    for (let i = 0; i < 2; i++) {
      const rv = new T.Mesh(sphGeo, rivetMat);
      rv.scale.setScalar(0.035);
      rv.position.set(side * 0.22, 0.36 + i * 0.20, 0.26);
      plates.add(rv);
    }
  });

  const spines = new T.Group(); torsoG.add(spines);
  const spineMat = new T.MeshLambertMaterial({ color: 0xf2d8e4 });
  for (let i = 0; i < 6; i++) {
    const sp2 = new T.Mesh(coneGeo, spineMat);
    sp2.scale.set(0.085, 0.32 - i * 0.02, 0.085);
    sp2.position.set(rnd(-0.16, 0.16), 0.10 + i * 0.12, -0.20);
    sp2.rotation.x = -0.85;
    spines.add(sp2);
  }
  const horns = new T.Group(); headG.add(horns);
  [-1, 1].forEach(side => {
    const h2 = new T.Mesh(coneGeo, spineMat);
    h2.scale.set(0.065, 0.30, 0.065);
    h2.position.set(side * 0.15, 0.22, -0.02);
    h2.rotation.z = side * 0.55;
    horns.add(h2);
  });

  /* ---- the burrower's mound of earth ---- */
  const mound = new T.Group();
  const dirtMat = new T.MeshLambertMaterial({ color: 0x5a4530 });
  const cap = new T.Mesh(sphGeo, dirtMat);
  cap.scale.set(1.2, 0.44, 1.2); cap.position.y = 0.05; mound.add(cap);
  for (let i = 0; i < 6; i++) {
    const cl = new T.Mesh(boxGeo, dirtMat);
    cl.scale.set(rnd(0.2,0.42), rnd(0.12,0.24), rnd(0.2,0.42));
    cl.position.set(rnd(-0.95,0.95), 0.10, rnd(-0.95,0.95));
    cl.rotation.y = rnd(0,3); mound.add(cl);
  }
  mound.visible = false; scene.add(mound);
  const moundHit = new T.Mesh(boxGeo, new T.MeshBasicMaterial({ visible: false }));
  moundHit.scale.set(2.1, 0.9, 2.1);
  scene.add(moundHit);

  g.visible = false;
  scene.add(g);

  const z = {
    g, hips, torsoG, headG, pelvis, abdomen, chest, collar, neck,
    cranium, brow, jaw, eyeL, eyeR,
    armL: armLG, armR: armRG, legL: legLG, legR: legRG,
    head: headHit, torso: bodyHit,
    skinMat, clothMat, darkMat, eyeMat,
    rags, cracks, headCrack, clawParts, plates, spines, horns, mound, moundHit,
    state:'walk', stateT:0, stagger:0, burrowT:0, tunnelT:0,
    alive:false, dying:false, dieT:0, hp:0, maxHp:0, type:'green',
    spd:2, dmg:10, score:100, atkCd:0, flash:0, phase:Math.random()*9, drift:0, driftT:0,
    feet:0, vy:0, twitch:0, sunT:0,
    pos: g.position,
  };
  headHit.userData.z = z; bodyHit.userData.z = z;
  moundHit.userData.z = z; moundHit.userData.part = 'mound';
  zombies.push(z);
  return z;
}
for (let i = 0; i < MAX_ZOMBIES; i++) buildZombie();

/* colour, silhouette and features for a strain */
function applyLook (z, typeName, t) {
  z.skinMat.color.setHex(t.skin);
  z.clothMat.color.setHex(t.cloth);
  z.eyeMat.color.setHex(t.eye);
  z.darkMat.color.setHex(t.armour ? 0x15171b : 0x2b3128);

  z.rags.visible   = !!t.rags;
  z.cracks.visible = !!t.cracked;
  z.plates.visible = !!t.armour;
  z.spines.visible = !!t.boss;
  z.horns.visible  = !!t.boss;
  for (let i = 0; i < z.clawParts.length; i++) z.clawParts[i].visible = !!t.claws;

  // silhouette: sprinters lean and hunch, hulks and bosses go wide and heavy
  const wide = t.thin ? 0.72 : t.armour ? 1.26 : 1;
  const deep = t.thin ? 0.82 : t.armour ? 1.20 : 1;
  z.chest.scale.set(0.60 * wide, 0.40, 0.34 * deep);
  z.abdomen.scale.set(0.46 * wide, 0.32, 0.30 * deep);
  z.collar.scale.set(0.52 * wide, 0.10, 0.30 * deep);
  z.pelvis.scale.set(0.44 * wide, 0.26, 0.30 * deep);
  z.armL.sh.position.x = -0.34 * wide;
  z.armR.sh.position.x =  0.34 * wide;

  // hunch: sprinters fold forward and lead with the head
  z.torsoG.rotation.x = t.thin ? 0.36 : t.boss ? 0.18 : t.armour ? 0.08 : 0.04;
  z.headG.rotation.x  = t.thin ? -0.30 : t.boss ? -0.16 : -0.05;
  z.cranium.scale.set(0.32 * (t.armour ? 1.1 : 1), 0.30, 0.34);
  z.jaw.position.y = t.boss ? -0.09 : -0.06;      // bosses hang their jaw open

  z.mound.visible = false;
  z.moundHit.visible = false;
  z.g.rotation.set(0, 0, 0);
  z.hips.position.y = 0.94;
}

function freeZombie () {
  for (let i = 0; i < zombies.length; i++) if (!zombies[i].alive) return zombies[i];
  return null;
}

function spawnZombie (typeName, waveNo, spawnY) {
  const z = freeZombie();
  if (!z) return false;
  const t = ZTYPES[typeName];

  // find a spot 42–95m away that is not inside geometry
  let x = 0, zz = 0, ok = false;
  let y = spawnY;

  // perched high up? a share of the wave comes in at your level instead,
  // so a rooftop buys you breathing room rather than immunity
  if (y === undefined && player.feet > 2.5 && Math.random() < 0.45) {
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2, d = rnd(9, 26);
      const tx = clamp(player.pos.x + Math.cos(a)*d, -MAP_HALF+8, MAP_HALF-8);
      const tz = clamp(player.pos.z + Math.sin(a)*d, -MAP_HALF+8, MAP_HALF-8);
      const surf = groundAt(tx, tz, 0.6, player.feet + 1.2, 1.2);
      if (surf > 2.0 && Math.abs(surf - player.feet) < 1.4 &&
          isClear(tx, tz, 0.8, surf + 0.1, surf + 1.9)) {
        x = tx; zz = tz; y = surf; ok = true; break;
      }
    }
  }

  if (!ok) for (let tries = 0; tries < 40; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = rnd(42, 95);
    x  = clamp(player.pos.x + Math.cos(a)*d, -MAP_HALF+8, MAP_HALF-8);
    zz = clamp(player.pos.z + Math.sin(a)*d, -MAP_HALF+8, MAP_HALF-8);
    if (!isClear(x, zz, 0.9, 0, 2)) continue;
    if (isEnclosed(x, zz)) continue;           // walled yard, not a spawn point
    ok = true; break;
  }
  if (!ok) return false;
  spawnY = y;

  const scaleHp  = 1 + 0.13 * (waveNo - 1);
  const scaleSpd = Math.min(1 + 0.028 * (waveNo - 1), 1.7);

  z.alive = true; z.dying = false; z.dieT = 0;
  z.type  = typeName;
  z.maxHp = z.hp = Math.round(t.hp * scaleHp);
  z.spd   = t.spd * scaleSpd * rnd(0.92, 1.08);
  z.dmg   = t.dmg;
  z.score = t.score;
  z.atkCd = rnd(0, 0.5);
  z.flash = 0;
  z.drift = 0; z.driftT = 0;
  z.state = 'walk'; z.stateT = 0; z.stagger = 0;
  z.stuckT = 0; z.bestDist = 1e9; z.checkT = 1; z.sunT = 0;
  z.burrowT = t.tunnel ? rnd(2.5, 5.5) : 0;
  z.mound.visible = false; z.moundHit.visible = false;
  if (t.boss) { Sfx.bossRoar(atXYZ(x, 2, zz, 20, 260)); banner('ABOMINATION INBOUND'); }
  applyLook(z, typeName, t);
  z.g.scale.setScalar(t.scale);
  z.g.rotation.set(0, 0, 0);
  z.g.position.set(x, spawnY || 0, zz);
  z.feet = spawnY || 0; z.vy = 0;
  z.g.visible = true;
  return true;
}

function killZombie (z) {
  z.dying = true; z.dieT = 0;
  z.atkCd = 999;
  z.state = 'walk';
  z.g.visible = true;
  z.mound.visible = false; z.moundHit.visible = false;
  game.kills++;
  game.score += Math.round(z.score * (1 + 0.1 * (game.wave - 1)));
  Sfx.kill(at3(z.g.position, 6, 90));
  if (Math.random() < 0.26) dropPickup(z.g.position.x, z.g.position.z);
  if (Math.random() < 0.40) {                     // salvage off the corpse
    const wood = Math.random() < 0.5;
    const n = wood ? 3 + (Math.random()*4|0) : 2 + (Math.random()*3|0);
    res[wood ? 'wood' : 'scrap'] += n;
    toast('+' + n + (wood ? ' WOOD' : ' SCRAP'));
  }
}

function hurtZombie (z, dmg, headshot, point) {
  const T = ZTYPES[z.type];
  z.hp -= dmg;
  z.flash = 0.09;
  z.stagger = Math.max(z.stagger, 0.24 * T.stagger);   // hulks barely flinch

  // shooting the moving mound drives a burrower to the surface, dazed
  if (T.tunnel && z.state === 'tunnel') {
    z.state = 'stunned'; z.stateT = 1.5;
    z.g.visible = true;
    z.mound.visible = false; z.moundHit.visible = false;
    z.g.position.y = z.feet;
    dirtBurst(z.mound.position, 20);
    Sfx.erupt(at3(z.mound.position, 6, 90));
    toast('BURROWER FLUSHED OUT');
  } else {
    bloodBurst(point, Math.round((headshot ? 14 : 8) * GORE.mult));
  }
  Sfx.flesh(at3(point || z.g.position, 4, 70), !!T.armour);
  hitmarker();
  if (z.hp <= 0) killZombie(z);
}

function updateZombies (dt) {
  hitList.length = 0;
  let alive = 0;
  const px = player.pos.x, pz = player.pos.z;

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z.alive) continue;

    if (z.flash > 0) {
      z.flash -= dt;
      z.skinMat.color.setHex(z.flash > 0 ? 0xff6b5a : ZTYPES[z.type].skin);
    }

    if (z.dying) {
      z.dieT += dt;
      const fall = Math.min(z.dieT * 3.2, Math.PI/2);
      z.g.rotation.x = -fall;
      z.torsoG.rotation.x = fall * 0.5;
      z.headG.rotation.x = fall * 0.4;
      z.legL.kn.rotation.x = -fall * 0.8;
      z.legR.kn.rotation.x = -fall * 0.6;
      z.armL.sh.rotation.x = -0.2; z.armR.sh.rotation.x = -0.2;
      z.g.position.y = z.feet - Math.max(0, (z.dieT - 0.7) * 1.6);
      if (z.dieT > 1.9) { z.alive = false; z.g.visible = false; }
      continue;
    }

    alive++;
    const T0 = ZTYPES[z.type];

    // caught out at dawn
    if (z.sunT > 0) {
      z.sunT -= dt;
      if ((game.time * 7 | 0) % 3 === 0 && Math.random() < dt * 6)
        dirtBurst(atVec.set(z.g.position.x, z.feet + 1.0, z.g.position.z), 1);
      if (z.sunT <= 0) {
        dirtBurst(atVec.set(z.g.position.x, z.feet + 0.9, z.g.position.z), 12);
        killZombie(z);
        continue;
      }
    }

    let dx = px - z.g.position.x, dz = pz - z.g.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    dx /= dist; dz /= dist;

    if (z.stagger > 0) z.stagger -= dt;

    /* ---- burrowers: dive, travel unseen, erupt underneath you ---- */
    if (T0.tunnel) {
      z.stateT -= dt;

      if (z.state === 'walk') {
        z.burrowT -= dt;
        if (z.burrowT <= 0 && dist > 7 && z.feet < 0.7) {
          z.state = 'tunnel'; z.stateT = 13;
          z.g.visible = false;
          z.mound.visible = true; z.moundHit.visible = true;
          dirtBurst(z.g.position, 16);
          Sfx.dig(at3(z.g.position, 6, 80));
        }
      } else if (z.state === 'tunnel') {
        // underground: ignores walls entirely, so bases do not stop them
        const tspd = T0.tunnelSpd * (z.stagger > 0 ? 0.4 : 1);
        z.g.position.x += dx * tspd * dt;
        z.g.position.z += dz * tspd * dt;
        z.feet = 0; z.vy = 0;
        const surf = groundAt(z.g.position.x, z.g.position.z, 0.5, 0.2, 0.9);
        z.mound.position.set(z.g.position.x, surf + 0.02, z.g.position.z);
        z.moundHit.position.set(z.g.position.x, surf + 0.45, z.g.position.z);
        z.mound.rotation.y += dt * 1.4;
        hitList.push(z.moundHit);                      // shoot the moving ground
        if (Math.random() < dt * 3) dirtBurst(z.mound.position, 1);

        const playerHigh = player.feet > 1.6;          // up on a structure: safe
        if (!playerHigh && dist < 2.4) {
          z.state = 'erupt'; z.stateT = 0.45;
          z.g.visible = true; z.mound.visible = false; z.moundHit.visible = false;
          dirtBurst(z.g.position, 26);
          Sfx.erupt(at3(z.g.position, 6, 90));
          game.shake = Math.min(game.shake + 0.09, 0.16);
          hurtPlayer(Math.round(z.dmg * 1.4), z.g.position.x, z.g.position.z);
          z.atkCd = 1.4;
        } else if (z.stateT <= 0) {
          z.state = 'walk'; z.burrowT = rnd(5, 9);
          z.g.visible = true; z.mound.visible = false; z.moundHit.visible = false;
          dirtBurst(z.g.position, 14);
        }
        z.g.updateMatrixWorld(true);
        z.mound.updateMatrixWorld(true);
        z.moundHit.updateMatrixWorld(true);
        continue;                                       // no walking while buried
      } else if (z.state === 'erupt') {
        z.g.position.y = z.feet + Math.sin((1 - z.stateT / 0.45) * Math.PI) * 1.1;
        z.g.updateMatrixWorld(true);
        hitList.push(z.head, z.torso);
        if (z.stateT <= 0) { z.state = 'walk'; z.burrowT = rnd(6, 11); }
        continue;
      } else if (z.state === 'stunned') {
        hitList.push(z.head, z.torso);
        z.torsoG.rotation.z = Math.sin(z.stateT * 22) * 0.14;
        z.headG.rotation.z  = Math.sin(z.stateT * 17) * 0.20;
        z.g.updateMatrixWorld(true);
        if (z.stateT <= 0) { z.state = 'walk'; z.burrowT = rnd(4, 8); z.torsoG.rotation.z = 0; }
        continue;
      }
    }

    hitList.push(z.head, z.torso);

    // steer around whatever it walked into, then straighten back out
    if (z.feet > 0.6) z.driftT = 0;
    if (z.driftT > 0) {
      z.driftT -= dt;
      const c = Math.cos(z.drift), s = Math.sin(z.drift);
      const nx = dx*c - dz*s, nz = dx*s + dz*c;
      dx = nx; dz = nz;
    }

    const step = z.spd * (z.stagger > 0 ? 0.32 : 1) * dt;
    z.g.position.x += dx * step;
    z.g.position.z += dz * step;

    /* Don't let them occupy your space. The zombie takes most of the push;
       the heavier strains shove you back instead of sliding aside. */
    {
      const zrad = 0.42 * z.g.scale.x;
      const pdx = z.g.position.x - player.pos.x;
      const pdz = z.g.position.z - player.pos.z;
      const pd2 = pdx * pdx + pdz * pdz;
      const minD = P_RADIUS + zrad;
      if (pd2 < minD * minD && pd2 > 0.0001 && Math.abs(z.feet - player.feet) < 1.9) {
        const d = Math.sqrt(pd2), over = minD - d;
        const nx = pdx / d, nz = pdz / d;
        const shove = T0.boss ? 0.72 : T0.armour ? 0.42 : 0.14;   // how much YOU move
        z.g.position.x += nx * over * (1 - shove);
        z.g.position.z += nz * over * (1 - shove);
        if (shove > 0) {
          player.pos.x -= nx * over * shove;
          player.pos.z -= nz * over * shove;
          // re-settle against the world so a shove cannot post you into a wall
          resolve(player.pos, P_RADIUS, player.feet, 1.75, null, STEP_P);
        }
      }
    }

    // keep zombies from stacking inside each other
    for (let j = i + 1; j < zombies.length; j++) {
      const o = zombies[j];
      if (!o.alive || o.dying) continue;
      const ax = o.g.position.x - z.g.position.x, az = o.g.position.z - z.g.position.z;
      const d2 = ax*ax + az*az;
      if (d2 > 0.0001 && d2 < 0.8) {
        const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
        z.g.position.x -= (ax/d) * push; z.g.position.z -= (az/d) * push;
        o.g.position.x += (ax/d) * push; o.g.position.z += (az/d) * push;
      }
    }

    // vertical: walk up steps and ramps, fall off ledges
    const zr = 0.42 * z.g.scale.x;
    const prevF = z.feet;
    z.vy -= GRAVITY * dt;
    let f = prevF + z.vy * dt;
    const gnd = groundAt(z.g.position.x, z.g.position.z, zr, prevF, STEP_Z);
    if (f <= gnd) { f = gnd; z.vy = 0; }
    z.feet = f;
    z.g.position.y = f;

    hitInfo.blocker = null;
    if (resolve(z.g.position, zr, f, 1.8 * z.g.scale.x, hitInfo, STEP_Z)) {
      // on a ramp or walkway, drifting sideways walks them into thin air,
      // so only sidestep obstacles while they are down on the street
      if (z.driftT <= 0 && z.feet < 0.6) {
        z.drift  = (Math.random() < 0.5 ? 1 : -1) * rnd(0.9, 1.5);
        z.driftT = rnd(0.5, 1.2);
      }
      // something built is in the way: tear at it instead of shuffling around
      if (hitInfo.blocker && hitInfo.blocker.hp > 0 && z.atkCd <= 0) {
        z.atkCd = 1.0;
        damageStructure(hitInfo.blocker, z.dmg * 1.6);
      }
    }
    z.g.position.y = f;

    z.g.rotation.y = Math.atan2(px - z.g.position.x, pz - z.g.position.z);

    // gait: knees and elbows actually bend, so sprinters piston, hulks lumber
    // and the boss rolls its shoulders through the stride
    z.phase += dt * z.spd * T0.gait;
    const sw  = Math.sin(z.phase);
    const swB = Math.sin(z.phase + Math.PI);
    const LS  = T0.legSwing;

    z.legL.th.rotation.x = sw  * LS;
    z.legR.th.rotation.x = swB * LS;
    // a knee only folds one way — clamp it to the back half of the stride
    z.legL.kn.rotation.x = -Math.max(0, -Math.sin(z.phase - 0.7)) * LS * 1.5;
    z.legR.kn.rotation.x = -Math.max(0, -Math.sin(z.phase - 0.7 + Math.PI)) * LS * 1.5;

    const armHang = T0.boss ? -1.35 : T0.armour ? -0.85 : -1.15;
    z.armL.sh.rotation.x = armHang + Math.sin(z.phase * 0.7) * T0.armSwing;
    z.armR.sh.rotation.x = armHang - Math.sin(z.phase * 0.7) * T0.armSwing;
    z.armL.sh.rotation.z =  (T0.boss ? 0.30 : 0.10) + (T0.boss ? Math.sin(z.phase*0.5)*0.22 : 0);
    z.armR.sh.rotation.z = -(T0.boss ? 0.30 : 0.10) - (T0.boss ? Math.sin(z.phase*0.5)*0.22 : 0);
    const elbow = T0.thin ? -1.05 : T0.armour ? -0.35 : -0.55;
    z.armL.el.rotation.x = elbow - Math.abs(Math.sin(z.phase * 0.7)) * 0.22;
    z.armR.el.rotation.x = elbow - Math.abs(Math.sin(z.phase * 0.7 + 1)) * 0.22;

    // weight shift through the hips and a counter-rotation in the shoulders
    z.hips.position.y = 0.94 - Math.abs(sw) * (T0.armour ? 0.028 : 0.020);
    z.hips.rotation.z = sw * 0.04;
    z.torsoG.rotation.z = -sw * (T0.armour ? 0.09 : 0.06);
    z.torsoG.rotation.y = -sw * 0.10;

    // head lolls, with an occasional twitch
    z.twitch -= dt;
    if (z.twitch <= 0) { z.twitch = rnd(1.5, 5); z.headG.rotation.y = rnd(-0.4, 0.4); }
    z.headG.rotation.y *= (1 - dt * 1.6);
    z.headG.rotation.z = sw * 0.08;

    z.g.rotation.z = 0;

    // attack
    z.atkCd -= dt;
    const reach = 1.45 * z.g.scale.x;
    if (dist < reach && z.atkCd <= 0 && Math.abs(player.feet - z.feet) < 1.6) {
      z.atkCd = T0.boss ? 1.3 : 1.0;
      hurtPlayer(z.dmg, z.g.position.x, z.g.position.z);
      if (T0.push) {                                  // shoved off your feet
        player.vel.x += dx * T0.push;
        player.vel.z += dz * T0.push;
        player.vel.y = Math.max(player.vel.y, 3.4);
        player.onGround = false;
        game.shake = Math.min(game.shake + 0.10, 0.18);
      }
    }

    // hitboxes are raycast before the next render, so refresh the matrices now
    z.g.updateMatrixWorld(true);

    /* Without real pathfinding something will always wedge itself somewhere.
       If it has not closed the gap for six seconds, pick it up and drop it
       back into the fight rather than letting the wave stall forever. */
    z.checkT -= dt;
    if (z.checkT <= 0) {
      z.checkT = 1;
      if (dist < z.bestDist - 1.0) { z.bestDist = dist; z.stuckT = 0; }
      else if (dist > 10) z.stuckT++;
      if (z.stuckT >= 6) {
        z.stuckT = 0; z.bestDist = 1e9;
        for (let tries = 0; tries < 24; tries++) {
          const a = Math.random() * Math.PI * 2, dd = rnd(26, 46);
          const nx = clamp(player.pos.x + Math.cos(a)*dd, -MAP_HALF+8, MAP_HALF-8);
          const nz = clamp(player.pos.z + Math.sin(a)*dd, -MAP_HALF+8, MAP_HALF-8);
          if (isClear(nx, nz, 0.9, 0, 2) && !isEnclosed(nx, nz)) {
            z.g.position.set(nx, 0, nz); z.feet = 0; z.vy = 0;
            z.driftT = 0;
            break;
          }
        }
      }
    }

    // a footfall on each stride, only for the ones close enough to matter
    if (dist < 22 && game.stepBudget > 0) {
      const s2 = Math.sin(z.phase);
      if (z.lastStep === undefined) z.lastStep = 0;
      if (s2 * z.lastStep < 0) {                       // crossed the stride midpoint
        game.stepBudget--;
        Sfx.step(atXYZ(z.g.position.x, z.feet, z.g.position.z, 4, 30),
                 ZTYPES[z.type].armour);
      }
      z.lastStep = s2;
    }

    // ambience
    if (dist < 34 && Math.random() < dt * 0.14 && game.growlBudget > 0) {
      game.growlBudget--; Sfx.growl(atXYZ(z.g.position.x, z.feet + 1.5, z.g.position.z, 7, 60));
    }
  }
  game.zAlive = alive;
}

/* ---------------------------------------------------------------- blood */
const bloodGeo = new T.BoxGeometry(0.09, 0.09, 0.09);
/* ---------------------------------------------------------------- rating
   PG under the Australian classification scheme allows violence of MILD impact
   only. Red spray on every hit is what pushes a game like this to M, so PG mode
   recolours the impact particle to a pale spore burst and thins it out. The
   mechanics are untouched — it is the depiction that carries the rating, not
   the act. Off by default only if you deliberately turn it off. */
const GORE = { pg: true, mult: 0.55 };
const bloodMat = new T.MeshBasicMaterial({ color: 0x8e1b1b });

function applyPG (on) {
  GORE.pg = !!on;
  GORE.mult = on ? 0.55 : 1;
  bloodMat.color.setHex(on ? 0x9fbe86 : 0x8e1b1b);
  document.body.classList.toggle('pg', GORE.pg);
  const b = $('pgBtn');
  if (b) { b.classList.toggle('on', GORE.pg); b.textContent = GORE.pg ? 'PG MODE: ON' : 'PG MODE: OFF'; }
}
const dustMat  = new T.MeshBasicMaterial({ color: 0xb9b2a4 });
const dirtPMat = new T.MeshBasicMaterial({ color: 0x6b5236 });
const blood = [];
for (let i = 0; i < 240; i++) {
  const m = new T.Mesh(bloodGeo, bloodMat);
  m.visible = false; scene.add(m);
  blood.push({ m, vx:0, vy:0, vz:0, life:0 });
}
let bloodPtr = 0;
function bloodBurst (point, n) {
  if (!point) return;
  for (let i = 0; i < n; i++) {
    const p = blood[bloodPtr = (bloodPtr + 1) % blood.length];
    p.m.material = bloodMat;
    p.m.position.copy(point);
    p.vx = gauss()*3.4; p.vy = rnd(1.2, 4.6); p.vz = gauss()*3.4;
    p.life = rnd(0.45, 0.95);
    p.m.visible = true;
  }
}
/* clods of earth thrown up by a burrower */
function dirtBurst (pos, n) {
  if (!pos) return;
  for (let i = 0; i < n; i++) {
    const p = blood[bloodPtr = (bloodPtr + 1) % blood.length];
    p.m.material = dirtPMat;
    p.m.position.set(pos.x + rnd(-0.5, 0.5), (pos.y || 0) + 0.1, pos.z + rnd(-0.5, 0.5));
    p.vx = gauss()*3.6; p.vy = rnd(1.6, 5.4); p.vz = gauss()*3.6;
    p.life = rnd(0.4, 0.9);
    p.m.visible = true;
  }
}

function updateBlood (dt) {
  for (let i = 0; i < blood.length; i++) {
    const p = blood[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vy -= 14 * dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
  }
}

/* ---------------------------------------------------------------- pickups */
const pickups = [];
const medGeo = new T.BoxGeometry(0.5, 0.5, 0.5);
const ammoGeo = new T.BoxGeometry(0.55, 0.34, 0.34);
const medMat = new T.MeshLambertMaterial({ color: 0xc8302a, emissive: 0x4a0c0a });
const ammoMat = new T.MeshLambertMaterial({ color: 0xffb64a, emissive: 0x4a3208 });
for (let i = 0; i < 18; i++) {
  const m = new T.Mesh(medGeo, medMat);
  m.visible = false; scene.add(m);
  const halo = glowSprite(0xff5a4a, 2.4, 0.6);   // recoloured per kind on drop
  m.add(halo);
  pickups.push({ m, halo, kind:'med', life:0 });
}
function dropPickup (x, z) {
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    if (p.life > 0) continue;
    p.kind = Math.random() < 0.42 ? 'med' : 'ammo';
    p.m.geometry = p.kind === 'med' ? medGeo : ammoGeo;
    p.m.material = p.kind === 'med' ? medMat : ammoMat;
    if (p.halo) p.halo.material.color.setHex(p.kind === 'med' ? 0xff5a4a : 0xffb64a);
    p.m.position.set(x, 0.5, z);
    p.m.visible = true;
    p.life = 26;
    return;
  }
}
/* top every unlocked weapon up by its own crate size */
function resupply (mult) {
  for (let i = 0; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    if (!gunState.unlocked[i] || w.resMax === Infinity) continue;
    ammo[i].res = Math.min(w.resMax, ammo[i].res + Math.ceil(w.pickup * mult));
  }
}

function updatePickups (dt, time) {
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.m.rotation.y = time * 1.8;
    p.m.position.y = 0.5 + Math.sin(time * 3 + i) * 0.11;
    if (p.life < 4) p.m.visible = (p.life * 6 % 1) > 0.4;   // blink before it rots away
    const d = Math.hypot(p.m.position.x - player.pos.x, p.m.position.z - player.pos.z);
    if (d < 1.7) {
      if (p.kind === 'med') {
        player.hp = Math.min(100, player.hp + 30);
        toast('+30 VITALS');
      } else {
        resupply(1);
        toast('AMMO RESUPPLY');
      }
      Sfx.pickup();
      p.life = 0; p.m.visible = false;
      syncHud();
    }
  }
}

/* ---------------------------------------------------------------- weapons
   Viewmodels are built from shared box/cylinder geometry with a handful of
   Phong materials, so eight detailed guns cost almost nothing to draw.
   Moving parts (slide, magazine, pump, cylinder, bolt) are kept as named
   references so the animation code can drive them. */
const gunGroup = new T.Group();
gunScene.add(gunGroup);
const gunModels = [];


const BASE_MATS = {
  poly:  new T.MeshPhongMaterial({ color:0x24262c, shininess:22, specular:0x33373f }),
  dark:  new T.MeshPhongMaterial({ color:0x33363d, shininess:55, specular:0x707784 }),
  metal: new T.MeshPhongMaterial({ color:0x7a808f, shininess:90, specular:0xc2c9d8 }),
  steel: new T.MeshPhongMaterial({ color:0x9aa2b2, shininess:110, specular:0xe6ecf7 }),
  wood:  new T.MeshPhongMaterial({ color:0x6d4526, shininess:20, specular:0x3d2c1d }),
  glove: new T.MeshPhongMaterial({ color:0x2c2f36, shininess:8,  specular:0x1a1c20 }),
  skin:  new T.MeshPhongMaterial({ color:0xb98a63, shininess:6 }),
  brass: new T.MeshPhongMaterial({ color:0xc9a24c, shininess:100, specular:0xffeab4 }),
  olive: new T.MeshPhongMaterial({ color:0x4c5539, shininess:18 }),
  glass: new T.MeshPhongMaterial({ color:0x24405e, shininess:140, specular:0xffffff,
                                   emissive:0x0b1a2b, transparent:true, opacity:0.9 }),
};

/* Skins recolour a weapon's own material set. Roles a skin omits fall back
   to the factory colour, so each entry only lists what it changes. */
const BASE_COLOURS = {};
for (const k in BASE_MATS) BASE_COLOURS[k] = BASE_MATS[k].color.getHex();

const SKINS = [
  { id:'gunmetal', name:'GUNMETAL', chip:'#7a808f', mats:{} },
  { id:'blackout', name:'BLACKOUT', chip:'#191b1f',
    mats:{ poly:0x121317, dark:0x1c1e23, metal:0x33363c, steel:0x4b5058, wood:0x2b2622, glove:0x15161a } },
  { id:'desert',   name:'DESERT',   chip:'#c2a878',
    mats:{ poly:0x8a7654, dark:0x6e5e42, metal:0xb5a483, steel:0xd8c9a7, wood:0x7a5c37, olive:0x8d7c52 } },
  { id:'arctic',   name:'ARCTIC',   chip:'#dfe6ee',
    mats:{ poly:0xa9b4c0, dark:0x8a97a5, metal:0xcad5df, steel:0xeef4f9, wood:0x99a2ac, olive:0xa7b3bd } },
  { id:'woodland', name:'WOODLAND', chip:'#5c6b43',
    mats:{ poly:0x3f4a30, dark:0x323b26, metal:0x6b7554, steel:0x8d9771, wood:0x5a3c22, olive:0x46512f } },
  { id:'crimson',  name:'CRIMSON',  chip:'#93261f',
    mats:{ poly:0x4a1512, dark:0x360f0d, metal:0x93261f, steel:0xc2463c, wood:0x5a2018 } },
  { id:'bullion',  name:'BULLION',  chip:'#d9a63c',
    mats:{ poly:0x2a2317, dark:0x3a3020, metal:0xd9a63c, steel:0xf3d078, brass:0xffe08c, wood:0x4a3418 } },
  { id:'toxic',    name:'TOXIC',    chip:'#9ddc3a',
    mats:{ poly:0x27301a, dark:0x1d2513, metal:0x7fae2e, steel:0x9ddc3a, olive:0x5d7a24 } },
];
const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

/* `GM` is what the builders read; makeGun points it at that weapon's own
   cloned set so recolouring one gun never touches the others. */
let GM = BASE_MATS;

/* part helpers: bx = box, cy = cylinder (axis 'x'|'y'|'z'), sp = sphere */
function bx (g, mat, x,y,z, sx,sy,sz, rx, ry, rz) {
  const m = new T.Mesh(boxGeo, mat);
  m.position.set(x,y,z); m.scale.set(sx,sy,sz);
  if (rx || ry || rz) m.rotation.set(rx||0, ry||0, rz||0);
  g.add(m); return m;
}
function cy (g, mat, x,y,z, r, len, axis, rx, ry, rz) {
  const m = new T.Mesh(cylGeo, mat);
  m.position.set(x,y,z); m.scale.set(r, len, r);
  if (axis === 'z') m.rotation.x = Math.PI/2;
  else if (axis === 'x') m.rotation.z = Math.PI/2;
  if (rx || ry || rz) { m.rotation.x += rx||0; m.rotation.y += ry||0; m.rotation.z += rz||0; }
  g.add(m); return m;
}
function sp (g, mat, x,y,z, r) {
  const m = new T.Mesh(sphGeo, mat);
  m.position.set(x,y,z); m.scale.setScalar(r);
  g.add(m); return m;
}
/* grip ridges / rail teeth: a run of thin slats */
function slats (g, mat, x,y,z, n, gap, sx,sy,sz, axis) {
  for (let i = 0; i < n; i++) {
    const o = (i - (n-1)/2) * gap;
    bx(g, mat, x + (axis === 'x' ? o : 0), y, z + (axis === 'x' ? 0 : o), sx, sy, sz);
  }
}
/* a gloved hand + forearm receding toward the camera */
function hand (g, x, y, z, tilt, yaw) {
  const h = new T.Group();
  h.position.set(x, y, z);
  h.rotation.set(tilt || 0, yaw || 0, 0);
  bx(h, GM.glove, 0, 0, 0, 0.088, 0.105, 0.115);                 // fist
  bx(h, GM.glove, 0, 0.045, -0.03, 0.075, 0.03, 0.06);           // knuckles
  slats(h, GM.glove, 0, -0.03, -0.02, 3, 0.032, 0.082, 0.028, 0.026, 'z');
  bx(h, GM.glove, -0.045, 0.01, -0.045, 0.03, 0.05, 0.055, 0.4); // thumb
  bx(h, GM.glove, 0, -0.02, 0.16, 0.095, 0.10, 0.24, 0.16);      // wrist + forearm
  bx(h, GM.olive, 0, -0.02, 0.30, 0.10, 0.105, 0.10, 0.16);      // sleeve cuff
  g.add(h);
  return h;
}
/* muzzle flash: a cone plus crossed petals, additive, re-rolled every shot */
function makeFlash (z, size) {
  const f = new T.Group();
  const mat = new T.MeshBasicMaterial({ color:0xffd070, transparent:true, opacity:0.95,
                                        blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide });
  const core = new T.Mesh(coneGeo, mat);
  core.scale.set(size*0.75, size*2.0, size*0.75);
  core.rotation.x = -Math.PI/2;
  core.position.z = -size;
  f.add(core);
  const petalGeo = new T.PlaneGeometry(1, 1);
  for (let i = 0; i < 3; i++) {
    const p = new T.Mesh(petalGeo, mat);
    p.scale.set(size*2.6, size*2.6, 1);
    p.rotation.z = i * 1.05;
    f.add(p);
  }
  const halo = glowSprite(0xffc978, size * 5.0, 0.9);
  halo.position.z = -size * 0.7;
  f.add(halo);
  f.position.z = z;
  f.visible = false;
  return f;
}

/* ---- the eight builds ---------------------------------------------------- */
const GUN_BUILDS = {

  pistol (g) {
    const slide = new T.Group(); g.add(slide);
    bx(slide, GM.dark,  0, 0.048, -0.10, 0.080, 0.088, 0.38);
    slats(slide, GM.poly, 0.041, 0.048, 0.045, 5, 0.022, 0.006, 0.06, 0.012, 'z');
    slats(slide, GM.poly, -0.041, 0.048, 0.045, 5, 0.022, 0.006, 0.06, 0.012, 'z');
    bx(slide, GM.dark,  0, 0.096, -0.10, 0.030, 0.020, 0.34);
    bx(slide, GM.steel, 0, 0.105, -0.26, 0.014, 0.028, 0.022);   // front sight
    bx(slide, GM.steel, 0, 0.100,  0.055, 0.058, 0.024, 0.026);  // rear sight
    cy(slide, GM.steel, 0, 0.048, -0.30, 0.019, 0.10, 'z');      // barrel crown

    bx(g, GM.poly,  0, -0.020, -0.055, 0.072, 0.075, 0.30);      // frame
    bx(g, GM.poly,  0, -0.062, -0.185, 0.056, 0.036, 0.16);      // accessory rail
    slats(g, GM.dark, 0, -0.080, -0.185, 3, 0.045, 0.058, 0.012, 0.020, 'z');
    bx(g, GM.poly,  0, -0.150,  0.055, 0.070, 0.215, 0.115, 0.30); // grip
    slats(g, GM.dark, 0, -0.150, 0.088, 4, 0.040, 0.072, 0.030, 0.014, 'z');
    bx(g, GM.dark,  0, -0.085,  0.008, 0.052, 0.055, 0.020);     // trigger guard rear
    bx(g, GM.dark,  0, -0.120, -0.045, 0.052, 0.018, 0.075);     // guard bottom
    bx(g, GM.steel, 0, -0.062,  0.010, 0.020, 0.045, 0.014);     // trigger
    bx(g, GM.steel, 0,  0.058,  0.115, 0.032, 0.052, 0.030, -0.35); // hammer

    const mag = bx(g, GM.dark, 0, -0.155, 0.062, 0.054, 0.215, 0.085, 0.30);
    hand(g, 0.005, -0.155, 0.115, 0.30, -0.12);
    return { slide, mag, flashZ:-0.36, flashY:0.048, flashSize:0.075 };
  },

  smg (g) {
    bx(g, GM.poly, 0, 0, -0.14, 0.090, 0.130, 0.52);             // receiver
    bx(g, GM.dark, 0, 0.075, -0.16, 0.052, 0.024, 0.46);         // top rail
    slats(g, GM.poly, 0, 0.090, -0.16, 9, 0.045, 0.056, 0.012, 0.022, 'z');
    bx(g, GM.dark, 0, 0.012, -0.46, 0.058, 0.064, 0.18);         // shroud
    slats(g, GM.poly, 0.031, 0.012, -0.46, 3, 0.05, 0.006, 0.040, 0.030, 'z');
    slats(g, GM.poly, -0.031, 0.012, -0.46, 3, 0.05, 0.006, 0.040, 0.030, 'z');
    cy(g, GM.steel, 0, 0.012, -0.60, 0.016, 0.16, 'z');          // barrel
    bx(g, GM.steel, 0, 0.108, -0.52, 0.016, 0.048, 0.020);       // front post
    bx(g, GM.steel, 0, 0.102,  0.045, 0.052, 0.030, 0.026);      // rear aperture

    const slide = bx(g, GM.metal, 0.052, 0.030, -0.02, 0.016, 0.048, 0.13); // charging handle
    const mag = bx(g, GM.dark, 0, -0.195, -0.030, 0.050, 0.250, 0.090, -0.06);
    bx(g, GM.poly, 0, -0.145, 0.105, 0.064, 0.180, 0.095, 0.28); // grip
    slats(g, GM.dark, 0, -0.145, 0.140, 4, 0.038, 0.066, 0.028, 0.014, 'z');
    bx(g, GM.poly, 0, -0.135, -0.375, 0.052, 0.140, 0.062, -0.10); // foregrip
    bx(g, GM.dark, 0, 0.005, 0.225, 0.048, 0.075, 0.20);         // stock rod
    bx(g, GM.poly, 0, -0.005, 0.335, 0.080, 0.145, 0.035);       // buttplate
    hand(g, 0.005, -0.150, 0.170, 0.26, -0.10);
    hand(g, -0.010, -0.150, -0.330, -0.30, 0.55);
    return { slide, mag, flashZ:-0.70, flashY:0.012, flashSize:0.085 };
  },

  shotgun (g) {
    bx(g, GM.dark,  0, 0, -0.05, 0.095, 0.120, 0.42);            // receiver
    bx(g, GM.poly,  0.050, 0.010, -0.10, 0.012, 0.055, 0.14);    // ejection port
    bx(g, GM.brass, 0.050, -0.030, 0.030, 0.014, 0.030, 0.070);  // shell on lifter
    cy(g, GM.steel, 0, 0.052, -0.46, 0.027, 0.76, 'z');          // barrel
    cy(g, GM.dark,  0, -0.028, -0.42, 0.020, 0.64, 'z');         // magazine tube
    sp(g, GM.brass, 0, 0.088, -0.82, 0.013);                     // bead sight

    const pump = new T.Group(); g.add(pump);
    bx(pump, GM.wood, 0, -0.020, -0.36, 0.086, 0.095, 0.18);
    slats(pump, GM.poly, 0, -0.020, -0.36, 5, 0.030, 0.090, 0.099, 0.012, 'z');

    bx(g, GM.wood, 0, -0.095,  0.150, 0.070, 0.115, 0.20, 0.22); // wrist
    bx(g, GM.wood, 0, -0.055,  0.320, 0.078, 0.145, 0.30, -0.10); // buttstock
    bx(g, GM.dark, 0, -0.075,  0.470, 0.088, 0.170, 0.032, -0.10);
    bx(g, GM.dark, 0, -0.085,  0.020, 0.050, 0.020, 0.080);      // guard
    bx(g, GM.steel,0, -0.058,  0.045, 0.018, 0.042, 0.014);      // trigger
    hand(g, 0.005, -0.135, 0.185, 0.24, -0.10);
    hand(g, -0.005, -0.115, -0.355, -0.26, 0.50);
    return { pump, flashZ:-0.86, flashY:0.052, flashSize:0.11 };
  },

  carbine (g) {
    bx(g, GM.dark, 0, 0.035, -0.18, 0.074, 0.090, 0.48);         // upper
    bx(g, GM.poly, 0, -0.040, -0.02, 0.070, 0.080, 0.28);        // lower
    bx(g, GM.dark, 0, 0.090, -0.18, 0.050, 0.022, 0.44);         // flat top rail
    slats(g, GM.poly, 0, 0.104, -0.18, 9, 0.044, 0.054, 0.012, 0.020, 'z');
    bx(g, GM.poly, 0, 0.025, -0.48, 0.064, 0.078, 0.30);         // handguard
    slats(g, GM.dark, 0.034, 0.025, -0.48, 4, 0.058, 0.008, 0.046, 0.038, 'z');
    slats(g, GM.dark, -0.034, 0.025, -0.48, 4, 0.058, 0.008, 0.046, 0.038, 'z');
    bx(g, GM.metal, 0, 0.060, -0.635, 0.042, 0.055, 0.055);      // gas block
    bx(g, GM.steel, 0, 0.110, -0.635, 0.018, 0.060, 0.020);      // front post
    cy(g, GM.steel, 0, 0.025, -0.72, 0.015, 0.28, 'z');          // barrel
    cy(g, GM.dark,  0, 0.025, -0.87, 0.024, 0.09, 'z');          // muzzle brake
    bx(g, GM.dark, 0, 0.105, 0.040, 0.048, 0.048, 0.10);         // rear sight block
    cy(g, GM.dark, 0, 0.030, 0.230, 0.030, 0.26, 'z');           // buffer tube
    bx(g, GM.poly, 0, 0.015, 0.300, 0.062, 0.120, 0.20);         // stock
    bx(g, GM.dark, 0, 0.005, 0.410, 0.078, 0.155, 0.035);        // buttpad
    bx(g, GM.poly, 0, -0.155, 0.095, 0.060, 0.170, 0.080, 0.30); // grip
    slats(g, GM.dark, 0, -0.155, 0.128, 4, 0.036, 0.064, 0.026, 0.014, 'z');
    bx(g, GM.dark, 0, -0.090, -0.015, 0.052, 0.020, 0.085);      // guard

    const slide = bx(g, GM.metal, 0, 0.085, 0.130, 0.070, 0.022, 0.070); // charging handle
    const mag = bx(g, GM.dark, 0, -0.175, -0.070, 0.052, 0.220, 0.090, 0.10);
    hand(g, 0.005, -0.160, 0.160, 0.28, -0.10);
    hand(g, -0.010, -0.115, -0.470, -0.28, 0.52);
    return { slide, mag, flashZ:-0.94, flashY:0.025, flashSize:0.095 };
  },

  magnum (g) {
    bx(g, GM.metal, 0, 0.035, -0.28, 0.046, 0.062, 0.36);        // barrel
    bx(g, GM.metal, 0, -0.020, -0.28, 0.036, 0.048, 0.32);       // underlug
    bx(g, GM.dark,  0, 0.070, -0.28, 0.020, 0.014, 0.32);        // vent rib
    bx(g, GM.steel, 0, 0.092, -0.44, 0.014, 0.030, 0.020);       // front blade
    bx(g, GM.metal, 0, 0.010, -0.02, 0.050, 0.105, 0.24);        // frame
    bx(g, GM.steel, 0, 0.080, 0.075, 0.048, 0.022, 0.055);       // rear notch

    const drum = new T.Group(); drum.position.set(0, 0.005, -0.055); g.add(drum);
    cy(drum, GM.metal, 0, 0, 0, 0.060, 0.145, 'z');
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI/3;
      cy(drum, GM.dark, Math.cos(a)*0.037, Math.sin(a)*0.037, -0.001, 0.014, 0.150, 'z');
      cy(drum, GM.brass, Math.cos(a)*0.037, Math.sin(a)*0.037, 0.070, 0.013, 0.020, 'z');
    }
    bx(g, GM.wood,  0, -0.165, 0.085, 0.062, 0.215, 0.125, 0.34); // grip
    bx(g, GM.dark,  0, -0.100, 0.090, 0.066, 0.070, 0.030, 0.34);
    bx(g, GM.steel, 0, 0.075, 0.115, 0.030, 0.050, 0.032, -0.40); // hammer
    bx(g, GM.steel, 0, -0.060, 0.030, 0.018, 0.044, 0.014);       // trigger
    bx(g, GM.metal, 0, -0.090, 0.000, 0.050, 0.018, 0.075);       // guard
    hand(g, 0.005, -0.165, 0.145, 0.32, -0.12);
    return { drum, flashZ:-0.48, flashY:0.035, flashSize:0.115 };
  },

  sniper (g) {
    bx(g, GM.dark, 0, 0, -0.12, 0.074, 0.105, 0.46);             // receiver
    cy(g, GM.steel, 0, 0, -0.60, 0.018, 0.74, 'z');              // heavy barrel
    cy(g, GM.dark,  0, 0, -0.98, 0.028, 0.11, 'z');              // brake
    slats(g, GM.poly, 0, 0.028, -0.98, 3, 0.028, 0.060, 0.008, 0.020, 'z');

    // scope: tube, bells, glass, rings
    cy(g, GM.dark,  0, 0.150, -0.18, 0.043, 0.40, 'z');
    cy(g, GM.dark,  0, 0.150, -0.40, 0.055, 0.10, 'z');
    cy(g, GM.dark,  0, 0.150,  0.045, 0.052, 0.09, 'z');
    cy(g, GM.glass, 0, 0.150, -0.448, 0.048, 0.014, 'z');
    cy(g, GM.glass, 0, 0.150,  0.088, 0.045, 0.014, 'z');
    bx(g, GM.metal, 0, 0.108, -0.300, 0.052, 0.070, 0.032);
    bx(g, GM.metal, 0, 0.108, -0.030, 0.052, 0.070, 0.032);
    cy(g, GM.metal, 0, 0.195, -0.18, 0.020, 0.030, 'y');         // turret

    const slide = new T.Group(); slide.position.set(0.050, 0.020, 0.040); g.add(slide);
    cy(slide, GM.steel, 0.030, 0, 0, 0.013, 0.10, 'x');          // bolt shaft
    sp(slide, GM.steel, 0.080, 0, 0, 0.026);                     // bolt knob

    bx(g, GM.poly, 0, -0.060, -0.44, 0.062, 0.075, 0.36);        // forend
    bx(g, GM.poly, 0, -0.030, 0.290, 0.064, 0.150, 0.36);        // buttstock
    bx(g, GM.poly, 0, 0.065, 0.250, 0.058, 0.055, 0.24);         // cheek riser
    bx(g, GM.dark, 0, -0.050, 0.470, 0.080, 0.180, 0.034);       // buttpad
    bx(g, GM.poly, 0, -0.155, 0.105, 0.060, 0.170, 0.080, 0.28); // grip
    bx(g, GM.dark, 0, -0.090, 0.010, 0.052, 0.020, 0.085);       // guard
    cy(g, GM.metal, 0.048, -0.145, -0.560, 0.010, 0.17, 'y', 0, 0, 0.42);  // bipod
    cy(g, GM.metal, -0.048, -0.145, -0.560, 0.010, 0.17, 'y', 0, 0, -0.42);

    const mag = bx(g, GM.dark, 0, -0.150, -0.055, 0.052, 0.150, 0.095);
    hand(g, 0.005, -0.160, 0.170, 0.28, -0.10);
    hand(g, -0.010, -0.135, -0.470, -0.26, 0.50);
    return { slide, mag, flashZ:-1.05, flashY:0, flashSize:0.10 };
  },

  lmg (g) {
    bx(g, GM.dark, 0, 0, -0.10, 0.115, 0.140, 0.54);             // receiver
    bx(g, GM.poly, 0, 0.080, -0.12, 0.105, 0.032, 0.46);         // feed cover
    slats(g, GM.dark, 0, 0.100, -0.12, 6, 0.062, 0.100, 0.014, 0.026, 'z');
    bx(g, GM.dark, 0, 0.135, -0.02, 0.032, 0.055, 0.18);         // carry handle
    bx(g, GM.dark, 0, 0.165, -0.02, 0.036, 0.022, 0.20);
    bx(g, GM.dark, 0, 0.012, -0.48, 0.078, 0.090, 0.28);         // heat shroud
    slats(g, GM.poly, 0.042, 0.012, -0.48, 4, 0.060, 0.008, 0.052, 0.038, 'z');
    slats(g, GM.poly, -0.042, 0.012, -0.48, 4, 0.060, 0.008, 0.052, 0.038, 'z');
    cy(g, GM.steel, 0, 0.012, -0.72, 0.022, 0.30, 'z');          // barrel
    cy(g, GM.dark,  0, 0.012, -0.90, 0.032, 0.10, 'z');          // flash hider
    bx(g, GM.steel, 0, 0.115, -0.60, 0.018, 0.055, 0.020);       // front post
    cy(g, GM.metal, 0.060, -0.155, -0.600, 0.011, 0.20, 'y', 0, 0, 0.40);  // bipod
    cy(g, GM.metal, -0.060, -0.155, -0.600, 0.011, 0.20, 'y', 0, 0, -0.40);
    bx(g, GM.poly, 0, -0.015, 0.310, 0.072, 0.135, 0.30);        // stock
    bx(g, GM.dark, 0, -0.035, 0.450, 0.086, 0.170, 0.034);
    bx(g, GM.poly, 0, -0.165, 0.115, 0.064, 0.180, 0.085, 0.30); // grip
    bx(g, GM.dark, 0, -0.100, 0.020, 0.054, 0.020, 0.090);

    const mag = new T.Group(); mag.position.set(0.010, -0.175, -0.030); g.add(mag);
    bx(mag, GM.olive, 0, 0, 0, 0.135, 0.165, 0.235);             // ammo box
    bx(mag, GM.dark,  0, 0.090, 0, 0.100, 0.030, 0.180);
    for (let i = 0; i < 5; i++)                                   // belt climbing to the tray
      bx(mag, GM.brass, 0, 0.095 + i*0.020, -0.100 - i*0.022, 0.075, 0.022, 0.028, -0.5);
    hand(g, 0.005, -0.170, 0.180, 0.28, -0.10);
    hand(g, -0.010, -0.130, -0.480, -0.26, 0.50);
    return { mag, flashZ:-0.98, flashY:0.012, flashSize:0.12 };
  },

  thumper (g) {
    cy(g, GM.dark,  0, 0.020, -0.44, 0.058, 0.50, 'z');          // fat barrel
    cy(g, GM.metal, 0, 0.020, -0.68, 0.066, 0.06, 'z');          // muzzle ring
    bx(g, GM.poly,  0, -0.040, -0.08, 0.052, 0.150, 0.24);       // frame
    bx(g, GM.dark,  0, 0.120, -0.24, 0.022, 0.110, 0.024);       // ladder sight
    slats(g, GM.metal, 0, 0.150, -0.24, 3, 0.030, 0.044, 0.010, 0.018, 'z');

    const drum = new T.Group(); drum.position.set(0, 0.015, -0.06); g.add(drum);
    cy(drum, GM.dark, 0, 0, 0, 0.110, 0.180, 'z');
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI/2;
      cy(drum, GM.poly,  Math.cos(a)*0.065, Math.sin(a)*0.065, 0, 0.030, 0.190, 'z');
      cy(drum, GM.olive, Math.cos(a)*0.065, Math.sin(a)*0.065, 0.085, 0.027, 0.030, 'z');
    }
    bx(g, GM.poly, 0, -0.020, 0.260, 0.064, 0.130, 0.28);        // stock
    bx(g, GM.dark, 0, -0.040, 0.390, 0.080, 0.160, 0.034);
    bx(g, GM.poly, 0, -0.165, 0.070, 0.062, 0.175, 0.082, 0.30); // grip
    bx(g, GM.dark, 0, -0.100, -0.010, 0.054, 0.020, 0.090);
    bx(g, GM.poly, 0, -0.105, -0.330, 0.052, 0.115, 0.075, -0.12); // foregrip
    hand(g, 0.005, -0.170, 0.130, 0.30, -0.10);
    hand(g, -0.010, -0.100, -0.310, -0.28, 0.50);
    return { drum, flashZ:-0.74, flashY:0.020, flashSize:0.14 };
  },
};

function makeGun (w) {
  const g = new T.Group();
  const mats = {};
  for (const k in BASE_MATS) mats[k] = BASE_MATS[k].clone();
  GM = mats;                                  // builders below read GM
  const refs = GUN_BUILDS[w.id](g);
  GM = BASE_MATS;
  const flash = makeFlash(refs.flashZ, refs.flashSize);
  flash.position.y = refs.flashY || 0;
  g.add(flash);
  g.position.set(0.20, -0.20, -0.42);
  g.visible = false;
  gunGroup.add(g);
  return {
    g, flash, mats,
    slide: refs.slide || null, mag: refs.mag || null,
    pump: refs.pump || null, drum: refs.drum || null,
    slideZ: refs.slide ? refs.slide.position.z : 0,
    magY:   refs.mag   ? refs.mag.position.y   : 0,
    pumpZ:  refs.pump  ? refs.pump.position.z  : 0,
  };
}

/* repaint one weapon: reset to factory, then lay the skin's overrides on top */
function applySkin (weaponIndex, skinId) {
  const M = gunModels[weaponIndex];
  if (!M) return;
  const skin = skinById(skinId);
  for (const role in M.mats) {
    const hex = skin.mats[role] !== undefined ? skin.mats[role] : BASE_COLOURS[role];
    M.mats[role].color.setHex(hex);
  }
}
for (let i = 0; i < WEAPONS.length; i++) gunModels.push(makeGun(WEAPONS[i]));

const ammo = WEAPONS.map(w => ({ mag: w.mag, res: w.resMax === Infinity ? Infinity : w.resMax }));

/* ------------------------------------------------------------ the profile
   What you carry, how each gun is painted, and whether the kit is handed to
   you up front or earned wave by wave. Saved between sessions when the
   browser allows it. */
const PROFILE = {
  loadout: WEAPONS.map((w, i) => i),     // ordered; slot 1 is the first entry
  skins: {},                             // weapon id -> skin id
  fullKit: true,                         // everything you carry, from wave 1
  mode: 'night',                         // 'night' = endless siege, 'cycle' = day/night
  upgrades: {},                          // weapon id -> { dmg, mag, reload }
  input: { sens: 1.0, invertY: false, smooth: false, trackpad: false },
  gfx: 'high',                           // 'high' | 'med' | 'low'
  pg: true,                              // classification-safe presentation
};
WEAPONS.forEach(w => { PROFILE.skins[w.id] = 'gunmetal'; });

const PROFILE_KEY = 'horde.profile.v1';
let loaner = false;            // true while the emergency M9 is on loan

function saveProfile () {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PROFILE)); } catch (e) {}
}
function loadProfile () {
  let raw = null;
  try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) { return; }
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p.loadout)) {
      const clean = p.loadout.filter((n, k) =>
        Number.isInteger(n) && n >= 0 && n < WEAPONS.length && p.loadout.indexOf(n) === k);
      if (clean.length) PROFILE.loadout = clean;
    }
    if (p.skins) WEAPONS.forEach(w => {
      if (p.skins[w.id] && skinById(p.skins[w.id]).id === p.skins[w.id]) PROFILE.skins[w.id] = p.skins[w.id];
    });
    if (typeof p.fullKit === 'boolean') PROFILE.fullKit = p.fullKit;
    if (p.mode === 'night' || p.mode === 'cycle') PROFILE.mode = p.mode;
    if (p.gfx && GFX_TIERS[p.gfx]) PROFILE.gfx = p.gfx;
    if (typeof p.pg === 'boolean') PROFILE.pg = p.pg;
    if (p.input && typeof p.input === 'object') {
      const I = p.input;
      if (Number.isFinite(I.sens)) PROFILE.input.sens = clamp(I.sens, 0.2, 4);
      PROFILE.input.invertY = !!I.invertY;
      PROFILE.input.smooth  = !!I.smooth;
      PROFILE.input.trackpad = !!I.trackpad;
    }
    if (p.upgrades && typeof p.upgrades === 'object') {
      WEAPONS.forEach(w => {
        const u = p.upgrades[w.id];
        if (!u) return;
        const clean = {};
        UPGRADES.forEach(t => {
          const v = u[t.id];
          if (Number.isInteger(v) && v > 0) clean[t.id] = Math.min(v, t.max);
        });
        if (Object.keys(clean).length) PROFILE.upgrades[w.id] = clean;
      });
    }
  } catch (e) {}
}

/* Which guns can you draw right now?  Only ones you're carrying, and either
   the whole kit or the ones the wave count has earned. */
function refreshAvailability (announce) {
  const wv = Math.max(1, game.wave);        // the pre-wave lull still counts as wave 1
  for (let i = 0; i < WEAPONS.length; i++) {
    const carried = PROFILE.loadout.indexOf(i) !== -1;
    const earned  = PROFILE.fullKit || wv >= WEAPONS[i].unlock;
    const was = gunState.unlocked[i];
    const now = carried && earned;
    gunState.unlocked[i] = now;
    if (now && !was) {
      ammo[i].mag = statMag(i);
      ammo[i].res = WEAPONS[i].resMax === Infinity ? Infinity
                  : Math.max(ammo[i].res, Math.round(WEAPONS[i].resMax * 0.7));
      if (announce) {
        const slot = PROFILE.loadout.indexOf(i) + 1;
        Sfx.unlock();
        banner(WEAPONS[i].name + ' UNLOCKED');
        toast('PRESS ' + slot + ' TO DRAW');
      }
    }
  }
  /* Nothing you are carrying has been earned yet? You get the M9 as a loaner
     so you are never sent out empty-handed. It is withdrawn the moment one of
     your own weapons comes good, and it never unlocks anything you have not
     earned — parking the launcher in slot 1 no longer hands it to you. */
  loaner = false;
  if (!PROFILE.fullKit) {
    let any = false;
    for (let i = 0; i < WEAPONS.length; i++) if (gunState.unlocked[i]) { any = true; break; }
    if (!any) {
      gunState.unlocked[0] = true;
      loaner = true;
      if (ammo[0].mag <= 0) ammo[0].mag = WEAPONS[0].mag;
    }
  }

  // if the gun in your hands is gone, draw the first one you can
  if (!gunState.unlocked[gunState.cur]) {
    let first = -1;
    for (let n = 0; n < PROFILE.loadout.length; n++) {
      const wi = PROFILE.loadout[n];
      if (gunState.unlocked[wi]) { first = wi; break; }
    }
    if (first < 0) for (let i = 0; i < WEAPONS.length; i++) if (gunState.unlocked[i]) { first = i; break; }
    if (first >= 0 && first !== gunState.cur) forceWeapon(first);
  }
  syncHud();
}

/* draw by loadout slot (what the number keys actually mean) */
function selectSlot (n) {
  const i = PROFILE.loadout[n];
  if (i === undefined) { toast('NO WEAPON IN SLOT ' + (n + 1)); return; }
  switchWeapon(i);
}



const gunState = {
  cur: 0, reloading: false, reloadT: 0, nextShot: 0,
  recoil: 0, recoilYaw: 0, kickZ: 0, sway: 0,
  ads: false, adsT: 0,          // 0 = hip, 1 = fully sighted
  slideT: 0, pumpT: 0, drumA: 0, drumTarget: 0,
  unlocked: WEAPONS.map((w, i) => i === 0),
};

/* tracers */
const tracers = [];
for (let i = 0; i < 22; i++) {
  const geo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const m = new T.Line(geo, new T.LineBasicMaterial({ color: 0xffe0a0, transparent:true, opacity:0.9 }));
  m.visible = false; scene.add(m);
  tracers.push({ m, life:0 });
}
let tracerPtr = 0;
function tracer (from, to) {
  const t = tracers[tracerPtr = (tracerPtr + 1) % tracers.length];
  const pos = t.m.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.m.geometry.computeBoundingSphere();
  t.m.visible = true;
  t.life = 0.055;
}
function updateTracers (dt) {
  for (let i = 0; i < tracers.length; i++) {
    const t = tracers[i];
    if (t.life <= 0) continue;
    t.life -= dt;
    if (t.life <= 0) t.m.visible = false;
  }
}

/* ------------------------------------------------------- grenades & blasts */
const grenades = [];
const grenGeo = new T.SphereGeometry(0.09, 8, 6);
const grenMat = new T.MeshLambertMaterial({ color: 0x4c5539, emissive: 0x1a2010 });
for (let i = 0; i < 8; i++) {
  const m = new T.Mesh(grenGeo, grenMat);
  m.visible = false; scene.add(m);
  grenades.push({ m, vel: new T.Vector3(), life: 0 });
}

const blasts = [];
const blastGeo = new T.SphereGeometry(1, 14, 10);
for (let i = 0; i < 5; i++) {
  const mat = new T.MeshBasicMaterial({ color: 0xffb257, transparent:true, opacity:0.9,
                                        blending:T.AdditiveBlending, depthWrite:false });
  const m = new T.Mesh(blastGeo, mat);
  m.visible = false; scene.add(m);
  blasts.push({ m, mat, life: 0, radius: 6 });
}
const blastLight = new T.PointLight(0xffa040, 0, 40, 2);
scene.add(blastLight);

function launchGrenade (from, dir, w) {
  for (let i = 0; i < grenades.length; i++) {
    const g = grenades[i];
    if (g.life > 0) continue;
    g.m.position.copy(from);
    g.vel.copy(dir).multiplyScalar(w.grenade.speed).add(new T.Vector3(0, 3.2, 0));
    g.life = 5;
    g.blast = w.grenade.blast;
    g.dmg = w.grenade.dmg;
    g.m.visible = true;
    return;
  }
}

function explode (pos, radius, dmg) {
  Sfx.boom(at3(pos, 14, 260));
  for (let i = 0; i < blasts.length; i++) {
    const b = blasts[i];
    if (b.life > 0) continue;
    b.m.position.copy(pos);
    b.radius = radius; b.life = 0.42;
    b.m.visible = true;
    break;
  }
  blastLight.position.copy(pos);
  blastLight.intensity = 9;

  bloodBurst(pos, Math.round(26 * GORE.mult));
  for (let i = 0; i < 14; i++) {
    const p = blood[bloodPtr = (bloodPtr + 1) % blood.length];
    p.m.material = dustMat;
    p.m.position.copy(pos);
    p.vx = gauss()*7; p.vy = rnd(1.5, 7); p.vz = gauss()*7;
    p.life = rnd(0.5, 1.1); p.m.visible = true;
  }

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z.alive || z.dying) continue;
    const d = z.g.position.distanceTo(pos);
    if (d > radius) continue;
    hurtZombie(z, dmg * (1 - d / radius), false, z.g.position.clone().setY(1.1));
  }

  const pd = player.pos.distanceTo(pos);
  if (pd < radius) {
    game.shake = Math.min(game.shake + 0.16 * (1 - pd / radius), 0.2);
    if (pd < radius * 0.55) hurtPlayer(Math.round(20 * (1 - pd / radius)), pos.x, pos.z);
  }
}

function updateGrenades (dt) {
  for (let i = 0; i < grenades.length; i++) {
    const g = grenades[i];
    if (g.life <= 0) continue;
    g.life -= dt;
    g.vel.y -= 19 * dt;
    g.m.position.addScaledVector(g.vel, dt);
    g.m.rotation.x += dt * 9;

    let pop = g.life <= 0;
    if (g.m.position.y <= 0.12) { g.m.position.y = 0.12; pop = true; }
    if (!pop && !isClear(g.m.position.x, g.m.position.z, 0.18)) pop = true;
    if (!pop) {
      for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        if (!z.alive || z.dying) continue;
        if (Math.abs(z.g.position.x - g.m.position.x) < 0.8 &&
            Math.abs(z.g.position.z - g.m.position.z) < 0.8 &&
            g.m.position.y < 2.0) { pop = true; break; }
      }
    }
    if (pop) {
      explode(g.m.position, g.blast, g.dmg);
      g.life = 0; g.m.visible = false;
    }
  }

  for (let i = 0; i < blasts.length; i++) {
    const b = blasts[i];
    if (b.life <= 0) continue;
    b.life -= dt;
    const t = 1 - b.life / 0.42;
    b.m.scale.setScalar(b.radius * (0.25 + t * 0.95));
    b.mat.opacity = Math.max(0, 0.9 * (1 - t));
    if (b.life <= 0) b.m.visible = false;
  }
  blastLight.intensity *= Math.max(0, 1 - 7 * dt);
}

const muzzleLight = new T.PointLight(0xffd08a, 0, 22, 2);
scene.add(muzzleLight);

const ray = new T.Raycaster();
const fwd = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3();
const camPos = new T.Vector3(), shotDir = new T.Vector3(), muzzleWorld = new T.Vector3();

function fire () {
  if (game.state !== 'play' || gunState.reloading) return;
  const w = WEAPONS[gunState.cur];
  const a = ammo[gunState.cur];
  if (game.time < gunState.nextShot) return;
  if (a.mag <= 0) { Sfx.dry(); startReload(); return; }

  a.mag--;
  gunState.nextShot = game.time + 60 / w.rpm;
  const kick = w.kick * (gunState.adsT > 0.5 ? 0.65 : 1);
  gunState.recoil    += kick;
  gunState.recoilYaw += gauss() * kick * 0.5;
  gunState.kickZ = Math.min(0.06 + w.kick * 1.6, 0.16);
  game.shake = Math.min(game.shake + w.kick * 1.6, 0.10);
  Sfx.shot(w.tone);
  if (w.id !== 'thumper') Sfx.casing(w.id === 'shotgun' ? 0.55 : 0.34);

  // moving parts
  const M = gunModels[gunState.cur];
  gunState.slideT = 1;
  if (M.pump) gunState.pumpT = 1;
  if (M.drum) gunState.drumTarget += (w.id === 'magnum' ? Math.PI/3 : Math.PI/2);

  M.flash.visible = true;
  M.flash.rotation.z = Math.random() * 6.283;
  M.flash.scale.setScalar(rnd(0.75, 1.35));
  clearTimeout(M.flashT);
  M.flashT = setTimeout(() => { M.flash.visible = false; }, 45);
  muzzleLight.intensity = 2.4 + w.kick * 12;

  camera.getWorldPosition(camPos);
  camera.getWorldDirection(fwd);
  right.set(1,0,0).applyQuaternion(camera.quaternion);
  up.set(0,1,0).applyQuaternion(camera.quaternion);
  muzzleWorld.copy(camPos).add(fwd.clone().multiplyScalar(0.55))
             .add(right.clone().multiplyScalar(0.16))
             .add(up.clone().multiplyScalar(-0.14));

  // 40mm goes out as a physical arcing shell rather than a hitscan ray
  if (w.grenade) {
    launchGrenade(muzzleWorld, fwd, w);
    syncHud();
    return;
  }

  let spread = w.spread * (player.sprinting ? 1.9 : 1) * (player.onGround ? 1 : 2.1);
  spread *= 1 - 0.6 * gunState.adsT;
  // gathered once per trigger pull, shared by every pellet
  const targets = solidsAlong(camPos, fwd, w.range, hitList).slice();

  for (let p = 0; p < w.pellets; p++) {
    shotDir.copy(fwd)
      .add(right.clone().multiplyScalar(gauss() * spread))
      .add(up.clone().multiplyScalar(gauss() * spread))
      .normalize();

    ray.set(camPos, shotDir);
    ray.far = w.range;
    const hits = ray.intersectObjects(targets, false);

    // walk the hits in order: zombies soak one pierce each, a wall stops it dead
    let end = null, punched = 0, hitAny = false;
    const struck = [];
    for (let h = 0; h < hits.length; h++) {
      const o = hits[h].object, z = o.userData.z;
      end = hits[h].point; hitAny = true;
      if (!z) break;                                  // wall or prop: round stops
      if (z.dying || struck.indexOf(z) !== -1) continue;
      struck.push(z);
      const headshot = o.userData.part === 'head';
      const falloff = 1 - punched * 0.25;             // each body costs the round
      hurtZombie(z, statDmg(gunState.cur) * (headshot ? w.head : 1) * falloff, headshot, hits[h].point);
      if (punched++ >= w.pierce) break;
    }
    if (!end) end = camPos.clone().add(shotDir.clone().multiplyScalar(w.range));

    tracer(muzzleWorld, end);
    if (window.NET && NET.onLocalShot) NET.onLocalShot(muzzleWorld, end, gunState.cur);

    if (hitAny && !struck.length) {
      const p2 = blood[bloodPtr = (bloodPtr + 1) % blood.length];
      p2.m.material = dustMat;
      p2.m.position.copy(end);
      p2.vx = gauss()*1.4; p2.vy = rnd(0.4,1.6); p2.vz = gauss()*1.4;
      p2.life = 0.25; p2.m.visible = true;
    }
  }
  syncHud();
}

function startReload () {
  const w = WEAPONS[gunState.cur], a = ammo[gunState.cur];
  if (gunState.reloading || a.mag >= statMag(gunState.cur)) return;
  if (a.res !== Infinity && a.res <= 0) { toast('NO RESERVE AMMO'); return; }
  gunState.reloading = true;
  gunState.reloadT = statReload(gunState.cur);
  Sfx.magOut();
  $('reloadTag').classList.remove('hidden');
}

function finishReload () {
  const w = WEAPONS[gunState.cur], a = ammo[gunState.cur];
  const cap = statMag(gunState.cur);
  const need = cap - a.mag;
  if (a.res === Infinity) a.mag = cap;
  else { const take = Math.min(need, a.res); a.mag += take; a.res -= take; }
  gunState.reloading = false;
  Sfx.magIn();
  $('reloadTag').classList.add('hidden');
  syncHud();
}

function switchWeapon (i) {
  if (game.state !== 'play' || i === gunState.cur || i < 0 || i >= WEAPONS.length) return;
  if (!gunState.unlocked[i]) {
    if (PROFILE.loadout.indexOf(i) === -1) toast(WEAPONS[i].name + ' NOT IN LOADOUT');
    else toast('LOCKED UNTIL WAVE ' + WEAPONS[i].unlock);
    Sfx.dry();
    return;
  }
  forceWeapon(i);
}

function forceWeapon (i) {
  gunState.cur = i;
  gunState.reloading = false;
  gunState.reloadT = 0;
  gunState.nextShot = game.time + 0.22;
  gunState.kickZ = 0.22;
  gunState.slideT = 0; gunState.pumpT = 0;
  $('reloadTag').classList.add('hidden');
  for (let k = 0; k < gunModels.length; k++) gunModels[k].g.visible = (k === i);
  syncHud();
}

/* next/previous available gun, walking the loadout order */
function cycleWeapon (dir) {
  const L = PROFILE.loadout;
  const at = L.indexOf(gunState.cur);
  for (let n = 1; n <= L.length; n++) {
    const i = L[((at + dir * n) % L.length + L.length) % L.length];
    if (gunState.unlocked[i]) { switchWeapon(i); return; }
  }
}

/* ---------------------------------------------------------------- player */
const player = {
  pos: new T.Vector3(0, EYE, 0),
  vel: new T.Vector3(),
  yaw: 0, pitch: 0,
  onGround: true, sprinting: false,
  hp: 100, bob: 0, feet: 0, stepDist: 0,
  /* movement feel — pos.y always stays feet + EYE so every other system keeps
     working; crouch, step-up and landing are camera offsets applied on top */
  crouch: 0, height: STAND_H,
  coyote: 0, jumpBuf: 0,
  sliding: false, slideT: 0, slideCd: 0,
  stepOff: 0, landDip: 0, strafe: 0,
};

const keys = Object.create(null);
let firing = false;

/* Screen-edge damage. The old version faded a vignette with a CSS transition
   that was slower than the flash itself, so it never got above a smudge — this
   one snaps to full and decays in the render loop instead. Edges light up on
   the side the hit came from, which doubles as a direction cue. */
const dmgEdge = { t:0, b:0, l:0, r:0, all:0 };
const edgeEls = {};

function flashDamage (dmg, fromX, fromZ) {
  const strength = clamp(0.45 + dmg / 45, 0.45, 1);
  dmgEdge.all = Math.max(dmgEdge.all, strength * 0.75);

  if (fromX === undefined) {                      // no direction: light everything
    dmgEdge.t = dmgEdge.b = dmgEdge.l = dmgEdge.r = Math.max(dmgEdge.t, strength * 0.7);
    return;
  }
  const dx = fromX - player.pos.x, dz = fromZ - player.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  // project onto the camera's forward and right axes
  const fwdC   = -Math.sin(player.yaw) * ux - Math.cos(player.yaw) * uz;
  const rightC =  Math.cos(player.yaw) * ux - Math.sin(player.yaw) * uz;
  dmgEdge.t = Math.max(dmgEdge.t, Math.max(0,  fwdC)   * strength);
  dmgEdge.b = Math.max(dmgEdge.b, Math.max(0, -fwdC)   * strength);
  dmgEdge.r = Math.max(dmgEdge.r, Math.max(0,  rightC) * strength);
  dmgEdge.l = Math.max(dmgEdge.l, Math.max(0, -rightC) * strength);
}

function updateDamageFlash (dt) {
  const k = Math.max(0, 1 - dt * 3.4);            // ~0.45s to fade out
  dmgEdge.t *= k; dmgEdge.b *= k; dmgEdge.l *= k; dmgEdge.r *= k; dmgEdge.all *= k;
  edgeEls.t.style.opacity = dmgEdge.t.toFixed(3);
  edgeEls.b.style.opacity = dmgEdge.b.toFixed(3);
  edgeEls.l.style.opacity = dmgEdge.l.toFixed(3);
  edgeEls.r.style.opacity = dmgEdge.r.toFixed(3);
  edgeEls.v.style.opacity = dmgEdge.all.toFixed(3);
}

function hurtPlayer (dmg, fromX, fromZ) {
  if (game.state !== 'play' || game.invuln > 0) return;
  player.hp -= dmg;
  game.invuln = 0.18;
  game.shake = Math.min(game.shake + 0.04 + dmg * 0.0016, 0.14);
  Sfx.hurt();
  flashDamage(dmg, fromX, fromZ);
  if (player.hp <= 0) { player.hp = 0; die(); }
  syncHud();
}

function movePlayer (dt) {
  let ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup'])    iz += 1;
  if (keys['s'] || keys['arrowdown'])  iz -= 1;
  if (keys['a'] || keys['arrowleft'])  ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }

  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  // three.js cameras look down -Z, so forward = (-sin yaw, -cos yaw)
  // and right = (cos yaw, -sin yaw). Rotate the WASD input onto those.
  const wishX = ( ix * cy - iz * sy);
  const wishZ = (-ix * sy - iz * cy);

  let speed = Math.hypot(player.vel.x, player.vel.z);
  const crouchKey = !!(keys['control'] || keys['c']);

  /* ---- slide: crouch out of a sprint and you keep the momentum ---- */
  player.slideCd -= dt;
  if (crouchKey && !player.sliding && player.slideCd <= 0 && player.onGround &&
      player.sprinting && speed > SPRINT * 0.72) {
    player.sliding = true;
    player.slideT = SLIDE_TIME;
    const boost = SLIDE_SPD / Math.max(0.001, speed);
    if (boost > 1) { player.vel.x *= boost; player.vel.z *= boost; }
    Sfx.step(null, true);
  }
  if (player.sliding) {
    player.slideT -= dt;
    if (player.slideT <= 0 || !player.onGround || speed < 3.4 || !crouchKey) {
      player.sliding = false;
      player.slideCd = SLIDE_CD;
    }
  }

  /* ---- crouch blend, with a ceiling check before standing back up ---- */
  let wantCrouch = crouchKey || player.sliding;
  if (!wantCrouch && player.crouch > 0.02) {
    const f = player.pos.y - EYE;
    if (!isClear(player.pos.x, player.pos.z, P_RADIUS, f + CROUCH_H, f + STAND_H)) wantCrouch = true;
  }
  player.crouch += ((wantCrouch ? 1 : 0) - player.crouch) * Math.min(1, dt * 13);
  player.height = STAND_H + (CROUCH_H - STAND_H) * player.crouch;

  /* ---- horizontal acceleration ---- */
  const canSprint = !player.sliding && player.crouch < 0.5 && iz > 0.1;
  player.sprinting = !!(keys['shift'] && len > 0 && canSprint);
  let target = player.sprinting ? SPRINT : WALK;
  target *= 1 - 0.55 * player.crouch;

  if (player.sliding) {
    // a slide steers, it does not accelerate — friction bleeds it off
    const f = Math.max(0, 1 - 2.1 * dt);
    player.vel.x *= f; player.vel.z *= f;
    player.vel.x += wishX * 5.5 * dt;
    player.vel.z += wishZ * 5.5 * dt;
  } else {
    /* Frame-rate independent approach: 1 - e^(-rate*dt) always covers the same
       fraction of the gap per second, whether you are on 30fps or 240. In the
       air you only get AIR_CTRL of that rate, so a jump commits you to a
       direction instead of letting you steer like a drone. */
    const rate = (ACCEL / Math.max(target, 0.001)) * (player.onGround ? 1 : AIR_CTRL);
    const k = 1 - Math.exp(-rate * dt);
    player.vel.x += (wishX * target - player.vel.x) * k;
    player.vel.z += (wishZ * target - player.vel.z) * k;
    if (len === 0 && player.onGround) {
      const f = Math.max(0, 1 - FRICTION * dt);
      player.vel.x *= f; player.vel.z *= f;
    }
  }

  /* ---- jump, with coyote time and an input buffer ---- */
  if (player.onGround) player.coyote = COYOTE; else player.coyote -= dt;
  player.jumpBuf -= dt;
  if (keys[' '] || keys['space']) player.jumpBuf = JUMP_BUF;
  if (player.jumpBuf > 0 && player.coyote > 0) {
    player.vel.y = JUMP;
    player.onGround = false;
    player.coyote = 0; player.jumpBuf = 0;
    if (player.sliding) { player.sliding = false; player.slideCd = SLIDE_CD * 0.5; }
    Sfx.step(null, player.feet > 0.2);
  }
  player.vel.y -= GRAVITY * dt;

  const prevFeet = player.pos.y - EYE;
  const fallVel = player.vel.y;
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  player.pos.y += player.vel.y * dt;

  // what am I standing on? anything low enough to step onto counts as floor
  const ground = groundAt(player.pos.x, player.pos.z, P_RADIUS, prevFeet, STEP_P);

  let feet = player.pos.y - EYE;
  const wasAir = !player.onGround;
  if (feet <= ground) {
    const rise = ground - feet;
    player.pos.y = ground + EYE; feet = ground;
    player.vel.y = 0; player.onGround = true;
    if (wasAir && fallVel < -6) {
      // land heavy and the camera absorbs it, like knees taking the drop
      player.landDip = clamp((-fallVel - 6) / 15, 0, 1);
      Sfx.step(null, true);
    } else if (!wasAir && rise > 0.08) {
      // stepping onto a kerb: the body snaps up, the camera catches up after
      player.stepOff = Math.min(player.stepOff + rise, 0.75);
    }
  } else {
    player.onGround = false;
  }

  resolve(player.pos, P_RADIUS, feet, player.height, null, STEP_P);
  player.feet = feet;

  player.stepOff *= Math.max(0, 1 - 13 * dt);
  player.landDip *= Math.max(0, 1 - 7 * dt);
  player.strafe += (ix - player.strafe) * Math.min(1, dt * 9);

  // head bob — a metronome tied to how fast the legs are actually moving
  speed = Math.hypot(player.vel.x, player.vel.z);
  player.bob += dt * speed * 1.5;
  if (speed < 0.4) player.bob *= 0.9;

  // footsteps fall on distance covered, so they stay in step at any pace
  if (player.onGround && speed > 0.6 && !player.sliding) {
    player.stepDist += speed * dt;
    const stride = player.sprinting ? 2.05 : player.crouch > 0.5 ? 1.45 : 1.75;
    if (player.stepDist > stride) {
      player.stepDist = 0;
      Sfx.step(null, feet > 0.2);          // harder sound up on metal and concrete
    }
  } else if (!player.onGround) {
    player.stepDist = 1.4;                 // land with a step the moment you touch down
  }
}

/* ---------------------------------------------------------------- waves */
const game = {
  state: 'menu',              // menu | play | pause | dead
  time: 0, wave: 0, kills: 0, score: 0,
  toSpawn: 0, spawnT: 0, zAlive: 0,
  inBreak: true, breakT: 3.5, boss: false, bossQueue: null,
  mode: 'night', phase: 'night', phaseT: 0, light: 0,
  weather: 'clear', weatherT: 60,
  shake: 0, invuln: 0, growlBudget: 3, growlT: 0, stepBudget: 6, heartT: 0,
  elapsed: 0,
};

/* Steeper ramp and a bigger batch on screen: a wave that takes four minutes to
   grind through is unwatchable in a three-minute video. */
function waveQuota (n) { return Math.round(5 + n * 3.2); }
function waveCap (n)   { return Math.min(8 + n * 2, MAX_ZOMBIES); }

function startWave () {
  game.wave++;
  game.boss = (game.wave % 10) === 0;
  game.bossQueue = game.boss ? buildBossQueue() : null;
  game.toSpawn = game.boss ? game.bossQueue.length : waveQuota(game.wave);
  game.inBreak = false;
  game.spawnT = 0;
  Sfx.wave();
  banner(game.boss ? 'WAVE ' + game.wave + ' — BOSS' : 'WAVE ' + game.wave);
  // any gun this wave has earned is announced once the wave banner clears
  const pending = PROFILE.loadout.filter(i => !gunState.unlocked[i] && game.wave >= WEAPONS[i].unlock);
  if (pending.length) setTimeout(() => { if (game.state === 'play') refreshAvailability(true); }, 2400);
  syncHud();
}

function pickType (n) {
  const table = SPAWN_TABLES.find(t => n <= t.upTo) || SPAWN_TABLES[SPAWN_TABLES.length - 1];
  const r = Math.random();
  for (let i = 0; i < table.mix.length; i++) if (r <= table.mix[i][1]) return table.mix[i][0];
  return 'green';
}

/* boss waves draw from a shuffled roster rather than the percentages */
function buildBossQueue () {
  const q = [];
  BOSS_ROSTER.forEach(pair => {
    if (pair[0] === 'pink') return;
    for (let i = 0; i < pair[1]; i++) q.push(pair[0]);
  });
  for (let i = q.length - 1; i > 0; i--) {          // shuffle the rank and file
    const j = (Math.random() * (i + 1)) | 0;
    const t = q[i]; q[i] = q[j]; q[j] = t;
  }
  q.unshift('pink');                                 // the boss leads
  return q;
}

function updateWaves (dt) {
  if (isDay()) return;                    // nothing hunts you in daylight
  if (game.inBreak) {
    game.breakT -= dt;
    if (game.breakT <= 0) startWave();
    return;
  }
  if (game.toSpawn > 0) {
    game.spawnT -= dt;
    if (game.spawnT <= 0 && game.zAlive < waveCap(game.wave)) {
      const batch = Math.min(game.toSpawn, 2 + (Math.random() < 0.5 ? 1 : 0));
      for (let i = 0; i < batch; i++) {
        const kind = game.bossQueue && game.bossQueue.length
                   ? game.bossQueue[0] : pickType(game.wave);
        if (spawnZombie(kind, game.wave)) {
          game.toSpawn--;
          if (game.bossQueue && game.bossQueue.length) game.bossQueue.shift();
        }
      }
      game.spawnT = Math.max(0.14, 0.62 - game.wave * 0.02);
    }
  } else if (game.zAlive === 0) {
    game.inBreak = true;
    game.breakT = 3.5;
    player.hp = Math.min(100, player.hp + 25);
    resupply(0.75);
    game.score += 250 * game.wave;
    banner('WAVE ' + game.wave + ' CLEARED');
    toast('+25 VITALS  ·  AMMO DROP  ·  NEXT WAVE');
    syncHud();
  }
}

/* ---------------------------------------------------------------- HUD */
/* build bar: one chip per piece with its cost */
let pieceEls = [];
function buildPieceBar () {
  const wrap = $('buildList');
  wrap.innerHTML = '';
  pieceEls = PIECES.map((pc, i) => {
    const el = document.createElement('div');
    el.className = 'pc';
    el.innerHTML = '<span class="pcn">' + (i + 1) + '</span>' +
                   '<span class="pcname">' + pc.name + '</span>' +
                   '<span class="pccost">' +
                     (pc.wood ? pc.wood + 'W ' : '') + (pc.scrap ? pc.scrap + 'S' : '') +
                   '</span>';
    wrap.appendChild(el);
    return el;
  });
}

/* contextual "press E" line under the reticle */
function updatePrompt () {
  const el = $('prompt');
  const t = lookTarget();
  if (!t) { if (el.textContent) el.textContent = ''; return; }
  let txt;
  if (t.type === 'loot') txt = 'E — GATHER ' + (t.node.kind === 'wood' ? 'PLANKS' : 'SCRAP');
  else if (t.type === 'turret') {
    const tu = turrets.find(x => x.obs === t.obs);
    txt = 'E — REARM TURRET (' + (tu ? tu.ammo : 0) + ' rounds, ' + TURRET.refill + ' scrap)';
  } else txt = 'E — REPAIR ' + Math.round(100 * t.obs.hp / t.obs.maxHp) + '%';
  if (el.textContent !== txt) el.textContent = txt;
}

let slotEls = [];
function buildSlots () {
  const wrap = $('wepSlots');
  wrap.innerHTML = '';
  slotEls = PROFILE.loadout.map((wi, n) => {
    const el = document.createElement('span');
    el.className = 'slot';
    el.textContent = n + 1;
    el.title = WEAPONS[wi].name;
    wrap.appendChild(el);
    return el;
  });
}

function syncHud () {
  $('hpNum').textContent = Math.ceil(player.hp);
  $('hpFill').style.width = clamp(player.hp, 0, 100) + '%';
  $('waveNum').textContent = game.wave || 1;
  const ph = $('phaseRow');
  if (game.mode === 'cycle') {
    ph.classList.remove('hidden');
    const secs = Math.max(0, Math.ceil(game.phaseT));
    $('phaseName').textContent = game.phase === 'day' ? 'DAY' : 'NIGHT';
    $('phaseName').className = 'val ' + (game.phase === 'day' ? 'sun' : 'moon');
    $('phaseTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  }
  const wxEl = $('wxRow');
  if (game.weather && game.weather !== 'clear') {
    wxEl.classList.remove('hidden');
    $('wxName').textContent = WEATHER[game.weather].label;
  } else if (!wxEl.classList.contains('hidden')) {
    wxEl.classList.add('hidden');
  }
  if (game.mode !== 'cycle' && !ph.classList.contains('hidden')) ph.classList.add('hidden');
  $('killNum').textContent = game.kills;
  $('scoreNum').textContent = game.score.toLocaleString();
  $('zLeft').textContent = game.zAlive + (game.toSpawn > 0 ? ' (+' + game.toSpawn + ')' : '');
  const w = WEAPONS[gunState.cur], a = ammo[gunState.cur];
  $('wepName').textContent = w.name + (loaner && gunState.cur === 0 ? ' *' : '');
  $('ammoMag').textContent = a.mag;
  $('ammoMag').title = 'capacity ' + statMag(gunState.cur);
  $('ammoRes').innerHTML = a.res === Infinity ? '&#8734;' : a.res;
  $('woodNum').textContent = res.wood;
  $('scrapNum').textContent = res.scrap;

  // boss bar: only while an abomination is on its feet
  let boss = null;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.alive && !z.dying && ZTYPES[z.type].boss) { boss = z; break; }
  }
  const bb = $('bossBar');
  if (boss) {
    bb.classList.remove('hidden');
    $('bossFill').style.width = clamp(100 * boss.hp / boss.maxHp, 0, 100) + '%';
    $('bossHp').textContent = Math.max(0, Math.ceil(boss.hp)) + ' / ' + boss.maxHp;
  } else if (!bb.classList.contains('hidden')) {
    bb.classList.add('hidden');
  }
  for (let i = 0; i < pieceEls.length; i++) {
    const pc = PIECES[i];
    pieceEls[i].classList.toggle('on', i === build.sel);
    pieceEls[i].classList.toggle('poor', res.wood < pc.wood || res.scrap < pc.scrap);
  }
  for (let n = 0; n < slotEls.length; n++) {
    const wi = PROFILE.loadout[n];
    const has = gunState.unlocked[wi];
    slotEls[n].classList.toggle('on', wi === gunState.cur);
    slotEls[n].classList.toggle('locked', !has);
    slotEls[n].classList.toggle('empty', has && ammo[wi].mag === 0 && ammo[wi].res === 0);
  }
}

let bannerT = null;
function banner (text) {
  const el = $('banner'), t = $('bannerText');
  t.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('show'), 2700);
}

let toastT = null;
function toast (text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 1600);
}

let hmT = null;
function hitmarker () {
  const el = $('hitmarker');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(hmT);
  hmT = setTimeout(() => el.classList.remove('show'), 200);
}

/* ---------------------------------------------------------------- minimap */
edgeEls.t = $('edgeT'); edgeEls.b = $('edgeB');
edgeEls.l = $('edgeL'); edgeEls.r = $('edgeR'); edgeEls.v = $('vignette');

const mm = $('minimap'), mctx = mm.getContext('2d');
const MM_COL = {};
for (const k in ZTYPES) MM_COL[k] = '#' + ZTYPES[k].skin.toString(16).padStart(6, '0');
const MM_RANGE = 90;
let mmFrame = 0;

function drawMinimap () {
  if ((mmFrame++ % 2) !== 0) return;
  const S = mm.width, C = S / 2, k = C / MM_RANGE;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = 'rgba(8,7,10,.55)';
  mctx.fillRect(0, 0, S, S);

  const px = player.pos.x, pz = player.pos.z;

  // buildings in range
  const list = collectNearby(px, pz, MM_RANGE);
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.y0 > 2.6) continue;                       // skip catwalks and roof decks
    mctx.fillStyle = o.built ? 'rgba(255,182,74,.75)' : 'rgba(233,228,216,.16)';
    mctx.fillRect(C + (o.x - o.hx - px) * k, C + (o.z - o.hz - pz) * k,
                  Math.max(1, o.hx * 2 * k), Math.max(1, o.hz * 2 * k));
  }
  for (let i = 0; i < lootNodes.length; i++) {      // salvage in range
    const n = lootNodes[i];
    if (n.cooldown > 0) continue;
    const dx = (n.x - px) * k, dz = (n.z - pz) * k;
    if (Math.abs(dx) > C || Math.abs(dz) > C) continue;
    mctx.fillStyle = n.kind === 'wood' ? 'rgba(154,116,66,.9)' : 'rgba(141,148,158,.9)';
    mctx.fillRect(C + dx - 1.5, C + dz - 1.5, 3, 3);
  }

  // pickups
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    if (p.life <= 0) continue;
    mctx.fillStyle = p.kind === 'med' ? '#c8302a' : '#ffb64a';
    mctx.fillRect(C + (p.m.position.x - px) * k - 2, C + (p.m.position.z - pz) * k - 2, 4, 4);
  }

  // zombies
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z.alive || z.dying) continue;
    const dx = (z.g.position.x - px) * k, dz = (z.g.position.z - pz) * k;
    if (Math.abs(dx) > C || Math.abs(dz) > C) continue;
    const T = ZTYPES[z.type];
    if (z.state === 'tunnel') {                       // buried: show the mound
      mctx.fillStyle = 'rgba(107,82,54,.9)';
      mctx.fillRect(C + dx - 2, C + dz - 2, 4, 4);
      continue;
    }
    mctx.fillStyle = MM_COL[z.type];
    const r = T.boss ? 5.0 : T.armour ? 3.6 : 2.4;
    mctx.beginPath(); mctx.arc(C + dx, C + dz, r, 0, 6.284); mctx.fill();
  }

  // player facing wedge
  mctx.save();
  mctx.translate(C, C);
  mctx.rotate(-player.yaw);
  mctx.fillStyle = '#ffb64a';
  mctx.beginPath();
  mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6);
  mctx.closePath(); mctx.fill();
  mctx.restore();

  mctx.strokeStyle = 'rgba(255,182,74,.35)';
  mctx.strokeRect(0.5, 0.5, S-1, S-1);
}

/* ============================================================ capture tools
   Everything a piece of footage needs that playing the game does not: a clean
   frame with no readouts, a still you can drop into an edit, and slow motion
   for the moment you want to talk over.

   The screenshot cannot just call canvas.toDataURL() on demand — WebGL clears
   its drawing buffer after every present, so grabbing it a millisecond later
   returns a blank image. Instead the request is queued and serviced at the very
   end of frame(), while the pixels are still there.
   ======================================================================== */
const film = { hud: true, slowmo: false, shot: false, on: false };

function toggleHud () {
  film.hud = !film.hud;
  $('hud').style.visibility = film.hud ? '' : 'hidden';
}

function grabShot () {
  film.shot = true;                    // serviced at the end of the render
}

function saveShot () {
  film.shot = false;
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'horde-' + Date.now() + '.png';
    a.click();
    toast('SCREENSHOT SAVED');
  } catch (err) { toast('SCREENSHOT FAILED'); }
}

function toggleFilm () {
  film.on = !film.on;
  const b = $('filmBtn');
  if (b) { b.classList.toggle('on', film.on); b.textContent = film.on ? 'FILM MODE: ON' : 'FILM MODE: OFF'; }
  if (film.on) {
    for (let i = 0; i < WEAPONS.length; i++) gunState.unlocked[i] = true;
    buildSlots(); syncHud();
    toast('FILM MODE — [ ] SET WAVE, ALL WEAPONS DRAWN');
  } else {
    refreshAvailability(false);
    toast('FILM MODE OFF');
  }
}

/* Jump the run to a wave so you can film the boss without playing to ten. */
function setWave (n) {
  game.wave = Math.max(1, n);
  game.toSpawn = 0;
  game.inBreak = true;
  game.breakT = 1.2;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.alive) { z.alive = false; z.dying = false; z.g.visible = false; }
  }
  game.zAlive = 0;
  game.boss = false; game.bossQueue = null;
  refreshAvailability(false);
  banner('WAVE ' + game.wave);
  syncHud();
}

/* ---------------------------------------------------------------- input */
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === ' ') e.preventDefault();
  if (game.state !== 'play') {
    if (game.state === 'dead' && (k === 'r' || k === 'enter')) restart();
    return;
  }
  if (k === 'm') { Sfx.toggleMute(); refreshMuteBtn(); toast(Sfx.muted ? 'AUDIO MUTED' : 'AUDIO ON'); return; }
  if (k === 'h') { toggleHud(); return; }
  if (k === 'p') { grabShot(); return; }
  if (k === 'o') { film.slowmo = !film.slowmo; toast(film.slowmo ? 'SLOW MOTION' : 'NORMAL SPEED'); return; }
  if (film.on && k === ']') { setWave(game.wave + 1); return; }
  if (film.on && k === '[') { setWave(game.wave - 1); return; }
  if (k === 'n' && isDay()) { goNight(true); toast('YOU CALLED THE NIGHT IN EARLY'); return; }
  // trackpads make click-and-hold while aiming painful, so the mouse buttons
  // all have keyboard equivalents
  if (k === 'f') {
    if (build.on) placePiece(PIECES[build.sel], build.gx, build.gy, build.gz, build.rot);
    else { firing = true; fire(); }
    return;
  }
  if (k === 'x' && build.on) { removeAim(); return; }
  if (k === 'q' && !build.on) { gunState.ads = !gunState.ads; return; }
  if (k === 'b') { toggleBuild(); return; }
  if (k === 'e') { interact(); return; }
  if (build.on) {
    if (k === 'r') { build.rot = (build.rot + 1) % 4; return; }
    if (k >= '1' && k <= '6') { build.sel = +k - 1; syncHud(); return; }
    return;
  }
  if (k === 'r') startReload();
  if (k >= '1' && k <= '8') selectSlot(+k - 1);
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  if (k === 'f') firing = false;
});

addEventListener('mousedown', e => {
  if (game.state !== 'play') return;
  if (build.on) {
    if (e.button === 0) placePiece(PIECES[build.sel], build.gx, build.gy, build.gz, build.rot);
    if (e.button === 2) { removeAim(); e.preventDefault(); }
    return;
  }
  if (e.button === 0) { firing = true; fire(); }
  if (e.button === 2) { gunState.ads = true; e.preventDefault(); }
});
addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) gunState.ads = false;
});

/* A mouse notch is one big delta; a trackpad swipe is a stream of tiny ones,
   which used to rip through every weapon in the loadout. Bank the scroll and
   only act once it crosses a threshold, then hold a short cooldown. */
let wheelAcc = 0, wheelLast = 0, wheelNext = 0;
const WHEEL_STEP = 55, WHEEL_GAP = 220, WHEEL_CD = 170;

addEventListener('wheel', e => {
  if (game.state !== 'play') return;
  const now = performance.now();
  if (now - wheelLast > WHEEL_GAP) wheelAcc = 0;      // a pause means a new gesture
  wheelLast = now;
  wheelAcc += e.deltaY;
  // never let a long swipe bank a backlog that fires several steps at once
  wheelAcc = clamp(wheelAcc, -WHEEL_STEP * 1.4, WHEEL_STEP * 1.4);
  if (now < wheelNext || Math.abs(wheelAcc) < WHEEL_STEP) return;
  const dir = wheelAcc > 0 ? 1 : -1;
  wheelAcc = 0;
  wheelNext = now + WHEEL_CD;
  if (build.on) { build.sel = (build.sel + (dir > 0 ? 1 : PIECES.length - 1)) % PIECES.length; syncHud(); }
  else cycleWeapon(dir);
}, { passive:true });

/* Look input is banked here and applied in the render loop. A trackpad
   delivers many small, uneven deltas where a mouse delivers few large ones, so
   optional smoothing spreads each burst over a few frames instead of letting
   the view stutter. With smoothing off this is identical to applying it
   straight away. */
let pendYaw = 0, pendPitch = 0;

addEventListener('mousemove', e => {
  if (game.state !== 'play' || document.pointerLockElement !== canvas) return;
  const I = PROFILE.input;
  const s = 0.0022 * I.sens;
  pendYaw   -= e.movementX * s;
  pendPitch -= e.movementY * s * (I.invertY ? -1 : 1);
});

function applyLook (dt) {
  const k = PROFILE.input.smooth ? Math.min(1, dt * 19) : 1;
  player.yaw   += pendYaw * k;
  player.pitch += pendPitch * k;
  pendYaw   -= pendYaw * k;
  pendPitch -= pendPitch * k;
  player.pitch = clamp(player.pitch, -1.45, 1.45);
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && game.state === 'play') pause();
});

addEventListener('resize', () => {
  camera.aspect = gunCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('contextmenu', e => { if (game.state === 'play') e.preventDefault(); });

/* ============================================================== SURVIVAL
   Scrap and planks are scavenged from the streets, then spent on blocks,
   ramps, platforms and spikes. Everything you place is a real collision box
   with hit points, and zombies tear at whatever stands between them and you.
   ====================================================================== */

const res = { wood: 20, scrap: 12 };

const PIECES = [
  { id:'wood',  name:'WOOD WALL', wood:4, scrap:0, hp:70,  kind:'block' },
  { id:'metal', name:'STEEL WALL', wood:0, scrap:4, hp:260, kind:'block' },
  { id:'ramp',  name:'RAMP',      wood:3, scrap:0, hp:60,  kind:'ramp' },
  { id:'floor', name:'PLATFORM',  wood:2, scrap:0, hp:55,  kind:'floor' },
  { id:'spike', name:'SPIKES',    wood:2, scrap:2, hp:45,  kind:'spike' },
  { id:'turret',name:'TURRET',    wood:4, scrap:14, hp:140, kind:'turret' },
];

const CELL = 2;                                  // build grid, in metres
const snapXZ = v => Math.round(v / CELL) * CELL;
const snapY  = v => Math.floor(v / CELL) * CELL;

const buildMats = {
  wood:  new T.MeshLambertMaterial({ color: 0x8a6034 }),
  metal: new T.MeshLambertMaterial({ color: 0x6d7480 }),
  ramp:  new T.MeshLambertMaterial({ color: 0x7d5730 }),
  floor: new T.MeshLambertMaterial({ color: 0x7a5c38 }),
  spike: new T.MeshLambertMaterial({ color: 0x5b6068 }),
  turret: new T.MeshLambertMaterial({ color: 0x4a5560 }),
};

const structures = [];       // every placed piece
const spikeList  = [];       // spikes only, for the damage sweep

/* ---- loot nodes ---- */
const lootNodes = [];
const woodNodeMat  = new T.MeshLambertMaterial({ color: 0x9a7442 });
const scrapNodeMat = new T.MeshLambertMaterial({ color: 0x8d949e });

function makeLootNode (x, z, kind) {
  const g = new T.Group();
  g.position.set(x, 0, z);
  const mat = kind === 'wood' ? woodNodeMat : scrapNodeMat;
  if (kind === 'wood') {
    for (let i = 0; i < 5; i++) {
      const m = new T.Mesh(boxGeo, mat);
      m.position.set(rnd(-0.2,0.2), 0.12 + i*0.19, rnd(-0.2,0.2));
      m.scale.set(1.5, 0.16, 0.55);
      m.rotation.y = rnd(-0.25, 0.25);
      g.add(m);
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const m = new T.Mesh(boxGeo, mat);
      m.position.set(rnd(-0.5,0.5), 0.1 + Math.random()*0.5, rnd(-0.5,0.5));
      m.scale.set(rnd(0.25,0.7), rnd(0.12,0.3), rnd(0.25,0.7));
      m.rotation.set(rnd(0,1), rnd(0,3), rnd(0,1));
      g.add(m);
    }
  }
  scene.add(g);
  lootNodes.push({ g, kind, x, z, amount: kind === 'wood' ? 14 : 10, cooldown: 0 });
}

function scatterLoot () {
  let placed = 0, tries = 0;
  while (placed < 78 && tries++ < 2600) {
    const x = rnd(-MAP_HALF + 12, MAP_HALF - 12);
    const z = rnd(-MAP_HALF + 12, MAP_HALF - 12);
    if (!isClear(x, z, 1.6, 0, 2)) continue;
    makeLootNode(x, z, Math.random() < 0.55 ? 'wood' : 'scrap');
    placed++;
  }
}

/* ---- placing and breaking ---- */
function pieceBounds (piece, gx, gy, gz) {
  if (piece.kind === 'floor') return { y0: gy + CELL - 0.34, y1: gy + CELL };
  if (piece.kind === 'spike') return { y0: gy, y1: gy + 0.55 };
  if (piece.kind === 'turret') return { y0: gy, y1: gy + 0.6 };
  return { y0: gy, y1: gy + CELL };
}

function canPlace (piece, gx, gy, gz) {
  if (Math.abs(gx) > MAP_HALF - 6 || Math.abs(gz) > MAP_HALF - 6) return false;
  if (gy < 0 || gy > 40) return false;
  const b = pieceBounds(piece, gx, gy, gz);
  // never seal yourself inside a block
  const pf = player.feet;
  if (Math.abs(player.pos.x - gx) < CELL/2 + P_RADIUS &&
      Math.abs(player.pos.z - gz) < CELL/2 + P_RADIUS &&
      pf < b.y1 - 0.05 && pf + 1.75 > b.y0 + 0.05) return false;
  return isClear(gx, gz, CELL/2 - 0.12, b.y0 + 0.08, b.y1 - 0.08);
}

function placePiece (piece, gx, gy, gz, rot) {
  if (res.wood < piece.wood || res.scrap < piece.scrap) {
    toast('NOT ENOUGH ' + (res.wood < piece.wood ? 'WOOD' : 'SCRAP'));
    Sfx.dry();
    return false;
  }
  if (!canPlace(piece, gx, gy, gz)) { toast('NO ROOM THERE'); Sfx.dry(); return false; }

  const mat = buildMats[piece.id];
  let mesh, obs;
  const b = pieceBounds(piece, gx, gy, gz);

  if (piece.kind === 'ramp') {
    const axis = (rot % 2) === 0 ? 'z' : 'x';
    const dir  = rot < 2 ? 1 : -1;
    mesh = ramp(mat, gx, gz, gy, gy + CELL, axis, dir, CELL, CELL - 0.1);
    obs = obstacles[obstacles.length - 1];
  } else if (piece.kind === 'floor') {
    mesh = platform(mat, gx, gy + CELL, gz, CELL, CELL);
    obs = obstacles[obstacles.length - 1];
  } else if (piece.kind === 'turret') {
    mesh = box(mat, gx, gy + 0.3, gz, CELL - 0.5, 0.6, CELL - 0.5, true);
    obs = obstacles[obstacles.length - 1];
    const t = buildTurret(gx, gy, gz);
    t.obs = obs;
    turrets.push(t);
    obs.deco = [t.g];
  } else if (piece.kind === 'spike') {
    mesh = box(mat, gx, gy + 0.22, gz, CELL - 0.1, 0.44, CELL - 0.1, true);
    obs = obstacles[obstacles.length - 1];
    for (let i = 0; i < 5; i++) {                       // visible spikes on top
      const sp2 = new T.Mesh(coneGeo, mat);
      sp2.scale.set(0.14, 0.55, 0.14);
      sp2.position.set(gx + rnd(-0.6,0.6), gy + 0.72, gz + rnd(-0.6,0.6));
      scene.add(sp2);
      obs.deco = obs.deco || []; obs.deco.push(sp2);
    }
  } else {
    mesh = box(mat, gx, gy + CELL/2, gz, CELL, CELL, CELL, true);
    obs = obstacles[obstacles.length - 1];
  }

  res.wood  -= piece.wood;
  res.scrap -= piece.scrap;
  obs.hp = obs.maxHp = piece.hp;
  obs.piece = piece.id;
  obs.built = true;
  shadowify(mesh);
  if (obs.deco) for (let i = 0; i < obs.deco.length; i++) shadowify(obs.deco[i]);
  structures.push(obs);
  if (piece.kind === 'spike') spikeList.push(obs);
  Sfx.build(atXYZ(gx, gy + 1, gz, 4, 40));
  syncHud();
  return true;
}

function killObstacle (o) {
  o.dead = true;
  if (o.mesh) {
    scene.remove(o.mesh);
    const i = solids.indexOf(o.mesh);
    if (i >= 0) solids.splice(i, 1);
  }
  if (o.deco) o.deco.forEach(d => scene.remove(d));
  const si = structures.indexOf(o);
  if (si >= 0) structures.splice(si, 1);
  const ki = spikeList.indexOf(o);
  if (ki >= 0) spikeList.splice(ki, 1);
}

function damageStructure (o, dmg) {
  if (!o || !o.built || o.dead) return;
  o.hp -= dmg;
  for (let i = 0; i < 4; i++) {                    // splinters fly off the hit face
    const p = blood[bloodPtr = (bloodPtr + 1) % blood.length];
    p.m.material = dustMat;
    p.m.position.set(o.x + rnd(-0.6,0.6), o.y1 - 0.3, o.z + rnd(-0.6,0.6));
    p.vx = gauss()*2.4; p.vy = rnd(0.6,2.4); p.vz = gauss()*2.4;
    p.life = 0.35; p.m.visible = true;
  }
  const sAt = atXYZ(o.x, o.y1 - 0.3, o.z, 5, 80);
  Sfx.thud(sAt);
  if (o.hp <= 0) { Sfx.crack(sAt); killObstacle(o); }
}

/* what am I looking at, within arm's reach? */
function lookTarget () {
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(fwd);
  // nearest loot node in a cone ahead
  let best = null, bestD = 3.4;
  for (let i = 0; i < lootNodes.length; i++) {
    const n = lootNodes[i];
    if (n.cooldown > 0) continue;
    const d = Math.hypot(n.x - player.pos.x, n.z - player.pos.z);
    if (d < bestD) { bestD = d; best = { type:'loot', node:n }; }
  }
  if (best) return best;
  // damaged structure in front
  ray.set(camPos, fwd); ray.far = 4.0;
  const hits = ray.intersectObjects(solidsAlong(camPos, fwd, 4.0), false);
  for (let i = 0; i < hits.length; i++) {
    const o = obstacles.find(ob => !ob.dead && ob.mesh === hits[i].object);
    if (o && o.built && o.piece === 'turret') return { type:'turret', obs:o };
    if (o && o.built && o.hp < o.maxHp) return { type:'repair', obs:o };
    break;
  }
  return null;
}

function interact () {
  const t = lookTarget();
  if (!t) return;
  if (t.type === 'turret') { if (refillTurret(t.obs)) return; }
  if (t.type === 'loot') {
    const n = t.node;
    const take = n.kind === 'wood' ? 14 : 10;
    res[n.kind] += take;
    n.cooldown = 55;
    n.g.visible = false;
    Sfx.pickup();
    toast('+' + take + ' ' + n.kind.toUpperCase());
    syncHud();
  } else {
    const o = t.obs;
    const need = Math.min(o.maxHp - o.hp, 40);
    const kind = o.piece === 'metal' || o.piece === 'spike' ? 'scrap' : 'wood';
    const cost = Math.max(1, Math.round(need / 20));
    if (res[kind] < cost) { toast('NEED ' + cost + ' ' + kind.toUpperCase()); return; }
    res[kind] -= cost;
    o.hp = Math.min(o.maxHp, o.hp + need);
    Sfx.build();
    toast('REPAIRED');
    syncHud();
  }
}

function updateLoot (dt) {
  for (let i = 0; i < lootNodes.length; i++) {
    const n = lootNodes[i];
    if (n.cooldown > 0) {
      n.cooldown -= dt;
      if (n.cooldown <= 0) n.g.visible = true;
    }
  }
}

function updateSpikes (dt) {
  for (let i = 0; i < spikeList.length; i++) {
    const sk = spikeList[i];
    if (sk.dead) continue;
    for (let j = 0; j < zombies.length; j++) {
      const z = zombies[j];
      if (!z.alive || z.dying) continue;
      if (Math.abs(z.g.position.x - sk.x) > 1.3 || Math.abs(z.g.position.z - sk.z) > 1.3) continue;
      if (z.feet > sk.y1 + 0.6) continue;
      hurtZombie(z, 34 * dt, false, z.g.position.clone().setY(z.feet + 0.5));
      if (Math.random() < dt * 0.6) damageStructure(sk, 1);
    }
  }
}

/* ------------------------------------------------------------------ turrets
   A placed turret is an ordinary structure with hit points that also happens
   to shoot. It picks the nearest zombie it can actually see, swings to face it,
   and fires on a cooldown using the same raycast damage path the player's guns
   use. Ammunition is finite, so it is a strong position rather than a win
   button — feed it scrap to keep it running. */
const turrets = [];
const TURRET = { range: 34, rpm: 150, dmg: 17, ammo: 220, turn: 3.4, refill: 8 };

function buildTurret (gx, gy, gz) {
  const g = new T.Group();
  g.position.set(gx, gy, gz);

  const base = new T.Mesh(cylGeo, buildMats.turret);
  base.scale.set(0.62, 0.34, 0.62); base.position.y = 0.17; g.add(base);
  const post = new T.Mesh(cylGeo, buildMats.turret);
  post.scale.set(0.20, 0.55, 0.20); post.position.y = 0.55; g.add(post);

  const head = new T.Group(); head.position.y = 0.92; g.add(head);
  const body = new T.Mesh(boxGeo, buildMats.turret);
  body.scale.set(0.52, 0.34, 0.46); head.add(body);
  const barrel = new T.Mesh(cylGeo, GM ? buildMats.metal : buildMats.turret);
  barrel.scale.set(0.075, 0.70, 0.075);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.44); head.add(barrel);
  const mag = new T.Mesh(boxGeo, buildMats.metal);
  mag.scale.set(0.34, 0.24, 0.20); mag.position.set(0, 0.26, 0.12); head.add(mag);
  const eye = new T.Mesh(sphGeo, new T.MeshBasicMaterial({ color: 0xff5a3c }));
  eye.scale.setScalar(0.055); eye.position.set(0, 0.10, -0.24); head.add(eye);
  const flash = new T.Mesh(coneGeo, new T.MeshBasicMaterial({
    color: 0xffd070, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
  flash.scale.set(0.10, 0.26, 0.10);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0, 0.02, -0.86);
  flash.visible = false; head.add(flash);

  scene.add(g);
  return { g, head, eye, flash, yaw: 0, cd: 0, ammo: TURRET.ammo, target: null };
}

function updateTurrets (dt) {
  for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i];
    if (t.obs.dead) { scene.remove(t.g); turrets.splice(i--, 1); continue; }

    t.eye.material.color.setHex(t.ammo > 0 ? 0x5aff7c : 0xff3b30);
    t.flash.visible = false;

    // nearest visible target
    let best = null, bestD = TURRET.range;
    for (let j = 0; j < zombies.length; j++) {
      const z = zombies[j];
      if (!z.alive || z.dying || z.state === 'tunnel') continue;
      const dx = z.g.position.x - t.g.position.x;
      const dz = z.g.position.z - t.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD) continue;
      if (Math.abs(z.feet - t.g.position.y) > 4) continue;
      best = z; bestD = d;
    }
    t.target = best;
    if (!best) continue;

    // swing to bear
    const want = Math.atan2(best.g.position.x - t.g.position.x,
                            best.g.position.z - t.g.position.z);
    let diff = want - t.yaw;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = clamp(diff, -TURRET.turn * dt, TURRET.turn * dt);
    t.yaw += step;
    t.head.rotation.y = t.yaw;

    t.cd -= dt;
    if (t.cd > 0 || t.ammo <= 0 || Math.abs(diff) > 0.18) continue;

    // clear line of fire?
    const muzzle = atVec.set(t.g.position.x, t.g.position.y + 0.92, t.g.position.z);
    const aim = new T.Vector3(best.g.position.x - muzzle.x,
                              best.feet + 1.1 - muzzle.y,
                              best.g.position.z - muzzle.z).normalize();
    ray.set(muzzle, aim); ray.far = TURRET.range;
    const hits = ray.intersectObjects(solidsAlong(muzzle, aim, TURRET.range, hitList), false);
    if (hits.length && !hits[0].object.userData.z) continue;   // wall in the way

    t.cd = 60 / TURRET.rpm;
    t.ammo--;
    t.flash.visible = true;
    tracer(muzzle, hits.length ? hits[0].point : muzzle.clone().addScaledVector(aim, TURRET.range));
    Sfx.shot('smg');
    if (hits.length && hits[0].object.userData.z) {
      const zz = hits[0].object.userData.z;
      hurtZombie(zz, TURRET.dmg * (hits[0].object.userData.part === 'head' ? 2 : 1),
                 hits[0].object.userData.part === 'head', hits[0].point);
    }
  }
}

/* top a turret up with scrap when you walk to it */
function refillTurret (obs) {
  const t = turrets.find(x => x.obs === obs);
  if (!t) return false;
  if (t.ammo >= TURRET.ammo) { toast('TURRET IS FULL'); return true; }
  if (res.scrap < TURRET.refill) { toast('NEED ' + TURRET.refill + ' SCRAP'); return true; }
  res.scrap -= TURRET.refill;
  t.ammo = TURRET.ammo;
  Sfx.build(atXYZ(obs.x, obs.y1, obs.z, 4, 40));
  toast('TURRET REARMED');
  syncHud();
  return true;
}

/* ---- build mode ---- */
const build = { on: false, sel: 0, rot: 0, gx: 0, gy: 0, gz: 0, ok: false };

const ghostMat = new T.MeshBasicMaterial({ color: 0x6fd66f, transparent: true, opacity: 0.34,
                                           depthWrite: false });
const ghost = new T.Mesh(boxGeo, ghostMat);
ghost.visible = false;
scene.add(ghost);
const ghostEdge = new T.LineSegments(new T.EdgesGeometry(boxGeo),
                  new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
ghostEdge.visible = false;
scene.add(ghostEdge);

function toggleBuild (on) {
  build.on = on === undefined ? !build.on : on;
  ghost.visible = ghostEdge.visible = build.on;
  $('buildBar').classList.toggle('hidden', !build.on);
  $('crosshair').style.opacity = build.on ? '0.35' : '';
  if (build.on) { gunState.ads = false; firing = false; }
  syncHud();
}

function aimCell () {
  const piece = PIECES[build.sel];
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(fwd);
  ray.set(camPos, fwd); ray.far = 9;
  const hits = ray.intersectObjects(solidsAlong(camPos, fwd, 9), false);
  let p;
  if (hits.length) p = hits[0].point.clone().addScaledVector(fwd, -0.55);
  else {
    p = camPos.clone().addScaledVector(fwd, 7);
    if (p.y < 0.2) {                                // aim at the street
      const t = (camPos.y - 0.05) / Math.max(0.001, -fwd.y);
      if (fwd.y < 0 && t < 40) p = camPos.clone().addScaledVector(fwd, t);
    }
  }
  build.gx = snapXZ(p.x);
  build.gz = snapXZ(p.z);
  build.gy = Math.max(0, snapY(p.y + 0.15));
  build.ok = res.wood >= piece.wood && res.scrap >= piece.scrap &&
             canPlace(piece, build.gx, build.gy, build.gz);

  const b = pieceBounds(piece, build.gx, build.gy, build.gz);
  const h = b.y1 - b.y0;
  ghost.position.set(build.gx, (b.y0 + b.y1) / 2, build.gz);
  ghost.scale.set(CELL, h, CELL);
  ghostEdge.position.copy(ghost.position);
  ghostEdge.scale.copy(ghost.scale);
  ghostMat.color.setHex(build.ok ? 0x6fd66f : 0xd65a4a);
}

function removeAim () {
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(fwd);
  ray.set(camPos, fwd); ray.far = 7;
  const hits = ray.intersectObjects(solidsAlong(camPos, fwd, 7), false);
  if (!hits.length) return;
  const o = obstacles.find(ob => !ob.dead && ob.mesh === hits[0].object);
  if (!o || !o.built) { toast('ONLY YOUR OWN BUILDS'); return; }
  const piece = PIECES.find(pc => pc.id === o.piece);
  if (piece) {                                     // half refund
    res.wood  += Math.floor(piece.wood / 2);
    res.scrap += Math.floor(piece.scrap / 2);
  }
  killObstacle(o);
  Sfx.magOut();
  syncHud();
}

/* ---------------------------------------------------------------- upgrades
   Scrap had exactly one use — walls. These give it a second: three tracks per
   weapon, four ranks each, bought in the armoury and saved with the profile.
   Costs climb per rank so late ranks are a real commitment. */
const UPGRADES = [
  { id:'dmg',    name:'DAMAGE',   max:4, cost:[14, 24, 38, 58], per:0.14,
    blurb:'+14% damage per rank' },
  { id:'mag',    name:'CAPACITY', max:4, cost:[10, 18, 30, 46], per:0.20,
    blurb:'+20% magazine per rank' },
  { id:'reload', name:'HANDLING', max:4, cost:[12, 20, 32, 50], per:0.13,
    blurb:'-13% reload time per rank' },
];

function upgRank (weaponId, trackId) {
  const w = PROFILE.upgrades[weaponId];
  return (w && w[trackId]) || 0;
}
function upgCost (trackId, rank) {
  const t = UPGRADES.find(u => u.id === trackId);
  return rank >= t.max ? null : t.cost[rank];
}

/* live stats = base stats folded with whatever ranks are bought */
function statDmg (i)    { return WEAPONS[i].dmg * (1 + 0.14 * upgRank(WEAPONS[i].id, 'dmg')); }
function statMag (i)    { return Math.round(WEAPONS[i].mag * (1 + 0.20 * upgRank(WEAPONS[i].id, 'mag'))); }
function statReload (i) { return WEAPONS[i].reload * Math.pow(0.87, upgRank(WEAPONS[i].id, 'reload')); }

function buyUpgrade (weaponIndex, trackId) {
  const w = WEAPONS[weaponIndex];
  const rank = upgRank(w.id, trackId);
  const cost = upgCost(trackId, rank);
  if (cost === null) { toast('ALREADY MAXED'); return; }
  if (res.scrap < cost) { toast('NEED ' + cost + ' SCRAP'); Sfx.dry(); return; }
  res.scrap -= cost;
  if (!PROFILE.upgrades[w.id]) PROFILE.upgrades[w.id] = {};
  PROFILE.upgrades[w.id][trackId] = rank + 1;
  saveProfile();
  Sfx.unlock();
  toast(w.name + ' ' + trackId.toUpperCase() + ' RANK ' + (rank + 1));
  ammo[weaponIndex].mag = Math.min(ammo[weaponIndex].mag, statMag(weaponIndex));
  buildArmoury();
  syncHud();
}

/* ------------------------------------------------------------- armoury UI */
const STAT_MAX = { power: 230, rate: 880, mag: 100, reach: 320 };
let armouryReturn = 'menu';

function weaponPower (w) { return w.grenade ? w.grenade.dmg : w.dmg * w.pellets; }

function buildArmoury () {
  const grid = $('gunGrid');
  grid.innerHTML = '';

  WEAPONS.forEach((w, i) => {
    const slot = PROFILE.loadout.indexOf(i);
    const carried = slot !== -1;
    const skin = PROFILE.skins[w.id];

    const card = document.createElement('div');
    card.className = 'gcard' + (carried ? ' carried' : '');
    card.dataset.i = i;

    const bar = (label, frac) =>
      '<div class="st"><b>' + label + '</b><i><u style="width:' +
      Math.max(3, Math.round(frac * 100)) + '%"></u></i></div>';

    const swatches = SKINS.map(sk =>
      '<button class="sw' + (sk.id === skin ? ' on' : '') + '" data-skin="' + sk.id +
      '" style="background:' + sk.chip + '" title="' + sk.name + '"></button>').join('');

    card.innerHTML =
      '<div class="ghead">' +
        '<span class="gslot">' + (carried ? slot + 1 : '&middot;') + '</span>' +
        '<span class="gname">' + w.name + '</span>' +
        '<span class="gtag">' + (carried ? 'CARRIED' : 'IN STORAGE') + '</span>' +
      '</div>' +
      '<div class="gstats">' +
        bar('POWER', (w.grenade ? w.grenade.dmg : statDmg(i) * w.pellets) / STAT_MAX.power) +
        bar('RATE',  w.rpm / STAT_MAX.rate) +
        bar('MAG',   statMag(i) / STAT_MAX.mag) +
        bar('REACH', w.range / STAT_MAX.reach) +
      '</div>' +
      '<div class="gnote">' +
        (w.pellets > 1 ? w.pellets + ' pellets &middot; ' : '') +
        (w.pierce ? 'punches through ' + w.pierce + ' &middot; ' : '') +
        (w.grenade ? 'explosive, ' + w.grenade.blast + 'm blast &middot; ' : '') +
        (w.scoped ? 'scoped &middot; ' : '') +
        (w.resMax === Infinity ? 'unlimited reserve' : 'reserve ' + w.resMax) +
      '</div>' +
      '<div class="gupg">' +
        UPGRADES.map(t => {
          const rank = upgRank(w.id, t.id);
          const cost = upgCost(t.id, rank);
          const pips = Array.from({length: t.max}, (_, n) =>
            '<i class="' + (n < rank ? 'on' : '') + '"></i>').join('');
          return '<button class="upg' + (cost !== null && res.scrap >= cost ? ' can' : '') +
                 '" data-upg="' + t.id + '" title="' + t.blurb + '">' +
                 '<span class="ut">' + t.name + '</span>' +
                 '<span class="up">' + pips + '</span>' +
                 '<span class="uc">' + (cost === null ? 'MAX' : cost + 'S') + '</span>' +
                 '</button>';
        }).join('') +
      '</div>' +
      '<div class="gfoot">' +
        '<span class="gunlock">' + (PROFILE.fullKit || w.unlock <= 1
            ? 'READY AT START' : 'EARNED WAVE ' + w.unlock) + '</span>' +
        '<div class="gskins">' + swatches + '</div>' +
      '</div>';

    grid.appendChild(card);
  });

  $('kitFull').classList.toggle('on', PROFILE.fullKit);
  $('kitEarn').classList.toggle('on', !PROFILE.fullKit);
  $('loadoutCount').textContent = PROFILE.loadout.length + ' of ' + WEAPONS.length +
                                  ' carried  ·  ' + res.scrap + ' SCRAP';
}

function toggleCarry (i) {
  const at = PROFILE.loadout.indexOf(i);
  if (at === -1) {
    PROFILE.loadout.push(i);
  } else {
    if (PROFILE.loadout.length === 1) { toast('YOU NEED AT LEAST ONE WEAPON'); return; }
    PROFILE.loadout.splice(at, 1);
  }
  saveProfile();
  buildArmoury();
}

function setSkin (i, skinId) {
  PROFILE.skins[WEAPONS[i].id] = skinId;
  applySkin(i, skinId);
  saveProfile();
  buildArmoury();
}

function applyAllSkins () {
  WEAPONS.forEach((w, i) => applySkin(i, PROFILE.skins[w.id]));
}

function openArmoury (from) {
  armouryReturn = from;
  if (from === 'pause') $('pause').classList.add('hidden');
  else $('start').classList.add('hidden');
  buildArmoury();
  $('armoury').classList.remove('hidden');
}

function closeArmoury () {
  $('armoury').classList.add('hidden');
  buildSlots();
  refreshAvailability(false);
  saveProfile();
  if (armouryReturn === 'pause') $('pause').classList.remove('hidden');
  else $('start').classList.remove('hidden');
}

$('gunGrid').addEventListener('click', e => {
  const sw = e.target.closest('.sw');
  const up = e.target.closest('.upg');
  const card = e.target.closest('.gcard');
  if (!card) return;
  const i = +card.dataset.i;
  if (up) { buyUpgrade(i, up.dataset.upg); return; }
  if (sw) { setSkin(i, sw.dataset.skin); return; }
  toggleCarry(i);
});
$('kitFull').addEventListener('click', () => { PROFILE.fullKit = true;  saveProfile(); buildArmoury(); });
$('kitEarn').addEventListener('click', () => { PROFILE.fullKit = false; saveProfile(); buildArmoury(); });
$('armouryDone').addEventListener('click', closeArmoury);

/* volume: slider, button and the M key all drive the same master gain */
function refreshMuteBtn () {
  const b = $('muteBtn');
  b.classList.toggle('on', Sfx.muted);
  b.textContent = Sfx.muted ? 'MUTED' : 'MUTE';
}
$('volSlider').addEventListener('input', e => {
  Sfx.init();
  Sfx.setVolume(e.target.value / 100);
  if (Sfx.muted) { Sfx.toggleMute(); refreshMuteBtn(); }
});
$('muteBtn').addEventListener('click', () => { Sfx.init(); Sfx.toggleMute(); refreshMuteBtn(); });

/* ---- input settings ---- */
function refreshInputUI () {
  const I = PROFILE.input;
  $('sensSlider').value = Math.round(I.sens * 100);
  $('sensVal').textContent = I.sens.toFixed(2) + '×';
  $('invertBtn').classList.toggle('on', I.invertY);
  $('smoothBtn').classList.toggle('on', I.smooth);
  $('padBtn').classList.toggle('on', I.trackpad);
  const gb = $('gfxBtn');
  if (gb) gb.textContent = 'GRAPHICS: ' + GFX_TIERS[gfxLevel].label;
}
/* one button cycling HIGH -> MED -> LOW. Shadows are the expensive part, so if
   the frame rate ever bites, this is the dial to turn. */
const gfxBtnEl = $('gfxBtn');
if (gfxBtnEl) gfxBtnEl.addEventListener('click', () => {
  const order = ['high', 'med', 'low'];
  PROFILE.gfx = order[(order.indexOf(gfxLevel) + 1) % order.length];
  applyQuality(PROFILE.gfx, true);
  saveProfile(); refreshInputUI();
});
$('sensSlider').addEventListener('input', e => {
  PROFILE.input.sens = clamp(e.target.value / 100, 0.2, 4);
  PROFILE.input.trackpad = false;
  saveProfile(); refreshInputUI();
});
$('invertBtn').addEventListener('click', () => {
  PROFILE.input.invertY = !PROFILE.input.invertY; saveProfile(); refreshInputUI();
});
$('smoothBtn').addEventListener('click', () => {
  PROFILE.input.smooth = !PROFILE.input.smooth; saveProfile(); refreshInputUI();
});
/* one button that sets everything a trackpad wants at once */
$('padBtn').addEventListener('click', () => {
  const I = PROFILE.input;
  I.trackpad = !I.trackpad;
  if (I.trackpad) { I.sens = 2.1; I.smooth = true; }
  else            { I.sens = 1.0; I.smooth = false; }
  saveProfile(); refreshInputUI();
  toast(I.trackpad ? 'TRACKPAD MODE ON — Q AIM, F FIRE' : 'MOUSE MODE');
});

/* ------------------------------------------------------------- high scores
   Kept in the same profile store as everything else, best five runs, with the
   mode recorded so an endless-siege run is not compared against a cycle run. */
const SCORE_KEY = 'horde.scores.v1';
let highScores = [];

function loadScores () {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) highScores = arr.filter(r =>
      r && Number.isFinite(r.score) && Number.isFinite(r.wave)).slice(0, 5);
  } catch (e) {}
}
function saveScores () {
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(highScores)); } catch (e) {}
}

/* returns the placing (1-based) if the run made the table, else 0 */
function recordScore () {
  const row = { score: game.score, wave: game.wave, kills: game.kills,
                secs: Math.round(game.elapsed), mode: game.mode,
                when: Date.now() };
  highScores.push(row);
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, 5);
  saveScores();
  const at = highScores.indexOf(row);
  return at < 0 ? 0 : at + 1;
}

function scoreTable (highlightIdx) {
  if (!highScores.length) return '<div class="noscores">No runs recorded yet.</div>';
  return '<table class="scores"><tr><th></th><th>SCORE</th><th>WAVE</th><th>KILLS</th><th>TIME</th><th>MODE</th></tr>' +
    highScores.map((r, i) => {
      const m = Math.floor(r.secs / 60), sec = r.secs % 60;
      return '<tr class="' + (i === highlightIdx ? 'me' : '') + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + r.score.toLocaleString() + '</td>' +
        '<td>' + r.wave + '</td>' +
        '<td>' + r.kills + '</td>' +
        '<td>' + m + 'm ' + (sec < 10 ? '0' : '') + sec + 's</td>' +
        '<td>' + (r.mode === 'cycle' ? 'CYCLE' : 'NIGHT') + '</td></tr>';
    }).join('') + '</table>';
}

/* ---------------------------------------------------------------- flow */
function lock () { canvas.requestPointerLock && canvas.requestPointerLock(); }

function beginRun () {
  Sfx.init(); Sfx.resume();
  $('start').classList.add('hidden');
  $('dead').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  game.state = 'play';
  lock();
  syncHud();
  banner('SURVIVE');
}

function pause () {
  if (game.state !== 'play') return;
  game.state = 'pause';
  firing = false;
  pendYaw = 0; pendPitch = 0; wheelAcc = 0; wheelNext = 0;
  for (const k in keys) keys[k] = false;
  $('pause').classList.remove('hidden');
}

function resume () {
  $('pause').classList.add('hidden');
  game.state = 'play';
  lock();
}

function die () {
  game.state = 'dead';
  firing = false;
  Sfx.dead();
  document.exitPointerLock && document.exitPointerLock();
  const mins = Math.floor(game.elapsed / 60), secs = Math.floor(game.elapsed % 60);
  const place = recordScore();
  $('finalStats').innerHTML =
    'REACHED WAVE <b>' + game.wave + '</b><br>' +
    'ZOMBIES DOWN <b>' + game.kills + '</b><br>' +
    'SCORE <b>' + game.score.toLocaleString() + '</b><br>' +
    'SURVIVED <b>' + mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's</b>' +
    (place ? '<div class="newbest">' + (place === 1 ? 'NEW BEST RUN' : 'RANKED #' + place) + '</div>' : '') +
    scoreTable(place ? place - 1 : -1);
  $('dead').classList.remove('hidden');
  $('hud').classList.add('hidden');
}

function restart () {
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    z.alive = false; z.dying = false; z.g.visible = false;
  }
  for (let i = 0; i < pickups.length; i++) { pickups[i].life = 0; pickups[i].m.visible = false; }
  for (let i = 0; i < blood.length; i++) { blood[i].life = 0; blood[i].m.visible = false; }
  for (let i = turrets.length - 1; i >= 0; i--) scene.remove(turrets[i].g);
  turrets.length = 0;
  for (let i = structures.length - 1; i >= 0; i--) killObstacle(structures[i]);
  for (let i = 0; i < lootNodes.length; i++) { lootNodes[i].cooldown = 0; lootNodes[i].g.visible = true; }
  res.wood = 20; res.scrap = 12;
  toggleBuild(false);
  build.sel = 0; build.rot = 0;
  dmgEdge.t = dmgEdge.b = dmgEdge.l = dmgEdge.r = dmgEdge.all = 0;
  updateDamageFlash(1);
  for (let i = 0; i < grenades.length; i++) { grenades[i].life = 0; grenades[i].m.visible = false; }
  for (let i = 0; i < blasts.length; i++) { blasts[i].life = 0; blasts[i].m.visible = false; }
  blastLight.intensity = 0;

  player.pos.set(0, EYE, 0);
  player.vel.set(0,0,0);
  player.yaw = 0; player.pitch = 0; player.hp = 100;
  player.crouch = 0; player.height = STAND_H; player.sliding = false;
  player.slideT = 0; player.slideCd = 0; player.coyote = 0; player.jumpBuf = 0;
  player.stepOff = 0; player.landDip = 0; player.strafe = 0; player.onGround = true;
  fovKick = 0; swayX = 0; swayY = 0; swayLastYaw = 0; swayLastPitch = 0;
  for (let i = 0; i < ammo.length; i++) {
    ammo[i].mag = statMag(i);
    ammo[i].res = WEAPONS[i].resMax === Infinity ? Infinity : Math.round(WEAPONS[i].resMax * 0.6);
    gunState.unlocked[i] = false;              // recomputed from the loadout below
  }
  gunState.cur = PROFILE.loadout[0]; gunState.reloading = false; gunState.reloadT = 0;
  gunState.ads = false; gunState.adsT = 0;
  gunState.slideT = 0; gunState.pumpT = 0; gunState.drumA = 0; gunState.drumTarget = 0;
  for (let k = 0; k < gunModels.length; k++) gunModels[k].g.visible = (k === gunState.cur);
  camera.fov = 76; camera.updateProjectionMatrix();
  $('scope').classList.add('hidden');
  $('crosshair').style.opacity = '';
  $('reloadTag').classList.add('hidden');

  game.time = 0; game.wave = 0; game.kills = 0; game.score = 0;
  game.toSpawn = 0; game.zAlive = 0; game.inBreak = true; game.breakT = 3.5;
  game.mode = PROFILE.mode;
  game.boss = false; game.bossQueue = null;
  if (game.mode === 'cycle') {
    game.phase = 'day'; game.phaseT = CYCLE.day; game.light = 1;
  } else {
    game.phase = 'night'; game.phaseT = 0; game.light = 0;
  }
  rollWeather('clear');
  game.weatherT = rnd(60, 120);
  applySky(game.light);
  game.shake = 0; game.invuln = 0; game.elapsed = 0;
  buildSlots();
  refreshAvailability(false);
  beginRun();
}

$('playBtn').addEventListener('click', () => { restart(); });
$('armouryBtn').addEventListener('click', () => openArmoury('menu'));

function refreshModeBtns () {
  $('modeNight').classList.toggle('on', PROFILE.mode === 'night');
  $('modeCycle').classList.toggle('on', PROFILE.mode === 'cycle');
  $('modeNote').textContent = PROFILE.mode === 'cycle'
    ? 'Five minutes of daylight to scavenge and fortify, then five minutes of night. Dawn burns off whatever is left. Press N to call the night in early.'
    : 'Endless siege. The waves never stop and the sun never comes up.';
}
$('modeNight').addEventListener('click', () => { PROFILE.mode = 'night'; saveProfile(); refreshModeBtns(); });
$('modeCycle').addEventListener('click', () => { PROFILE.mode = 'cycle'; saveProfile(); refreshModeBtns(); });
$('pauseArmoury').addEventListener('click', () => openArmoury('pause'));
$('resumeBtn').addEventListener('click', resume);
$('quitBtn').addEventListener('click', () => {
  game.state = 'menu';
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('start').classList.remove('hidden');
});
$('againBtn').addEventListener('click', restart);
canvas.addEventListener('click', () => {
  if (game.state === 'pause') resume();
});

/* ---------------------------------------------------------------- loop */
buildWorld();
scatterLoot();
const bakeStats = bakeStatic();   // must run before enableShadows: it makes new meshes
enableShadows(scene);
applySky(0);                   // seed the dome, stars and moon before frame one
console.log('[horde] static batch: ' + bakeStats.source + ' meshes -> ' +
            bakeStats.batches + ' draw calls');
setTimeout(() => { refreshModeBtns(); refreshInputUI(); $('menuScores').innerHTML = scoreTable(-1); }, 0);
buildPieceBar();
loadProfile();
applyQuality(PROFILE.gfx, false);
applyPG(PROFILE.pg);
const pgB = $('pgBtn');
if (pgB) pgB.addEventListener('click', () => {
  PROFILE.pg = !PROFILE.pg; applyPG(PROFILE.pg); saveProfile();
});
const filmB = $('filmBtn');
if (filmB) filmB.addEventListener('click', toggleFilm);
loadScores();
applyAllSkins();
buildSlots();
gunState.cur = PROFILE.loadout[0];
gunModels[gunState.cur].g.visible = true;
for (let i = 0; i < ammo.length; i++)
  ammo[i].res = WEAPONS[i].resMax === Infinity ? Infinity : Math.round(WEAPONS[i].resMax * 0.6);
refreshAvailability(false);

// Dev handle: poke at the run from the browser console.
//   HORDE.player.hp = 999      HORDE.game.wave = 20
//   HORDE.spawn('brute', 10)   HORDE.restart()
window.HORDE = { game, player, zombies, ammo, gunState, camera, scene, renderer, solids,
                 hitList, WEAPONS, gunModels, gunScene, gunCam, PROFILE, SKINS,
                 applySkin, refreshAvailability, selectSlot, openArmoury, fire, explode,
                 res, PIECES, build, toggleBuild, placePiece, structures, lootNodes, interact,
                 damageStructure, groundAt, resolve, obstacles, keys,
                 movePlayer, updateZombies, updateSpikes, aimCell, spawn: spawnZombie,
                 ZTYPES, pickType, buildBossQueue, hurtZombie, dirtBurst, hurtPlayer, Sfx,
                 dmgEdge, updateDamageFlash, isEnclosed, isClear, roofTops,
                 updateCycle, updateWaves, applySky, goDay, goNight, playerLamp,
                 sun, hemi, skyDome, skyUni, stars, moon, applyQuality, GFX_TIERS,
                 enableShadows, shadowify, glowSprite, bakeStatic, bakeStats,
                 film, toggleHud, grabShot, toggleFilm, setWave, applyPG, GORE,
                 tracer, hitList, WEAPONS, syncHud, banner, toast, EYE, resolve,
                 lock, pause, resume, beginRun, die, glowSprite,
                 updateWeather, rollWeather, wx, WEATHER, rainMesh, lightning,
                 UPGRADES, buyUpgrade, upgRank, statDmg, statMag, statReload, finishReload, startReload,
                 turrets, updateTurrets, TURRET, refillTurret,
                 highScores, recordScore, scoreTable, applyLook,
                 restart, startWave };

let last = performance.now();
let scopeOn = false;
const shakeV = new T.Vector3();
let fovKick = 0, swayX = 0, swayY = 0, swayLastYaw = 0, swayLastPitch = 0;

function frame (now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;             // don't let a stutter teleport anyone
  if (film.slowmo) dt *= 0.32;          // everything downstream is dt-driven

  if (game.state === 'play') {
    game.time += dt;
    game.elapsed += dt;
    game.invuln -= dt;
    game.growlT -= dt;
    if (game.growlT <= 0) { game.growlT = 1; game.growlBudget = 3; game.stepBudget = 8; }

    // heartbeat when you are nearly gone, and dread that tracks the wave
    if (player.hp < 38) {
      game.heartT -= dt;
      if (game.heartT <= 0) {
        const f = 1 - player.hp / 38;
        game.heartT = 1.05 - f * 0.45;
        Sfx.heartbeat(0.35 + f * 0.65);
      }
    }
    Sfx.setTension(clamp((game.wave - 1) / 18, 0, 1) * (game.inBreak ? 0.45 : 1));

    movePlayer(dt);
    updateWaves(dt);
    updateZombies(dt);
    updateBlood(dt);
    updatePickups(dt, game.time);
    updateTracers(dt);
    updateGrenades(dt);
    updateLoot(dt);
    updateSpikes(dt);
    updateTurrets(dt);
    updateDamageFlash(dt);
    applyLook(dt);
    updateCycle(dt);
    updateWeather(dt);
    if (build.on) aimCell();
    updatePrompt();
    if (window.NET && NET.update) NET.update(dt);

    if (gunState.reloading) {
      gunState.reloadT -= dt;
      if (gunState.reloadT <= 0) finishReload();
    }
    if (firing && !build.on && WEAPONS[gunState.cur].auto) fire();

    // recoil + shake decay
    gunState.recoil    *= Math.max(0, 1 - 9 * dt);
    gunState.recoilYaw *= Math.max(0, 1 - 9 * dt);
    gunState.kickZ     *= Math.max(0, 1 - 12 * dt);
    game.shake         *= Math.max(0, 1 - 6 * dt);
    muzzleLight.intensity *= Math.max(0, 1 - 16 * dt);

    if (game.zAlive || game.toSpawn || game.mode === 'cycle' || game.weather !== 'clear') syncHud();
    if (game.boss) syncHud();

    // low-health pulse
    $('lowhp').style.opacity = player.hp < 35
      ? (0.25 + Math.sin(game.time * 6) * 0.18 * (1 - player.hp / 35)).toFixed(3)
      : '0';
  }

  // ---- camera ----
  // bob settles down when you aim, so the sight picture stays readable
  const bobAmt = 1 - gunState.adsT * 0.65;
  const bobY = Math.sin(player.bob * 2) * 0.055 * bobAmt;
  const bobX = Math.cos(player.bob) * 0.035 * bobAmt;
  shakeV.set(gauss() * game.shake, gauss() * game.shake, 0);

  // everything that lowers the view stacks into one offset: crouch, the dip on
  // a heavy landing, and the step-up the legs already took but the head hasn't
  const viewDrop = (EYE - CROUCH_EYE) * player.crouch
                 + player.landDip * 0.30
                 + player.stepOff;

  camera.position.set(player.pos.x + bobX * 0.35, player.pos.y + bobY - viewDrop, player.pos.z);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(player.yaw + gunState.recoilYaw + shakeV.x);
  camera.rotateX(player.pitch + gunState.recoil + shakeV.y - player.landDip * 0.10);
  camera.rotateZ(bobX * 0.12 - player.strafe * 0.028 * (1 - gunState.adsT * 0.7)
                 - (player.sliding ? 0.10 : 0));

  // the sun rides above you so its shadow box always covers the street you're
  // standing in, and the sky dome travels with the camera so you never reach it
  sunTarget.position.set(player.pos.x, 0, player.pos.z);
  sunTarget.updateMatrixWorld();
  sun.position.set(player.pos.x + sunDir.x * 140, sunDir.y * 140, player.pos.z + sunDir.z * 140);
  skyDome.position.copy(camera.position);
  stars.position.copy(camera.position);
  if (moon.visible) {
    moon.position.copy(camera.position).addScaledVector(MOON_DIR, 340);
    moon.lookAt(camera.position);
    moonGlow.position.copy(moon.position);
  }

  playerLamp.position.set(player.pos.x, player.pos.y + 0.4 - viewDrop, player.pos.z);
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(fwd);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  Sfx.listener(camPos, fwd, up);
  muzzleLight.position.copy(camPos).add(fwd.multiplyScalar(0.8));

  // ---- viewmodel ----
  const W = WEAPONS[gunState.cur];
  const M = gunModels[gunState.cur];
  const g = M.g;
  gunState.sway += dt;

  // aim-down-sights blend drives both the gun position and the camera FOV
  const wantAds = gunState.ads && !gunState.reloading && game.state === 'play' ? 1 : 0;
  gunState.adsT += (wantAds - gunState.adsT) * Math.min(1, dt * 13);
  const A = gunState.adsT;
  // speed you can feel: the view opens up when you run and snaps wider in a
  // slide, then closes down again the moment you bring the sights up
  const wantKick = player.sliding ? 1.7 : (player.sprinting ? 1 : 0);
  fovKick += (wantKick - fovKick) * Math.min(1, dt * 7);
  const fov = (76 + fovKick * 5.5 * (1 - A)) - (76 - 76 * W.zoom) * A;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  const sp = Math.hypot(player.vel.x, player.vel.z);
  const moving = sp > 0.5 ? 1 - A * 0.8 : 0;

  /* Sway: the gun trails the view instead of being welded to it. Track how far
     the look moved this frame and let the weapon lag behind, the way a heavy
     object lags the hands carrying it. Clamped so a fast flick can't fling it
     off screen, and killed off when aiming so the sights stay put. */
  const dYaw   = player.yaw   - swayLastYaw;
  const dPitch = player.pitch - swayLastPitch;
  swayLastYaw = player.yaw; swayLastPitch = player.pitch;
  const swayK = Math.min(1, dt * 8);
  swayX += (clamp(dYaw   * 0.9, -0.055, 0.055) - swayX) * swayK;
  swayY += (clamp(dPitch * 0.9, -0.045, 0.045) - swayY) * swayK;
  const swayAmt = 1 - A * 0.85;

  // running with the gun down, then bringing it up — a pose, not a stat
  const runPose = player.sprinting && A < 0.15 ? 1 : 0;
  gunState.runT = (gunState.runT || 0) + (runPose - (gunState.runT || 0)) * Math.min(1, dt * 8);
  const R = gunState.runT;

  const hipX = 0.20, hipY = -0.20, hipZ = -0.42;
  const adsX = 0.00, adsY = -0.128, adsZ = -0.30;
  g.position.set(
    (hipX + (adsX - hipX) * A) + Math.cos(player.bob) * 0.012 * moving + swayX * swayAmt + R * 0.06,
    (hipY + (adsY - hipY) * A) + Math.sin(player.bob * 2) * 0.012 * moving - gunState.recoil * 0.5
      + swayY * swayAmt - R * 0.09 - player.landDip * 0.05 - player.crouch * 0.015,
    (hipZ + (adsZ - hipZ) * A) + gunState.kickZ + R * 0.05
  );
  g.rotation.set(
    -gunState.recoil * 2.2 - swayY * 3.2 * swayAmt + R * 0.38,
    -0.06 * (1 - A) - swayX * 2.4 * swayAmt - R * 0.30,
     0.03 * (1 - A) + swayX * 1.6 * swayAmt + R * 0.34
  );

  // slide / bolt / charging handle snapping back on each shot
  gunState.slideT *= Math.max(0, 1 - 16 * dt);
  if (M.slide) M.slide.position.z = M.slideZ + gunState.slideT * 0.055;

  // pump action racks between shells
  gunState.pumpT *= Math.max(0, 1 - 5.5 * dt);
  if (M.pump) M.pump.position.z = M.pumpZ + Math.sin((1 - gunState.pumpT) * Math.PI) * 0.14;

  // revolver / launcher drum indexes to the next chamber
  if (M.drum) {
    gunState.drumA += (gunState.drumTarget - gunState.drumA) * Math.min(1, dt * 11);
    M.drum.rotation.z = gunState.drumA;
  }

  if (gunState.reloading) {
    const t = 1 - gunState.reloadT / statReload(gunState.cur);
    g.rotation.x += Math.sin(t * Math.PI) * 0.75;
    g.rotation.z += Math.sin(t * Math.PI) * 0.28;
    g.position.y -= Math.sin(t * Math.PI) * 0.16;
    if (M.mag) {                       // magazine drops away, fresh one slots home
      const drop = t < 0.4 ? t / 0.4 : t < 0.72 ? 1 - (t - 0.4) / 0.32 : 0;
      M.mag.position.y = M.magY - drop * 0.42;
    }
  } else if (M.mag) {
    M.mag.position.y = M.magY;
  }

  // scoped rifles swap the model for a proper sight picture
  const scoped = !!W.scoped && A > 0.72;
  g.visible = !scoped;
  if (scoped !== scopeOn) {
    scopeOn = scoped;
    $('scope').classList.toggle('hidden', !scoped);
    $('crosshair').style.opacity = scoped ? '0' : '';
  }

  drawMinimap();

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(gunScene, gunCam);

  if (film.shot) saveShot();            // buffer is still live at this point
}
requestAnimationFrame(frame);

})();
