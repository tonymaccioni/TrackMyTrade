
import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const FB_KEY = "AIzaSyA6SLYL7Ep451nu6edynUeBbPROtgRucv8";
const FB_PROJECT = "trackmytrade-389b0";
const AU = "https://identitytoolkit.googleapis.com/v1/accounts";
const TU = "https://securetoken.googleapis.com/v1/token";
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const jh = { "Content-Type": "application/json" };
const ah = t => ({ ...jh, Authorization: `Bearer ${t}` });
const sbSignUp  = (e,p) => fetch(`${AU}:signUp?key=${FB_KEY}`,{method:"POST",headers:jh,body:JSON.stringify({email:e,password:p,returnSecureToken:true})}).then(r=>r.json());
const sbSignIn  = (e,p) => fetch(`${AU}:signInWithPassword?key=${FB_KEY}`,{method:"POST",headers:jh,body:JSON.stringify({email:e,password:p,returnSecureToken:true})}).then(r=>r.json());
const fbRefresh = rt => fetch(`${TU}?key=${FB_KEY}`,{method:"POST",headers:jh,body:JSON.stringify({grant_type:"refresh_token",refresh_token:rt})}).then(r=>r.json());
const fsRead = async (uid,tok) => {
  try {
    const r = await fetch(`${FS}/users/${uid}`,{headers:ah(tok)});
    if(!r.ok) return null;
    const d = await r.json();
    if(!d.fields) return null;
    const o = {};
    Object.entries(d.fields).forEach(([k,v])=>{try{o[k]=JSON.parse(v.stringValue);}catch{}});
    return o;
  } catch { return null; }
};
const fsWrite = async (uid,tok,data) => {
  try {
    const f = {};
    Object.entries(data).forEach(([k,v])=>{f[k]={stringValue:JSON.stringify(v)};});
    await fetch(`${FS}/users/${uid}`,{method:"PATCH",headers:ah(tok),body:JSON.stringify({fields:f})});
  } catch {}
};
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch {} };

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const ALL_ASSETS = ["XAU/USD","EUR/USD","GBP/USD","NAS100","BTC/USD","ETH/USD","US30","SPX500","GBP/JPY","USD/JPY"];
const DEFAULT_CRITERIA = ["HA M5 claire (pas de doji)","MM20 bien orientée","BB approche sur M1","Bougie de rejet propre","Fenêtre horaire respectée","Pas de distraction","1 seul trade aujourd'hui","Contexte macro neutre"];
const MONO = "'IBM Plex Mono','Courier New',monospace";
const PNL_PRESETS = ["-1","-0.5","0","+1","+2","+3","+4","+5"];
const NTR = ["Pas de setup valide","Hors fenêtre","Marché difficile","Journée chargée","Jour de repos"];
const today = () => new Date().toISOString().split("T")[0];
const rc = r => r==="WIN"?"#00ff9d":r==="LOSS"?"#ff4d4d":"#f0b429";
const fmtPct = v => v===""||v===null||v===undefined?"—":`${Number(v)>=0?"+":""}${Number(v).toFixed(2)}%`;
const emptyForm = (asset="XAU/USD") => ({ date:today(), asset, direction:"BUY", checklist:[], result:"WIN", pnlPreset:"", pnlManual:"", notes:"", rejetScore:0, time:"", screenshot:"" });
const inputSt = { width:"100%", background:"#0d1a0d", border:"1px solid rgba(0,255,157,0.2)", borderRadius:8, color:"#c8e6c8", padding:"12px 14px", fontSize:13, fontFamily:MONO, marginBottom:10, outline:"none" };

const CSS = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#080f08}
    input,select,textarea{outline:none;font-family:${MONO}}
    input[type=checkbox]{accent-color:#00ff9d;width:16px;height:16px;cursor:pointer}
    input[type=file]{display:none}
    .btn{transition:all 0.15s;cursor:pointer}
    .btn:hover{opacity:0.85;transform:translateY(-1px)}
    .row{transition:all 0.2s;cursor:pointer}
    .row:hover{background:rgba(0,255,157,0.06)!important;border-color:rgba(0,255,157,0.2)!important}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1e2a1e}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1;text-shadow:0 0 8px rgba(0,255,157,0.4)}50%{opacity:0.85;text-shadow:0 0 14px rgba(0,255,157,0.7)}}
    @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
    .fu{animation:fadeUp 0.45s ease both}
    .fi{animation:fadeIn 0.4s ease both}
    .glow{animation:pulse 3s ease-in-out infinite}
    .grid-bg{background-image:linear-gradient(rgba(0,255,157,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,157,0.025) 1px,transparent 1px);background-size:32px 32px}
    .slide-up{animation:slideUp 0.3s ease both}
  `}</style>
);

// ─── LOGO ◈ dans carré arrondi ────────────────────────────────────────────────
function Logo({ size="sm" }) {
  const cfg = { sm:[28,18], md:[34,22], lg:[48,30] }[size] || [28,18];
  const [box, fs] = cfg;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:9 }}>
      <div style={{ width:box, height:box, borderRadius:7, background:"rgba(0,255,157,0.1)", border:"1px solid rgba(0,255,157,0.3)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 0 12px rgba(0,255,157,0.15)" }}>
        <span className="glow" style={{ fontSize:Math.round(box*0.52), color:"#00ff9d", lineHeight:1 }}>◈</span>
      </div>
      <span style={{ fontSize:fs, fontFamily:MONO, letterSpacing:-0.5, lineHeight:1 }}>
        <b style={{ color:"#00ff9d" }}>Track</b>
        <span style={{ color:"#3a7a5a", fontWeight:300 }}>My</span>
        <b style={{ color:"#00ff9d" }}>Trade</b>
      </span>
    </div>
  );
}

function ScoreRing({ score, max=8, size=52, threshold=6 }) {
  const r=(size-8)/2, circ=2*Math.PI*r;
  const color=score>=threshold?"#00ff9d":score>=threshold-1?"#f0b429":"#ff4d4d";
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e2a1e" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${circ*(score/max)} ${circ}`} strokeLinecap="round"
        style={{ transform:"rotate(-90deg)", transformOrigin:"50% 50%", transition:"stroke-dasharray 0.4s" }}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize:11, fontWeight:700, fill:color, fontFamily:"monospace" }}>{score}/{max}</text>
    </svg>
  );
}

function Stat({ label, value, sub, color="#00ff9d" }) {
  return (
    <div style={{ background:"rgba(0,255,157,0.04)", border:"1px solid rgba(0,255,157,0.12)", borderRadius:10, padding:"14px 16px", flex:1 }}>
      <div style={{ fontSize:9, color:"#5a7a5a", textTransform:"uppercase", letterSpacing:1, marginBottom:6, fontFamily:MONO }}>{label}</div>
      <div style={{ fontSize:23, fontWeight:800, color, fontFamily:MONO, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"#5a7a5a", marginTop:5 }}>{sub}</div>}
    </div>
  );
}

