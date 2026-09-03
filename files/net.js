/* =========================================================================
   ESCAPE THE HORDE — shared-horde co-op networking
   Supabase Realtime rooms, remote survivors, host-authoritative horde state.
   ========================================================================= */
'use strict';
window.NET = (function () {

const H = window.HORDE;
const T = window.THREE;
if (!H || !T) { console.warn('[net] game not loaded'); return {}; }

const CFG = window.HORDE_CONFIG || {};
const SUPABASE_URL = CFG.supabaseUrl || 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = CFG.supabaseAnonKey || 'YOUR-ANON-KEY';
const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');

const POS_HZ = 12;
const Z_HZ = 8;
const WORLD_HZ = 4;
const INTERP_MS = 110;
const DROP_MS = 6500;

const state = {
  on:false, room:null, id:null, name:null, client:null, channel:null,
  peers:new Map(), isHost:false, started:false, seq:0,
  posT:0, zT:0, worldT:0, lastZ:null,
  zombieMap:new Map(), world:null, onRoster:null,
};

const bodyGeo = new T.BoxGeometry(1, 1, 1);
const AV_COLS = [0x4ea8de,0xe8b04b,0x6fd66f,0xd96f9a,0xb07fe0,0x59d6c8];

function makeNameTag(name, col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px system-ui,sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.lineWidth=6; x.strokeStyle='rgba(0,0,0,.85)'; x.strokeText(name,128,34);
  x.fillStyle='#'+col.toString(16).padStart(6,'0'); x.fillText(name,128,34);
  const tex = new T.CanvasTexture(c);
  const s = new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthTest:false,toneMapped:false}));
  s.scale.set(2,0.5,1); s.position.y=2.35; s.renderOrder=50; return s;
}

function makeAvatar(name, idx) {
  const col = AV_COLS[idx % AV_COLS.length], g = new T.Group();
  const kit = new T.MeshLambertMaterial({color:col});
  const dark = new T.MeshLambertMaterial({color:0x2b2f38});
  const skin = new T.MeshLambertMaterial({color:0xb98a63});
  const put=(mat,x,y,z,sx,sy,sz)=>{ const m=new T.Mesh(bodyGeo,mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); g.add(m); return m; };
  const torso=put(kit,0,1.15,0,.52,.72,.30), head=put(skin,0,1.68,0,.28,.30,.28);
  put(dark,0,1.80,0,.31,.10,.31);
  const armL=put(kit,-.36,1.22,0,.16,.62,.16), armR=put(kit,.36,1.22,0,.16,.62,.16);
  const legL=put(dark,-.15,.42,0,.19,.84,.19), legR=put(dark,.15,.42,0,.19,.84,.19);
  g.add(makeNameTag(name,col)); H.scene.add(g);
  return {g,torso,head,armL,armR,legL,legR};
}

function addPeer(id,name,host) {
  if (!id || id===state.id || state.peers.has(id)) return;
  const av=makeAvatar(name||'SURVIVOR',state.peers.size+1);
  state.peers.set(id,{id,name:name||'SURVIVOR',host:!!host,av,prev:null,next:null,lastSeen:performance.now(),walk:0});
  H.toast((name||'SURVIVOR')+' JOINED'); pushRoster();
}
function dropPeer(id) {
  const p=state.peers.get(id); if(!p)return;
  H.scene.remove(p.av.g); state.peers.delete(id); H.toast((p.name||'SURVIVOR')+' LEFT');
  electHost(); pushRoster();
}

function localSnapshot(){ const p=H.player; return {i:state.id,n:++state.seq,t:Date.now(),nm:state.name,x:+p.pos.x.toFixed(2),y:+(p.pos.y-H.EYE).toFixed(2),z:+p.pos.z.toFixed(2),r:+p.yaw.toFixed(3),p:+p.pitch.toFixed(3),s:+Math.hypot(p.vel.x,p.vel.z).toFixed(2),c:p.crouch>.5?1:0,h:Math.round(p.hp),w:H.gunState.cur}; }
function onPos(m){ if(!m||m.i===state.id)return; let p=state.peers.get(m.i); if(!p){addPeer(m.i,m.nm,false);p=state.peers.get(m.i);} if(!p)return; if(p.next&&m.n<=p.next.n)return; p.prev=p.next||m; p.next=m; p.lastSeen=performance.now(); }

function buildZombieSnapshot(){
  const out=[]; (H.zombies||[]).forEach((z,idx)=>{ if(!z||!z.alive||z.dying)return; out.push({idx,a:1,t:z.type,x:+z.pos.x.toFixed(2),y:+z.pos.y.toFixed(2),z:+z.pos.z.toFixed(2),r:+z.yaw.toFixed(3),hp:Math.round(z.hp),max:Math.round(z.maxHp||z.hp),s:z.state||'walk'}); }); return out;
}
function zombieDelta(prev,curr){
  if(!prev)return curr; const pm=new Map(prev.map(z=>[z.idx,z])), out=[];
  for(const z of curr){ const p=pm.get(z.idx); if(!p||p.a!==z.a||p.t!==z.t||p.x!==z.x||p.y!==z.y||p.z!==z.z||p.r!==z.r||p.hp!==z.hp||p.s!==z.s)out.push(z); pm.delete(z.idx); }
  pm.forEach((v,idx)=>out.push({idx,a:0})); return out;
}
function onZombies(m,keyframe){
  if(!m||!Array.isArray(m.zombies)||state.isHost)return;
  if(keyframe){
    const live=new Set(m.zombies.filter(z=>z.a).map(z=>z.idx));
    (H.zombies||[]).forEach((z,idx)=>{ if(!live.has(idx)){ z.alive=false; z.dying=false; if(z.g)z.g.visible=false; if(z.mound)z.mound.visible=false; if(z.moundHit)z.moundHit.visible=false; } });
    state.zombieMap.clear();
  }
  const now=performance.now();
  for(const s of m.zombies){
    if(!s.a){ const z=H.zombies&&H.zombies[s.idx]; if(z){z.alive=false;z.dying=false;if(z.g)z.g.visible=false;} state.zombieMap.delete(s.idx); continue; }
    const old=state.zombieMap.get(s.idx); state.zombieMap.set(s.idx,{prev:old?old.next:s,next:s,seen:now});
  }
}
function applyRemoteZombie(s){
  const z=H.zombies&&H.zombies[s.idx]; if(!z)return;
  const type=H.ZTYPES[s.t]?s.t:(z.type||'green'), cfg=H.ZTYPES[type];
  z.alive=true; z.dying=false; z.dieT=0; z.type=type; z.hp=s.hp; z.maxHp=s.max||Math.max(s.hp,1); z.state=s.s||'walk'; z.yaw=s.r||0; z.feet=s.y||0;
  if(z.pos)z.pos.set(s.x,s.y,s.z); if(z.g){z.g.visible=true;z.g.position.set(s.x,s.y,s.z);z.g.rotation.y=s.r||0;if(cfg&&z.g.scale)z.g.scale.setScalar(cfg.scale||1);}
  if(cfg){ if(z.skinMat)z.skinMat.color.setHex(cfg.skin); if(z.clothMat)z.clothMat.color.setHex(cfg.cloth); if(z.eyeMat)z.eyeMat.color.setHex(cfg.eye); }
  if(z.mound)z.mound.visible=false; if(z.moundHit)z.moundHit.visible=false;
}

function worldSnapshot(){ const g=H.game; return {wave:g.wave,toSpawn:g.toSpawn,zAlive:g.zAlive,inBreak:g.inBreak,breakT:g.breakT,boss:g.boss,phase:g.phase,phaseT:g.phaseT,light:g.light,elapsed:g.elapsed,score:g.score,kills:g.kills,weather:g.weather,weatherT:g.weatherT}; }
function onWorld(m){ if(!state.isHost&&m)state.world=m; }
function applyWorld(){ if(state.isHost||!state.world)return; const g=H.game,w=state.world; ['wave','toSpawn','zAlive','breakT','phaseT','light','elapsed','score','kills','weatherT'].forEach(k=>{if(w[k]!==undefined)g[k]=w[k];}); ['inBreak','boss','phase','weather'].forEach(k=>{if(w[k]!==undefined)g[k]=w[k];}); }