function Dots({ total, current }) {
  return (
    <div style={{ display:"flex", gap:6, justifyContent:"center" }}>
      {Array.from({length:total}).map((_,i) => (
        <div key={i} style={{ width:i===current?22:7, height:7, borderRadius:4, background:i===current?"#00ff9d":i<current?"#1e4a1e":"#1e2a1e", transition:"all 0.3s" }}/>
      ))}
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slides = [
    {
      visual:(
        <div style={{ position:"relative", width:200, height:180, margin:"0 auto" }}>
          <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,255,157,0.1) 0%,transparent 70%)" }}/>
          <div style={{ position:"absolute", inset:20, borderRadius:"50%", border:"1px solid rgba(0,255,157,0.12)" }}/>
          <div style={{ position:"absolute", inset:40, borderRadius:"50%", border:"1px solid rgba(0,255,157,0.06)" }}/>
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}><Logo size="lg"/></div>
        </div>
      ),
      title:"Bienvenue sur\nTrackMyTrade",
      desc:"Le journal de trading qui transforme ta discipline en données concrètes. Chaque trade enregistré est un pas vers la rentabilité.",
      cta:"Découvrir →"
    },
    {
      visual:(
        <div style={{ display:"flex", flexDirection:"column", gap:8, maxWidth:260, margin:"0 auto" }}>
          {["HA M5 claire ✓","MM20 orientée ✓","BB approche ✓","Rejet propre —"].map((item,i)=>(
            <div key={i} className="fu" style={{ background:i<3?"rgba(0,255,157,0.08)":"rgba(255,77,77,0.06)", border:`1px solid ${i<3?"rgba(0,255,157,0.2)":"rgba(255,77,77,0.15)"}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:i<3?"#00ff9d":"#ff4d4d", fontFamily:MONO, animationDelay:`${i*0.08}s` }}>{item}</div>
          ))}
        </div>
      ),
      title:"Ta checklist,\nton filtre",
      desc:"Configure tes critères d'entrée. Chaque setup reçoit une note automatique — conforme ou non-conforme. Les chiffres ne mentent pas.",
      cta:"Suivant →"
    },
    {
      visual:(
        <div style={{ maxWidth:260, margin:"0 auto" }}>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            {[["WIN RATE","73%"],["P&L TOTAL","+4.2%"]].map(([l,v])=>(
              <div key={l} style={{ flex:1, background:"rgba(0,255,157,0.08)", border:"1px solid rgba(0,255,157,0.2)", borderRadius:8, padding:12, textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:"#00ff9d", fontFamily:MONO }}>{v}</div>
                <div style={{ fontSize:9, color:"#5a7a5a", marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ background:"rgba(0,255,157,0.04)", border:"1px solid rgba(0,255,157,0.1)", borderRadius:8, padding:12, display:"flex", gap:6, alignItems:"flex-end", height:60 }}>
            {[0.5,0.9,0.3,1,0.7,0.85,0.4,1].map((h,i)=>(
              <div key={i} style={{ flex:1, height:`${h*100}%`, background:h>0.5?"#00ff9d":"#ff4d4d", borderRadius:"3px 3px 0 0", opacity:0.7 }}/>
            ))}
          </div>
        </div>
      ),
      title:"Mesure ce qui\nfonctionne",
      desc:"Courbe de capital, conformité des setups, résumé hebdomadaire. Les données te font progresser.",
      cta:"Commencer →"
    },
  ];
  const s = slides[step];
  return (
    <div style={{ background:"#080f08", minHeight:"100vh", display:"flex", flexDirection:"column", fontFamily:MONO, maxWidth:480, margin:"0 auto" }}>
      <CSS/>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 28px" }}>
        <div className="fi" key={`v${step}`} style={{ marginBottom:32, width:"100%" }}>{s.visual}</div>
        <div className="fi" key={`t${step}`} style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:26, fontWeight:700, color:"#00ff9d", whiteSpace:"pre-line", lineHeight:1.25, marginBottom:14, fontFamily:MONO }}>{s.title}</div>
          <div style={{ fontSize:13, color:"#5a7a5a", lineHeight:1.8, maxWidth:300, margin:"0 auto" }}>{s.desc}</div>
        </div>
        <button onClick={()=>step<slides.length-1?setStep(step+1):onDone()} className="btn"
          style={{ width:"100%", maxWidth:300, background:"rgba(0,255,157,0.12)", border:"1px solid #00ff9d", color:"#00ff9d", borderRadius:12, padding:16, fontSize:14, fontWeight:700, fontFamily:MONO, marginBottom:14 }}>{s.cta}</button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{ background:"transparent", border:"none", color:"#3a5a3a", fontSize:12, fontFamily:MONO }}>← Retour</button>}
      </div>
      <div style={{ padding:"20px 28px 36px" }}><Dots total={slides.length} current={step}/></div>
    </div>
  );
}

// ─── GUIDED SETUP ─────────────────────────────────────────────────────────────
function GuidedSetup({ onDone }) {
  const [step,setStep]=useState(0);
  const [stratName,setStratName]=useState("");
  const [selectedAssets,setSelectedAssets]=useState(["XAU/USD"]);
  const [criteria,setCriteria]=useState([...DEFAULT_CRITERIA]);
  const [threshold,setThreshold]=useState(6);
  const [newItem,setNewItem]=useState("");
  const steps = [
    { label:"01", title:"Ta stratégie", desc:"Donne un nom à ta stratégie. Il apparaîtra dans ton journal.", ok:stratName.trim().length>0,
      content:<input value={stratName} onChange={e=>setStratName(e.target.value)} placeholder="Ex: XAU/USD Scalping BB" style={{...inputSt,fontSize:14,padding:14}} autoFocus/> },
    { label:"02", title:"Tes actifs", desc:"Sur quoi tu trades ? Sélectionne un ou plusieurs actifs.", ok:selectedAssets.length>0,
      content:<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{ALL_ASSETS.map(a=>(
        <button key={a} onClick={()=>setSelectedAssets(p=>p.includes(a)?p.filter(x=>x!==a):[...p,a])} className="btn"
          style={{background:selectedAssets.includes(a)?"rgba(0,255,157,0.15)":"#0d1a0d",border:`1px solid ${selectedAssets.includes(a)?"#00ff9d":"rgba(0,255,157,0.15)"}`,color:selectedAssets.includes(a)?"#00ff9d":"#3a5a3a",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,fontFamily:MONO}}>{a}</button>
      ))}</div> },
    { label:"03", title:"Tes critères", desc:"Modifie la checklist pour qu'elle corresponde à ta stratégie.", ok:criteria.length>=2,
      content:<div>
        {criteria.map((c,i)=>(
          <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={c} onChange={e=>{const n=[...criteria];n[i]=e.target.value;setCriteria(n);}} style={{...inputSt,marginBottom:0,flex:1}}/>
            <button onClick={()=>setCriteria(criteria.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
          </div>
        ))}
        <div style={{display:"flex",gap:8}}>
          <input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Ajouter un critère…"
            onKeyDown={e=>{if(e.key==="Enter"&&newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} style={{...inputSt,marginBottom:0,flex:1}}/>
          <button onClick={()=>{if(newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} className="btn"
            style={{background:"rgba(0,255,157,0.1)",border:"1px solid rgba(0,255,157,0.3)",color:"#00ff9d",borderRadius:8,padding:"0 16px",fontSize:18}}>+</button>
        </div>
      </div> },
    { label:"04", title:"Seuil de conformité", desc:`Un setup est conforme s'il valide au moins X critères sur ${criteria.length}.`, ok:true,
      content:<div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {Array.from({length:Math.min(7,criteria.length-1)},(_,i)=>i+2).map(n=>(
            <button key={n} onClick={()=>setThreshold(n)} className="btn"
              style={{flex:1,padding:"12px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:threshold===n?"rgba(0,255,157,0.2)":"#0d1a0d",border:`1px solid ${threshold===n?"#00ff9d":"rgba(0,255,157,0.15)"}`,color:threshold===n?"#00ff9d":"#3a5a3a"}}>{n}</button>
          ))}
        </div>
        <div style={{background:"rgba(0,255,157,0.04)",border:"1px solid rgba(0,255,157,0.1)",borderRadius:10,padding:16}}>
          <div style={{fontSize:12,color:"#00ff9d",marginBottom:6}}>✓ Conforme = {threshold}/{criteria.length}</div>
          <div style={{fontSize:10,color:"#3a5a3a"}}>{threshold/criteria.length>=0.875?"🎯 Standard élevé":threshold/criteria.length>=0.6?"⚖ Équilibré":"⚠ Standard faible"}</div>
        </div>
      </div> },
  ];
  const s = steps[step];
  return (
    <div style={{background:"#080f08",minHeight:"100vh",fontFamily:MONO,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <CSS/>
      <div style={{padding:"24px 24px 16px",borderBottom:"1px solid rgba(0,255,157,0.08)"}}>
        <Logo size="sm"/><div style={{marginTop:20}}><Dots total={steps.length} current={step}/></div>
      </div>
      <div style={{flex:1,padding:"28px 24px",overflow:"auto"}} key={step}>
        <div className="fu">
          <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:3,marginBottom:6}}>ÉTAPE {s.label} / 04</div>
          <div style={{fontSize:22,fontWeight:700,color:"#00ff9d",marginBottom:8,lineHeight:1.2}}>{s.title}</div>
          <div style={{fontSize:13,color:"#5a7a5a",marginBottom:24,lineHeight:1.7}}>{s.desc}</div>
          {s.content}
        </div>
      </div>
      <div style={{padding:"16px 24px 36px",borderTop:"1px solid rgba(0,255,157,0.08)"}}>
        <button onClick={()=>step<steps.length-1?setStep(step+1):onDone({strategyName:stratName,defaultAsset:selectedAssets[0],items:criteria,threshold})}
          disabled={!s.ok} className="btn"
          style={{width:"100%",background:s.ok?"rgba(0,255,157,0.15)":"rgba(0,255,157,0.04)",border:`1px solid ${s.ok?"#00ff9d":"rgba(0,255,157,0.1)"}`,color:s.ok?"#00ff9d":"#2a3a2a",borderRadius:12,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:12}}>
          {step===steps.length-1?"✓ Lancer TrackMyTrade":"Continuer →"}
        </button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#3a5a3a",fontSize:12,fontFamily:MONO}}>← Étape précédente</button>}
      </div>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [username,setUsername]=useState("");
  const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const reset=()=>{setError("");setSuccess("");}; const go=m=>{setMode(m);reset();};
  const submit=async()=>{
    reset();
    if(!email||(!password&&mode!=="forgot")){setError("Champs requis.");return;}
    if(password.length<6&&mode!=="forgot"){setError("6 caractères minimum.");return;}
    setLoading(true);
    if(mode==="forgot"){
      try{await fetch(`${AU}:sendOobCode?key=${FB_KEY}`,{method:"POST",headers:jh,body:JSON.stringify({requestType:"PASSWORD_RESET",email})});setSuccess("Email envoyé !");}catch{setError("Erreur réseau.");}
      setLoading(false);return;
    }
    try{
      const data=mode==="register"?await sbSignUp(email,password):await sbSignIn(email,password);
      if(data.error)setError(data.error.message||"Erreur.");
      else if(mode==="register"){setSuccess("Compte créé ! Connecte-toi.");go("login");}
      else onAuth({email:data.email,id:data.localId,token:data.idToken,refreshToken:data.refreshToken,expiresAt:Date.now()+3600000,username:username||data.email.split("@")[0]});
    }catch{setError("Erreur réseau.");}
    setLoading(false);
  };
  return (
    <div style={{background:"#080f08",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <CSS/>
      <div style={{marginBottom:40}}><Logo size="lg"/></div>
      <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:3,marginBottom:24}}>{mode==="login"?"CONNEXION":mode==="register"?"CRÉER UN COMPTE":"MOT DE PASSE OUBLIÉ"}</div>
      <div style={{width:"100%",maxWidth:340}}>
        {mode==="register"&&<input placeholder="Pseudo" value={username} onChange={e=>{setUsername(e.target.value);reset();}} style={inputSt}/>}
        <input type="email" placeholder="Email" value={email} onChange={e=>{setEmail(e.target.value);reset();}} style={inputSt}/>
        {mode!=="forgot"&&<input type="password" placeholder="Mot de passe (6 car. min.)" value={password} onChange={e=>{setPassword(e.target.value);reset();}} style={inputSt} onKeyDown={e=>e.key==="Enter"&&submit()}/>}
        {error&&<div style={{fontSize:11,color:"#ff4d4d",marginBottom:10,padding:"8px 12px",background:"rgba(255,77,77,0.08)",borderRadius:8}}>{error}</div>}
        {success&&<div style={{fontSize:11,color:"#00ff9d",marginBottom:10,padding:"8px 12px",background:"rgba(0,255,157,0.08)",borderRadius:8}}>{success}</div>}
        <button onClick={submit} disabled={loading} className="btn" style={{width:"100%",background:"rgba(0,255,157,0.12)",border:"1px solid #00ff9d",color:"#00ff9d",borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO,letterSpacing:1,marginBottom:10}}>{loading?"…":mode==="login"?"SE CONNECTER":mode==="register"?"CRÉER MON COMPTE":"ENVOYER LE LIEN"}</button>
        {mode==="login"&&<button onClick={()=>go("forgot")} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#3a5a3a",fontSize:11,fontFamily:MONO,marginBottom:6}}>Mot de passe oublié ?</button>}
        <button onClick={()=>go(mode==="register"?"login":mode==="forgot"?"login":"register")} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#3a5a3a",fontSize:12,fontFamily:MONO,marginBottom:20}}>
          {mode==="login"?"Pas encore de compte → S'inscrire":mode==="forgot"?"← Retour":"Déjà inscrit → Se connecter"}
        </button>
      </div>
    </div>
  );
}

// ─── TRADE DETAIL MODAL ───────────────────────────────────────────────────────
function TradeDetailModal({ trade, config, onClose, onEdit }) {
  if(!trade) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="slide-up" style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.2)",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,maxHeight:"90vh",overflow:"auto",padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#00ff9d",fontFamily:MONO}}>RÉCAP TRADE</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{onEdit(trade);onClose();}} className="btn" style={{background:"rgba(0,255,157,0.08)",border:"1px solid rgba(0,255,157,0.2)",color:"#5aaa7a",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>✏ Modifier</button>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:"#5a7a5a",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
        </div>
        <div style={{background:`${rc(trade.result)}10`,border:`1px solid ${rc(trade.result)}35`,borderRadius:10,padding:16,marginBottom:14,borderLeft:`3px solid ${rc(trade.result)}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#c8e6c8",fontFamily:MONO}}>{trade.asset} · {trade.direction}</div>
              <div style={{fontSize:11,color:"#5a7a5a",marginTop:4}}>{trade.date}{trade.time?" · "+trade.time:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:800,color:rc(trade.result),fontFamily:MONO}}>{trade.result}</div>
              {trade.pnlPct!==""&&<div style={{fontSize:14,color:parseFloat(trade.pnlPct)>=0?"#00ff9d":"#ff4d4d",fontWeight:700}}>{fmtPct(parseFloat(trade.pnlPct))}</div>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:"rgba(0,255,157,0.04)",border:"1px solid rgba(0,255,157,0.1)",borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
            <ScoreRing score={trade.setupScore} max={trade.checklistMax||config.items.length} size={44} threshold={config.threshold}/>
            <div>
              <div style={{fontSize:10,color:"#3a5a3a",letterSpacing:1}}>SETUP SCORE</div>
              <div style={{fontSize:12,color:trade.conforming?"#00ff9d":"#ff4d4d",fontWeight:700,marginTop:3}}>{trade.conforming?"✓ Conforme":"✗ Non-conforme"}</div>
            </div>
          </div>
          {trade.rejetScore>0&&(
            <div style={{flex:1,background:"rgba(0,255,157,0.04)",border:"1px solid rgba(0,255,157,0.1)",borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:28,fontWeight:800,color:trade.rejetScore>=8?"#00ff9d":trade.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:MONO}}>{trade.rejetScore}</div>
              <div>
                <div style={{fontSize:10,color:"#3a5a3a",letterSpacing:1}}>REJET /10</div>
                <div style={{fontSize:11,color:"#5a7a5a",marginTop:3}}>{trade.rejetScore>=8?"Excellent":trade.rejetScore>=5?"Correct":"Faible"}</div>
              </div>
            </div>
          )}
        </div>
        <div style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.1)",borderRadius:8,padding:12,marginBottom:14}}>
          <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:10}}>CHECKLIST</div>
          {config.items.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid rgba(0,255,157,0.04)"}}>
              <span style={{fontSize:13,color:trade.checklist.includes(i)?"#00ff9d":"#2a3a2a"}}>{trade.checklist.includes(i)?"✓":"✗"}</span>
              <span style={{fontSize:11,color:trade.checklist.includes(i)?"#c8e6c8":"#3a5a3a"}}>{item}</span>
            </div>
          ))}
        </div>
        {trade.screenshot&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:8}}>CAPTURE D'ÉCRAN</div>
            <img src={trade.screenshot} alt="" style={{width:"100%",borderRadius:8,border:"1px solid rgba(0,255,157,0.15)"}}/>
          </div>
        )}
        {trade.notes&&(
          <div style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.08)",borderRadius:8,padding:12}}>
            <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:6}}>NOTES</div>
            <div style={{fontSize:12,color:"#5a7a5a",lineHeight:1.6,fontStyle:"italic"}}>"{trade.notes}"</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConformityBar({ trades, threshold, maxItems }) {
  const conf=trades.filter(t=>t.setupScore>=threshold), nonConf=trades.filter(t=>t.setupScore<threshold);
  const cWR=conf.length?Math.round(conf.filter(t=>t.result==="WIN").length/conf.length*100):null;
  const nWR=nonConf.length?Math.round(nonConf.filter(t=>t.result==="WIN").length/nonConf.length*100):null;
  const cPct=trades.length?(conf.length/trades.length)*100:50;
  return (
    <div style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.1)",borderRadius:10,padding:16,marginBottom:12}}>
      <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Conformité · seuil {threshold}/{maxItems}</div>
      <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",marginBottom:14,background:"#1e2a1e"}}>
        <div style={{width:`${cPct}%`,background:"#00ff9d",transition:"width 0.5s"}}/>
        <div style={{flex:1,background:"#ff4d4d44"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        {[{label:"✓ CONFORMES",count:conf.length,wr:cWR,color:"#00ff9d",bg:"rgba(0,255,157,0.06)",bd:"rgba(0,255,157,0.15)",arr:conf},
          {label:"✗ NON-CONF.",count:nonConf.length,wr:nWR,color:"#ff4d4d",bg:"rgba(255,77,77,0.04)",bd:"rgba(255,77,77,0.15)",arr:nonConf}
        ].map(({label,count,wr,color,bg,bd,arr})=>(
          <div key={label} style={{flex:1,background:bg,border:`1px solid ${bd}`,borderRadius:8,padding:12}}>
            <div style={{fontSize:9,color,letterSpacing:1,marginBottom:8}}>{label}</div>
            <div style={{fontSize:22,fontWeight:800,color,fontFamily:MONO}}>{count}</div>
            {wr!==null&&<div style={{marginTop:8,padding:"4px 8px",background:`${color}18`,borderRadius:6}}>
              <span style={{fontSize:14,fontWeight:700,color}}>{wr}%</span>
              <span style={{fontSize:10,color:"#5a7a5a",marginLeft:6}}>win rate</span>
            </div>}
            {arr.length>0&&<div style={{marginTop:8,display:"flex",gap:2}}>
              {arr.slice(0,12).map((t,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:rc(t.result)}}/>)}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function PerformanceChart({ trades }) {
  const [mode,setMode]=useState("cumul");
  if(!trades.length) return null;
  const sorted=[...trades].reverse();
  let cum=0;
  const cumData=sorted.map((t,i)=>{cum+=parseFloat(t.pnlPct)||0;return{n:i+1,val:parseFloat(cum.toFixed(3)),result:t.result,date:t.date};});
  const wk={};
  sorted.forEach(t=>{
    const d=new Date(t.date),m=new Date(d);m.setDate(d.getDate()-d.getDay()+1);
    const k=m.toISOString().split("T")[0];
    if(!wk[k])wk[k]={k,pnl:0};
    wk[k].pnl+=parseFloat(t.pnlPct)||0;
  });
  const wkData=Object.values(wk).map(w=>({...w,pnl:parseFloat(w.pnl.toFixed(3))}));
  const TT=({active,payload})=>{
    if(!active||!payload?.length) return null;
    const d=payload[0].payload,v=d.val??d.pnl;
    return <div style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.2)",borderRadius:8,padding:"8px 12px",fontSize:11,fontFamily:MONO}}>
      <div style={{color:"#5a7a5a"}}>{d.date||d.k}</div>
      <div style={{color:v>=0?"#00ff9d":"#ff4d4d",fontWeight:700,fontSize:14}}>{fmtPct(v)}</div>
    </div>;
  };
  return (
    <div style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.1)",borderRadius:10,padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,textTransform:"uppercase"}}>Performance P&L</div>
        <div style={{display:"flex",gap:4}}>
          {[["cumul","CUMULÉ"],["week","SEMAINES"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{background:mode===m?"rgba(0,255,157,0.15)":"transparent",border:`1px solid ${mode===m?"#00ff9d":"rgba(0,255,157,0.15)"}`,color:mode===m?"#00ff9d":"#3a5a3a",borderRadius:5,padding:"4px 8px",fontSize:9,fontFamily:MONO,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        {mode==="cumul"
          ?<LineChart data={cumData} margin={{top:5,right:5,left:-20,bottom:0}}>
            <XAxis dataKey="n" tick={{fontSize:9,fill:"#3a5a3a",fontFamily:MONO}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fontSize:9,fill:"#3a5a3a",fontFamily:MONO}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`}/>
            <Tooltip content={<TT/>}/>
            <ReferenceLine y={0} stroke="rgba(0,255,157,0.15)" strokeDasharray="4 4"/>
            <Line type="monotone" dataKey="val" stroke="#00ff9d" strokeWidth={2}
              dot={({cx,cy,payload})=><circle cx={cx} cy={cy} r={4} fill={rc(payload.result)}/>}
              activeDot={{r:6,fill:"#00ff9d"}}/>
          </LineChart>
          :<BarChart data={wkData} margin={{top:5,right:5,left:-20,bottom:0}}>
            <XAxis dataKey="k" tick={{fontSize:8,fill:"#3a5a3a",fontFamily:MONO}} tickLine={false} axisLine={false} tickFormatter={v=>v.slice(5)}/>
            <YAxis tick={{fontSize:9,fill:"#3a5a3a",fontFamily:MONO}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`}/>
            <Tooltip content={<TT/>}/>
            <ReferenceLine y={0} stroke="rgba(0,255,157,0.15)" strokeDasharray="4 4"/>
            <Bar dataKey="pnl" radius={[3,3,0,0]}>
              {wkData.map((e,i)=><Cell key={i} fill={e.pnl>=0?"#00ff9d":"#ff4d4d"}/>)}
            </Bar>
          </BarChart>
        }
      </ResponsiveContainer>
    </div>
  );
}

function StreakBadge({ trades }) {
  if(trades.length<2) return null;
  let streak=1,type=trades[0].result;
  for(let i=1;i<trades.length;i++){if(trades[i].result===type)streak++;else break;}
  if(streak<2||type==="BE") return null;
  const color=type==="WIN"?"#00ff9d":"#ff4d4d";
  return (
    <div style={{background:`${color}12`,border:`1px solid ${color}35`,borderRadius:8,padding:"8px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span style={{fontSize:12,color,fontWeight:700}}>{type==="WIN"?"🔥":"⚠"} {streak} {type} de suite</span>
      {type==="LOSS"&&<span style={{fontSize:10,color:"#5a7a5a"}}>Vérifier les règles</span>}
    </div>
  );
}

function getAdvice(t, all) {
  if(all.length<3) return null;
  const cf=all.filter(x=>x.conforming),nc=all.filter(x=>!x.conforming);
  const cwr=cf.length?Math.round(cf.filter(x=>x.result==="WIN").length/cf.length*100):null;
  const nclr=nc.length?Math.round(nc.filter(x=>x.result==="LOSS").length/nc.length*100):null;
  const ncwr=nc.length?Math.round(nc.filter(x=>x.result==="WIN").length/nc.length*100):null;
  if(!t.conforming&&t.result==="LOSS"&&nclr!==null&&nc.length>=4) return{txt:`${nclr}% des non-conformes finissent en LOSS.`,c:"#ff4d4d"};
  if(!t.conforming&&t.result==="WIN"&&nc.length>=3) return{txt:`WIN non-conforme. WR NC : ${ncwr}% (${nc.length} trades).`,c:"#f0b429"};
  if(t.conforming&&t.result==="WIN"&&cwr!==null&&cf.length>=3) return{txt:`Conforme → WIN. WR conformes : ${cwr}% (${cf.length} trades).`,c:"#00ff9d"};
  if(t.conforming&&t.result==="LOSS"&&cwr!==null&&cf.length>=3) return{txt:`LOSS conforme. WR: ${cwr}% / ${cf.length} trades.`,c:"#5aaa7a"};
  if(all.slice(0,5).filter(x=>x.result==="LOSS").length>=3) return{txt:`3+ LOSS récents. Prends un moment.`,c:"#ff4d4d"};
  return null;
}

function AdviceCard({ advice, onClose }) {
  if(!advice) return null;
  return (
    <div style={{background:`${advice.c}12`,border:`1px solid ${advice.c}30`,borderRadius:10,padding:"12px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",gap:10}}>
      <div style={{fontSize:12,color:"#c8e6c8",lineHeight:1.6,fontFamily:MONO,flex:1}}>{advice.txt}</div>
      <button onClick={onClose} style={{background:"transparent",border:"none",color:"#3a5a3a",fontSize:14,cursor:"pointer",flexShrink:0}}>✕</button>
    </div>
  );
}

function NoTradeButton({ onSave, alreadyDone }) {
  const [open,setOpen]=useState(false);
  const [reason,setReason]=useState("");
  if(alreadyDone) return (
    <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
      <span style={{color:"#4a5a4a"}}>⊘</span><span style={{fontSize:11,color:"#5a5a5a",fontFamily:MONO}}>Pas de trade aujourd'hui</span>
    </div>
  );
  if(!open) return (
    <button onClick={()=>setOpen(true)} className="btn" style={{width:"100%",background:"transparent",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,color:"#5a7a5a",fontFamily:MONO,fontSize:12}}>
      <span>⊘</span><span>Pas de trade aujourd'hui</span>
    </button>
  );
  return (
    <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,marginBottom:12}}>
      <div style={{fontSize:10,color:"#5a7a5a",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>RAISON (OPTIONNEL)</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        {NTR.map(r=><button key={r} onClick={()=>setReason(reason===r?"":r)} className="btn" style={{background:reason===r?"rgba(255,255,255,0.1)":"#0d1a0d",border:`1px solid ${reason===r?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}`,color:reason===r?"#c8e6c8":"#5a7a5a",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{r}</button>)}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{onSave({id:Date.now(),date:today(),reason});setOpen(false);setReason("");}} className="btn"
          style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",color:"#c8e6c8",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>⊘ Confirmer</button>
        <button onClick={()=>{setOpen(false);setReason("");}} className="btn"
          style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"#5a7a5a",borderRadius:8,padding:"10px 12px",fontSize:12,fontFamily:MONO}}>✕</button>
      </div>
    </div>
  );
}

function SettingsView({ config, onSave, onLogout, period, onPeriodChange, user }) {
  const [items,setItems]=useState([...config.items]);
  const [threshold,setThreshold]=useState(config.threshold);
  const [stratName,setStratName]=useState(config.strategyName||"");
  const [pnlTarget,setPnlTarget]=useState(config.pnlTarget||"");
  const [savedOk,setSavedOk]=useState(false);
  const save=()=>{onSave({items,threshold,strategyName:stratName,pnlTarget:pnlTarget===""?"":parseFloat(pnlTarget)||""});setSavedOk(true);setTimeout(()=>setSavedOk(false),2000);};
  return (
    <div className="fi" style={{padding:20}}>
      {user&&<div style={{fontSize:10,color:"#3a5a3a",marginBottom:16,padding:"10px 12px",background:"rgba(0,255,157,0.04)",borderRadius:8,fontFamily:MONO}}>
        ◈ <span style={{color:"#00ff9d"}}>{user.username}</span> · {user.email}
      </div>}
      <div style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.08)",borderRadius:10,padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:10}}>PÉRIODE D'ANALYSE</div>
        <div style={{display:"flex",gap:6}}>
          {[["all","Tout"],["month","Mois"],["week","Semaine"],["day","Jour"]].map(([v,l])=>(
            <button key={v} onClick={()=>onPeriodChange(v)} className="btn"
              style={{flex:1,padding:"8px 0",borderRadius:7,fontSize:11,fontWeight:700,fontFamily:MONO,background:period===v?"rgba(0,255,157,0.15)":"#0d1a0d",border:`1px solid ${period===v?"#00ff9d":"rgba(0,255,157,0.15)"}`,color:period===v?"#00ff9d":"#3a5a3a"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.08)",borderRadius:10,padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:4}}>OBJECTIF P&L %</div>
        <div style={{fontSize:10,color:"#2a4a2a",marginBottom:10}}>Objectif de performance cumulée (optionnel)</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <input type="number" step="0.5" value={pnlTarget} onChange={e=>setPnlTarget(e.target.value)} placeholder="Ex: 5"
            style={{...inputSt,marginBottom:0,flex:1,color:parseFloat(pnlTarget)>0?"#00ff9d":parseFloat(pnlTarget)<0?"#ff4d4d":"#c8e6c8"}}/>
          <span style={{fontSize:13,color:"#3a5a3a",fontFamily:MONO}}>%</span>
          {pnlTarget!==""&&<button onClick={()=>setPnlTarget("")} style={{background:"transparent",border:"none",color:"#3a5a3a",fontSize:14,cursor:"pointer"}}>✕</button>}
        </div>
      </div>
      <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:8}}>NOM DE LA STRATÉGIE</div>
      <input value={stratName} onChange={e=>setStratName(e.target.value)} style={inputSt}/>
      <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:8}}>SEUIL DE CONFORMITÉ</div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[4,5,6,7,8].map(n=>(
          <button key={n} onClick={()=>setThreshold(n)} className="btn"
            style={{flex:1,padding:8,borderRadius:8,fontSize:13,fontWeight:700,fontFamily:MONO,background:threshold===n?"rgba(0,255,157,0.2)":"#080f08",border:`1px solid ${threshold===n?"#00ff9d":"rgba(0,255,157,0.15)"}`,color:threshold===n?"#00ff9d":"#3a5a3a"}}>{n}</button>
        ))}
      </div>
      <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:10}}>CRITÈRES ({items.length})</div>
      {items.map((item,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={item} onChange={e=>{const n=[...items];n[i]=e.target.value;setItems(n);}} style={{...inputSt,marginBottom:0,flex:1}}/>
          <button onClick={()=>setItems(items.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      ))}
      <button onClick={()=>setItems([...items,""])} style={{width:"100%",background:"transparent",border:"1px dashed rgba(0,255,157,0.2)",color:"#3a5a3a",borderRadius:8,padding:10,fontSize:12,cursor:"pointer",fontFamily:MONO,marginBottom:20}}>+ Ajouter un critère</button>
      <button onClick={save} className="btn" style={{width:"100%",background:"rgba(0,255,157,0.15)",border:"1px solid #00ff9d",color:"#00ff9d",borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO,marginBottom:10}}>
        {savedOk?"✓ Enregistré !":"✓ ENREGISTRER"}
      </button>
      <button onClick={onLogout} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.15)",color:"#5a2a2a",borderRadius:10,padding:12,fontSize:12,fontFamily:MONO}}>Se déconnecter</button>
    </div>
  );
}

function ExportModal({ trades, onClose }) {
  const dl=(c,n,t)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([c],{type:t}));a.download=n;a.click();};
  const pnl=trades.reduce((s,t)=>s+(parseFloat(t.pnlPct)||0),0);
  const wins=trades.filter(t=>t.result==="WIN").length;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="slide-up" style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.2)",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:"#00ff9d",fontFamily:MONO}}>EXPORTER</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#5a7a5a",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          <Stat label="Trades" value={trades.length} color="#38bdf8"/>
          <Stat label="Win Rate" value={trades.length?Math.round(wins/trades.length*100)+"%":"—"} color={trades.length&&wins/trades.length>=0.5?"#00ff9d":"#ff4d4d"}/>
          <Stat label="P&L" value={fmtPct(pnl)} color={pnl>=0?"#00ff9d":"#ff4d4d"}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{const h=["Date","Asset","Dir","Résultat","P&L%","Score","Conforme","Notes"];const rows=trades.map(t=>[t.date,t.asset,t.direction,t.result,t.pnlPct,t.setupScore,t.conforming?"Oui":"Non",`"${(t.notes||"").replace(/"/g,"'")}"`]);dl([h,...rows].map(r=>r.join(",")).join("\n"),`tmt-${today()}.csv`,"text/csv");}} className="btn"
            style={{flex:1,background:"rgba(0,255,157,0.12)",border:"1px solid #00ff9d",color:"#00ff9d",borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>
            ↓ CSV<br/><span style={{fontSize:9,opacity:0.6}}>Excel / Sheets</span>
          </button>
          <button onClick={()=>dl(JSON.stringify(trades,null,2),`tmt-${today()}.json`,"application/json")} className="btn"
            style={{flex:1,background:"rgba(56,189,248,0.1)",border:"1px solid #38bdf8",color:"#38bdf8",borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>
            ↓ JSON<br/><span style={{fontSize:9,opacity:0.6}}>Backup complet</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [phase,setPhase]=useState("loading");
  const [user,setUser]=useState(null);
  const [trades,setTrades]=useState([]);
  const [noTrades,setNoTrades]=useState([]);
  const [lastAdvice,setLastAdvice]=useState(null);
  const [showNoTrades,setShowNoTrades]=useState(true);
  const [period,setPeriod]=useState("all");
  const [config,setConfig]=useState({items:DEFAULT_CRITERIA,threshold:6,strategyName:"Ma Stratégie",defaultAsset:"XAU/USD",pnlTarget:""});
  const [view,setView]=useState("dashboard");
  const [form,setForm]=useState(emptyForm());
  const [editingId,setEditingId]=useState(null);
  const [showExport,setShowExport]=useState(false);
  const [saved,setSaved]=useState(false);
  const [historyFilter,setHistoryFilter]=useState("ALL");
  const [historyAsset,setHistoryAsset]=useState("ALL");
  const [confirmDeleteId,setConfirmDeleteId]=useState(null);
  const [detailTrade,setDetailTrade]=useState(null);
  const fileRef=useRef();

  const getToken=useCallback(async u=>{
    const s=lsGet("tmt:session")||u;
    if(!s?.refreshToken) return s?.token||null;
    if(Date.now()<(s.expiresAt||0)-60000) return s.token;
    try{const r=await fbRefresh(s.refreshToken);if(r.id_token){const up={...s,token:r.id_token,expiresAt:Date.now()+3600000};lsSet("tmt:session",up);setUser(up);return r.id_token;}}catch{}
    return s?.token||null;
  },[]);

  const loadUserData=useCallback(async u=>{
    const cached=lsGet(`tmt:data:${u.id}`);
    if(cached){if(cached.trades)setTrades(cached.trades);if(cached.config)setConfig(c=>({...c,...cached.config}));if(cached.noTrades)setNoTrades(cached.noTrades);}
    try{
      const tok=await getToken(u);if(!tok)return;
      const data=await fsRead(u.id,tok);
      if(data){if(data.trades)setTrades(data.trades);if(data.config)setConfig(c=>({...c,...data.config}));if(data.noTrades)setNoTrades(data.noTrades);lsSet(`tmt:data:${u.id}`,data);}
    }catch{}
  },[getToken]);

  useEffect(()=>{
    (async()=>{
      try{
        const ob=lsGet("tmt:onboarded");if(!ob){setPhase("onboarding");return;}
        const session=lsGet("tmt:session");
        if(session){await loadUserData(session);setUser(session);setPhase("app");return;}
        setPhase("auth");
      }catch{setPhase("onboarding");}
    })();
  },[]);

  const persist=useCallback(async(nt,nc,nnt)=>{
    if(!user)return;
    const cur=lsGet(`tmt:data:${user.id}`)||{};
    const updated={trades:nt!==undefined?nt:(cur.trades||trades),config:nc!==undefined?nc:(cur.config||config),noTrades:nnt!==undefined?nnt:(cur.noTrades||noTrades)};
    lsSet(`tmt:data:${user.id}`,updated);
    try{const tok=await getToken(user);if(tok)await fsWrite(user.id,tok,updated);}catch{}
  },[user,trades,config,noTrades,getToken]);

  const onOnboarding=()=>{lsSet("tmt:onboarded","1");setPhase("setup");};
  const onSetup=cfg=>{const nc={...config,...cfg};setConfig(nc);setForm(emptyForm(cfg.defaultAsset));setPhase("auth");};
  const onAuth=async u=>{setUser(u);lsSet("tmt:session",u);await loadUserData(u);setPhase("app");};
  const logout=()=>{lsDel("tmt:session");setUser(null);setTrades([]);setNoTrades([]);setConfig({items:DEFAULT_CRITERIA,threshold:6,strategyName:"Ma Stratégie",defaultAsset:"XAU/USD",pnlTarget:""});setPhase("auth");};

  const handleScreenshot=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>setForm(f=>({...f,screenshot:ev.target.result}));
    reader.readAsDataURL(file);
  };

  const getPnl=()=>form.pnlManual!==""?form.pnlManual:form.pnlPreset;

  const saveTrade=async()=>{
    const score=form.checklist.length,pnl=getPnl();
    let updated,updatedTrade=null;
    if(editingId!==null){updated=trades.map(x=>x.id===editingId?{...x,...form,pnlPct:pnl,setupScore:score,conforming:score>=config.threshold,checklistMax:config.items.length}:x);}
    else{const trade={...form,pnlPct:pnl,id:Date.now(),setupScore:score,conforming:score>=config.threshold,checklistMax:config.items.length};updatedTrade=trade;updated=[trade,...trades];}
    setTrades(updated);await persist(updated);
    setForm(emptyForm(config.defaultAsset||"XAU/USD"));setEditingId(null);
    if(editingId===null){const adv=getAdvice(updatedTrade,updated);if(adv)setLastAdvice(adv);}
    setSaved(true);setTimeout(()=>setSaved(false),2000);
    setView(editingId!==null?"history":"dashboard");
  };

  const startEdit=x=>{
    setForm({date:x.date,asset:x.asset,direction:x.direction,checklist:[...x.checklist],result:x.result,
      pnlPreset:PNL_PRESETS.includes(x.pnlPct)?x.pnlPct:"",pnlManual:PNL_PRESETS.includes(x.pnlPct)?"":x.pnlPct,
      notes:x.notes||"",rejetScore:x.rejetScore||0,time:x.time||"",screenshot:x.screenshot||""});
    setEditingId(x.id);setView("log");
  };
  const cancelEdit=()=>{setForm(emptyForm(config.defaultAsset||"XAU/USD"));setEditingId(null);setView("history");};
  const deleteTrade=async id=>{const u=trades.filter(x=>x.id!==id);setTrades(u);await persist(u);setConfirmDeleteId(null);};
  const saveNoTrade=async e=>{const u=[e,...noTrades];setNoTrades(u);await persist(undefined,undefined,u);};
  const deleteNoTrade=async id=>{const u=noTrades.filter(x=>x.id!==id);setNoTrades(u);await persist(undefined,undefined,u);};
  const saveConfig=async cfg=>{const nc={...config,...cfg};setConfig(nc);await persist(undefined,nc);};

  const now2=new Date();
  const pStart=period==="all"?null:period==="day"?new Date(now2.getFullYear(),now2.getMonth(),now2.getDate()):period==="week"?new Date(now2.getTime()-7*86400000):period==="month"?new Date(now2.getFullYear(),now2.getMonth(),1):null;
  const pf=pStart?trades.filter(x=>new Date(x.date)>=pStart):trades;
  const total=pf.length,wins=pf.filter(x=>x.result==="WIN").length,losses=pf.filter(x=>x.result==="LOSS").length;
  const winRate=total?Math.round(wins/total*100):0;
  const totalPnl=pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const usedAssets=[...new Set(trades.map(x=>x.asset))];
  const histFiltered=trades.filter(x=>(historyFilter==="ALL"||x.result===historyFilter)&&(historyAsset==="ALL"||x.asset===historyAsset));
  const mergedHistory=[...histFiltered.map(x=>({...x,_type:"trade"})),...(showNoTrades?noTrades.map(x=>({...x,_type:"notrade"})):[])].sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id);
  const pnlVal=getPnl();
  const pnlIncoherent=pnlVal!==""&&((form.result==="WIN"&&parseFloat(pnlVal)<0)||(form.result==="LOSS"&&parseFloat(pnlVal)>0));
  const editingTrade=editingId!==null?trades.find(x=>x.id===editingId):null;
  const pnlProgress=config.pnlTarget&&config.pnlTarget!==""?Math.min(100,Math.max(0,Math.round((totalPnl/parseFloat(config.pnlTarget))*100))):null;

  if(phase==="loading") return <div style={{background:"#080f08",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><CSS/><Logo size="md"/></div>;
  if(phase==="onboarding") return <><CSS/><Onboarding onDone={onOnboarding}/></>;
  if(phase==="setup") return <><CSS/><GuidedSetup onDone={onSetup}/></>;
  if(phase==="auth") return <AuthScreen onAuth={onAuth}/>;

  return (
    <div className="grid-bg" style={{background:"#080f08",minHeight:"100vh",color:"#c8e6c8",fontFamily:MONO,maxWidth:480,margin:"0 auto",paddingBottom:80}}>
      <CSS/>

      {/* HEADER */}
      <div style={{padding:"16px 20px 10px",borderBottom:"1px solid rgba(0,255,157,0.1)",background:"rgba(8,15,8,0.7)",backdropFilter:"blur(8px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <Logo size="sm"/>
            <div style={{fontSize:10,color:"#3a5a3a",marginTop:4}}>{config.strategyName}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {total>0&&<div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:winRate>=50?"#00ff9d":"#ff4d4d",fontWeight:700,fontFamily:MONO}}>{winRate}% WR</div>
              <div style={{fontSize:11,color:totalPnl>=0?"#00ff9d":"#ff4d4d",fontFamily:MONO}}>{fmtPct(totalPnl)}</div>
            </div>}
            <button onClick={()=>setShowExport(true)} className="btn" style={{background:"rgba(0,255,157,0.06)",border:"1px solid rgba(0,255,157,0.15)",borderRadius:8,padding:"7px 11px",color:"#5a7a5a",fontSize:13}}>↓</button>
          </div>
        </div>
        {pnlProgress!==null&&(
          <div style={{marginTop:6,height:2,background:"#1e2a1e",borderRadius:2,overflow:"hidden"}}>
            <div style={{width:`${pnlProgress}%`,height:"100%",background:totalPnl>=parseFloat(config.pnlTarget)?"#00ff9d":"#00ff9d55",borderRadius:2,transition:"width 0.5s"}}/>
          </div>
        )}
      </div>

      {/* NAV */}
      <div style={{display:"flex",gap:6,padding:"10px 20px",borderBottom:"1px solid rgba(0,255,157,0.08)"}}>
        {[["dashboard","STATS"],["log",editingId?"✏ ÉDITION":"+ TRADE"],["history","HISTORIQUE"],["settings","⚙"]].map(([v,l])=>(
          <button key={v} className="btn" onClick={()=>{if(editingId&&v!=="log")cancelEdit();else setView(v);}}
            style={{background:view===v?(editingId&&v==="log"?"rgba(240,180,41,0.15)":"rgba(0,255,157,0.12)"):"transparent",border:`1px solid ${view===v?(editingId&&v==="log"?"#f0b429":"#00ff9d"):"rgba(0,255,157,0.15)"}`,color:view===v?(editingId&&v==="log"?"#f0b429":"#00ff9d"):"#3a5a3a",borderRadius:6,padding:v==="settings"?"7px 12px":"7px 0",fontSize:11,fontWeight:700,letterSpacing:1,fontFamily:MONO,flex:v==="settings"?0:1}}>{l}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {view==="dashboard"&&(
        <div className="fi" style={{padding:20}}>
          <StreakBadge trades={pf}/>
          <AdviceCard advice={lastAdvice} onClose={()=>setLastAdvice(null)}/>
          {trades.length>0&&(
            <div className="row" onClick={()=>setDetailTrade(trades[0])}
              style={{background:"rgba(0,255,157,0.03)",border:`1px solid ${rc(trades[0].result)}35`,borderRadius:10,padding:14,marginBottom:12,borderLeft:`3px solid ${rc(trades[0].result)}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Dernier trade · {trades[0].date}{trades[0].time?" · "+trades[0].time:""}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#c8e6c8"}}>{trades[0].asset} · {trades[0].direction}</div>
                  <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:rc(trades[0].result)}}>{trades[0].result}</span>
                    {trades[0].pnlPct!==""&&parseFloat(trades[0].pnlPct)!==0&&<span style={{fontSize:12,color:parseFloat(trades[0].pnlPct)>0?"#00ff9d":"#ff4d4d",fontWeight:600}}>{fmtPct(parseFloat(trades[0].pnlPct))}</span>}
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:trades[0].conforming?"rgba(0,255,157,0.1)":"rgba(255,77,77,0.1)",color:trades[0].conforming?"#00ff9d":"#ff4d4d",border:`1px solid ${trades[0].conforming?"rgba(0,255,157,0.2)":"rgba(255,77,77,0.2)"}`}}>
                      {trades[0].conforming?"✓ conforme":"✗ non-conforme"}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,marginLeft:10}}>
                  <ScoreRing score={trades[0].setupScore} max={trades[0].checklistMax||config.items.length} size={42} threshold={config.threshold}/>
                  <button onClick={e=>{e.stopPropagation();startEdit(trades[0]);}} className="btn" style={{background:"rgba(0,255,157,0.06)",border:"1px solid rgba(0,255,157,0.15)",color:"#5aaa7a",borderRadius:6,padding:"3px 8px",fontSize:10,fontFamily:MONO}}>✏</button>
                </div>
              </div>
            </div>
          )}
          <NoTradeButton onSave={saveNoTrade} alreadyDone={noTrades.some(x=>x.date===today())}/>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <Stat label="Win Rate" value={`${winRate}%`} sub={`${wins}W · ${losses}L · ${total-wins-losses}BE`} color={winRate>=50?"#00ff9d":"#ff4d4d"}/>
            <Stat label="P&L Total" value={fmtPct(totalPnl)} sub={`${total} trades`} color={totalPnl>=0?"#00ff9d":"#ff4d4d"}/>
          </div>
          {total>0&&<><ConformityBar trades={pf} threshold={config.threshold} maxItems={config.items.length}/><PerformanceChart trades={pf}/></>}
          {total===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",color:"#2a3a2a"}}>
              <div style={{display:"inline-block",marginBottom:20}}><Logo size="lg"/></div>
              <div style={{fontSize:13,color:"#3a5a3a",marginBottom:8,fontWeight:700}}>Journal vide</div>
              <div style={{fontSize:11,color:"#2a3a2a",marginBottom:24,lineHeight:1.6}}>Saisis ton premier trade pour commencer à mesurer ta performance.</div>
              <button onClick={()=>setView("log")} className="btn" style={{background:"rgba(0,255,157,0.12)",border:"1px solid #00ff9d",color:"#00ff9d",borderRadius:10,padding:"12px 28px",fontSize:12,fontFamily:MONO,fontWeight:700}}>+ Saisir un trade</button>
            </div>
          )}
        </div>
      )}

      {/* LOG */}
      {view==="log"&&(
        <div className="fi" style={{padding:20}}>
          {editingId!==null&&editingTrade&&(
            <div style={{background:"rgba(240,180,41,0.08)",border:"1px solid rgba(240,180,41,0.3)",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:11,color:"#f0b429",fontWeight:700,marginBottom:2}}>✏ Modification du trade</div><div style={{fontSize:10,color:"#5a7a5a"}}>{editingTrade.asset} · {editingTrade.date}</div></div>
              <button onClick={cancelEdit} className="btn" style={{background:"transparent",border:"1px solid rgba(240,180,41,0.4)",color:"#f0b429",borderRadius:6,padding:"5px 10px",fontSize:10,fontFamily:MONO,fontWeight:700}}>ANNULER</button>
            </div>
          )}
          {editingId===null&&<div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:16,textTransform:"uppercase"}}>Nouveau trade</div>}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:8}}>
              <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{...inputSt,marginBottom:0,flex:2}}/>
              <input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{...inputSt,marginBottom:0,flex:1,color:form.time?"#c8e6c8":"#3a5a3a"}}/>
            </div>
            <div style={{fontSize:9,color:"#2a4a2a",marginTop:5}}>⏱ Heure d'entrée (optionnel)</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})} style={{flex:2,background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.2)",borderRadius:8,color:"#c8e6c8",padding:"12px",fontSize:12,fontFamily:MONO,outline:"none"}}>
              {ALL_ASSETS.map(a=><option key={a}>{a}</option>)}
            </select>
            {["BUY","SELL"].map(d=>(
              <button key={d} onClick={()=>setForm({...form,direction:d})} className="btn"
                style={{flex:1,padding:10,background:form.direction===d?(d==="BUY"?"rgba(0,255,157,0.2)":"rgba(255,77,77,0.2)"):"#0d1a0d",border:`1px solid ${form.direction===d?(d==="BUY"?"#00ff9d":"#ff4d4d"):"rgba(0,255,157,0.2)"}`,color:form.direction===d?(d==="BUY"?"#00ff9d":"#ff4d4d"):"#3a5a3a",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO}}>{d}</button>
            ))}
          </div>
          <div style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.15)",borderRadius:10,padding:14,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2}}>CHECKLIST SETUP</div>
                <div style={{fontSize:10,marginTop:4,color:form.checklist.length>=config.threshold?"#00ff9d":"#ff4d4d"}}>
                  {form.checklist.length>=config.threshold?"✓ Conforme":`⚠ ${config.threshold-form.checklist.length} critère(s) manquant(s)`}
                </div>
              </div>
              <ScoreRing score={form.checklist.length} max={config.items.length} threshold={config.threshold}/>
            </div>
            {config.items.map((item,i)=>(
              <label key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(0,255,157,0.05)",cursor:"pointer"}}>
                <input type="checkbox" checked={form.checklist.includes(i)} onChange={e=>setForm({...form,checklist:e.target.checked?[...form.checklist,i]:form.checklist.filter(x=>x!==i)})}/>
                <span style={{fontSize:12,color:form.checklist.includes(i)?"#c8e6c8":"#3a5a3a"}}>{item}</span>
              </label>
            ))}
          </div>
          <div style={{background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.12)",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2}}>QUALITÉ DU REJET <span style={{color:"#2a4a2a"}}>(optionnel)</span></div>
              {form.rejetScore>0&&<span style={{fontSize:15,fontWeight:800,color:form.rejetScore>=8?"#00ff9d":form.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:MONO}}>{form.rejetScore}/10</span>}
            </div>
            <div style={{display:"flex",gap:3}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} onClick={()=>setForm({...form,rejetScore:form.rejetScore===n?0:n})} className="btn"
                  style={{flex:1,padding:"6px 0",borderRadius:5,fontSize:11,fontWeight:700,fontFamily:MONO,background:form.rejetScore>=n?(n>=8?"rgba(0,255,157,0.2)":n>=5?"rgba(240,180,41,0.2)":"rgba(255,77,77,0.2)"):"#0d1a0d",border:`1px solid ${form.rejetScore>=n?(n>=8?"#00ff9d":n>=5?"#f0b429":"#ff4d4d"):"rgba(0,255,157,0.08)"}`,color:form.rejetScore>=n?(n>=8?"#00ff9d":n>=5?"#f0b429":"#ff4d4d"):"#2a3a2a"}}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {["WIN","LOSS","BE"].map(r=>(
              <button key={r} onClick={()=>setForm({...form,result:r})} className="btn"
                style={{flex:1,background:form.result===r?`${rc(r)}22`:"#0d1a0d",border:`1px solid ${form.result===r?rc(r):"rgba(0,255,157,0.15)"}`,color:form.result===r?rc(r):"#3a5a3a",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>{r}</button>
            ))}
          </div>
          {/* P&L presets + manuel même ligne */}
          <div style={{marginBottom:pnlIncoherent?4:10}}>
            <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,marginBottom:8}}>P&L %</div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {PNL_PRESETS.map(v=>(
                <button key={v} onClick={()=>setForm({...form,pnlPreset:v,pnlManual:""})} className="btn"
                  style={{padding:"8px 0",borderRadius:6,fontSize:11,fontWeight:700,fontFamily:MONO,flex:1,
                    background:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?"rgba(0,255,157,0.2)":parseFloat(v)<0?"rgba(255,77,77,0.2)":"rgba(240,180,41,0.2)"):"#0d1a0d",
                    border:`1px solid ${form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?"#00ff9d":parseFloat(v)<0?"#ff4d4d":"#f0b429"):"rgba(0,255,157,0.1)"}`,
                    color:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?"#00ff9d":parseFloat(v)<0?"#ff4d4d":"#f0b429"):"#3a5a3a"}}>{v}%</button>
              ))}
              <input type="number" step="0.1" placeholder="…" value={form.pnlManual}
                onChange={e=>setForm({...form,pnlManual:e.target.value,pnlPreset:""})}
                style={{width:52,background:form.pnlManual?"#0d2a0d":"#0d1a0d",border:`1px solid ${form.pnlManual?"rgba(0,255,157,0.4)":"rgba(0,255,157,0.1)"}`,borderRadius:6,color:form.pnlManual?(parseFloat(form.pnlManual)>=0?"#00ff9d":"#ff4d4d"):"#3a5a3a",padding:"8px 4px",fontSize:10,fontFamily:MONO,outline:"none",textAlign:"center",flexShrink:0}}/>
            </div>
            {pnlVal!==""&&<div style={{fontSize:11,color:parseFloat(pnlVal)>=0?"#00ff9d":"#ff4d4d",fontFamily:MONO,fontWeight:700,marginTop:5,textAlign:"right"}}>{fmtPct(parseFloat(pnlVal))}</div>}
          </div>
          {pnlIncoherent&&<div style={{fontSize:10,color:"#f0b429",background:"rgba(240,180,41,0.08)",border:"1px solid rgba(240,180,41,0.2)",borderRadius:6,padding:"6px 10px",marginBottom:10}}>⚠ P&L incohérent avec {form.result}</div>}
          <textarea placeholder="Notes comportementales, erreurs, observations..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3}
            style={{width:"100%",background:"#0d1a0d",border:"1px solid rgba(0,255,157,0.15)",borderRadius:8,color:"#c8e6c8",padding:"12px",fontSize:12,fontFamily:MONO,resize:"none",marginBottom:10,outline:"none"}}/>
          <div style={{marginBottom:16}}>
            <input type="file" ref={fileRef} accept="image/*" onChange={handleScreenshot}/>
            <button onClick={()=>fileRef.current&&fileRef.current.click()}
              style={{width:"100%",display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"8px 12px",borderRadius:8,border:"1px dashed rgba(0,255,157,0.15)",color:form.screenshot?"#00ff9d":"#3a5a3a",fontSize:11,fontFamily:MONO,background:"transparent"}}>
              📎 {form.screenshot?"Capture ajoutée ✓":"Ajouter une capture (optionnel)"}
            </button>
            {form.screenshot&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
              <img src={form.screenshot} alt="" style={{height:40,borderRadius:4,border:"1px solid rgba(0,255,157,0.15)"}}/>
              <button onClick={()=>setForm({...form,screenshot:""})} style={{background:"transparent",border:"none",color:"#ff4d4d",fontSize:12,cursor:"pointer",fontFamily:MONO}}>✕ Supprimer</button>
            </div>}
          </div>
          <button onClick={saveTrade} className="btn"
            style={{width:"100%",background:editingId!==null?"rgba(240,180,41,0.18)":(form.checklist.length>=config.threshold?"rgba(0,255,157,0.18)":"rgba(255,77,77,0.1)"),border:`1px solid ${editingId!==null?"#f0b429":(form.checklist.length>=config.threshold?"#00ff9d":"#ff4d4d")}`,color:editingId!==null?"#f0b429":(form.checklist.length>=config.threshold?"#00ff9d":"#ff4d4d"),borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO}}>
            {editingId!==null?"✓ METTRE À JOUR":form.checklist.length>=config.threshold?"✓ ENREGISTRER — Conforme":`⚠ ENREGISTRER — ${form.checklist.length}/${config.items.length} — Non-conforme`}
          </button>
          {saved&&<div style={{textAlign:"center",marginTop:10,color:"#00ff9d",fontSize:12}}>✓ {editingId!==null?"Trade modifié":"Trade enregistré"}</div>}
        </div>
      )}

      {/* HISTORIQUE */}
      {view==="history"&&(
        <div className="fi" style={{padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:9,color:"#3a5a3a",letterSpacing:2,textTransform:"uppercase"}}>Historique · {trades.length} trades</div>
            {noTrades.length>0&&<button onClick={()=>setShowNoTrades(v=>!v)} className="btn" style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#5a7a5a",borderRadius:6,padding:"4px 10px",fontSize:10,fontFamily:MONO}}>{showNoTrades?"⊘ Masquer":"⊘ Afficher"}</button>}
          </div>
          {trades.length>0&&<>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["ALL","Tous"],["WIN","WIN"],["LOSS","LOSS"],["BE","BE"]].map(([v,l])=>(
                <button key={v} className="btn" onClick={()=>setHistoryFilter(v)}
                  style={{flex:1,background:historyFilter===v?(v==="ALL"?"rgba(0,255,157,0.15)":`${rc(v)}22`):"transparent",border:`1px solid ${historyFilter===v?(v==="ALL"?"#00ff9d":rc(v)):"rgba(0,255,157,0.15)"}`,color:historyFilter===v?(v==="ALL"?"#00ff9d":rc(v)):"#3a5a3a",borderRadius:6,padding:"6px 0",fontSize:11,fontWeight:700,fontFamily:MONO}}>{l}</button>
              ))}
            </div>
            {usedAssets.length>1&&<div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
              {["ALL",...usedAssets].map(a=>(
                <button key={a} className="btn" onClick={()=>setHistoryAsset(a)}
                  style={{background:historyAsset===a?"rgba(0,255,157,0.12)":"transparent",border:`1px solid ${historyAsset===a?"rgba(0,255,157,0.4)":"rgba(0,255,157,0.1)"}`,color:historyAsset===a?"#00ff9d":"#3a5a3a",borderRadius:5,padding:"4px 8px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap"}}>{a}</button>
              ))}
            </div>}
          </>}
          {trades.length===0&&<div style={{textAlign:"center",padding:40,color:"#2a3a2a",fontSize:12}}>Aucun trade enregistré.</div>}
          {mergedHistory.map(x=>x._type==="notrade"?(
            <div key={x.id} style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:16,color:"#4a5a4a"}}>⊘</span>
                <div><div style={{fontSize:12,color:"#5a7a5a",fontFamily:MONO,fontWeight:700}}>Pas de trade</div><div style={{fontSize:10,color:"#3a4a3a",marginTop:2}}>{x.date}{x.reason?" · "+x.reason:""}</div></div>
              </div>
              <button onClick={()=>deleteNoTrade(x.id)} style={{background:"transparent",border:"none",color:"#2a3a2a",fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
          ):(
            <div key={x.id} className="row" onClick={()=>setDetailTrade(x)}
              style={{background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.08)",borderRadius:10,padding:14,marginBottom:10,borderLeft:`3px solid ${rc(x.result)}`}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#c8e6c8"}}>{x.asset} · {x.direction}</div>
                  <div style={{fontSize:10,color:"#3a5a3a",marginTop:3}}>{x.date}{x.time?" · "+x.time:""}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <ScoreRing score={x.setupScore} max={x.checklistMax||config.items.length} size={42} threshold={config.threshold}/>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:700,color:rc(x.result)}}>{x.result}</div>
                    {x.pnlPct!==""&&<div style={{fontSize:11,color:parseFloat(x.pnlPct)>=0?"#00ff9d":"#ff4d4d",fontWeight:600}}>{fmtPct(parseFloat(x.pnlPct))}</div>}
                  </div>
                </div>
              </div>
              <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:x.conforming?"rgba(0,255,157,0.1)":"rgba(255,77,77,0.1)",color:x.conforming?"#00ff9d":"#ff4d4d",border:`1px solid ${x.conforming?"rgba(0,255,157,0.2)":"rgba(255,77,77,0.2)"}`}}>
                  {x.conforming?"✓ conforme":"✗ non-conforme"}
                </span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {x.screenshot&&<span style={{fontSize:9,color:"#3a5a3a"}}>📎</span>}
                  {x.rejetScore>0&&<span style={{fontSize:10,color:"#3a5a3a"}}>rejet <b style={{color:x.rejetScore>=8?"#00ff9d":x.rejetScore>=5?"#f0b429":"#ff4d4d"}}>{x.rejetScore}/10</b></span>}
                </div>
              </div>
              {x.notes&&<div style={{fontSize:11,color:"#5a7a5a",marginTop:6,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{x.notes}"</div>}
              <div style={{marginTop:10,display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>
                {confirmDeleteId===x.id?(
                  <><span style={{fontSize:10,color:"#5a7a5a"}}>Supprimer ?</span>
                    <button onClick={()=>deleteTrade(x.id)} className="btn" style={{background:"rgba(255,77,77,0.18)",border:"1px solid #ff4d4d",color:"#ff4d4d",borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO,fontWeight:700}}>Confirmer</button>
                    <button onClick={()=>setConfirmDeleteId(null)} className="btn" style={{background:"transparent",border:"1px solid rgba(0,255,157,0.15)",color:"#5a7a5a",borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO}}>Annuler</button></>
                ):(
                  <><button onClick={e=>{e.stopPropagation();startEdit(x);}} className="btn" style={{background:"rgba(0,255,157,0.06)",border:"1px solid rgba(0,255,157,0.2)",color:"#5aaa7a",borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO,fontWeight:700}}>✏ MODIFIER</button>
                    <button onClick={()=>setConfirmDeleteId(x.id)} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.15)",color:"#5a2a2a",borderRadius:6,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:MONO}}>supprimer</button></>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS */}
      {view==="settings"&&<SettingsView config={config} onSave={saveConfig} onLogout={logout} period={period} onPeriodChange={setPeriod} user={user}/>}

      {/* FOOTER */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(8,15,8,0.95)",backdropFilter:"blur(10px)",borderTop:"1px solid rgba(0,255,157,0.1)",padding:"10px 20px",display:"flex",justifyContent:"space-between"}}>
        <div style={{fontSize:9,color:"#1e3a1e"}}>◈ TrackMyTrade</div>
        <div style={{fontSize:9,color:"#1e3a1e"}}>{config.strategyName}</div>
      </div>

      {detailTrade&&<TradeDetailModal trade={detailTrade} config={config} onClose={()=>setDetailTrade(null)} onEdit={startEdit}/>}
      {showExport&&<ExportModal trades={trades} onClose={()=>setShowExport(false)}/>}
    </div>
  );
}