function closestZombieToPoint(p){ let best=null,bd=3.0; for(const z of H.zombies||[]){ if(!z||!z.alive||z.dying||!z.g)continue; const d=z.g.position.distanceTo(p); if(d<bd){bd=d;best=z;} } return best; }
function onShot(m){
  if(!m||m.i===state.id)return;
  const a=new T.Vector3(m.ax,m.ay,m.az), b=new T.Vector3(m.bx,m.by,m.bz); H.tracer(a,b);
  if(H.Sfx&&H.Sfx.shot){const w=H.WEAPONS[m.w]||H.WEAPONS[0];H.Sfx.shot(w.tone);}
  if(!state.isHost||!state.started)return;
  const z=closestZombieToPoint(b); if(!z)return;
  const w=H.WEAPONS[m.w]||H.WEAPONS[0]; const scale=(H.ZTYPES[z.type]&&H.ZTYPES[z.type].scale)||1;
  const head=b.y>(z.feet||z.g.position.y)+1.35*scale; const dmg=w.dmg*(head?w.head:1);
  if(dmg>0&&H.hurtZombie)H.hurtZombie(z,dmg,head,b);
}
function onLocalShot(from,to,weaponIndex){ if(!state.on||!state.channel)return; state.channel.send({type:'broadcast',event:'shot',payload:{i:state.id,w:weaponIndex,ax:+from.x.toFixed(2),ay:+from.y.toFixed(2),az:+from.z.toFixed(2),bx:+to.x.toFixed(2),by:+to.y.toFixed(2),bz:+to.z.toFixed(2)}}); }

function onStart(m){ if(!m||m.i===state.id)return; state.started=true; H.toast('HOST STARTED THE RUN'); H.restart(); }
function sendStart(){ if(!state.on||!state.isHost||!state.channel)return; state.started=true; state.lastZ=null; state.channel.send({type:'broadcast',event:'start',payload:{i:state.id,t:Date.now()}}); }

async function electHost(){
  if(!state.on||!state.channel)return;
  const ps=state.channel.presenceState()||{}, rows=[];
  Object.keys(ps).forEach(id=>{const p=ps[id]&&ps[id][0]; if(p)rows.push({id,host:!!p.host});});
  if(!rows.some(r=>r.id===state.id))rows.push({id:state.id,host:state.isHost});
  const marked=rows.filter(r=>r.host).sort((a,b)=>a.id.localeCompare(b.id));
  const chosen=(marked[0]||rows.sort((a,b)=>a.id.localeCompare(b.id))[0]); if(!chosen)return;
  const was=state.isHost; state.isHost=chosen.id===state.id;
  state.peers.forEach(p=>p.host=p.id===chosen.id);
  if(was!==state.isHost){ try{await state.channel.track({name:state.name,host:state.isHost,at:Date.now()});}catch(e){} if(state.isHost)H.toast('YOU ARE THE CO-OP HOST'); }
  pushRoster();
}

let sbLoading=null;
function loadSupabase(){ if(window.supabase)return Promise.resolve(true); if(sbLoading)return sbLoading; sbLoading=new Promise(resolve=>{const s=document.createElement('script');let done=false;const fin=ok=>{if(!done){done=true;resolve(ok&&!!window.supabase);}};s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=()=>fin(true);s.onerror=()=>fin(false);document.head.appendChild(s);setTimeout(()=>fin(false),8000);});return sbLoading; }

async function join(room,name){
  if(state.on)return; if(!configured){H.toast('SET YOUR KEYS IN config.js');return;}
  H.toast('CONNECTING…'); if(!(await loadSupabase())){H.toast('CANNOT REACH SUPABASE');return;}
  state.name=(name||'SURVIVOR').toUpperCase().slice(0,12); state.room=(room||'STREET').toUpperCase().slice(0,12); state.id=Math.random().toString(36).slice(2,10);
  state.client=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{realtime:{params:{eventsPerSecond:30}}});
  state.channel=state.client.channel('horde:'+state.room,{config:{presence:{key:state.id},broadcast:{self:false}}});
  state.channel
    .on('broadcast',{event:'pos'},({payload})=>onPos(payload))
    .on('broadcast',{event:'shot'},({payload})=>onShot(payload))
    .on('broadcast',{event:'start'},({payload})=>onStart(payload))
    .on('broadcast',{event:'z_delta'},({payload})=>onZombies(payload,false))
    .on('broadcast',{event:'z_keyframe'},({payload})=>onZombies(payload,true))
    .on('broadcast',{event:'world'},({payload})=>onWorld(payload))
    .on('presence',{event:'join'},({key,newPresences})=>{if(key===state.id)return;const p=newPresences&&newPresences[0];addPeer(key,p&&p.name,p&&p.host);setTimeout(electHost,50);})
    .on('presence',{event:'sync'},()=>{const ps=state.channel.presenceState();Object.keys(ps).forEach(id=>{if(id===state.id)return;const p=ps[id]&&ps[id][0];addPeer(id,p&&p.name,p&&p.host);});electHost();})
    .on('presence',{event:'leave'},({key})=>dropPeer(key))
    .subscribe(async status=>{if(status!=='SUBSCRIBED')return;state.on=true;await state.channel.track({name:state.name,host:false,at:Date.now()});H.toast('JOINED ROOM '+state.room);setTimeout(electHost,80);pushRoster();});
}
function host(name){ return join(makeRoomCode(),name); }
function leave(){ if(!state.on)return; state.peers.forEach((p,id)=>dropPeer(id)); if(state.channel)state.channel.unsubscribe(); state.on=false;state.isHost=false;state.started=false;state.zombieMap.clear();state.world=null;pushRoster();H.toast('LEFT THE ROOM'); }

function update(dt){
  if(!state.on||!state.channel)return;
  state.posT-=dt; if(state.posT<=0){state.posT=1/POS_HZ;state.channel.send({type:'broadcast',event:'pos',payload:localSnapshot()});}
  if(state.isHost&&state.started){
    state.zT-=dt; if(state.zT<=0){state.zT=1/Z_HZ;const cur=buildZombieSnapshot(),delta=zombieDelta(state.lastZ,cur);const key=!state.lastZ||state.seq%8===0;state.channel.send({type:'broadcast',event:key?'z_keyframe':'z_delta',payload:{t:Date.now(),zombies:key?cur:delta}});state.lastZ=cur;}
    state.worldT-=dt; if(state.worldT<=0){state.worldT=1/WORLD_HZ;state.channel.send({type:'broadcast',event:'world',payload:worldSnapshot()});}
  }
  const now=Date.now()-INTERP_MS, clock=performance.now();
  state.peers.forEach((p,id)=>{if(clock-p.lastSeen>DROP_MS){dropPeer(id);return;}if(!p.next)return;const a=p.prev||p.next,b=p.next,span=Math.max(1,b.t-a.t),k=Math.max(0,Math.min(1,(now-a.t)/span));let dr=b.r-a.r;while(dr>Math.PI)dr-=Math.PI*2;while(dr<-Math.PI)dr+=Math.PI*2;const av=p.av;av.g.position.set(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k,a.z+(b.z-a.z)*k);av.g.rotation.y=a.r+dr*k;av.g.scale.y=1-(b.c?0.32:0);p.walk+=dt*b.s*1.4;const sw=Math.sin(p.walk)*Math.min(1,b.s/6);av.legL.rotation.x=sw*.7;av.legR.rotation.x=-sw*.7;av.armL.rotation.x=-sw*.4;av.armR.rotation.x=sw*.4;av.head.rotation.x=-(b.p||0)*.6;});
  if(!state.isHost&&state.started){
    const live=new Set(); state.zombieMap.forEach((e,idx)=>{live.add(idx);applyRemoteZombie(e.next);});
    (H.zombies||[]).forEach((z,idx)=>{if(!live.has(idx)&&z.alive){z.alive=false;z.dying=false;if(z.g)z.g.visible=false;}}); applyWorld();
  }
}

function roster(){const a=[{id:state.id,name:state.name,host:state.isHost,me:true}];state.peers.forEach(p=>a.push({id:p.id,name:p.name,host:p.host,me:false}));return a;}
function pushRoster(){if(state.onRoster)state.onRoster(roster(),state);}
function makeRoomCode(){const L='BCDFGHJKLMNPQRSTVWXZ';let s='';for(let i=0;i<4;i++)s+=L[(Math.random()*L.length)|0];return s;}
function roomFromUrl(){try{return new URLSearchParams(location.search).get('room');}catch(e){return null;}}
function shareLink(){return state.room?location.origin+location.pathname+'?room='+encodeURIComponent(state.room):location.href;}
async function copyLink(){try{await navigator.clipboard.writeText(shareLink());H.toast('INVITE LINK COPIED');}catch(e){H.toast(shareLink());}}

const play=document.getElementById('playBtn');
if(play)play.addEventListener('click',e=>{if(!state.on)return;if(!state.isHost){e.preventDefault();e.stopImmediatePropagation();H.toast('WAITING FOR THE HOST TO START');return;}sendStart();},true);

return {join,host,leave,update,onLocalShot,state,roomFromUrl,shareLink,copyLink,configured,roster,sendStart,makeRoomCode,electHost};
})();
