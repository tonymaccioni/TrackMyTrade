import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA6SLYL7Ep451nu6edynUeBbPROtgRucv8",
  authDomain: "trackmytrade-389b0.firebaseapp.com",
  projectId: "trackmytrade-389b0",
  storageBucket: "trackmytrade-389b0.firebasestorage.app",
  messagingSenderId: "704401956727",
  appId: "1:704401956727:web:0d08bffe7f55ef92a58b72"
};
let db=null;
let auth=null;
try {
  const fbApp = initializeApp(firebaseConfig);
  db = getFirestore(fbApp);
  auth = getAuth(fbApp);
} catch(e) { console.error("Firebase init error:",e); }

// Simple Firestore auth — no Firebase Auth SDK needed
const encEmail = e => e.replace(/\./g,"_DOT_").replace(/@/g,"_AT_");
// File d'attente locale anti-perte : si une écriture Firestore échoue, on stocke le payload et on réessaie.
const PENDING_KEY = "ttm_pending_writes";
const getPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY)||"[]"); } catch(e){ return []; } };
const setPending = (arr) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr)); } catch(e){} };
// Empile une écriture en attente (fusionne par id pour ne garder que le dernier état)
const queuePending = (id, data) => {
  const key = id || "__PENDING_UID__"; // si pas d'UID, on garde pour réattribuer au prochain login
  const arr = getPending().filter(p => p.id !== key);
  // fusionne avec un éventuel payload déjà en attente pour cette clé
  const prev = getPending().find(p => p.id === key);
  const merged = prev ? { ...prev.data, ...data } : data;
  arr.push({ id: key, data: merged, ts: Date.now() });
  setPending(arr);
};
// Tente d'écrire ; renvoie true si succès, false sinon. En cas d'échec, met en file d'attente.
const saveUserData = async (id, data) => {
  if(!db) return false;
  if(!id) { queuePending(null, data); return false; } // pas d'UID encore : on garde pour plus tard
  try {
    await setDoc(doc(db,"users",id), data, {merge:true});
    return true;
  } catch(e) {
    console.error("Firestore save failed, queued:", e);
    queuePending(id, data);
    return false;
  }
};
// Rejoue les écritures en attente (appelé après login / retour réseau).
const flushPending = async (realUid) => {
  if(!db) return;
  const arr = getPending();
  if(!arr.length) return;
  const remaining = [];
  for(const p of arr){
    // Réattribue les payloads sans UID à l'UID réel maintenant connu
    const targetId = (p.id === "__PENDING_UID__") ? realUid : p.id;
    if(!targetId){ remaining.push(p); continue; }
    try { await setDoc(doc(db,"users",targetId), p.data, {merge:true}); }
    catch(e){ remaining.push(p); }
  }
  setPending(remaining);
};
const loadUserData = async id => { if(!db)return null; try { const s=await getDoc(doc(db,"users",id)); return s.exists()?s.data():null; } catch(e) { return null; } };
const authLogin = async (email, pwd) => {
  if(!auth) return null;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pwd);
    const uid = cred.user.uid;
    // 1) Nouveau système : document sous UID
    let d = await loadUserData(uid);
    // 2) Ancien système : document sous email encodé -> migration automatique vers UID
    if(!d) {
      const legacy = await loadUserData(encEmail(email));
      if(legacy) {
        // Recopie les anciennes données sous l'UID (une seule fois), puis on travaille sous UID
        try { await setDoc(doc(db,"users",uid), legacy, {merge:true}); } catch(e){}
        d = legacy;
      }
    }
    return { ...(d || { setupDone: false }), _uid: uid };
  } catch(e) { return null; }
};
const authRegister = async (email, pwd, lang) => {
  if(!auth) return null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    const uid = cred.user.uid;
    await saveUserData(uid, {setupDone:false, lang, trades:[], noTrades:[], phases:[]});
    return uid;
  } catch(e) { return false; }
};

const PRESET_ASSETS = ["XAU/USD","EUR/USD","GBP/USD","NAS100","BTC/USD","ETH/USD","US30","SPX500","GBP/JPY","USD/JPY"];
const DEFAULT_CRITERIA = ["HA M5 claire (pas de doji)","MM20 bien orientée","BB approche sur M1","Bougie de rejet propre","Fenêtre horaire respectée","Pas de distraction","Contexte macro neutre"];
const MONO = "'Geist Mono','IBM Plex Mono',monospace";
const SANS = "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const PNL_PRESETS = ["-1","-0.5","0","+1","+2","+3","+4","+5"];
const NEON_COLORS = [{name:"Vert",value:"#00ff9d"},{name:"Bleu",value:"#00d4ff"},{name:"Violet",value:"#bf00ff"},{name:"Rose",value:"#ff00aa"},{name:"Or",value:"#f0b429"}];
const HUMEUR_PILLS = {fr:["◎ Focus","◌ Neutre","△ Tendu","◷ Fatigué"],en:["◎ Focus","◌ Neutral","△ Tense","◷ Tired"]};
const BIAIS_PILLS = {fr:["↑ Haussier","→ Range","↓ Baissier"],en:["↑ Bullish","→ Range","↓ Bearish"]};
const NTR = {fr:["Pas de setup valide","Hors fenêtre","Marché difficile","Journée chargée","Jour de repos","Jour férié"],en:["No valid setup","Out of window","Difficult market","Busy day","Rest day","Holiday"]};
const today = () => new Date().toISOString().split("T")[0];
const rc = (r, neon="#00ff9d") => r==="WIN"?neon:r==="LOSS"?"#ff4d4d":"#f0b429";
const fmtPct = v => { if(v===""||v===null||v===undefined) return "—"; const n=Number(v),abs=Math.abs(n); const s=abs%1===0?abs.toFixed(0):abs*10%1===0?abs.toFixed(1):abs*100%1===0?abs.toFixed(2):abs.toFixed(3); return `${n>=0?"+":""}${n<0?"-":""}${s}%`; };
const calcDisc = list => { if(!list||!list.length) return null; return Math.round((list.filter(x=>x.conforming).length/list.length*0.6+list.filter(x=>!x.isRevenge).length/list.length*0.4)*10); };
// ── MODULES & TIMEFRAMES ──
const ALL_TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"];
const DEFAULT_TIMEFRAMES = ["M1","M5","M15","M30","H1","H4","D1"];
// Un module est actif sauf s'il est explicitement mis à false → users existants = tout activé
const modOn = (config, key) => (config && config.modules) ? config.modules[key] !== false : true;
// Liste des timeframes configurés (repli sur défaut si absent/vide)
const getTimeframes = (config) => (config && Array.isArray(config.timeframes) && config.timeframes.length) ? config.timeframes : DEFAULT_TIMEFRAMES;
// ── COMPTES ──
const ACCOUNT_COLORS = ["#00ff9d","#00d4ff","#bf00ff","#ff00aa","#f0b429","#ff6b35","#4ecdc4","#a8e063"];
const mkAccount = (id, name, color, opts={}) => ({id, name, color: color||ACCOUNT_COLORS[0], capital: opts.capital||"", devise: opts.devise||"€", accountType: opts.accountType||"perso", objPnl: opts.objPnl||"", objDrawdown: opts.objDrawdown||"", archived: opts.archived||false});
// Migration phases→comptes, BLINDÉE : aucun trade ne peut devenir orphelin.
// Reconstruit les comptes depuis les phases + les accountId réellement présents sur les trades,
// puis applique par-dessus les métadonnées sauvegardées (nom perso, couleur, archived…).
const ensureAccountsData = (ud) => {
  const trades = Array.isArray(ud.trades) ? ud.trades : [];
  const phases = Array.isArray(ud.phases) ? ud.phases : [];
  const cfg = (ud.config && typeof ud.config==="object") ? ud.config : {};
  const savedAccs = Array.isArray(ud.accounts) ? ud.accounts.filter(a=>a&&a.id&&a.name) : [];

  // Nom de référence pour un id de phase "ph_N"
  const phaseLabel = (id) => {
    if(id==="ph_0") return cfg.phaseName || "Phase 1";
    const m = /^ph_(\d+)$/.exec(id);
    if(m){ const n=parseInt(m[1],10); return phases[n-1]?.name || ("Phase "+(n+1)); }
    return id;
  };

  const byId = {};
  const addAcc = (id, name, opts={}) => { if(!byId[id]) byId[id] = mkAccount(id, name, ACCOUNT_COLORS[Object.keys(byId).length%ACCOUNT_COLORS.length], opts); };

  // 1) Comptes attendus depuis les phases
  addAcc("ph_0", cfg.phaseName||"Phase 1", {capital:cfg.capital, devise:cfg.devise, accountType:cfg.accountType, objPnl:cfg.objPnl, objDrawdown:cfg.objDrawdown});
  phases.forEach((ph,i)=> addAcc("ph_"+(i+1), ph.name||("Phase "+(i+2)), {devise:cfg.devise, accountType:cfg.accountType}));

  // 2) Tague les trades sans accountId selon leur phase
  const getPhaseKey = (tradeId) => { if(phases.length===0) return 0; for(let i=phases.length-1;i>=0;i--){ if(tradeId>phases[i].id) return i+1; } return 0; };
  const tagged = trades.map(t => t.accountId ? t : {...t, accountId: "ph_"+getPhaseKey(t.id)});

  // 3) Crée un compte pour tout accountId orphelin référencé par un trade (anti-disparition)
  tagged.forEach(t=>{ if(t.accountId && !byId[t.accountId]) addAcc(t.accountId, phaseLabel(t.accountId), {devise:cfg.devise}); });

  // 4) Applique les métadonnées sauvegardées par-dessus (nom, couleur, capital, archived…)
  savedAccs.forEach(sa=>{ byId[sa.id] = byId[sa.id] ? {...byId[sa.id], ...sa} : sa; });

  const accounts = Object.values(byId);
  // Compte du trade le plus récent (sert de repli intelligent)
  const sortedByRecent = [...tagged].sort((a,b)=>(b.id||0)-(a.id||0));
  const mostRecentAccId = sortedByRecent[0]?.accountId;
  const hasTrades = (id)=> tagged.some(t=>t.accountId===id);
  let activeAccountId = (ud.activeAccountId && byId[ud.activeAccountId] && !byId[ud.activeAccountId].archived) ? ud.activeAccountId : null;
  // Si le compte actif sauvegardé est vide alors que d'autres ont des trades → bascule sur le plus récent
  if(activeAccountId && !hasTrades(activeAccountId) && mostRecentAccId && byId[mostRecentAccId] && !byId[mostRecentAccId].archived){
    activeAccountId = mostRecentAccId;
  }
  if(!activeAccountId){
    if(mostRecentAccId && byId[mostRecentAccId] && !byId[mostRecentAccId].archived) activeAccountId = mostRecentAccId;
    else { const live = accounts.filter(a=>!a.archived); activeAccountId = ((live.length?live:accounts)[ (live.length?live:accounts).length - 1 ]).id; }
  }
  const migrated = trades.some(t=>!t.accountId) || accounts.length!==savedAccs.length;
  return {accounts, activeAccountId, trades: tagged, migrated};
};
const emptyForm = (asset="XAU/USD", tf="M5", mode="eur", accountId=null) => ({date:today(),asset,direction:"BUY",checklist:[],result:"WIN",pnlPreset:"",pnlManual:"",pnlMode:mode,pnlEurManual:"",notes:"",rejetScore:0,time:"",timeframe:tf,screenshot:"",isRevenge:false,slDirection:"",checkin:{humeur:"",biais:""},accountId});
const mkInput = neon => ({width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:8,color:"#ffffff",padding:"12px 14px",fontSize:13,fontFamily:MONO,marginBottom:10,outline:"none"});
// Auth handled by Firebase Auth

const T = {
  fr:{
    ob1Title:"Le marché ne te bat pas.\nTon indiscipline, oui.",ob1Desc:"La plupart des traders ne perdent pas par manque de stratégie, mais par manque de discipline. TrackMyTrade mesure la tienne, trade après trade.",
    ob2Title:"Tes règles,\npas celles d'un autre",ob2Desc:"Définis ta propre checklist d'entrée. Chaque trade est noté automatiquement — conforme ou non. Ton edge devient mesurable, pas une impression.",
    ob3Title:"Scalping, ICT, swing…\nta méthode reste la tienne",ob3Desc:"L'app s'adapte à toute stratégie : tes critères, tes actifs, tes timeframes, tes objectifs. Active seulement ce dont tu as besoin.",
    ob4Title:"Vois ce qui te rend\nvraiment rentable",ob4Desc:"Win rate, profit factor, discipline, courbe d'équité. Les chiffres qui comptent, réunis et lisibles d'un coup d'œil.",
    ob5Title:"Un coach dans\nta poche",ob5Desc:"Une lecture honnête de tes stats à chaque session, et tous tes comptes (perso, prop firm, démo) au même endroit. Prêt ?",
    welcome:"Bienvenue sur\nTrackMyTrade",welcomeDesc:"Le journal de trading qui transforme ta discipline en données concrètes.",
    discover:"Découvrir →",next:"Suivant →",start:"Configurer ma stratégie →",back:"← Retour",step:"ÉTAPE",
    strategy:"Ta stratégie",strategyDesc:"Donne un nom à ta stratégie.",assets:"Tes actifs",assetsDesc:"Sur quoi tu trades ?",
    criteria:"Tes critères",criteriaDesc:"Modifie la checklist.",threshold:"Seuil de conformité",thresholdDesc:"Un setup est conforme s'il valide au moins X critères.",
    launch:"✓ Lancer TrackMyTrade",continue:"Continuer →",prevStep:"← Étape précédente",
    stats:"STATS",addTrade:"+ TRADE",history:"HISTORIQUE",settings:"⚙",editLabel:"✏ ÉDITION",
    newTrade:"Nouveau trade",entryTime:"⏱ Heure d'entrée (optionnel)",
    checklistSetup:"CHECKLIST SETUP",conform:"✓ Conforme",missing:"critère(s) manquant(s)",
    rejectQuality:"QUALITÉ DU REJET",optional:"(optionnel)",pnl:"P&L %",manualPnl:"Autre…",
    notesPlaceholder:"Notes comportementales, erreurs, observations...",
    addScreenshot:"Ajouter une capture (optionnel)",screenshotAdded:"Capture ajoutée ✓",
    saveConform:"✓ ENREGISTRER — Conforme",saveNonConform:"⚠ ENREGISTRER — Non-conforme",
    updateBtn:"✓ METTRE À JOUR",tradeSaved:"✓ Trade enregistré",tradeUpdated:"✓ Trade modifié",
    noTradeToday:"Pas de trade aujourd'hui",noTradeReason:"RAISON (OPTIONNEL)",confirmBtn:"⊘ Confirmer",
    histTitle:"Historique",allLabel:"Tous",detailTitle:"RÉCAP TRADE",modifyBtn:"✏ Modifier",closeBtn:"✕",
    setupScore:"SETUP SCORE",rejectLabel:"REJET /10",excellent:"Excellent",correct:"Correct",weak:"Faible",
    checklistDetail:"CHECKLIST",screenshotLabel:"CAPTURE",notesLabel:"NOTES",
    strategyName:"NOM DE LA STRATÉGIE",thresholdLabel:"SEUIL DE CONFORMITÉ",
    criteriaLabel:"CRITÈRES",addCriteria:"+ Ajouter un critère",saveBtn:"✓ ENREGISTRER",savedOk:"✓ Enregistré !",logout:"Se déconnecter",
    winRate:"Win Rate",totalPnl:"P&L",trades:"trades",noTrades:"Aucun trade enregistré.",
    journalEmpty:"Journal vide",journalEmptyDesc:"Saisis ton premier trade pour commencer.",firstTrade:"+ Saisir un trade",
    deleteConfirm:"Supprimer ?",deleteBtn:"Confirmer",cancelBtn:"Annuler",deleteLink:"supprimer",
    conformLabel:"✓ conforme",nonConformLabel:"✗ non-conforme",conformShort:"✓ CONFORMES",nonConformShort:"✗ NON-CONF.",
    winRateLabel:"win rate",perfPnl:"Performance P&L",cumulLabel:"CUMULÉ",weeksLabel:"SEMAINES",
    streakWin:"WIN de suite",streakLoss:"LOSS de suite",checkRules:"Vérifier les règles",
    exportTitle:"EXPORTER",exportCsv:"Excel / Sheets",exportJson:"Backup complet",
    modifyTrade:"✏ Modification",cancelEdit:"ANNULER",hideBtn:"⊘ Masquer",showBtn:"⊘ Afficher",
    conformityTitle:"Conformité · seuil",langLabel:"LANGUE",colorLabel:"COULEUR NÉON",
    lastTrade:"Dernier trade",rejectStat:"rejet",highStd:"Standard élevé",balanced:"Équilibré",lowStd:"Standard faible",
    inconsistent:"incohérent avec",maxTradesLabel:"TRADES MAX PAR JOUR",
    revengeLabel:"Revenge trade",revengeWarning:"⚠ Limite atteinte — tagué Revenge trade",
    statsTitle:"STATISTIQUES",expectancy:"Expectancy",bestAsset:"Meilleur actif",avgWin:"Gain moyen",avgLoss:"Perte moyenne",
    calendarTitle:"CALENDRIER",calendarToggle:"Afficher le calendrier",enableNotif:"Activer les conseils",
    addAsset:"+ Ajouter un actif",customAsset:"Nom de l'actif…",
    slDirectionLabel:"DIRECTION POST-SL",slWith:"Dans le bon sens ✓",slAgainst:"Contre moi ✗",ratio:"Ratio G/P",
    loginTitle:"Connexion",loginEmail:"Adresse email",loginPassword:"Mot de passe",
    loginBtn:"Se connecter",signupBtn:"Créer un compte",loginSwitch:"Pas encore de compte ?",signupSwitch:"Déjà un compte ?",
    loginError:"Email ou mot de passe incorrect",signupError:"Email déjà utilisé",
    loginEmailPlaceholder:"ton@email.com",loginPasswordPlaceholder:"········",confirmPwdPlaceholder:"Confirmer le mot de passe",confirmPwdError:"Les mots de passe ne correspondent pas",
    disciplineLabel:"DISCIPLINE",disciplineExcellent:"Excellent",disciplineGood:"Bon",disciplineWork:"À améliorer",disciplinePoor:"Insuffisant",
    conformiteLabel:"Conformité",sansRevengeLabel:"Sans revenge",
    phaseEnCours:"Phase en cours",toutHistorique:"Tout",
    newPhaseBtn:"▶ Nouvelle phase",newPhaseConfirmQ:"Démarrer une nouvelle phase ?",
    newPhaseDesc:"Les stats repartent à zéro à partir d'aujourd'hui. L'historique est conservé.",
    newPhaseConfirmBtn:"✓ Confirmer",phaseSince:"depuis",
    checkinToggle:"Check-in",humeurLabel:"HUMEUR",humeurPlaceholder:"Champ libre…",biaisLabel:"BIAIS",
    weeklyTitle:"Récap de la semaine",weeklySubtitle:"7 derniers jours",weeklyClose:"C'est parti →",
    insightNoRevenge:"Aucun revenge trade cette semaine ✓",
    insightConformVsNot:"Conformes : {c}% WR vs {n}% non-conformes",insightRevenge:"{n} revenge trade(s) — à corriger",
    resetTitle:"Réinitialiser les données",resetWarning:"trades seront effacés définitivement.",
    resetExportBtn:"↓ Exporter (CSV) puis réinitialiser",resetSkipBtn:"Réinitialiser sans exporter",
    resetCancel:"Annuler",resetExportedTitle:"Export effectué ✓",
    resetExportedDesc:"Ton historique a été sauvegardé. Tu peux maintenant réinitialiser.",
    resetConfirmBtn:"Confirmer la réinitialisation",resetBtn:"⊘ Réinitialiser les données",
  },
  en:{
    ob1Title:"The market isn't beating you.\nYour lack of discipline is.",ob1Desc:"Most traders don't lose from a lack of strategy, but a lack of discipline. TrackMyTrade measures yours, trade after trade.",
    ob2Title:"Your rules,\nnot someone else's",ob2Desc:"Define your own entry checklist. Each trade is scored automatically — compliant or not. Your edge becomes measurable, not a feeling.",
    ob3Title:"Scalping, ICT, swing…\nyour method stays yours",ob3Desc:"The app adapts to any strategy: your criteria, your assets, your timeframes, your goals. Turn on only what you need.",
    ob4Title:"See what truly\nmakes you profitable",ob4Desc:"Win rate, profit factor, discipline, equity curve. The numbers that matter, together and readable at a glance.",
    ob5Title:"A coach in\nyour pocket",ob5Desc:"An honest read of your stats every session, and all your accounts (personal, prop firm, demo) in one place. Ready?",
    welcome:"Welcome to\nTrackMyTrade",welcomeDesc:"The trading journal that turns your discipline into concrete data.",
    discover:"Discover →",next:"Next →",start:"Set up my strategy →",back:"← Back",step:"STEP",
    strategy:"Your strategy",strategyDesc:"Give your strategy a name.",assets:"Your assets",assetsDesc:"What do you trade?",
    criteria:"Your criteria",criteriaDesc:"Edit the checklist.",threshold:"Compliance threshold",thresholdDesc:"A setup is compliant if it meets at least X criteria.",
    launch:"✓ Launch TrackMyTrade",continue:"Continue →",prevStep:"← Previous step",
    stats:"STATS",addTrade:"+ TRADE",history:"HISTORY",settings:"⚙",editLabel:"✏ EDIT",
    newTrade:"New trade",entryTime:"⏱ Entry time (optional)",
    checklistSetup:"SETUP CHECKLIST",conform:"✓ Compliant",missing:"criterion missing",
    rejectQuality:"REJECTION QUALITY",optional:"(optional)",pnl:"P&L %",manualPnl:"Other…",
    notesPlaceholder:"Behavioral notes, mistakes, observations...",
    addScreenshot:"Add screenshot (optional)",screenshotAdded:"Screenshot added ✓",
    saveConform:"✓ SAVE — Compliant",saveNonConform:"⚠ SAVE — Non-compliant",
    updateBtn:"✓ UPDATE",tradeSaved:"✓ Trade saved",tradeUpdated:"✓ Trade updated",
    noTradeToday:"No trade today",noTradeReason:"REASON (OPTIONAL)",confirmBtn:"⊘ Confirm",
    histTitle:"History",allLabel:"All",detailTitle:"TRADE RECAP",modifyBtn:"✏ Edit",closeBtn:"✕",
    setupScore:"SETUP SCORE",rejectLabel:"REJECTION /10",excellent:"Excellent",correct:"Good",weak:"Poor",
    checklistDetail:"CHECKLIST",screenshotLabel:"SCREENSHOT",notesLabel:"NOTES",
    strategyName:"STRATEGY NAME",thresholdLabel:"COMPLIANCE THRESHOLD",
    criteriaLabel:"CRITERIA",addCriteria:"+ Add criterion",saveBtn:"✓ SAVE",savedOk:"✓ Saved!",logout:"Sign out",
    winRate:"Win Rate",totalPnl:"P&L",trades:"trades",noTrades:"No trades recorded.",
    journalEmpty:"Empty journal",journalEmptyDesc:"Log your first trade to start.",firstTrade:"+ Log a trade",
    deleteConfirm:"Delete?",deleteBtn:"Confirm",cancelBtn:"Cancel",deleteLink:"delete",
    conformLabel:"✓ compliant",nonConformLabel:"✗ non-compliant",conformShort:"✓ COMPLIANT",nonConformShort:"✗ NON-COMP.",
    winRateLabel:"win rate",perfPnl:"P&L Performance",cumulLabel:"CUMUL.",weeksLabel:"WEEKS",
    streakWin:"WIN streak",streakLoss:"LOSS streak",checkRules:"Check your rules",
    exportTitle:"EXPORT",exportCsv:"Excel / Sheets",exportJson:"Full backup",
    modifyTrade:"✏ Editing",cancelEdit:"CANCEL",hideBtn:"⊘ Hide",showBtn:"⊘ Show",
    conformityTitle:"Compliance · threshold",langLabel:"LANGUAGE",colorLabel:"NEON COLOR",
    lastTrade:"Last trade",rejectStat:"reject",highStd:"High standard",balanced:"Balanced",lowStd:"Low standard",
    inconsistent:"inconsistent with",maxTradesLabel:"MAX TRADES PER DAY",
    revengeLabel:"Revenge trade",revengeWarning:"⚠ Limit reached — tagged as Revenge trade",
    statsTitle:"STATISTICS",expectancy:"Expectancy",bestAsset:"Best asset",avgWin:"Avg win",avgLoss:"Avg loss",
    calendarTitle:"CALENDAR",calendarToggle:"Show calendar",enableNotif:"Enable tips",
    addAsset:"+ Add asset",customAsset:"Asset name…",
    slDirectionLabel:"POST-SL DIRECTION",slWith:"Went my way ✓",slAgainst:"Against me ✗",ratio:"Win/Loss ratio",
    loginTitle:"Sign in",loginEmail:"Email address",loginPassword:"Password",
    loginBtn:"Sign in",signupBtn:"Create account",loginSwitch:"No account yet?",signupSwitch:"Already have an account?",
    loginError:"Invalid email or password",signupError:"Email already in use",
    loginEmailPlaceholder:"your@email.com",loginPasswordPlaceholder:"········",confirmPwdPlaceholder:"Confirm password",confirmPwdError:"Passwords do not match",
    disciplineLabel:"DISCIPLINE",disciplineExcellent:"Excellent",disciplineGood:"Good",disciplineWork:"Needs work",disciplinePoor:"Poor",
    conformiteLabel:"Compliance",sansRevengeLabel:"Revenge-free",
    phaseEnCours:"Current phase",toutHistorique:"All",
    newPhaseBtn:"▶ New phase",newPhaseConfirmQ:"Start a new phase?",
    newPhaseDesc:"Dashboard stats reset from today. Full history is kept.",
    newPhaseConfirmBtn:"✓ Confirm",phaseSince:"since",
    checkinToggle:"Check-in",humeurLabel:"MOOD",humeurPlaceholder:"Free field…",biaisLabel:"BIAS",
    weeklyTitle:"Weekly recap",weeklySubtitle:"Last 7 days",weeklyClose:"Let's go →",
    insightNoRevenge:"No revenge trades this week ✓",
    insightConformVsNot:"Compliant: {c}% WR vs {n}% non-compliant",insightRevenge:"{n} revenge trade(s) — needs fixing",
    resetTitle:"Reset all data",resetWarning:"trades will be permanently deleted.",
    resetExportBtn:"↓ Export (CSV) then reset",resetSkipBtn:"Reset without exporting",
    resetCancel:"Cancel",resetExportedTitle:"Export done ✓",
    resetExportedDesc:"Your history has been saved. You can now reset.",
    resetConfirmBtn:"Confirm reset",resetBtn:"⊘ Reset all data",
  }
};

const CSS = ({neon="#00ff9d"}) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;700;800;900&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0c0c12}
    input,select,textarea{outline:none;font-family:${MONO};font-size:16px}
    input[type=checkbox]{accent-color:${neon};width:16px;height:16px;cursor:pointer}
    input[type=date],input[type=time]{color-scheme:dark}
    input[type=file]{display:none}
    .btn{transition:all 0.15s;cursor:pointer}
    .btn:hover{opacity:0.85;transform:translateY(-1px)}
    .row{transition:background 0.2s;cursor:pointer}
    .row:hover{background:${neon}0a!important}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${neon}26}

    /* ══ TUTORIAL ══ */
    .tut-overlay{position:fixed;inset:0;z-index:900;pointer-events:all}
    @keyframes iconPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(1.08)}}
    @keyframes appFadeIn{0%{opacity:0;transform:scale(0.985)}100%{opacity:1;transform:scale(1)}}
    .app-fade-in{animation:appFadeIn 0.6s ease both}
    .icon-pulse{animation:iconPulse 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
    .icon-hover{transition:transform 0.15s ease,filter 0.15s ease}
    .icon-hover:hover{transform:scale(1.15);filter:drop-shadow(0 0 4px currentColor)}
    .tut-svg{position:absolute;inset:0;width:100%;height:100%}
    .tut-tooltip{
      position:fixed;z-index:910;width:282px;pointer-events:all;
      background:linear-gradient(145deg,rgba(20,20,36,0.98),rgba(12,12,24,0.99));
      border:1px solid rgba(255,255,255,0.1);
      border-top:1px solid rgba(255,255,255,0.2);
      border-radius:20px;padding:20px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.11),0 32px 80px rgba(0,0,0,0.95),0 0 0 1px ${neon}10,0 0 50px ${neon}07;
      backdrop-filter:blur(20px);
      transition:opacity 0.38s cubic-bezier(0.16,1,0.3,1),transform 0.38s cubic-bezier(0.16,1,0.3,1);
    }
    .tut-tooltip::before{content:'';position:absolute;inset:0;border-radius:20px;
      background:linear-gradient(118deg,rgba(255,255,255,0.055) 0%,transparent 42%,rgba(0,0,0,0.06) 100%);
      pointer-events:none}
    .tut-tooltip::after{content:'';position:absolute;top:0;left:12%;right:12%;height:1px;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,0.28) 45%,rgba(255,255,255,0.28) 55%,transparent);
      pointer-events:none}
    .tut-tooltip>*{position:relative;z-index:1}
    .tut-icon{width:36px;height:36px;border-radius:10px;background:${neon}14;border:1px solid ${neon}28;
      display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:17px}
    .tut-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;letter-spacing:-0.3px}
    .tut-body{font-size:11px;color:rgba(255,255,255,0.52);line-height:1.7}
    .tut-foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
    .tut-prog-wrap{flex:1;margin-right:14px}
    .tut-prog-bar{height:2px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;margin-bottom:5px}
    .tut-prog-fill{height:100%;background:linear-gradient(90deg,${neon},#00d4ff);border-radius:2px;
      transition:width 0.5s cubic-bezier(0.16,1,0.3,1)}
    .tut-step-label{font-size:9px;color:rgba(255,255,255,0.22)}
    .tut-btn-skip{background:transparent;border:none;color:rgba(255,255,255,0.28);font-size:10px;
      cursor:pointer;font-family:${MONO};padding:0}
    .tut-btn-next{
      background:linear-gradient(180deg,${neon},#00e08a);
      border:none;color:#071409;border-radius:10px;
      padding:8px 16px;font-size:11px;font-weight:700;
      cursor:pointer;font-family:${MONO};letter-spacing:0.3px;margin-left:8px;
      box-shadow:0 4px 16px ${neon}38,inset 0 1px 0 rgba(255,255,255,0.28);
      transition:all 0.18s;
    }
    .tut-btn-next:hover{transform:translateY(-1px);box-shadow:0 8px 24px ${neon}4a}

    /* ══ ANIMATIONS ══ */
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1;text-shadow:0 0 8px ${neon}66}50%{opacity:0.85;text-shadow:0 0 14px ${neon}aa}}
    @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ring{0%,100%{transform:scale(1);opacity:0.12}50%{transform:scale(1.08);opacity:0.22}}
    @keyframes slideFromLeft{0%{opacity:0;transform:translateX(-60px)}65%{transform:translateX(6px)}80%{transform:translateX(-2px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes slideFromRight{0%{opacity:0;transform:translateX(60px)}65%{transform:translateX(-6px)}80%{transform:translateX(2px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes fadeInSlow{0%{opacity:0}100%{opacity:1}}
    @keyframes logoBoxGlow{0%,100%{box-shadow:0 0 8px ${neon}22}50%{box-shadow:0 0 20px ${neon}55,0 0 6px ${neon}33}}
    @keyframes dotPulse{0%,40%,100%{width:6px;background:${neon}22}50%{width:22px;background:${neon};box-shadow:0 0 12px ${neon}99}}
    @keyframes icoCheck{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
    @keyframes icoX{from{stroke-dashoffset:22}to{stroke-dashoffset:0}}
    @keyframes icoRadar{0%{r:3;opacity:0.7}100%{r:14;opacity:0}}
    @keyframes icoPop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
    @keyframes icoBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes icoShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-10deg)}40%{transform:rotate(10deg)}60%{transform:rotate(-6deg)}80%{transform:rotate(6deg)}}
    @keyframes icoSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes icoPulse{0%,100%{opacity:0.5;transform:scale(0.92)}50%{opacity:1;transform:scale(1.08)}}
    @keyframes icoFlame{0%,100%{transform:scaleY(1) skewX(0deg)}25%{transform:scaleY(1.07) skewX(-2deg)}75%{transform:scaleY(0.93) skewX(2deg)}}
    @keyframes icoFlame2{0%,100%{transform:scaleY(1) skewX(0deg)}33%{transform:scaleY(1.09) skewX(2deg)}66%{transform:scaleY(0.91) skewX(-2deg)}}
    @keyframes icoClock{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes icoDraw{from{stroke-dashoffset:80}to{stroke-dashoffset:0}}
    @keyframes icoHeartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}45%{transform:scale(1.15)}60%{transform:scale(1)}}
    @keyframes icoDiamond{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes barFill{from{width:0}to{width:var(--bar-w)}}
    @keyframes kpiPop{0%{opacity:0;transform:scale(0.7)}70%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
    .slide-up{animation:slideUp 0.3s ease both}
    .fu{animation:fadeUp 0.45s ease both}
    .fi{animation:fadeIn 0.4s ease both}
    .glow{animation:pulse 3s ease-in-out infinite}
    .grid-bg{background-image:linear-gradient(${neon}06 1px,transparent 1px),linear-gradient(90deg,${neon}06 1px,transparent 1px);background-size:32px 32px}
    .view-in{animation:fadeIn 0.22s ease both}
    @keyframes p1{0%{opacity:0.2;transform:scale(0.95)}50%{opacity:0.07;transform:scale(1.03)}100%{opacity:0.2;transform:scale(0.95)}}
    @keyframes p2{0%{opacity:0.25;transform:scale(0.93)}50%{opacity:0.05;transform:scale(1.05)}100%{opacity:0.25;transform:scale(0.93)}}
  `}</style>
);



function Logo({size="sm",neon="#00ff9d"}) {
  const [box,fs]={sm:[28,18],md:[34,22],lg:[48,30]}[size]||[28,18];
  return (
    <div style={{display:"flex",alignItems:"center",gap:9}}>
      <div style={{width:box,height:box,borderRadius:7,background:`${neon}1a`,border:`1px solid ${neon}55`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 0 20px ${neon}44, 0 0 8px ${neon}22`}}>
        <svg width={Math.round(box*0.74)} height={Math.round(box*0.74)} viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 22,12 12,22 2,12" fill={`${neon}22`} stroke={neon} strokeWidth="1.6" strokeLinejoin="round"/>
          <polygon points="12,7 17,12 12,17 7,12" fill={neon} stroke={neon} strokeWidth="0.5"/>
        </svg>
      </div>
      <span style={{fontSize:fs,fontFamily:MONO,letterSpacing:-0.5,lineHeight:1}}>
        <b style={{color:neon}}>Track</b><span style={{color:neon+"44",fontWeight:300}}>My</span><b style={{color:neon}}>Trade</b>
      </span>
    </div>
  );
}

function StreakBadge({trades,neon,lang}) {
  const t=T[lang];
  if(trades.length<2) return null;
  let streak=1,type=trades[0].result;
  for(let i=1;i<trades.length;i++){if(trades[i].result===type)streak++;else break;}
  if(streak<2||type==="BE") return null;
  const color=type==="WIN"?neon:"#ff4d4d";
  return <div style={{background:`${color}12`,border:`1px solid ${color}35`,borderRadius:10,padding:"8px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 2px 12px ${color}18`}}><span style={{fontSize:12,color,fontWeight:700,fontFamily:MONO,textShadow:`0 0 10px ${color}88`}}>{streak} {type==="WIN"?t.streakWin:t.streakLoss}</span>{type==="LOSS"&&<span style={{fontSize:10,color:"#ffffffaa"}}>{t.checkRules}</span>}</div>;
}


function AdvancedStats({trades,neon,lang}) {
  const t=T[lang];
  if(trades.length<3) return null;
  const wins=trades.filter(x=>x.result==="WIN");
  const losses=trades.filter(x=>x.result==="LOSS");
  const avgWin=wins.length?wins.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/wins.length:0;
  const avgLoss=losses.length?Math.abs(losses.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/losses.length):0;
  const wr=trades.length?wins.length/trades.length:0;
  const exp=(wr*avgWin)-((1-wr)*avgLoss);
  const aMap={};
  trades.forEach(x=>{if(!aMap[x.asset])aMap[x.asset]={w:0,t:0};aMap[x.asset].t++;if(x.result==="WIN")aMap[x.asset].w++;});
  const best=Object.entries(aMap).filter(([,v])=>v.t>=2).sort((a,b)=>(b[1].w/b[1].t)-(a[1].w/a[1].t))[0];
  const revs=trades.filter(x=>x.isRevenge);
  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:16,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{t.statsTitle}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:`${neon}08`,borderRadius:10,padding:10,boxShadow:`inset 0 1px 0 ${neon}15`}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4}}>{t.expectancy}</div><div style={{fontSize:16,fontWeight:700,color:exp>=0?neon:"#ff4d4d",fontFamily:MONO,textShadow:`0 0 14px ${exp>=0?neon:"#ff4d4d"}99`}}>{fmtPct(exp)}</div></div>
        {best&&<div style={{background:`${neon}08`,borderRadius:10,padding:10,boxShadow:`inset 0 1px 0 ${neon}15`}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4}}>{t.bestAsset}</div><div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:MONO}}>{best[0]}</div><div style={{fontSize:10,color:"#ffffffaa"}}>{Math.round(best[1].w/best[1].t*100)}% WR</div></div>}
        <div style={{background:`${neon}08`,borderRadius:10,padding:10,boxShadow:`inset 0 1px 0 ${neon}15`}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4}}>{t.avgWin}</div><div style={{fontSize:16,fontWeight:700,color:neon,fontFamily:MONO,textShadow:`0 0 14px ${neon}99`}}>{fmtPct(avgWin)}</div></div>
        <div style={{background:`${neon}08`,borderRadius:10,padding:10,boxShadow:`inset 0 1px 0 ${neon}15`}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4}}>{t.avgLoss}</div><div style={{fontSize:16,fontWeight:700,color:"#ff4d4d",fontFamily:MONO,textShadow:"0 0 14px #ff4d4d99"}}>-{avgLoss%1===0?avgLoss.toFixed(0):avgLoss.toFixed(1)}%</div></div>
        {wins.length>0&&losses.length>0&&(()=>{const r=avgWin/avgLoss;return<div style={{background:`${neon}08`,borderRadius:8,padding:10,gridColumn:"1/-1"}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4}}>{t.ratio}</div><div style={{fontSize:16,fontWeight:700,color:r>=1?neon:"#f0b429",fontFamily:MONO}}>{r.toFixed(2)}</div></div>;})()}
        {revs.length>0&&<div style={{background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,padding:10,gridColumn:"1/-1"}}><div style={{fontSize:9,color:"#ff4d4d",marginBottom:4}}>REVENGE TRADES</div><div style={{fontSize:14,fontWeight:700,color:"#ff4d4d",fontFamily:MONO}}>{revs.length} · {Math.round(revs.filter(x=>x.result==="LOSS").length/revs.length*100)}% LOSS</div></div>}
      </div>
    </div>
  );
}



function ScoreRing({score,max=8,size=52,threshold=6,neon="#00ff9d"}) {
  const r=(size-8)/2,circ=2*Math.PI*r;
  const color=score>=threshold?neon:score>=threshold-1?"#f0b429":"#ff4d4d";
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff12" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${circ*(score/max)} ${circ}`} strokeLinecap="round"
        style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%",transition:"stroke-dasharray 0.4s"}}/>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{fontSize:11,fontWeight:700,fill:color,fontFamily:"monospace"}}>{score}/{max}</text>
    </svg>
  );
}

function Dots({total,current,neon="#00ff9d"}) {
  return (
    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
      {Array.from({length:total}).map((_,i)=>(
        <div key={i} style={{width:i===current?22:7,height:7,borderRadius:4,background:i===current?neon:i<current?`${neon}55`:"#ffffff15",transition:"all 0.3s"}}/>
      ))}
    </div>
  );
}

function Stat({label,value,color="#00ff9d"}) {
  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${color}28`,borderRadius:14,padding:"14px 16px",flex:1,boxShadow:"0 8px 32px #00000060,inset 0 1px 0 #ffffff08"}}>
      <div style={{fontSize:9,color:"#ffffffaa",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{label}</div>
      <div style={{fontSize:22,fontWeight:900,color:"#ffffff",fontFamily:MONO,lineHeight:1,textShadow:`0 0 20px ${color}cc, 0 2px 6px rgba(0,0,0,0.6)`}}>{value}</div>
    </div>
  );
}

// ── Composant Icon centralisé : icônes néon géométriques (style B), animation sur alerte/survol ──
function Icon({name, size=18, color="currentColor", strokeW=1.6, animate=false, style={}}) {
  const sw = strokeW;
  const common = { fill:"none", stroke:color, strokeWidth:sw, strokeLinecap:"round", strokeLinejoin:"round" };
  const paths = {
    // Statistiques : axes + barres
    stats: <g>
      <path d="M3,3 L3,21 L21,21" {...common}/>
      <rect x="6" y="13" width="3" height="5" fill={color} stroke="none"/>
      <rect x="11" y="9" width="3" height="9" fill={color} stroke="none"/>
      <rect x="16" y="5" width="3" height="13" fill={color} stroke="none"/>
    </g>,
    // Nouveau trade : losange + plus
    add: <g>
      <rect x="4" y="4" width="16" height="16" rx="3" {...common} transform="rotate(45 12 12)"/>
      <line x1="12" y1="8" x2="12" y2="16" {...common}/>
      <line x1="8" y1="12" x2="16" y2="12" {...common}/>
    </g>,
    // Discipline : cible bouclier
    discipline: <g>
      <path d="M12,2 L20,5 L20,12 Q20,19 12,22 Q4,19 4,12 L4,5 Z" {...common}/>
      <polyline points="8.5,12 11,14.5 16,8.5" {...common}/>
    </g>,
    // Profit factor : courbe montante + point
    profit: <g>
      <line x1="3" y1="21" x2="21" y2="21" {...common} opacity="0.35"/>
      <polyline points="3,18 9,11 13,14 20,5" {...common}/>
      <circle cx="20" cy="5" r="2" fill={color} stroke="none"/>
    </g>,
    // Navigation : étoile/boussole 4 branches
    nav: <g>
      <polygon points="12,2 14,10 22,12 14,14 12,22 10,14 2,12 10,10" {...common}/>
    </g>,
    // Alerte : triangle
    alert: <g>
      <path d="M12,3 L22,21 L2,21 Z" {...common}/>
      <line x1="12" y1="10" x2="12" y2="15" {...common}/>
      <circle cx="12" cy="18" r="1" fill={color} stroke="none"/>
    </g>,
    // Calendrier
    calendar: <g>
      <rect x="3" y="5" width="18" height="16" rx="2.5" {...common}/>
      <line x1="3" y1="10" x2="21" y2="10" {...common}/>
      <line x1="8" y1="2.5" x2="8" y2="6.5" {...common}/>
      <line x1="16" y1="2.5" x2="16" y2="6.5" {...common}/>
      <circle cx="12" cy="15" r="1.8" fill={color} stroke="none"/>
    </g>,
    // Compte / utilisateur
    account: <g>
      <circle cx="12" cy="9" r="4" {...common}/>
      <path d="M5,21 Q5,15 12,15 Q19,15 19,21" {...common}/>
    </g>,
    // Switch / rotation
    swap: <g>
      <polyline points="4,8 8,4 12,8" {...common}/>
      <path d="M8,4 L8,14 Q8,18 14,18 L18,18" {...common}/>
      <polyline points="20,16 16,20 12,16" {...common}/>
    </g>,
    // Feu / momentum (remplace 🔥) : flamme stylisée
    fire: <g>
      <path d="M12,2 Q17,8 14,12 Q13,9 11,9 Q13,14 9,15 Q6,11 9,6 Q10,9 12,8 Q13,5 12,2 Z" {...common}/>
    </g>,
    // Éclair (remplace ⚡)
    bolt: <g>
      <polygon points="13,2 4,13 11,13 10,22 19,10 12,10" {...common}/>
    </g>,
    // Corbeille (remplace 🗑)
    trash: <g>
      <polyline points="4,6 20,6" {...common}/>
      <path d="M6,6 L7,21 L17,21 L18,6" {...common}/>
      <line x1="10" y1="10" x2="10" y2="17" {...common}/>
      <line x1="14" y1="10" x2="14" y2="17" {...common}/>
      <path d="M9,6 L9,3 L15,3 L15,6" {...common}/>
    </g>,
    // Réglages (remplace ⚙) version géométrique
    settings: <g>
      <circle cx="12" cy="12" r="3.5" {...common}/>
      <path d="M12,2 L12,5 M12,19 L12,22 M2,12 L5,12 M19,12 L22,12 M5,5 L7,7 M17,17 L19,19 M19,5 L17,7 M7,17 L5,19" {...common}/>
    </g>,
    // Edition (remplace ✏ / ✎)
    edit: <g>
      <path d="M4,20 L4,16 L16,4 L20,8 L8,20 Z" {...common}/>
      <line x1="14" y1="6" x2="18" y2="10" {...common}/>
    </g>,
    // Check
    check: <polyline points="4,12 10,18 20,6" {...common}/>,
    // Croix
    close: <g><line x1="5" y1="5" x2="19" y2="19" {...common}/><line x1="19" y1="5" x2="5" y2="19" {...common}/></g>,
    // Insights / diamant
    insight: <g>
      <polygon points="12,2 20,12 12,22 4,12" {...common}/>
      <polygon points="12,7 16,12 12,17 8,12" fill={color} stroke="none" opacity="0.5"/>
    </g>,
    // Pas de trade (cercle barré)
    notrade: <g>
      <circle cx="12" cy="12" r="9" {...common}/>
      <line x1="6" y1="6" x2="18" y2="18" {...common}/>
    </g>,
    // Historique (lignes)
    history: <g>
      <line x1="4" y1="7" x2="20" y2="7" {...common}/>
      <line x1="4" y1="12" x2="20" y2="12" {...common}/>
      <line x1="4" y1="17" x2="14" y2="17" {...common}/>
    </g>,
  };
  const content = paths[name] || paths.insight;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{display:"inline-block",verticalAlign:"middle",flexShrink:0,color, ...style}} className={animate?"icon-pulse":undefined}>
      {content}
    </svg>
  );
}

// ── Contenu légal (FR/EN) ──
const LEGAL_CONTENT = {
  fr: {
    mentions: {
      title: "Mentions légales",
      sections: [
        ["Éditeur", "L'application TrackMyTrade est éditée par un entrepreneur individuel. L'Application est actuellement proposée gratuitement et ne donne lieu à aucune facturation."],
        ["Contact", "Pour toute question, réclamation ou demande relative à vos données, vous pouvez écrire à : contact@trackmytrade.app"],
        ["Statut", "L'éditeur exerce à ce jour sans structure commerciale enregistrée, l'Application étant gratuite et non commerciale. Les informations d'immatriculation (n° SIRET) seront ajoutées si une activité commerciale est mise en place."],
        ["Hébergement", "L'Application et les données sont hébergées via Google Firebase — Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande. Le déploiement web est assuré par un hébergeur cloud (Vercel / Netlify), serveurs situés dans l'Union européenne et/ou aux États-Unis."],
        ["Propriété", "L'ensemble des éléments de l'Application (code, interface, nom, logo) est protégé par le droit de la propriété intellectuelle et demeure la propriété exclusive de l'éditeur."],
      ],
    },
    cgu: {
      title: "Conditions Générales d'Utilisation",
      sections: [
        ["1. Objet", "TrackMyTrade est un outil de journalisation et d'analyse de trading à usage personnel. L'Application ne fournit aucun conseil en investissement et ne constitue pas un service de gestion de portefeuille."],
        ["2. Accès", "L'Application est actuellement gratuite. Des fonctionnalités payantes pourront être introduites à l'avenir (modèle freemium), avec des conditions communiquées avant tout achat. L'accès nécessite un compte (e-mail + mot de passe). Vous êtes responsable de la confidentialité de vos identifiants."],
        ["3. Utilisation", "Vous vous engagez à utiliser l'Application conformément à sa destination et à la loi. Il est interdit de tenter d'accéder aux données d'autres utilisateurs, de compromettre la sécurité de l'Application, ou de la reproduire sans autorisation."],
        ["4. Vos données", "Vous êtes seul responsable de l'exactitude des données saisies. Il est recommandé d'exporter régulièrement vos données. L'éditeur ne peut être tenu responsable d'une perte résultant d'un évènement échappant à son contrôle raisonnable."],
        ["5. Propriété intellectuelle", "L'Application, son code et son interface sont la propriété de l'éditeur. Vos données de trading restent votre propriété."],
        ["6. Responsabilité", "L'Application est fournie « en l'état ». Elle ne constitue pas un conseil financier. L'éditeur n'est pas responsable des décisions de trading ni des pertes financières en résultant."],
        ["7. Résiliation", "Vous pouvez supprimer votre compte à tout moment. L'éditeur peut suspendre un compte en cas de violation des présentes CGU."],
        ["8. Droit applicable", "Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux français sont compétents."],
      ],
    },
    privacy: {
      title: "Politique de Confidentialité",
      sections: [
        ["1. Données collectées", "Adresse e-mail et mot de passe (chiffré, jamais accessible en clair par l'éditeur), opérations de trading enregistrées, paramètres de stratégie et statistiques. Aucune donnée bancaire n'est collectée."],
        ["2. Finalités", "Gérer votre compte, fournir les fonctionnalités de journalisation, sauvegarder et synchroniser vos données entre vos appareils, sécuriser et améliorer l'Application."],
        ["3. Base légale", "Exécution du service demandé (RGPD art. 6.1.b), consentement et intérêt légitime à sécuriser l'Application."],
        ["4. Hébergement", "Les données sont hébergées via Google Firebase (authentification et base Firestore), avec des garanties de conformité au RGPD. Les données peuvent être stockées dans l'UE et/ou faire l'objet de transferts encadrés."],
        ["5. Conservation", "Les données sont conservées tant que votre compte est actif. En cas de suppression du compte, elles sont effacées dans un délai raisonnable."],
        ["6. Vos droits", "Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité sur vos données. Pour les exercer, contactez contact@trackmytrade.app. Vous pouvez aussi saisir la CNIL (www.cnil.fr)."],
        ["7. Sécurité", "Authentification sécurisée, règles d'accès restreignant chaque utilisateur à ses propres données, chiffrement des communications."],
        ["8. Stockage local", "L'Application utilise un stockage local nécessaire à son fonctionnement (session, préférences). Aucun traceur publicitaire, aucune publicité."],
      ],
    },
    disclaimer: {
      title: "Avertissement sur les risques",
      sections: [
        ["Absence de conseil", "TrackMyTrade est un outil de suivi statistique personnel. L'Application ne fournit aucun conseil en investissement, aucune recommandation d'achat/vente, ni aucune stratégie de trading. Rien dans l'Application ne doit être interprété comme un conseil financier."],
        ["Risque de perte", "Le trading comporte un risque élevé de perte en capital. Les performances passées ne préjugent pas des performances futures. Vous pouvez perdre tout ou partie de votre capital. N'investissez que des sommes dont la perte n'affecterait pas votre situation."],
        ["Votre responsabilité", "Toutes vos décisions de trading relèvent de votre seule responsabilité. L'éditeur n'est pas responsable des pertes ou manques à gagner résultant de l'utilisation de l'Application."],
        ["Exactitude", "Les analyses reposent sur les données que vous saisissez. Leur pertinence dépend de l'exactitude de vos saisies."],
        ["Recommandation", "Avant toute décision, consultez un conseiller financier habilité et informez-vous auprès de l'AMF. Vous tradez à vos propres risques."],
      ],
    },
  },
  en: {
    mentions: {
      title: "Legal Notice",
      sections: [
        ["Publisher", "TrackMyTrade is published by an individual entrepreneur. The App is currently provided free of charge and involves no billing."],
        ["Contact", "For any question, complaint or data-related request, you can write to: contact@trackmytrade.app"],
        ["Status", "The publisher currently operates without a registered commercial structure, as the App is free and non-commercial. Registration details (business ID) will be added if a commercial activity is set up."],
        ["Hosting", "The App and its data are hosted via Google Firebase — Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland. Web deployment is handled by a cloud host (Vercel / Netlify), with servers located in the EU and/or the United States."],
        ["Ownership", "All elements of the App (code, interface, name, logo) are protected by intellectual property law and remain the exclusive property of the publisher."],
      ],
    },
    cgu: {
      title: "Terms of Use",
      sections: [
        ["1. Purpose", "TrackMyTrade is a personal trading journaling and analysis tool. The App provides no investment advice and is not a portfolio management service."],
        ["2. Access", "The App is currently free. Paid features may be introduced later (freemium model), with terms communicated before any purchase. Access requires an account (email + password). You are responsible for keeping your credentials confidential."],
        ["3. Use", "You agree to use the App lawfully and as intended. You may not attempt to access other users' data, compromise the App's security, or reproduce it without permission."],
        ["4. Your data", "You are solely responsible for the accuracy of the data you enter. Regular exports are recommended. The publisher is not liable for losses resulting from events beyond its reasonable control."],
        ["5. Intellectual property", "The App, its code and interface belong to the publisher. Your trading data remains yours."],
        ["6. Liability", "The App is provided 'as is'. It is not financial advice. The publisher is not liable for trading decisions or resulting financial losses."],
        ["7. Termination", "You may delete your account at any time. The publisher may suspend an account in case of breach of these Terms."],
        ["8. Governing law", "These Terms are governed by French law. French courts have jurisdiction in case of dispute."],
      ],
    },
    privacy: {
      title: "Privacy Policy",
      sections: [
        ["1. Data collected", "Email and password (encrypted, never accessible in clear by the publisher), logged trades, strategy settings and statistics. No banking data is collected."],
        ["2. Purposes", "Manage your account, provide journaling features, save and sync your data across devices, secure and improve the App."],
        ["3. Legal basis", "Performance of the requested service (GDPR art. 6.1.b), consent, and legitimate interest in securing the App."],
        ["4. Hosting", "Data is hosted via Google Firebase (authentication and Firestore), with GDPR compliance guarantees. Data may be stored in the EU and/or subject to framed transfers."],
        ["5. Retention", "Data is kept while your account is active. Upon account deletion, it is erased within a reasonable time."],
        ["6. Your rights", "You have rights of access, rectification, erasure, restriction, objection and portability over your data. To exercise them, contact contact@trackmytrade.app. You may also contact your data protection authority."],
        ["7. Security", "Secure authentication, access rules restricting each user to their own data, encrypted communications."],
        ["8. Local storage", "The App uses local storage necessary for its operation (session, preferences). No advertising trackers, no ads."],
      ],
    },
    disclaimer: {
      title: "Risk Disclaimer",
      sections: [
        ["No advice", "TrackMyTrade is a personal statistical tracking tool. The App provides no investment advice, no buy/sell recommendation, and no trading strategy. Nothing in the App should be interpreted as financial advice."],
        ["Risk of loss", "Trading carries a high risk of capital loss. Past performance does not predict future results. You may lose all or part of your capital. Only invest amounts whose loss would not affect your situation."],
        ["Your responsibility", "All your trading decisions are your sole responsibility. The publisher is not liable for losses or missed gains resulting from use of the App."],
        ["Accuracy", "Analyses rely on the data you enter. Their relevance depends on the accuracy of your input."],
        ["Recommendation", "Before any decision, consult a licensed financial advisor and inform yourself with the relevant authorities. You trade at your own risk."],
      ],
    },
  },
};

function LegalModal({tab:initialTab, lang, neon, onClose}) {
  const [tab,setTab]=useState(initialTab||"cgu");
  const fr=lang==="fr";
  const L=LEGAL_CONTENT[lang]||LEGAL_CONTENT.fr;
  const doc=L[tab]||L.cgu;
  const tabs=[["mentions",fr?"Mentions":"Legal"],["cgu",fr?"CGU":"Terms"],["privacy",fr?"Confidentialité":"Privacy"],["disclaimer",fr?"Risques":"Risk"]];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:18}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${neon}30`,borderRadius:16,width:"100%",maxWidth:520,maxHeight:"88vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 18px 0",borderBottom:`1px solid ${neon}12`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:neon,fontFamily:MONO,letterSpacing:1}}>{fr?"INFORMATIONS LÉGALES":"LEGAL"}</div>
            <button onClick={onClose} className="btn" style={{background:"transparent",border:"none",color:"#ffffff66",cursor:"pointer",display:"inline-flex"}}><Icon name="close" size={16} color="#ffffff66"/></button>
          </div>
          <div style={{display:"flex",gap:4}}>
            {tabs.map(([k,label])=>(
              <button key={k} onClick={()=>setTab(k)} className="btn" style={{flex:1,padding:"9px 2px",borderRadius:"8px 8px 0 0",fontSize:10,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap",background:tab===k?`${neon}14`:"transparent",color:tab===k?neon:"#ffffff77",border:"none",borderBottom:tab===k?`2px solid ${neon}`:"2px solid transparent"}}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{padding:"18px",overflowY:"auto",flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:16,fontFamily:MONO}}>{doc.title}</div>
          {doc.sections.map(([h,body],i)=>(
            <div key={i} style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:neon,marginBottom:5,fontFamily:MONO}}>{h}</div>
              <div style={{fontSize:12,color:"#ffffffbb",lineHeight:1.65,fontFamily:MONO}}>{body}</div>
            </div>
          ))}
          <div style={{fontSize:10,color:"#ffffff66",marginTop:20,lineHeight:1.6,fontFamily:MONO}}>
            {fr?"Contact : ":"Contact: "}
            <a href="mailto:contact@trackmytrade.app" style={{color:neon,textDecoration:"underline"}}>contact@trackmytrade.app</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotifCard({notif,onClose}) {
  const {txt,color,trade,lang:nl,icon}=notif;
  const neon=color||"#00ff9d";
  const fr=(nl||"fr")==="fr";
  const iC=icon==="block"||icon==="stop"?"#ff4d4d":icon==="warn"||icon==="dice"?"#f0b429":neon;
  const parts=(txt||"").split("\n");
  const Icon=()=>{
    if(icon==="fire")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 2c0 5.5-6 7-5 13a7 7 0 0 0 13.5-1.5c-1.5 0-3-1.5-3-4 0 3-3.5 4.5-3.5 7a3.5 3.5 0 0 1-3.5-3.5c0-3 3.5-5.5 3.5-11Z" fill={`${iC}22`} stroke={iC} strokeWidth="1.5"/></svg>;
    if(icon==="ok")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${iC}12`} stroke={iC} strokeWidth="1.5"/><polyline points="7.5,12.5 10.5,15.5 17,8.5" stroke={iC} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    if(icon==="block")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${iC}12`} stroke={iC} strokeWidth="1.5"/><line x1="5" y1="12" x2="19" y2="12" stroke={iC} strokeWidth="2.2" strokeLinecap="round"/></svg>;
    if(icon==="stop")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${iC}12`} stroke={iC} strokeWidth="1.5"/><line x1="12" y1="7" x2="12" y2="14" stroke={iC} strokeWidth="2.4" strokeLinecap="round"/><circle cx="12" cy="17.5" r="1.5" fill={iC}/></svg>;
    if(icon==="warn")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 3L22.5 21H1.5L12 3Z" fill={`${iC}12`} stroke={iC} strokeWidth="1.5" strokeLinejoin="round"/><line x1="12" y1="9.5" x2="12" y2="15" stroke={iC} strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="18" r="1.5" fill={iC}/></svg>;
    if(icon==="dice")return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill={`${iC}12`} stroke={iC} strokeWidth="1.5"/><circle cx="7.5" cy="7.5" r="1.8" fill={iC}/><circle cx="16.5" cy="16.5" r="1.8" fill={iC}/><circle cx="16.5" cy="7.5" r="1.8" fill={iC}/><circle cx="7.5" cy="16.5" r="1.8" fill={iC}/><circle cx="12" cy="12" r="1.8" fill={iC}/></svg>;
    return <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${iC}12`} stroke={iC} strokeWidth="1.5"/><line x1="12" y1="8" x2="12" y2="13" stroke={iC} strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="16.5" r="1.5" fill={iC}/></svg>;
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${iC}30`,borderRadius:20,width:"100%",maxWidth:320,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:iC,opacity:0.85}}/>
        <div style={{padding:"26px 22px 22px"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><Icon/></div>
          <div style={{fontSize:17,fontWeight:700,color:"#ffffff",fontFamily:MONO,lineHeight:1.35,textAlign:"center",marginBottom:parts[1]?8:0}}>{parts[0]}</div>
          {parts[1]&&<div style={{fontSize:12,color:"#ffffffaa",fontFamily:MONO,lineHeight:1.65,textAlign:"center"}}>{parts[1]}</div>}
          {trade&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,margin:"16px 0 4px",padding:"9px 14px",background:`${iC}0d`,borderRadius:10,border:`1px solid ${iC}20`}}>
            <span style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO}}>{trade.asset}</span>
            <span style={{fontSize:10,color:"#ffffffaa"}}>·</span>
            <span style={{fontSize:13,fontWeight:800,color:rc(trade.result,neon),fontFamily:MONO}}>{trade.result}</span>
            {trade.pnlPct!==""&&parseFloat(trade.pnlPct)!==0&&<><span style={{fontSize:10,color:"#ffffffaa"}}>·</span><span style={{fontSize:12,fontWeight:700,color:parseFloat(trade.pnlPct)>=0?neon:"#ff4d4d",fontFamily:MONO}}>{fmtPct(parseFloat(trade.pnlPct))}</span></>}
          </div>}
          <button onClick={onClose} className="btn" style={{width:"100%",marginTop:trade?12:18,background:`${iC}15`,border:`1px solid ${iC}45`,color:iC,borderRadius:10,padding:"11px 0",fontSize:11,fontWeight:700,fontFamily:MONO,letterSpacing:1.5}}>{fr?"COMPRIS":"GOT IT"}</button>
        </div>
      </div>
    </div>
  );
}

function WeeklyRecapModal({trades,lang,neon,onClose,onShareWeek}) {
  const t=T[lang];
  const cutoff=new Date(Date.now()-7*86400000).toISOString().split("T")[0];
  const week=trades.filter(x=>x.date>=cutoff);
  if(week.length<2) return null;
  const wins=week.filter(x=>x.result==="WIN").length;
  const pnl=week.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const wr=Math.round(wins/week.length*100);
  const score=calcDisc(week);
  const sC=score>=8?neon:score>=5?"#f0b429":"#ff4d4d";
  const cC=week.filter(x=>x.conforming).length;
  const rC=week.filter(x=>x.isRevenge).length;
  const cWR=cC?Math.round(week.filter(x=>x.conforming&&x.result==="WIN").length/cC*100):null;
  const nWR=week.length-cC?Math.round(week.filter(x=>!x.conforming&&x.result==="WIN").length/(week.length-cC)*100):null;
  const insights=[];
  if(cWR!==null&&nWR!==null&&Math.abs(cWR-nWR)>=10) insights.push(t.insightConformVsNot.replace("{c}",cWR).replace("{n}",nWR));
  if(rC>0) insights.push(t.insightRevenge.replace("{n}",rC));
  else if(week.length>=3) insights.push(t.insightNoRevenge);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${neon}35`,borderRadius:20,width:"100%",maxWidth:340,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:neon,opacity:0.85}}/>
        <div style={{padding:"24px 22px 22px"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:3,marginBottom:6,fontFamily:MONO}}>{t.weeklySubtitle}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#ffffff",fontFamily:MONO}}>{t.weeklyTitle}</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{l:"WIN RATE",v:`${wr}%`,c:wr>=50?neon:"#ff4d4d"},{l:"P&L",v:fmtPct(pnl),c:pnl>=0?neon:"#ff4d4d"},{l:t.trades.toUpperCase(),v:week.length,c:neon}].map(({l,v,c})=>(
              <div key={l} style={{flex:1,background:`${neon}08`,border:`1px solid ${neon}1a`,borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:MONO,lineHeight:1,textShadow:`0 0 18px ${c}cc, 0 2px 5px rgba(0,0,0,0.6)`}}>{v}</div>
                <div style={{fontSize:8,color:"#ffffffaa",marginTop:4,letterSpacing:1}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{background:`${sC}0d`,border:`1px solid ${sC}30`,borderRadius:12,padding:"12px 16px",marginBottom:14,boxShadow:`0 4px 24px ${sC}14, inset 0 1px 0 ${sC}22`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,fontFamily:MONO,marginBottom:4}}>{t.disciplineLabel}</div>
                <div style={{fontSize:28,fontWeight:800,color:sC,fontFamily:MONO,lineHeight:1,textShadow:`0 0 24px ${sC}cc, 0 2px 8px rgba(0,0,0,0.6)`}}>{score}<span style={{fontSize:14,color:"#ffffff44",textShadow:"none"}}>/10</span></div>
                <div style={{fontSize:9,color:sC,marginTop:3}}>{score>=8?t.disciplineExcellent:score>=6?t.disciplineGood:score>=4?t.disciplineWork:t.disciplinePoor}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:120}}>
                {[{l:t.conformiteLabel,v:Math.round(cC/week.length*100),c:neon},{l:t.sansRevengeLabel,v:Math.round((week.length-rC)/week.length*100),c:rC===0?neon:"#f0b429"}].map(({l,v,c})=>(
                  <div key={l}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:8,color:"#ffffffaa",fontFamily:MONO}}>{l}</span>
                      <span style={{fontSize:9,fontWeight:700,color:c,fontFamily:MONO}}>{v}%</span>
                    </div>
                    <div style={{height:3,background:"#ffffff10",borderRadius:2}}><div style={{width:`${v}%`,height:"100%",background:c,borderRadius:2}}/></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {insights.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
            {insights.map((ins,i)=><div key={i} style={{background:`${neon}06`,border:`1px solid ${neon}15`,borderRadius:8,padding:"8px 12px",fontSize:11,color:"#ffffffbb",fontFamily:MONO,lineHeight:1.5}}>{ins}</div>)}
          </div>}
          <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{onClose();}} className="btn" style={{flex:2,background:`${neon}1a`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"12px 0",fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.weeklyClose}</button>
          <button onClick={()=>{onShareWeek&&onShareWeek();onClose();}} className="btn" style={{flex:1,background:`${neon}0d`,border:`1px solid ${neon}30`,color:neon,borderRadius:10,padding:"12px 0",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>
        </div>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModal({trade,config,onClose,onEdit,onShare,lang,neon,accounts,onReassign}) {
  const t=T[lang];
  const [reassignOpen,setReassignOpen]=useState(false);
  if(!trade) return null;
  const ci=trade.checkin;
  const hasCI=ci&&(ci.humeur||ci.biais);
  const fr=lang==="fr";
  const currentAcc=(accounts||[]).find(a=>a.id===(trade.accountId||"ph_0"))||(accounts||[])[0];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${neon}35`,borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflow:"auto",padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:neon,fontFamily:MONO}}>{t.detailTitle}</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{onEdit(trade);onClose();}} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}26`,color:"#ffffff",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{t.modifyBtn}</button>
            <button onClick={()=>{onShare&&onShare(trade);onClose();}} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}26`,color:"#ffffff",borderRadius:6,padding:"5px 9px",display:"flex",alignItems:"center"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffffaa",fontSize:18,cursor:"pointer"}}>{t.closeBtn}</button>
          </div>
        </div>
        {/* Réaffectation de compte (sélecteur déroulant) */}
        {accounts&&accounts.length>1&&onReassign&&currentAcc&&(()=>{
          const c=currentAcc.color||neon;
          return <div style={{marginBottom:14}}>
            <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{fr?"COMPTE":"ACCOUNT"}</div>
            <div style={{position:"relative"}}>
              <button onClick={()=>setReassignOpen(o=>!o)} className="btn"
                style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:`${c}10`,border:`1px solid ${reassignOpen?c:`${c}28`}`,borderRadius:reassignOpen?"8px 8px 0 0":8,padding:"9px 12px",cursor:"pointer",textAlign:"left"}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}`,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:700,color:"#ffffff",fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{currentAcc.name}{currentAcc.archived?" ⊘":""}</span>
                <span style={{fontSize:9,color:`${c}99`,flexShrink:0,transition:"transform 0.2s",transform:reassignOpen?"rotate(180deg)":"none"}}>▼</span>
              </button>
              {reassignOpen&&<>
                <div onClick={()=>setReassignOpen(false)} style={{position:"fixed",inset:0,zIndex:310}}/>
                <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:311,background:"#0f0f16",border:`1px solid ${c}28`,borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
                  {accounts.filter(a=>a.id!==currentAcc.id).map(acc=>{
                    const ac=acc.color||neon;
                    return <button key={acc.id} onClick={()=>{onReassign(trade.id,acc.id);setReassignOpen(false);}} className="row"
                      style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"10px 12px",cursor:"pointer"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:ac,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,textAlign:"left"}}>{acc.name}{acc.archived?" ⊘":""}</span>
                    </button>;
                  })}
                </div>
              </>}
            </div>
          </div>;
        })()}
        {modOn(config,"revenge")&&trade.isRevenge&&<div style={{background:"rgba(255,77,77,0.1)",border:"1px solid rgba(255,77,77,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#ff4d4d",fontFamily:MONO}}>REVENGE TRADE</div>}
        {modOn(config,"checkin")&&hasCI&&<div style={{background:`${neon}05`,border:`1px solid ${neon}18`,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>CHECK-IN</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {ci.humeur&&<span style={{fontSize:11,padding:"4px 10px",background:`${neon}12`,border:`1px solid ${neon}26`,borderRadius:6,color:"#ffffff",fontFamily:MONO}}>{ci.humeur}</span>}
            {ci.biais&&<span style={{fontSize:11,padding:"4px 10px",background:`${neon}12`,border:`1px solid ${neon}26`,borderRadius:6,color:"#ffffff",fontFamily:MONO}}>{ci.biais}</span>}
          </div>
        </div>}
        <div style={{background:`${rc(trade.result,neon)}10`,border:`1px solid ${rc(trade.result,neon)}35`,borderRadius:10,padding:16,marginBottom:14,borderLeft:`3px solid ${rc(trade.result,neon)}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#ffffff",fontFamily:MONO}}>{trade.asset} · {trade.direction}</div>
              <div style={{fontSize:11,color:"#ffffffaa",marginTop:4}}>{trade.date}{trade.time?" · "+trade.time:""}</div>
              {modOn(config,"postSl")&&trade.slDirection&&<div style={{fontSize:10,marginTop:4,color:trade.slDirection==="with"?neon:"#ff4d4d"}}>{trade.slDirection==="with"?`✓ ${lang==="fr"?"Dans mon sens":"My way"}`:`✗ ${lang==="fr"?"Contre moi":"Against me"}`}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:800,color:rc(trade.result,neon),fontFamily:MONO,textShadow:`0 0 20px ${rc(trade.result,neon)}cc, 0 2px 6px rgba(0,0,0,0.6)`,display:"flex",alignItems:"center",gap:6}}>{trade.result==="WIN"&&<IcoWin neon={neon} size={22}/>}{trade.result==="LOSS"&&<IcoLoss size={22}/>}{trade.result==="BE"&&<IcoBE size={22}/>}{trade.result}</div>
              {trade.pnlPct!==""&&<div style={{fontSize:14,color:parseFloat(trade.pnlPct)>=0?neon:"#ff4d4d",fontWeight:700}}>{fmtPct(parseFloat(trade.pnlPct))}</div>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:1,background:`${neon}0a`,border:`1px solid ${neon}1a`,borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
            <ScoreRing score={trade.setupScore} max={trade.checklistMax||config.items.length} size={44} threshold={config.threshold} neon={neon}/>
            <div>
              <div style={{fontSize:10,color:"#ffffffbb",letterSpacing:1}}>{t.setupScore}</div>
              <div style={{fontSize:12,color:trade.conforming?neon:"#ff4d4d",fontWeight:700,marginTop:3}}>{trade.conforming?t.conformLabel:t.nonConformLabel}</div>
            </div>
          </div>
          {modOn(config,"rejet")&&trade.rejetScore>0&&<div style={{flex:1,background:`${neon}0a`,border:`1px solid ${neon}1a`,borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:28,fontWeight:800,color:trade.rejetScore>=8?neon:trade.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:MONO}}>{trade.rejetScore}</div>
            <div>
              <div style={{fontSize:10,color:"#ffffffbb",letterSpacing:1}}>{t.rejectLabel}</div>
              <div style={{fontSize:11,color:"#ffffffaa",marginTop:3}}>{trade.rejetScore>=8?t.excellent:trade.rejetScore>=5?t.correct:t.weak}</div>
            </div>
          </div>}
        </div>
        <div style={{background:"#131318",border:`1px solid ${neon}14`,borderRadius:8,padding:12,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.checklistDetail}</div>
          {config.items.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #ffffff06"}}>
              <span style={{fontSize:13,color:(trade.checklist||[]).includes(i)?neon:"#ffffff44"}}>{(trade.checklist||[]).includes(i)?"✓":"✗"}</span>
              <span style={{fontSize:11,color:(trade.checklist||[]).includes(i)?"#ffffff":"#ffffffaa"}}>{item}</span>
            </div>
          ))}
        </div>
        {trade.screenshot&&<div style={{marginBottom:14}}><div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.screenshotLabel}</div><img src={trade.screenshot} alt="" style={{width:"100%",borderRadius:8,border:`1px solid ${neon}26`}}/></div>}
        {trade.notes&&<div style={{background:`${neon}04`,border:`1px solid ${neon}10`,borderRadius:8,padding:12}}><div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:6}}>{t.notesLabel}</div><div style={{fontSize:12,color:"#ffffffaa",lineHeight:1.6,fontStyle:"italic"}}>"{trade.notes}"</div></div>}
      </div>
    </div>
  );
}

function ConformityBar({trades,threshold,maxItems,neon,lang}) {
  const t=T[lang];
  const conf=trades.filter(x=>x.setupScore>=threshold);
  const nonConf=trades.filter(x=>x.setupScore<threshold);
  const cWR=conf.length?Math.round(conf.filter(x=>x.result==="WIN").length/conf.length*100):null;
  const nWR=nonConf.length?Math.round(nonConf.filter(x=>x.result==="WIN").length/nonConf.length*100):null;
  const cPct=trades.length?(conf.length/trades.length)*100:50;
  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:16,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{t.conformityTitle} {threshold}/{maxItems}</div>
      <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",marginBottom:14,background:"#ffffff10"}}>
        <div style={{width:`${cPct}%`,background:neon,transition:"width 0.5s"}}/><div style={{flex:1,background:"#ff4d4d44"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1,background:"#ffffff10",border:`1px solid ${neon}28`,borderRadius:8,padding:12}}>
          <div style={{fontSize:9,color:neon,letterSpacing:1,marginBottom:8}}>{t.conformShort}</div>
          <div style={{fontSize:22,fontWeight:800,color:neon,fontFamily:MONO,textShadow:`0 0 20px ${neon}cc, 0 2px 6px rgba(0,0,0,0.6)`}}>{conf.length}</div>
          {cWR!==null&&<div style={{marginTop:8,padding:"4px 8px",background:`${neon}18`,borderRadius:6}}><span style={{fontSize:14,fontWeight:700,color:neon,textShadow:`0 0 12px ${neon}99`}}>{cWR}%</span><span style={{fontSize:10,color:"#ffffffaa",marginLeft:6}}>{t.winRateLabel}</span></div>}
        </div>
        {nonConf.length>0&&<div style={{flex:1,background:"rgba(255,77,77,0.04)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,padding:12}}>
          <div style={{fontSize:9,color:"#ff4d4d",letterSpacing:1,marginBottom:8}}>{t.nonConformShort}</div>
          <div style={{fontSize:22,fontWeight:800,color:"#ff4d4d",fontFamily:MONO,textShadow:"0 0 20px #ff4d4dcc, 0 2px 6px rgba(0,0,0,0.6)"}}>{nonConf.length}</div>
          {nWR!==null&&<div style={{marginTop:8,padding:"4px 8px",background:"rgba(255,77,77,0.15)",borderRadius:6}}><span style={{fontSize:14,fontWeight:700,color:"#ff4d4d",textShadow:"0 0 12px #ff4d4d99"}}>{nWR}%</span><span style={{fontSize:10,color:"#ffffffaa",marginLeft:6}}>{t.winRateLabel}</span></div>}
        </div>}
      </div>
    </div>
  );
}

function PerformanceChart({trades, neon, lang}) {
  const fr = lang === "fr";
  const MONO = "'Geist Mono','IBM Plex Mono',monospace";
  const [active, setActive] = useState(null); // index du point survolé/cliqué
  if(!trades||trades.length<2) return null;

  // P&L cumulé par trade (ordre chronologique réel)
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date)||(Number(a.id)-Number(b.id)));
  let cum = 0;
  const points = sorted.map(t => {
    cum += parseFloat(t.pnlPct)||0;
    return {pnl: parseFloat(t.pnlPct)||0, cum: parseFloat(cum.toFixed(2)), result: t.result, date: t.date};
  });

  const W = 320, H = 104, PAD = {t:16, r:14, b:20, l:34};
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const cums = points.map(p=>p.cum);
  const minV = Math.min(0, ...cums);
  const maxV = Math.max(0, ...cums);
  const range = maxV - minV || 1;

  const toX = i => PAD.l + (i / (points.length-1)) * chartW;
  const toY = v => PAD.t + chartH - ((v - minV) / range) * chartH;
  const zeroY = toY(0);

  const pathD = points.map((p,i) => `${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(points.length-1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  const finalVal = points[points.length-1].cum;
  const finalX = toX(points.length-1);
  const finalY = toY(finalVal);
  const color = finalVal >= 0 ? neon : "#ff4d4d";

  // Format date court : "12 mai" / "May 12"
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso+"T00:00:00");
      const moisFr = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
      const moisEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return fr ? `${d.getDate()} ${moisFr[d.getMonth()]}` : `${moisEn[d.getMonth()]} ${d.getDate()}`;
    } catch(e){ return iso; }
  };

  // Labels Y
  const yLabels = [];
  const step = range / 3;
  for(let i=0;i<=3;i++) {
    const v = minV + step*i;
    yLabels.push({v: parseFloat(v.toFixed(1)), y: toY(v)});
  }

  const firstDate = points[0].date;
  const lastDate = points[points.length-1].date;
  const ap = active!=null ? points[active] : null;

  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:9,color:`${neon}66`,letterSpacing:2,fontFamily:MONO}}>
          {fr?"P&L CUMULÉ":"CUMULATIVE P&L"}
        </div>
        {/* Affiche soit le point actif, soit la valeur finale + sa date */}
        {ap ? (
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontSize:8,color:"#ffffff66",fontFamily:MONO}}>{fmtDate(ap.date)}</span>
            <span style={{fontSize:12,fontWeight:800,color:ap.cum>=0?neon:"#ff4d4d",fontFamily:MONO}}>{ap.cum>=0?"+":""}{ap.cum.toFixed(1)}%</span>
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
            <span style={{fontSize:8,color:"#ffffff44",fontFamily:MONO}}>{fmtDate(lastDate)}</span>
            <span style={{fontSize:12,fontWeight:800,color:color,fontFamily:MONO}}>{finalVal>=0?"+":""}{finalVal.toFixed(1)}%</span>
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible",display:"block"}}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
            <stop offset="60%" stopColor={color} stopOpacity="0.08"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.01"/>
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.55"/>
            <stop offset="100%" stopColor={color} stopOpacity="1"/>
          </linearGradient>
          <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <clipPath id="chartClip"><rect x={PAD.l} y={PAD.t-4} width={chartW} height={chartH+8}/></clipPath>
        </defs>

        {/* Grille */}
        {yLabels.map(({v,y})=>(
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke={neon} strokeOpacity="0.06" strokeWidth="1"/>
            <text x={PAD.l-5} y={y+3} fontFamily={MONO} fontSize="7" fill={neon} fillOpacity="0.32" textAnchor="end">{v>0?"+":""}{v}%</text>
          </g>
        ))}

        {/* Ligne zéro */}
        {minV<0&&maxV>0&&<line x1={PAD.l} y1={zeroY} x2={W-PAD.r} y2={zeroY} stroke={neon} strokeOpacity="0.20" strokeWidth="1" strokeDasharray="4,3"/>}

        {/* Aire + courbe avec glow */}
        <path d={areaD} fill="url(#areaGrad)" clipPath="url(#chartClip)"/>
        <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#chartClip)" filter="url(#glowLine)"/>

        {/* Ligne verticale guide si point actif */}
        {ap && <line x1={toX(active)} y1={PAD.t-4} x2={toX(active)} y2={PAD.t+chartH} stroke={ap.cum>=0?neon:"#ff4d4d"} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3,2"/>}

        {/* Petits points WIN/LOSS/BE */}
        {points.map((p,i)=>(
          <circle key={i} cx={toX(i)} cy={toY(p.cum)} r={active===i?3.5:2.3}
            fill={p.result==="WIN"?neon:p.result==="LOSS"?"#ff4d4d":"#f0b429"}
            opacity={active===null||active===i?0.9:0.4}
            style={{transition:"all 0.12s"}}/>
        ))}

        {/* Point final "tu es ici" : halo pulsant */}
        <circle cx={finalX} cy={finalY} r="9" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="1">
          <animate attributeName="r" values="6;11;6" dur="2.4s" repeatCount="indefinite"/>
          <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite"/>
        </circle>
        <circle cx={finalX} cy={finalY} r="4.5" fill={color} stroke="#0c0c12" strokeWidth="1.5" style={{filter:`drop-shadow(0 0 5px ${color})`}}/>

        {/* Dates aux extrémités */}
        <text x={PAD.l} y={H-5} fontFamily={MONO} fontSize="7" fill={neon} fillOpacity="0.30" textAnchor="start">{fmtDate(firstDate)}</text>
        <text x={W-PAD.r} y={H-5} fontFamily={MONO} fontSize="7" fill={neon} fillOpacity="0.30" textAnchor="end">{fmtDate(lastDate)}</text>

        {/* Zones de survol/clic invisibles pour interactivité */}
        {points.map((p,i)=>(
          <rect key={"h"+i} x={toX(i)-(chartW/points.length/2)} y={PAD.t-6} width={Math.max(6,chartW/points.length)} height={chartH+12}
            fill="transparent" style={{cursor:"pointer"}}
            onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)}
            onClick={()=>setActive(active===i?null:i)}/>
        ))}
      </svg>

      {/* Légende */}
      <div style={{display:"flex",gap:12,marginTop:4}}>
        {[{c:neon,l:"WIN"},{c:"#ff4d4d",l:"LOSS"},{c:"#f0b429",l:"BE"}].map(({c,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
            <span style={{fontSize:8,color:`${neon}44`,fontFamily:MONO}}>{l}</span>
          </div>
        ))}
        <span style={{fontSize:8,color:`${neon}33`,fontFamily:MONO,marginLeft:"auto"}}>{points.length} {fr?"trades":"trades"}</span>
      </div>
    </div>
  );
}


function TradingCalendar({trades,neon,lang}) {
  const t=T[lang];
  const now=new Date();
  const year=now.getFullYear(),month=now.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const dIM=new Date(year,month+1,0).getDate();
  const mN={fr:["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],en:["January","February","March","April","May","June","July","August","September","October","November","December"]};
  const dN={fr:["L","M","M","J","V","S","D"],en:["M","T","W","T","F","S","S"]};
  const byDay={};
  trades.forEach(tr=>{const d=new Date(tr.date);if(d.getMonth()===month&&d.getFullYear()===year){const k=d.getDate();if(!byDay[k])byDay[k]={w:0,l:0,c:0,t:0};byDay[k].t++;if(tr.result==="WIN")byDay[k].w++;else if(tr.result==="LOSS")byDay[k].l++;if(tr.conforming)byDay[k].c++;}});
  const cells=[];const sD=(firstDay+6)%7;
  for(let i=0;i<sD;i++)cells.push(null);
  for(let d=1;d<=dIM;d++)cells.push(d);
  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:12,textTransform:"uppercase"}}>{t.calendarTitle} · {mN[lang][month]} {year}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>{dN[lang].map((d,i)=><div key={i} style={{fontSize:8,color:"#ffffff44",textAlign:"center"}}>{d}</div>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const data=byDay[d];const isToday=d===now.getDate();
          const bg=data?(data.l>data.w?"rgba(255,77,77,0.2)":`${neon}20`):"transparent";
          const tc=data?(data.l>data.w?"#ff4d4d":neon):"#ffffffaa";
          return <div key={i} style={{background:bg,border:isToday?`1px solid ${neon}`:"1px solid transparent",borderRadius:4,padding:"4px 2px",textAlign:"center"}}><div style={{fontSize:10,color:tc,fontFamily:MONO}}>{d}</div></div>;
        })}
      </div>
    </div>
  );
}

function getAdvice(tr,all,lang,neon) {
  if(!tr||all.length<3) return null;
  const fr=lang==="fr";
  const rL=all.slice(0,5).filter(x=>x.result==="LOSS").length;
  if(tr.isRevenge) return {txt:fr?"Pause obligatoire.\nUn revenge trade, ça se paie toujours.":"Mandatory break.\nRevenge trades always cost more.",icon:"block",c:"#ff4d4d"};
  if(rL>=3) return {txt:fr?"3 pertes de suite.\nÉteins l'écran. Reviens demain.":"3 losses in a row.\nClose the screen. Come back tomorrow.",icon:"stop",c:"#ff4d4d"};
  if(tr.result==="LOSS"&&tr.conforming) return {txt:fr?"SL respecté, règles suivies.\nC'est un bon trade perdu.":"SL respected, rules followed.\nThat's a good losing trade.",icon:"ok",c:neon};
  if(tr.result==="LOSS"&&!tr.conforming) return {txt:fr?"Perdu ET non-conforme.\nLe marché t'a montré quelque chose.":"Lost AND non-compliant.\nThe market just showed you something.",icon:"warn",c:"#f0b429"};
  if(tr.result==="WIN"&&!tr.conforming) return {txt:fr?"Gagné sans suivre les règles.\nNe prends pas de mauvaises habitudes.":"Won without following rules.\nDon't build bad habits on luck.",icon:"dice",c:"#f0b429"};
  if(tr.result==="WIN"&&tr.conforming) return {txt:fr?"Setup propre, exécution propre.\nC'est exactement ça.":"Clean setup, clean execution.\nThat's exactly it.",icon:"fire",c:neon};
  return null;
}

function NoTradeButton({onSave,alreadyDone,lang,neon,accounts,activeAccountId}) {
  const t=T[lang];
  const fr=lang==="fr";
  const ntr=NTR[lang]||NTR.fr;
  const [open,setOpen]=useState(false);
  const [reason,setReason]=useState("");
  const [customReason,setCustomReason]=useState("");
  const [acctId,setAcctId]=useState(activeAccountId||null);
  const [acctMenuOpen,setAcctMenuOpen]=useState(false);
  const liveAccounts=Array.isArray(accounts)?accounts.filter(a=>!a.archived):[];
  const hasAccounts=liveAccounts.length>1;
  const selAcc=Array.isArray(accounts)?accounts.find(a=>a.id===(acctId||activeAccountId)):null;
  const selColor=selAcc?(selAcc.color||neon):neon;
  const inSt=mkInput(neon);
  if(alreadyDone) return <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{color:"#ffffff66"}}>⊘</span><span style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO}}>{t.noTradeToday}</span></div>;
  if(!open) return <button onClick={()=>{setOpen(true);setAcctId(activeAccountId||null);}} className="btn" style={{width:"100%",background:"transparent",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,color:"#ffffffaa",fontFamily:MONO,fontSize:12}}><span>⊘</span><span>{t.noTradeToday}</span></button>;
  const finalReason=customReason.trim()||reason;
  return (
    <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,marginBottom:12}}>
      <div style={{fontSize:10,color:"#ffffffaa",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.noTradeReason}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
        {ntr.map(r=><button key={r} onClick={()=>{setReason(reason===r?"":r);setCustomReason("");}} className="btn" style={{background:reason===r&&!customReason?"rgba(255,255,255,0.1)":"#131318",border:`1px solid ${reason===r&&!customReason?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}`,color:reason===r&&!customReason?"#ffffff":"#ffffffbb",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{r}</button>)}
      </div>
      {/* Champ libre */}
      <input value={customReason} onChange={e=>{setCustomReason(e.target.value);if(e.target.value)setReason("");}} placeholder={fr?"Autre raison (optionnel)…":"Other reason (optional)…"} style={{...inSt,marginBottom:hasAccounts?10:12,fontSize:12}}/>
      {/* Sélecteur de compte */}
      {hasAccounts&&<div style={{position:"relative",marginBottom:12}}>
        <div style={{fontSize:8,color:"#ffffff66",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{fr?"COMPTE":"ACCOUNT"}</div>
        <button onClick={()=>setAcctMenuOpen(o=>!o)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:`${selColor}10`,border:`1px solid ${acctMenuOpen?selColor:`${selColor}28`}`,borderRadius:acctMenuOpen?"8px 8px 0 0":8,padding:"8px 12px",cursor:"pointer",textAlign:"left"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:selColor,boxShadow:`0 0 4px ${selColor}`,flexShrink:0}}/>
          <span style={{fontSize:11,fontWeight:700,color:"#ffffff",fontFamily:MONO,flex:1}}>{selAcc?selAcc.name:""}</span>
          <span style={{fontSize:9,color:`${selColor}99`,transition:"transform 0.2s",transform:acctMenuOpen?"rotate(180deg)":"none"}}>▼</span>
        </button>
        {acctMenuOpen&&<>
          <div onClick={()=>setAcctMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
          <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:41,background:"#0f0f16",border:`1px solid ${selColor}28`,borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
            {liveAccounts.filter(a=>a.id!==(acctId||activeAccountId)).map(acc=>(
              <button key={acc.id} onClick={()=>{setAcctId(acc.id);setAcctMenuOpen(false);}} className="row" style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"9px 12px",cursor:"pointer"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:acc.color||neon,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO,flex:1,textAlign:"left"}}>{acc.name}</span>
              </button>
            ))}
          </div>
        </>}
      </div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{onSave({id:Date.now(),date:today(),reason:finalReason,accountId:acctId||activeAccountId||null});setOpen(false);setReason("");setCustomReason("");}} className="btn" style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",color:"#ffffff",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.confirmBtn}</button>
        <button onClick={()=>{setOpen(false);setReason("");setCustomReason("");}} className="btn" style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"#ffffffaa",borderRadius:8,padding:"10px 12px",fontFamily:MONO}}>✕</button>
      </div>
    </div>
  );
}

function NoTradeEditModal({entry,onSave,onDelete,onClose,lang,neon,accounts}) {
  const t=T[lang];
  const fr=lang==="fr";
  const ntr=NTR[lang]||NTR.fr;
  const initIsPreset = entry && ntr.includes(entry.reason);
  const [reason,setReason]=useState(entry&&initIsPreset?entry.reason:"");
  const [customReason,setCustomReason]=useState(entry&&!initIsPreset&&entry.reason?entry.reason:"");
  const [date,setDate]=useState(entry?.date||today());
  const [acctId,setAcctId]=useState(entry?.accountId||(Array.isArray(accounts)&&accounts[0]?.id)||null);
  const [acctMenuOpen,setAcctMenuOpen]=useState(false);
  const liveAccounts=Array.isArray(accounts)?accounts.filter(a=>!a.archived):[];
  const hasAccounts=liveAccounts.length>1;
  const selAcc=Array.isArray(accounts)?accounts.find(a=>a.id===acctId):null;
  const selColor=selAcc?(selAcc.color||neon):neon;
  const inSt=mkInput(neon);
  if(!entry) return null;
  const finalReason=customReason.trim()||reason;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${neon}35`,borderRadius:16,width:"100%",maxWidth:440,maxHeight:"88vh",overflow:"auto",padding:20}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:neon,fontFamily:MONO,display:"flex",alignItems:"center",gap:8}}><span>⊘</span><span>{fr?"Modifier — Pas de trade":"Edit — No trade"}</span></div>
          <button onClick={onClose} className="btn" style={{background:"transparent",border:"none",color:"#ffffff66",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        {/* Date */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:"#ffffff66",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{fr?"DATE":"DATE"}</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inSt,fontSize:12}}/>
        </div>
        {/* Raison prédéfinie */}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:9,color:"#ffffff66",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{t.noTradeReason}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
            {ntr.map(r=><button key={r} onClick={()=>{setReason(reason===r?"":r);setCustomReason("");}} className="btn" style={{background:reason===r&&!customReason?"rgba(255,255,255,0.1)":"#131318",border:`1px solid ${reason===r&&!customReason?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}`,color:reason===r&&!customReason?"#ffffff":"#ffffffbb",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{r}</button>)}
          </div>
          {/* Champ libre */}
          <input value={customReason} onChange={e=>{setCustomReason(e.target.value);if(e.target.value)setReason("");}} placeholder={fr?"Autre raison (optionnel)…":"Other reason (optional)…"} style={{...inSt,fontSize:12}}/>
        </div>
        {/* Sélecteur de compte */}
        {hasAccounts&&<div style={{position:"relative",marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff66",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{fr?"COMPTE":"ACCOUNT"}</div>
          <button onClick={()=>setAcctMenuOpen(o=>!o)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:`${selColor}10`,border:`1px solid ${acctMenuOpen?selColor:`${selColor}28`}`,borderRadius:acctMenuOpen?"8px 8px 0 0":8,padding:"8px 12px",cursor:"pointer",textAlign:"left"}}>
            {selAcc&&<div style={{width:7,height:7,borderRadius:"50%",background:selColor,boxShadow:`0 0 4px ${selColor}`,flexShrink:0}}/>}
            <span style={{fontSize:11,fontWeight:700,color:"#ffffff",fontFamily:MONO,flex:1}}>{selAcc?selAcc.name:(fr?"Aucun compte":"No account")}</span>
            <span style={{fontSize:9,color:`${selColor}99`,transition:"transform 0.2s",transform:acctMenuOpen?"rotate(180deg)":"none"}}>▼</span>
          </button>
          {acctMenuOpen&&<>
            <div onClick={()=>setAcctMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:310}}/>
            <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:311,background:"#0f0f16",border:`1px solid ${selColor}28`,borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
              {liveAccounts.filter(a=>a.id!==acctId).map(acc=>(
                <button key={acc.id} onClick={()=>{setAcctId(acc.id);setAcctMenuOpen(false);}} className="row" style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"9px 12px",cursor:"pointer"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:acc.color||neon,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO,flex:1,textAlign:"left"}}>{acc.name}</span>
                </button>
              ))}
            </div>
          </>}
        </div>}
        {/* Actions */}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{onSave({...entry,date,reason:finalReason,accountId:acctId});onClose();}} className="btn" style={{flex:1,background:`${neon}18`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:11,fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.confirmBtn||"Confirmer"}</button>
          <button onClick={()=>{if(window.confirm(fr?"Supprimer cette entrée ?":"Delete this entry?")){onDelete(entry.id);onClose();}}} className="btn" style={{background:"transparent",border:"1px solid rgba(255,77,77,0.3)",color:"#ff4d4d",borderRadius:8,padding:"11px 14px",fontSize:11,fontFamily:MONO}}>{fr?"Supprimer":"Delete"}</button>
        </div>
      </div>
    </div>
  );
}

function ResetModal({trades,onReset,onClose,lang,neon}) {
  const t=T[lang];
  const [step,setStep]=useState("confirm");
  const doExport=()=>{
    const h=["Date","Asset","Dir","Result","P&L%","Score","Conform","Revenge","Humeur","Biais","Notes"];
    const rows=trades.map(x=>[x.date,x.asset,x.direction,x.result,x.pnlPct,x.setupScore,x.conforming?"Yes":"No",x.isRevenge?"Yes":"No",x.checkin?.humeur||"",x.checkin?.biais||"",`"${(x.notes||"").replace(/"/g,"'")}"`]);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([[h,...rows].map(r=>r.join(",")).join("\n")],{type:"text/csv"}));
    a.download=`tmt-backup-${today()}.csv`;a.click();setStep("exported");
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div className="slide-up" style={{background:"#131318",border:"1px solid rgba(255,77,77,0.3)",borderRadius:20,width:"100%",maxWidth:340,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:"#ff4d4d",opacity:0.8}}/>
        <div style={{padding:"26px 22px 22px"}}>
          {step==="confirm"?(
            <>
              <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 3L22.5 21H1.5L12 3Z" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="1.5" strokeLinejoin="round"/><line x1="12" y1="9.5" x2="12" y2="15" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="18" r="1.5" fill="#ff4d4d"/></svg></div>
              <div style={{fontSize:16,fontWeight:700,color:"#ffffff",fontFamily:MONO,textAlign:"center",marginBottom:8}}>{t.resetTitle}</div>
              <div style={{fontSize:12,color:"#ffffffaa",textAlign:"center",lineHeight:1.65,marginBottom:22}}><span style={{color:"#ff4d4d",fontWeight:700}}>{trades.length}</span> {t.resetWarning}</div>
              <button onClick={doExport} className="btn" style={{width:"100%",background:`${neon}1a`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:MONO,marginBottom:10}}>{t.resetExportBtn}</button>
              <button onClick={onReset} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.25)",color:"#ff4d4d88",borderRadius:10,padding:"10px 0",fontSize:11,fontFamily:MONO,marginBottom:10}}>{t.resetSkipBtn}</button>
              <button onClick={onClose} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#ffffff44",fontSize:11,fontFamily:MONO,padding:"6px 0"}}>{t.resetCancel}</button>
            </>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${neon}10`} stroke={neon} strokeWidth="1.5"/><polyline points="7.5,12.5 10.5,15.5 17,8.5" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <div style={{fontSize:16,fontWeight:700,color:"#ffffff",fontFamily:MONO,textAlign:"center",marginBottom:8}}>{t.resetExportedTitle}</div>
              <div style={{fontSize:12,color:"#ffffffaa",textAlign:"center",lineHeight:1.65,marginBottom:22}}>{t.resetExportedDesc}</div>
              <button onClick={onReset} className="btn" style={{width:"100%",background:"rgba(255,77,77,0.15)",border:"1px solid #ff4d4d",color:"#ff4d4d",borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:MONO,marginBottom:10}}>{t.resetConfirmBtn}</button>
              <button onClick={onClose} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#ffffff44",fontSize:11,fontFamily:MONO,padding:"6px 0"}}>{t.resetCancel}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({onLogin,lang,setLang,neon="#00ff9d"}) {
  const t=T[lang];
  const fr=lang==="fr";
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");const [pwd,setPwd]=useState("");const [confirmPwd,setConfirmPwd]=useState("");
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  const [signupDone,setSignupDone]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const [resetLoading,setResetLoading]=useState(false);
  const [acceptedTerms,setAcceptedTerms]=useState(false);
  const [showLegal,setShowLegal]=useState(null); // null | "cgu" | "privacy" | "disclaimer"
  const inSt=mkInput(neon);
  const pwdPlaceholder=fr?"Mot de passe (6 car. min.)":"Password (6 chars min.)";
  const submit=async()=>{
    setError("");if(!email.trim()||!pwd.trim())return;
    if(pwd.trim().length<6){setError(fr?"Mot de passe trop court (6 car. min.)":"Password too short");return;}
    if(mode==="signup"&&pwd.trim()!==confirmPwd.trim()){setError(t.confirmPwdError);return;}
    if(mode==="signup"&&!acceptedTerms){setError(fr?"Veuillez accepter les conditions et la politique de confidentialité.":"Please accept the terms and privacy policy.");return;}
    if(!db){setError(fr?"Service indisponible, réessayez.":"Service unavailable.");return;}
    setLoading(true);
    try {
      const em=email.trim().toLowerCase();
      if(mode==="login"){
        const result=await authLogin(em,pwd);
        if(result){onLogin({email:em, _uid:result._uid, userData:result});}
        else{setError(t.loginError);setLoading(false);}
      } else {
        const newUid=await authRegister(em,pwd,lang);
        if(newUid){setSignupDone(newUid);setLoading(false);}
        else{setError(t.signupError);setLoading(false);}
      }
    } catch(e){setError(e.message||t.loginError);setLoading(false);}
  };
  // Signup confirmation screen
  if(signupDone) return (
    <div style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <CSS neon={neon}/>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,width:"100%",height:120,overflow:"hidden"}}>
        <GridBackground neon={neon} height={120}/>
        <div style={{position:"relative",zIndex:2}}>
          <SplashLogo neon={neon}/>
        </div>
      </div>
      <div className="slide-up" style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={`${neon}15`} stroke={neon} strokeWidth="1.5"/><polyline points="7,12.5 10.5,16 17,8.5" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{fontSize:20,fontWeight:700,color:"#ffffff",fontFamily:MONO,marginBottom:10}}>{fr?"Compte créé !":"Account created!"}</div>
        <div style={{fontSize:13,color:"#ffffffaa",fontFamily:MONO,lineHeight:1.7,marginBottom:28}}>{fr?`Bienvenue sur TrackMyTrade.\nTon compte est prêt.`:`Welcome to TrackMyTrade.\nYour account is ready.`}</div>
        <button onClick={()=>onLogin({email:email.trim().toLowerCase(),_uid:signupDone,userData:null,isNew:true})} className="btn"
          style={{width:"100%",background:`${neon}22`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,letterSpacing:2}}>
          {fr?"VOIR LE TUTORIEL →":"SEE THE TUTORIAL →"}
        </button>
      </div>
    </div>
  );
  return (
    <div className="app-fade-in" style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <CSS neon={neon}/>
      <div style={{position:"absolute",top:20,right:20,display:"flex",gap:6}}>
        {["fr","en"].map(l=><button key={l} onClick={()=>setLang(l)} className="btn" style={{background:lang===l?`${neon}26`:"transparent",border:`1px solid ${lang===l?neon:`${neon}33`}`,color:lang===l?neon:"#ffffffaa",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,fontFamily:MONO}}>{l.toUpperCase()}</button>)}
      </div>
      <div style={{marginBottom:24}}><SplashLogo neon={neon}/></div>
      <div className="slide-up" style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",fontSize:9,color:"#ffffff44",letterSpacing:4,marginBottom:20,fontFamily:MONO}}>{mode==="login"?t.loginTitle.toUpperCase():t.signupBtn.toUpperCase()}</div>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={t.loginEmailPlaceholder} style={{...inSt,marginBottom:10,fontSize:14}} autoFocus/>
        <input type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={pwdPlaceholder} style={{...inSt,marginBottom:mode==="signup"?10:error?10:16,fontSize:14}}/>
        {mode==="signup"&&<input type="password" value={confirmPwd} onChange={e=>{setConfirmPwd(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={t.confirmPwdPlaceholder} style={{...inSt,marginBottom:12,fontSize:14}}/>}
        {mode==="signup"&&<div onClick={()=>setAcceptedTerms(v=>!v)} style={{display:"flex",alignItems:"flex-start",gap:9,marginBottom:16,cursor:"pointer",padding:"2px 2px"}}>
          <div style={{width:18,height:18,borderRadius:5,border:`1.5px solid ${acceptedTerms?neon:"#ffffff33"}`,background:acceptedTerms?`${neon}22`:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.15s"}}>
            {acceptedTerms&&<Icon name="check" size={12} color={neon}/>}
          </div>
          <div style={{fontSize:10.5,color:"#ffffff99",lineHeight:1.5,fontFamily:MONO}}>
            {fr?"J'accepte les ":"I accept the "}
            <span onClick={e=>{e.stopPropagation();setShowLegal("cgu");}} style={{color:neon,textDecoration:"underline",cursor:"pointer"}}>{fr?"Conditions d'utilisation":"Terms of Use"}</span>
            {fr?", la ":", the "}
            <span onClick={e=>{e.stopPropagation();setShowLegal("privacy");}} style={{color:neon,textDecoration:"underline",cursor:"pointer"}}>{fr?"Politique de confidentialité":"Privacy Policy"}</span>
            {fr?" et l'":" and the "}
            <span onClick={e=>{e.stopPropagation();setShowLegal("disclaimer");}} style={{color:neon,textDecoration:"underline",cursor:"pointer"}}>{fr?"avertissement sur les risques":"Risk Disclaimer"}</span>.
          </div>
        </div>}
        {error&&<div style={{fontSize:11,color:"#ff4d4d",marginBottom:14,padding:"8px 12px",background:"rgba(255,77,77,0.08)",borderRadius:8,border:"1px solid rgba(255,77,77,0.2)"}}>{error}</div>}
        <button onClick={submit} disabled={loading} className="btn"
          style={{width:"100%",background:`${neon}22`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:20,letterSpacing:2}}>
          {loading?"...":(mode==="login"?(fr?"SE CONNECTER":"SIGN IN"):(fr?"CRÉER UN COMPTE":"CREATE ACCOUNT"))}
        </button>
        <div style={{textAlign:"center",display:"flex",flexDirection:"column",gap:10}}>
          {mode==="login"&&(
          resetSent
            ?<div style={{fontSize:11,color:neon,fontFamily:MONO}}>{fr?"Email de réinitialisation envoyé ✓":"Reset email sent ✓"}</div>
            :<button onClick={async()=>{if(!email.trim()){setError(fr?"Entrez votre email d'abord":"Enter your email first");return;}setResetLoading(true);try{await sendPasswordResetEmail(auth,email.trim().toLowerCase());setResetSent(true);}catch(e){setError(fr?"Email introuvable":"Email not found");}finally{setResetLoading(false);}}} style={{background:"transparent",border:"none",color:`${neon}55`,fontSize:11,cursor:"pointer",fontFamily:MONO,textDecoration:"underline"}}>
              {resetLoading?(fr?"Envoi…":"Sending…"):(fr?"Mot de passe oublié ?":"Forgot password?")}
            </button>
        )}
          <div style={{fontSize:11,color:"#ffffff44",fontFamily:MONO}}>
            {mode==="login"?t.loginSwitch:t.signupSwitch}{" "}
            <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setConfirmPwd("");}} style={{background:"transparent",border:"none",color:neon,fontSize:11,cursor:"pointer",fontFamily:MONO,textDecoration:"underline"}}>{mode==="login"?t.signupBtn:t.loginTitle}</button>
          </div>
          {mode==="login"&&<div style={{fontSize:10,color:"#ffffff55",fontFamily:MONO,marginTop:4}}>
            <span onClick={()=>setShowLegal("cgu")} style={{cursor:"pointer",textDecoration:"underline"}}>{fr?"CGU":"Terms"}</span>{" · "}
            <span onClick={()=>setShowLegal("privacy")} style={{cursor:"pointer",textDecoration:"underline"}}>{fr?"Confidentialité":"Privacy"}</span>{" · "}
            <span onClick={()=>setShowLegal("disclaimer")} style={{cursor:"pointer",textDecoration:"underline"}}>{fr?"Risques":"Risk"}</span>
          </div>}
        </div>
      </div>
      {showLegal&&<LegalModal tab={showLegal} lang={lang} neon={neon} onClose={()=>setShowLegal(null)}/>}
    </div>
  );
}

function SplashScreen({onDone,neon}) {
  const canvasRef=useRef();
  const rafRef=useRef();
  const startRef=useRef(null);
  const isMobile=window.innerWidth<600;
  const boxSize=isMobile?80:150;
  const svgSize=isMobile?46:88;
  const fontSize=isMobile?34:70;
  const gap=isMobile?16:30;

  useEffect(()=>{
    const done=setTimeout(onDone,2600);
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const cols=11,rows=19,cw=W/cols,rh=H/rows;
    const hex=neon; // "#00ff9d"
    const PTS=[[52,88],[248,65],[32,215],[268,192],[142,35],[72,335],[232,305],[25,445],[275,382],[115,488],[195,452],[45,532],[255,515],[128,148],[185,348],[88,188],[218,162],[158,545],[38,308],[262,458]];

    const animate=ts=>{
      if(!startRef.current)startRef.current=ts;
      const t=(ts-startRef.current)/1000;
      ctx.clearRect(0,0,W,H);

      // Grille pulsante
      for(let r=0;r<=rows;r++){
        for(let c=0;c<=cols;c++){
          const cx=c*cw,cy=r*rh;
          const dist=Math.hypot(cx-W/2,cy-H/2)/185;
          const wave=Math.sin(t*1.5-dist*4.5)*0.5+0.5;
          const op=wave*(1-Math.min(1,dist*0.75))*0.42;
          if(op<0.02)continue;
          ctx.beginPath();
          ctx.arc(cx,cy,1.4,0,Math.PI*2);
          ctx.fillStyle=`${hex}${Math.round(op*255).toString(16).padStart(2,"0")}`;
          ctx.fill();
          // Lignes grille vers droite et bas
          if(r<rows&&c<cols){
            const lineOp=wave*(1-Math.min(1,dist*0.85))*0.1;
            if(lineOp>0.01){
              ctx.strokeStyle=`${hex}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;
              ctx.lineWidth=0.4;
              ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+cw,cy);ctx.stroke();
              ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+rh);ctx.stroke();
            }
          }
        }
      }

      // Particules flottantes
      const pts=PTS.map(([x,y],i)=>({
        x:x+Math.sin(t*1.05+i*1.4)*9,
        y:y+Math.cos(t*0.88+i*0.75)*7,
        op:0.35+Math.sin(t*1.4+i*0.9)*0.18,
        r:1.2+(i%4)*0.55,
      }));

      // Connexions
      for(let i=0;i<pts.length;i++){
        for(let j=i+1;j<pts.length;j++){
          const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);
          if(d>110)continue;
          const lineOp=(1-d/110)*0.18;
          ctx.strokeStyle=`${hex}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;
          ctx.lineWidth=0.5;
          ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();
        }
      }

      // Halos + points
      for(let i=0;i<pts.length;i++){
        const p=pts[i];
        // Halo flou
        const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r+4);
        grad.addColorStop(0,`${hex}${Math.round(p.op*0.3*255).toString(16).padStart(2,"0")}`);
        grad.addColorStop(1,"transparent");
        ctx.beginPath();ctx.arc(p.x,p.y,p.r+4,0,Math.PI*2);
        ctx.fillStyle=grad;ctx.fill();
        // Point net
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=`${hex}${Math.round(p.op*255).toString(16).padStart(2,"0")}`;
        ctx.fill();
      }

      rafRef.current=requestAnimationFrame(animate);
    };
    rafRef.current=requestAnimationFrame(animate);
    return()=>{clearTimeout(done);cancelAnimationFrame(rafRef.current);};
  },[]);

  return (
    <div style={{background:"#07070d",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Geist Mono','IBM Plex Mono',monospace",overflow:"hidden",position:"relative"}}>
      <CSS neon={neon}/>

      {/* Fond radial fixe */}
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 75% 60% at 50% 50%,${neon}12,transparent 68%)`,pointerEvents:"none",zIndex:1}}/>

      {/* Canvas — zIndex 1, derrière le logo */}
      <canvas ref={canvasRef} width={300} height={580}
        style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:1,maxWidth:"100%"}}/>

      {/* Logo — zIndex 10, toujours devant */}
      <div style={{position:"relative",zIndex:10,display:"flex",alignItems:"center",gap,animation:"slideFromLeft 0.95s cubic-bezier(0.34,1.3,0.64,1) 0.15s both"}}>
        <div style={{width:boxSize,height:boxSize,borderRadius:isMobile?18:32,background:`linear-gradient(135deg,${neon}22,${neon}08)`,border:`1.5px solid ${neon}65`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 50px ${neon}55,0 0 18px ${neon}22,inset 0 1px 0 ${neon}35`,position:"relative",overflow:"hidden",animation:"logoBoxGlow 3s ease-in-out infinite",flexShrink:0}}>
          <div style={{position:"absolute",top:-4,left:-4,width:"55%",height:"55%",background:`linear-gradient(135deg,${neon}20,transparent 70%)`,borderRadius:"0 0 60% 0"}}/>
          <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 22,12 12,22 2,12" fill={`${neon}22`} stroke={neon} strokeWidth="1.5" strokeLinejoin="round"/>
            <polygon points="12,7 17,12 12,17 7,12" fill={neon} style={{filter:`drop-shadow(0 0 7px ${neon})`}}/>
          </svg>
        </div>
        <div style={{animation:"slideFromRight 0.95s cubic-bezier(0.34,1.3,0.64,1) 0.15s both"}}>
          <div style={{fontSize,fontWeight:900,letterSpacing:-2,lineHeight:1,whiteSpace:"nowrap",textShadow:`0 0 50px ${neon}55`}}>
            <b style={{color:neon}}>Track</b><span style={{color:"#ffffff1a",fontWeight:300}}>My</span><b style={{color:neon}}>Trade</b>
          </div>
          <div style={{fontSize:isMobile?8:11,color:`${neon}55`,letterSpacing:isMobile?4:6,marginTop:10,animation:"fadeInSlow 0.6s ease 0.8s both"}}>JOURNAL DE TRADING</div>
        </div>
      </div>

      {/* Dots CSS — pas de state */}
      <div style={{position:"absolute",bottom:44,display:"flex",gap:8,zIndex:10}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:6,height:6,borderRadius:3,background:`${neon}22`,animation:`dotPulse 2.2s ease-in-out ${i*0.55}s infinite`}}/>
        ))}
      </div>
    </div>
  );
}


// ── ICÔNES ANIMÉES ──
function IcoWin({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="14" stroke={neon} strokeWidth="1.2" fill={neon+"08"} style={{animation:"icoRadar 2s ease-out infinite",transformOrigin:"19px 19px"}}/>
      <circle cx="19" cy="19" r="14" stroke={neon} strokeWidth="1.2" fill="none" opacity="0.25"/>
      <polyline points="11.5,19.5 16,24.5 27,13" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" style={{animation:"icoCheck 0.5s ease 0.15s both"}}/>
    </svg>
  );
}

function IcoLoss({size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="14" stroke="#ff4d4d" strokeWidth="1.2" fill="#ff4d4d08"/>
      <line x1="12" y1="12" x2="26" y2="26" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="22" style={{animation:"icoX 0.3s ease 0.1s both"}}/>
      <line x1="26" y1="12" x2="12" y2="26" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="22" style={{animation:"icoX 0.3s ease 0.25s both"}}/>
    </svg>
  );
}

function IcoBE({size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="14" stroke="#f0b429" strokeWidth="1.2" fill="#f0b42908"/>
      <line x1="11" y1="19" x2="27" y2="19" stroke="#f0b429" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="11" y1="15" x2="19" y2="19" stroke="#f0b429" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      <line x1="19" y1="19" x2="27" y2="23" stroke="#f0b429" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  );
}

function IcoWarn({size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoBounce 1.4s ease-in-out infinite 0.4s"}}>
      <path d="M19 7L34 31H4L19 7Z" stroke="#f0b429" strokeWidth="1.3" strokeLinejoin="round" fill="#f0b42910"/>
      <line x1="19" y1="16" x2="19" y2="23" stroke="#f0b429" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="19" cy="27" r="1.5" fill="#f0b429"/>
    </svg>
  );
}

function IcoBlock({size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoShake 0.55s ease 0.3s both"}}>
      <circle cx="19" cy="19" r="14" stroke="#ff4d4d" strokeWidth="1.3" fill="#ff4d4d08"/>
      <line x1="8" y1="8" x2="30" y2="30" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IcoTip({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="4.5" stroke="#00d4ff" strokeWidth="1.5" style={{animation:"icoPulse 2s ease-in-out infinite"}}/>
      <g style={{animation:"icoSpin 7s linear infinite",transformOrigin:"19px 19px"}}>
        <line x1="19" y1="4" x2="19" y2="8" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="19" y1="30" x2="19" y2="34" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4" y1="19" x2="8" y2="19" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="30" y1="19" x2="34" y2="19" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
        <line x1="8.5" y1="8.5" x2="11.5" y2="11.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
        <line x1="26.5" y1="26.5" x2="29.5" y2="29.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
        <line x1="29.5" y1="8.5" x2="26.5" y2="11.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
        <line x1="11.5" y1="26.5" x2="8.5" y2="29.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
      </g>
    </svg>
  );
}

function IcoFlame({size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <g style={{animation:"icoFlame 0.9s ease-in-out infinite",transformOrigin:"19px 34px"}}>
        <path d="M19 5 C19 5 29 15 29 24 C29 31 24.5 37 19 38 C13.5 37 9 31 9 24 C9 15 19 5 19 5Z" stroke="#ff4d4d" strokeWidth="1.3" strokeLinejoin="round" fill="#ff4d4d0d"/>
      </g>
      <g style={{animation:"icoFlame2 0.7s ease-in-out infinite 0.1s",transformOrigin:"19px 34px"}}>
        <path d="M19 15 C19 15 25 21 25 27 C25 31.5 22.5 35.5 19 37 C15.5 35.5 13 31.5 13 27 C13 21 19 15 19 15Z" fill="#f0b429" fillOpacity="0.25" stroke="#f0b429" strokeWidth="0.8" strokeLinejoin="round"/>
      </g>
      <g style={{animation:"icoFlame 0.6s ease-in-out infinite 0.2s",transformOrigin:"19px 35px"}}>
        <path d="M19 24 C18 22 17 20 18 18 C19 20 21 21 19 28Z" fill="#f0b429" fillOpacity="0.6"/>
      </g>
    </svg>
  );
}

function IcoClock({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="13" stroke={neon} strokeWidth="1.2" fill={neon+"06"} opacity="0.7"/>
      <line x1="19" y1="11" x2="19" y2="19" stroke={neon} strokeWidth="2" strokeLinecap="round" style={{animation:"icoClock 3s linear infinite",transformOrigin:"19px 19px"}}/>
      <line x1="19" y1="19" x2="24.5" y2="22.5" stroke={neon} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="19" cy="19" r="1.8" fill={neon}/>
    </svg>
  );
}

function IcoDiamond({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <g style={{animation:"icoDiamond 5s linear infinite",transformOrigin:"19px 19px"}}>
        <polygon points="19,5 33,19 19,33 5,19" stroke={neon} strokeWidth="1.2" fill={neon+"0a"}/>
      </g>
      <polygon points="19,12 26,19 19,26 12,19" fill={neon} fillOpacity="0.3" style={{animation:"icoPulse 2s ease-in-out infinite"}}/>
    </svg>
  );
}

function IcoHumeur({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <circle cx="19" cy="19" r="9" stroke={neon} strokeWidth="1.2" fill={neon+"08"} style={{animation:"icoHeartbeat 1.8s ease-in-out infinite 0.5s",transformOrigin:"19px 19px"}}/>
      <circle cx="19" cy="19" r="4" fill={neon} fillOpacity="0.4" style={{animation:"icoPulse 1.8s ease-in-out infinite 0.5s",transformOrigin:"19px 19px"}}/>
      <circle cx="19" cy="19" r="15" stroke={neon} strokeWidth="0.6" fill="none" style={{animation:"icoRadar 2.5s ease-out infinite",transformOrigin:"19px 19px"}}/>
    </svg>
  );
}

function IcoActif({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <polyline points="4,28 10,20 16,24 22,14 28,18 34,8" stroke={neon} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" style={{animation:"icoDraw 1.2s ease 0.2s both"}}/>
      <line x1="4" y1="32" x2="34" y2="32" stroke={neon} strokeWidth="0.8" opacity="0.2"/>
      <circle cx="34" cy="8" r="2.5" fill={neon} fillOpacity="0.6" style={{animation:"icoPulse 1.5s ease-in-out infinite"}}/>
    </svg>
  );
}

function IcoStar({neon,size=32}) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoPop 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both"}}>
      <polygon points="19,5 22.5,14.5 33,14.5 24.5,20.5 27.5,31 19,25 10.5,31 13.5,20.5 5,14.5 15.5,14.5" stroke={neon} strokeWidth="1.2" strokeLinejoin="round" fill={neon+"12"}/>
    </svg>
  );
}

// ── RÉSUMÉ COMPLET MODERNISÉ ──
function StatsInsightsModal({trades:tradesProp,lang,neon,onClose,accounts,activeAccountId}) {
  const fr=lang==="fr";
  const MONO2="'Geist Mono','IBM Plex Mono',monospace";
  const hasAccounts=Array.isArray(accounts)&&accounts.length>1;
  const [acctFilter,setAcctFilter]=useState(hasAccounts?(activeAccountId||"ALL"):"ALL");
  const [acctMenuOpen,setAcctMenuOpen]=useState(false);
  const allTrades=Array.isArray(tradesProp)?tradesProp:[];
  if(allTrades.length<3) return null;
  const selAcc=hasAccounts?accounts.find(a=>a.id===acctFilter):null;
  const selColor=selAcc?(selAcc.color||neon):neon;
  // "trades" = trades filtrés par compte (le reste du composant utilise "trades")
  const trades=acctFilter==="ALL"?allTrades:allTrades.filter(x=>(x.accountId||"ph_0")===acctFilter);

  const wins=trades.filter(x=>x.result==="WIN");
  const losses=trades.filter(x=>x.result==="LOSS");
  const wr=trades.length?Math.round(wins.length/trades.length*100):0;
  const avgWin=wins.length?wins.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/wins.length:0;
  const avgLoss=losses.length?Math.abs(losses.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/losses.length):0;
  const ratio=avgLoss>0?(avgWin/avgLoss):0;
  const grossWin=wins.reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
  const grossLoss=losses.reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
  const pf=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0);
  const pfStr=pf===Infinity?"∞":pf.toFixed(2);
  const pfColor=pf>=1.5?neon:pf>=1?"#f0b429":"#ff4d4d";
  const totalPnl=trades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const fmtP=v=>{const n=Number(v),a=Math.abs(n);return`${n>=0?"+":""}${a%1===0?a.toFixed(0):a.toFixed(1)}%`;};

  const conf=trades.filter(x=>x.conforming);
  const nconf=trades.filter(x=>!x.conforming);
  const confWR=conf.length?Math.round(conf.filter(x=>x.result==="WIN").length/conf.length*100):0;
  const nconfWR=nconf.length?Math.round(nconf.filter(x=>x.result==="WIN").length/nconf.length*100):0;
  const revs=trades.filter(x=>x.isRevenge);
  const disc=Math.round((conf.length/trades.length*0.6+(1-revs.length/trades.length)*0.4)*10);
  const discC=disc>=8?neon:disc>=5?"#f0b429":"#ff4d4d";
  const confPct=trades.length?Math.round(conf.length/trades.length*100):0;
  const noRevPct=trades.length?Math.round((1-revs.length/trades.length)*100):100;

  // Par jour
  const daysFr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  const daysEn=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const byDay={};
  trades.forEach(x=>{const d=new Date(x.date).getDay();if(!byDay[d])byDay[d]={w:0,t:0};byDay[d].t++;if(x.result==="WIN")byDay[d].w++;});
  const dayStats=Object.entries(byDay).filter(([,v])=>v.t>=2).map(([d,v])=>({day:(fr?daysFr:daysEn)[d],wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);

  // Par actif
  const byAsset={};
  trades.forEach(x=>{if(!byAsset[x.asset])byAsset[x.asset]={w:0,t:0,pnl:0};byAsset[x.asset].t++;byAsset[x.asset].pnl+=parseFloat(x.pnlPct)||0;if(x.result==="WIN")byAsset[x.asset].w++;});
  const assetStats=Object.entries(byAsset).filter(([,v])=>v.t>=2).map(([a,v])=>({a,wr:Math.round(v.w/v.t*100),pnl:parseFloat(v.pnl.toFixed(1)),t:v.t})).sort((a,b)=>b.wr-a.wr);

  // Par heure
  const byHour={};
  trades.filter(x=>x.time).forEach(x=>{const h=parseInt(x.time.split(":")[0]);const k=`${h}h`;if(!byHour[k])byHour[k]={w:0,t:0};byHour[k].t++;if(x.result==="WIN")byHour[k].w++;});
  const hourStats=Object.entries(byHour).filter(([,v])=>v.t>=2).map(([h,v])=>({h,wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);

  // Humeur
  const byHumeur={};
  trades.filter(x=>x.checkin&&x.checkin.humeur).forEach(x=>{const h=x.checkin.humeur;if(!byHumeur[h])byHumeur[h]={w:0,t:0};byHumeur[h].t++;if(x.result==="WIN")byHumeur[h].w++;});
  const humeurStats=Object.entries(byHumeur).filter(([,v])=>v.t>=2).map(([h,v])=>({h,wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);

  // Rejet
  const highRejet=trades.filter(x=>x.rejetScore>=8);
  const lowRejet=trades.filter(x=>x.rejetScore>0&&x.rejetScore<8);
  const highRWR=highRejet.length?Math.round(highRejet.filter(x=>x.result==="WIN").length/highRejet.length*100):null;
  const lowRWR=lowRejet.length?Math.round(lowRejet.filter(x=>x.result==="WIN").length/lowRejet.length*100):null;

  // Insights texte
  const insights=[];
  if(fr){
    insights.push({type:"global",icon:"diamond",txt:`Sur ${trades.length} trades, tu affiches ${wr}% WR pour ${fmtP(totalPnl)} de P&L total. ${wr>=55?"Ton edge est réel.":wr>=45?"Proche de l'équilibre.":"Travaille la sélection des setups."} Ratio G/P : ${ratio.toFixed(2)} · Profit Factor : ${pfStr}${pf>=1.5?" — excellent.":pf>=1?" — correct.":" — à améliorer."} Discipline : ${disc}/10.`});
    if(conf.length>=2&&nconf.length>=2) insights.push({type:confWR-nconfWR>10?"good":"warn",icon:confWR-nconfWR>10?"check":"warn",txt:`Conformes : ${confWR}% WR vs ${nconfWR}% non-conformes.${confWR-nconfWR>10?` +${confWR-nconfWR}% quand tu respectes tes règles.`:""}`});
    if(assetStats.length>=2) insights.push({type:"asset",icon:"actif",txt:`${assetStats[0].a} est ton meilleur actif (${assetStats[0].wr}% WR, ${fmtP(assetStats[0].pnl)}).${assetStats[assetStats.length-1].wr<40?` Évite ${assetStats[assetStats.length-1].a} — seulement ${assetStats[assetStats.length-1].wr}% WR.`:""}`});
    if(dayStats.length>=2) insights.push({type:dayStats[dayStats.length-1].wr<40?"warn":"day",icon:"clock",txt:`Tu trades mieux le ${dayStats[0].day} (${dayStats[0].wr}% WR).${dayStats[dayStats.length-1].wr<40?` Le ${dayStats[dayStats.length-1].day} est ta pire journée (${dayStats[dayStats.length-1].wr}% WR).`:""}`});
    if(hourStats.length>=1) insights.push({type:"hour",icon:"clock",txt:`Meilleure plage : autour de ${hourStats[0].h} avec ${hourStats[0].wr}% WR sur ${hourStats[0].t} trades.`});
    if(humeurStats.length>=2) insights.push({type:humeurStats[humeurStats.length-1].wr<40?"warn":"mood",icon:"humeur",txt:`En état "${humeurStats[0].h}" : ${humeurStats[0].wr}% WR. En état "${humeurStats[humeurStats.length-1].h}" : ${humeurStats[humeurStats.length-1].wr}%.${humeurStats[humeurStats.length-1].wr<40?" Ne trade pas dans cet état.":""}`});
    if(highRWR!==null&&lowRWR!==null) insights.push({type:highRWR>lowRWR?"good":"neutral",icon:"star",txt:`Rejet ≥8 : ${highRWR}% WR vs ${lowRWR}% avec rejet <8.${highRWR-lowRWR>15?" La qualité du rejet change tout.":""}`});
    if(revs.length>0) insights.push({type:"danger",icon:"flame",txt:`${revs.length} revenge trade${revs.length>1?"s":""} — ${Math.round(revs.filter(x=>x.result==="LOSS").length/revs.length*100)}% de pertes. Stop.`});
  } else {
    insights.push({type:"global",icon:"diamond",txt:`Over ${trades.length} trades, ${wr}% WR for ${fmtP(totalPnl)} P&L. ${wr>=55?"Your edge is real.":wr>=45?"Near breakeven.":"Work on setup selection."} R/R: ${ratio.toFixed(2)} · Profit Factor: ${pfStr}. Discipline: ${disc}/10.`});
    if(conf.length>=2&&nconf.length>=2) insights.push({type:confWR-nconfWR>10?"good":"warn",icon:confWR-nconfWR>10?"check":"warn",txt:`Compliant: ${confWR}% WR vs ${nconfWR}% non-compliant.${confWR-nconfWR>10?` +${confWR-nconfWR}% when following rules.`:""}`});
    if(assetStats.length>=2) insights.push({type:"asset",icon:"actif",txt:`${assetStats[0].a} is your best asset (${assetStats[0].wr}% WR, ${fmtP(assetStats[0].pnl)}).${assetStats[assetStats.length-1].wr<40?` Avoid ${assetStats[assetStats.length-1].a} — only ${assetStats[assetStats.length-1].wr}% WR.`:""}`});
    if(dayStats.length>=2) insights.push({type:dayStats[dayStats.length-1].wr<40?"warn":"day",icon:"clock",txt:`Best day: ${dayStats[0].day} (${dayStats[0].wr}% WR).${dayStats[dayStats.length-1].wr<40?` Worst: ${dayStats[dayStats.length-1].day} (${dayStats[dayStats.length-1].wr}% WR).`:""}`});
    if(hourStats.length>=1) insights.push({type:"hour",icon:"clock",txt:`Best window: around ${hourStats[0].h} with ${hourStats[0].wr}% WR over ${hourStats[0].t} trades.`});
    if(humeurStats.length>=2) insights.push({type:humeurStats[humeurStats.length-1].wr<40?"warn":"mood",icon:"humeur",txt:`"${humeurStats[0].h}": ${humeurStats[0].wr}% WR. "${humeurStats[humeurStats.length-1].h}": ${humeurStats[humeurStats.length-1].wr}%.${humeurStats[humeurStats.length-1].wr<40?" Don't trade in that state.":""}`});
    if(highRWR!==null&&lowRWR!==null) insights.push({type:highRWR>lowRWR?"good":"neutral",icon:"star",txt:`Rejection ≥8: ${highRWR}% WR vs ${lowRWR}% with lower rejection.${highRWR-lowRWR>15?" Quality rejection matters.":""}`});
    if(revs.length>0) insights.push({type:"danger",icon:"flame",txt:`${revs.length} revenge trade${revs.length>1?"s":""} — ${Math.round(revs.filter(x=>x.result==="LOSS").length/revs.length*100)}% loss rate. Stop.`});
  }

  const typeColor={global:neon,good:neon,warn:"#f0b429",danger:"#ff4d4d",asset:neon,day:"#f0b429",hour:neon,mood:"#f0b429",neutral:neon};

  const renderIcon=(icon,color,sz=22)=>{
    if(icon==="check") return <IcoWin neon={color} size={sz}/>;
    if(icon==="warn") return <IcoWarn size={sz}/>;
    if(icon==="flame") return <IcoFlame size={sz}/>;
    if(icon==="clock") return <IcoClock neon={color} size={sz}/>;
    if(icon==="diamond") return <IcoDiamond neon={color} size={sz}/>;
    if(icon==="humeur") return <IcoHumeur neon={color} size={sz}/>;
    if(icon==="actif") return <IcoActif neon={color} size={sz}/>;
    if(icon==="star") return <IcoStar neon={color} size={sz}/>;
    return <IcoDiamond neon={color} size={sz}/>;
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="slide-up" style={{background:"#0f0f18",border:`1px solid ${neon}28`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",paddingBottom:40}} onClick={e=>e.stopPropagation()}>
        {/* Barre top */}
        <div style={{height:3,background:neon,opacity:0.7,borderRadius:"20px 20px 0 0"}}/>
        {/* Header sticky */}
        <div style={{position:"sticky",top:0,background:"#0f0f18",padding:"16px 20px 12px",borderBottom:`1px solid ${neon}10`,zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <IcoDiamond neon={neon} size={22}/>
              <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:MONO2}}>{fr?"RÉSUMÉ COMPLET":"FULL SUMMARY"}</div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}55`,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontSize:10,color:`${neon}33`,marginTop:4,fontFamily:MONO2}}>{trades.length} {fr?"trades analysés":"trades analyzed"}</div>
          {/* Sélecteur de compte */}
          {hasAccounts&&<div style={{position:"relative",marginTop:10}}>
            <button onClick={()=>setAcctMenuOpen(o=>!o)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",gap:8,background:`${selColor}10`,border:`1px solid ${acctMenuOpen?selColor:`${selColor}28`}`,borderRadius:acctMenuOpen?"8px 8px 0 0":8,padding:"8px 12px",cursor:"pointer",textAlign:"left"}}>
              {acctFilter!=="ALL"&&<div style={{width:7,height:7,borderRadius:"50%",background:selColor,boxShadow:`0 0 4px ${selColor}`,flexShrink:0}}/>}
              <span style={{fontSize:11,fontWeight:700,color:"#ffffff",fontFamily:MONO2,flex:1}}>{acctFilter==="ALL"?(fr?"Tous les comptes":"All accounts"):(selAcc?selAcc.name:"")}</span>
              <span style={{fontSize:9,color:`${selColor}99`,transition:"transform 0.2s",transform:acctMenuOpen?"rotate(180deg)":"none"}}>▼</span>
            </button>
            {acctMenuOpen&&<>
              <div onClick={()=>setAcctMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:410}}/>
              <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:411,background:"#0f0f16",border:`1px solid ${selColor}28`,borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden",maxHeight:200,overflowY:"auto",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
                {[{id:"ALL",name:fr?"Tous les comptes":"All accounts",color:neon},...accounts].filter(a=>a.id!==acctFilter).map(acc=>(
                  <button key={acc.id} onClick={()=>{setAcctFilter(acc.id);setAcctMenuOpen(false);}} className="row" style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"9px 12px",cursor:"pointer"}}>
                    {acc.id!=="ALL"&&<div style={{width:6,height:6,borderRadius:"50%",background:acc.color||neon,flexShrink:0}}/>}
                    <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO2,flex:1,textAlign:"left"}}>{acc.name}{acc.archived?" ⊘":""}</span>
                  </button>
                ))}
              </div>
            </>}
          </div>}
        </div>

        {/* KPI animés */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"16px 20px 8px"}}>
          {[
            {l:"WIN RATE",v:`${wr}%`,c:wr>=50?neon:"#ff4d4d",delay:"0.05s"},
            {l:"P&L",v:fmtP(totalPnl),c:totalPnl>=0?neon:"#ff4d4d",delay:"0.12s"},
            {l:"TRADES",v:`${trades.length}`,c:neon,delay:"0.19s"},
          ].map(({l,v,c,delay})=>(
            <div key={l} style={{background:`${c}0c`,border:`1px solid ${c}22`,borderRadius:10,padding:"10px 0",textAlign:"center",animation:`kpiPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay} both`}}>
              <div style={{fontSize:8,color:`${neon}44`,fontFamily:MONO2,letterSpacing:1,marginBottom:4}}>{l}</div>
              <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:MONO2,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>

        {/* KPI ligne 2 : Ratio G/P + Profit Factor */}
        {(wins.length>0||losses.length>0)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 20px 8px"}}>
          {[
            {l:fr?"RATIO G/P":"WIN/LOSS",v:ratio>0?ratio.toFixed(2):"—",c:ratio>=1?neon:"#f0b429",delay:"0.24s"},
            {l:"PROFIT FACTOR",v:pfStr,c:pfColor,delay:"0.3s"},
          ].map(({l,v,c,delay})=>(
            <div key={l} style={{background:`${c}0c`,border:`1px solid ${c}22`,borderRadius:10,padding:"10px 0",textAlign:"center",animation:`kpiPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay} both`}}>
              <div style={{fontSize:8,color:`${neon}44`,fontFamily:MONO2,letterSpacing:1,marginBottom:4}}>{l}</div>
              <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:MONO2,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>}

        {/* Discipline */}
        <div style={{margin:"0 20px 14px",background:`${discC}08`,border:`1px solid ${discC}18`,borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO2,letterSpacing:2}}>{fr?"DISCIPLINE":"DISCIPLINE"}</span>
            <span style={{fontSize:22,fontWeight:800,color:discC,fontFamily:MONO2}}>{disc}<span style={{fontSize:12,color:`${neon}33`}}>/10</span></span>
          </div>
          {[{l:fr?"Conformité":"Compliance",v:confPct,c:neon,delay:"0.3s"},{l:fr?"Sans revenge":"No revenge",v:noRevPct,c:revs.length===0?neon:"#f0b429",delay:"0.5s"}].map(({l,v,c,delay})=>(
            <div key={l} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO2}}>{l}</span>
                <span style={{fontSize:9,color:c,fontWeight:700,fontFamily:MONO2}}>{v}%</span>
              </div>
              <div style={{height:3,background:`${neon}10`,borderRadius:2,overflow:"hidden"}}>
                <div style={{["--bar-w"]:`${v}%`,height:"100%",background:c,borderRadius:2,animation:`barFill 0.8s ease ${delay} both`}}/>
              </div>
            </div>
          ))}
        </div>

        {/* Insights avec icônes */}
        <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
          {insights.map((ins,i)=>{
            const c=typeColor[ins.type];
            return (
              <div key={i} style={{background:`${c}07`,border:`1px solid ${c}18`,borderRadius:12,padding:"12px 14px",borderLeft:`3px solid ${c}`,display:"flex",gap:10,alignItems:"flex-start",animation:`fadeUp 0.35s ease ${0.1+i*0.08}s both`}}>
                <div style={{flexShrink:0,marginTop:2}}>{renderIcon(ins.icon,c,24)}</div>
                <p style={{fontSize:12,color:"#ffffff",lineHeight:1.7,fontFamily:MONO2,margin:0}}>{ins.txt}</p>
              </div>
            );
          })}
        </div>
        {/* Bouton partager résumé */}
        <div style={{padding:"0 20px 16px",marginTop:4}}>
          <button onClick={()=>{
            const wr_=Math.round(trades.filter(x=>x.result==="WIN").length/trades.length*100);
            const pnl_=trades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0).toFixed(1);
            const text=`TrackMyTrade — ${trades.length} trades · ${wr_}% WR · ${pnl_>0?"+":""}${pnl_}% P&L`;
            if(navigator.share)navigator.share({text,url:"https://trackmytrade.app"}).catch(()=>{});
            else if(navigator.clipboard)navigator.clipboard.writeText(text);
          }} className="btn" style={{width:"100%",background:`${neon}18`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:"'Geist Mono','IBM Plex Mono',monospace",letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            {fr?"PARTAGER CE RÉSUMÉ":"SHARE SUMMARY"}
          </button>
        </div>
      </div>
    </div>
  );
}


function ShareModal({trade, trades, lang, neon, config, onClose}) {
  const fr = lang === "fr";
  const M = "'Geist Mono','IBM Plex Mono',monospace";
  const fmtP = v => {
    if(v===undefined||v===null||v==="") return "—";
    const n=Number(v), a=Math.abs(n);
    return (n>=0?"+":"")+(a%1===0?a.toFixed(0):a.toFixed(1))+"%";
  };
  const rc2 = r => r==="WIN"?neon:r==="LOSS"?"#ff4d4d":"#f0b429";
  const isTrade = !!(trade && trade.asset);

  // Stats semaine
  const cutoff = new Date(Date.now()-7*86400000).toISOString().split("T")[0];
  const week = (trades||[]).filter(x=>x.date>=cutoff);
  const wWins = week.filter(x=>x.result==="WIN").length;
  const wPnl = week.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const wWR = week.length?Math.round(wWins/week.length*100):0;
  const wConf = week.filter(x=>x.conforming).length;
  const wRev = week.filter(x=>x.isRevenge).length;
  const disc = week.length?Math.round((wConf/week.length*0.6+(1-wRev/week.length)*0.4)*10):0;
  const discC = disc>=8?neon:disc>=5?"#f0b429":"#ff4d4d";
  const confPct = week.length?Math.round(wConf/week.length*100):0;
  const noRevPct = week.length?Math.round((1-wRev/week.length)*100):100;
  const wGrossWin = week.filter(x=>x.result==="WIN").reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
  const wGrossLoss = week.filter(x=>x.result==="LOSS").reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
  const wPf = wGrossLoss>0?wGrossWin/wGrossLoss:(wGrossWin>0?Infinity:0);
  const wPfStr = wPf===Infinity?"∞":wPf.toFixed(2);
  const wPfColor = wPf>=1.5?neon:wPf>=1?"#f0b429":"#ff4d4d";

  // Insights semaine
  const insights = [];
  if(week.length>=3) {
    const nc = week.filter(x=>!x.conforming);
    const cWRv = wConf?Math.round(week.filter(x=>x.conforming&&x.result==="WIN").length/wConf*100):0;
    const ncWR = nc.length?Math.round(nc.filter(x=>x.result==="WIN").length/nc.length*100):0;
    if(wConf>=2&&nc.length>=2&&cWRv-ncWR>10)
      insights.push({c:neon, txt:fr?`Conformes : ${cWRv}% WR vs ${ncWR}% non-conformes`:`Compliant: ${cWRv}% WR vs ${ncWR}% non-compliant`});
    if(wRev>0)
      insights.push({c:"#ff4d4d", txt:fr?`${wRev} revenge trade${wRev>1?"s":""} — à corriger`:`${wRev} revenge trade${wRev>1?"s":""} — fix this`});
    else
      insights.push({c:neon, txt:fr?"Aucun revenge trade ✓":"No revenge trades ✓"});
  }

  const doShare = () => {
    try {
      const text = isTrade
        ? `${trade.result} · ${trade.asset} · ${fmtP(trade.pnlPct)} — TrackMyTrade`
        : fr
          ? `Semaine : ${wWR}% WR · ${fmtP(wPnl)} P&L · ${week.length} trades · Discipline ${disc}/10 — TrackMyTrade`
          : `Week: ${wWR}% WR · ${fmtP(wPnl)} P&L · ${week.length} trades · Discipline ${disc}/10 — TrackMyTrade`;
      if(navigator.share) {
        navigator.share({text, url:"https://trackmytrade.app"}).catch(()=>{});
      } else if(navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    } catch(e) { console.error("share error:", e); }
  };

  // Stats trade sécurisées
  const tResult = isTrade ? (trade.result||"—") : "—";
  const tPnl = isTrade ? fmtP(trade.pnlPct) : "—";
  const tScore = isTrade ? `${trade.setupScore||0}/${trade.checklistMax||(config&&config.items?config.items.length:7)}` : "—";
  const tChecklist = isTrade ? (trade.checklist||[]) : [];
  const tConforming = isTrade ? !!trade.conforming : false;
  const tRevenge = isTrade ? !!trade.isRevenge : false;
  const tRejet = isTrade ? (trade.rejetScore||0) : 0;
  const tHumeur = isTrade ? (trade.checkin&&trade.checkin.humeur ? trade.checkin.humeur : null) : null;
  const tNotes = isTrade ? (trade.notes||null) : null;
  const tAsset = isTrade ? (trade.asset||"") : "";
  const tDir = isTrade ? (trade.direction||"") : "";
  const configItems = (config&&config.items)||[];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={onClose}>
      <div className="slide-up" style={{width:"100%",maxWidth:360,background:"#0f0f18",borderRadius:20,overflow:"hidden",border:`1px solid ${neon}28`}} onClick={e=>e.stopPropagation()}>
        <div style={{height:4,background:`linear-gradient(90deg,${neon},${neon}55)`}}/>
        <div style={{padding:"18px 18px 0"}}>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:9,color:`${neon}44`,fontFamily:M,letterSpacing:3}}>TRACKMYTRADE</span>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}44`,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
          </div>
          <div style={{fontSize:15,fontWeight:700,color:neon,fontFamily:M,marginBottom:3}}>
            {isTrade?(fr?"◈ RÉCAP TRADE":"◈ TRADE RECAP"):(fr?"◈ RÉSUMÉ SEMAINE":"◈ WEEKLY RECAP")}
          </div>
          <div style={{fontSize:9,color:`${neon}33`,fontFamily:M,marginBottom:14}}>
            {isTrade
              ? `${trade.date||""}${trade.time?" · "+trade.time:""}`
              : fr?`7 derniers jours · ${week.length} trades`:`Last 7 days · ${week.length} trades`}
          </div>

          {/* Stats 3 colonnes */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
            {(isTrade
              ? [{l:"RÉSULTAT",v:tResult,c:rc2(tResult)},{l:"P&L",v:tPnl,c:parseFloat(trade.pnlPct||0)>=0?neon:"#ff4d4d"},{l:"SCORE",v:tScore,c:tConforming?neon:"#ff4d4d"}]
              : [{l:"WIN RATE",v:`${wWR}%`,c:wWR>=50?neon:"#ff4d4d"},{l:"P&L",v:fmtP(wPnl),c:wPnl>=0?neon:"#ff4d4d"},{l:"TRADES",v:`${week.length}`,c:neon}]
            ).map(({l,v,c},i)=>(
              <div key={i} style={{background:`${c}0c`,border:`1px solid ${c}22`,borderRadius:10,padding:"10px 0",textAlign:"center"}}>
                <div style={{fontSize:8,color:`${neon}44`,fontFamily:M,letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:M,lineHeight:1}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Bloc trade */}
          {isTrade&&(
            <div style={{background:`${rc2(tResult)}08`,border:`1px solid ${rc2(tResult)}20`,borderRadius:10,padding:"12px 14px",marginBottom:10,borderLeft:`3px solid ${rc2(tResult)}`}}>
              <div style={{fontSize:15,fontWeight:700,color:"#ffffff",fontFamily:M,marginBottom:8}}>{tAsset} · {tDir}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:tNotes?8:0}}>
                <span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:tConforming?`${neon}14`:"rgba(255,77,77,0.1)",color:tConforming?neon:"#ff4d4d",fontFamily:M}}>
                  {tConforming?(fr?"✓ conforme":"✓ compliant"):(fr?"✗ non-conforme":"✗ non-compliant")}
                </span>
                {tRevenge&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"rgba(255,77,77,0.1)",color:"#ff4d4d",fontFamily:M}}>REVENGE</span>}
                {tRejet>0&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:`${neon}0a`,color:`${neon}77`,fontFamily:M}}>Rejet {tRejet}/10</span>}
                {tHumeur&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:`${neon}08`,color:`${neon}66`,fontFamily:M}}>{tHumeur}</span>}
              </div>
              {tNotes&&<div style={{fontSize:11,color:`${neon}55`,fontStyle:"italic",lineHeight:1.5}}>"{tNotes.length>80?tNotes.slice(0,80)+"…":tNotes}"</div>}
            </div>
          )}

          {/* Checklist trade */}
          {isTrade&&configItems.length>0&&(
            <div style={{background:`${neon}05`,border:`1px solid ${neon}10`,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              {configItems.slice(0,7).map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:i<Math.min(configItems.length,7)-1?`1px solid ${neon}08`:"none"}}>
                  <span style={{fontSize:11,color:tChecklist.includes(i)?neon:"#ffffff44",flexShrink:0}}>{tChecklist.includes(i)?"✓":"✗"}</span>
                  <span style={{fontSize:10,color:tChecklist.includes(i)?"#ffffff":"#ffffffaa",fontFamily:M}}>{item}</span>
                </div>
              ))}
            </div>
          )}

          {/* Discipline semaine */}
          {!isTrade&&(
            <div style={{background:`${discC}08`,border:`1px solid ${discC}18`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:9,color:`${neon}44`,fontFamily:M,letterSpacing:2}}>DISCIPLINE</span>
                <span style={{fontSize:24,fontWeight:800,color:discC,fontFamily:M}}>{disc}<span style={{fontSize:12,color:`${neon}33`}}>/10</span></span>
              </div>
              {(wGrossWin>0||wGrossLoss>0)&&<div style={{display:"flex",gap:8,marginBottom:10}}>
                <div style={{flex:1,background:`${neon}06`,border:`1px solid ${neon}12`,borderRadius:8,padding:"7px 0",textAlign:"center"}}>
                  <div style={{fontSize:7,color:`${neon}44`,fontFamily:M,letterSpacing:1,marginBottom:3}}>PROFIT FACTOR</div>
                  <div style={{fontSize:15,fontWeight:800,color:wPfColor,fontFamily:M,lineHeight:1}}>{wPfStr}</div>
                </div>
              </div>}
              {[{l:fr?"Conformité":"Compliance",v:confPct,c:neon},{l:fr?"Sans revenge":"No revenge",v:noRevPct,c:wRev===0?neon:"#f0b429"}].map(({l,v,c})=>(
                <div key={l} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:9,color:`${neon}44`,fontFamily:M}}>{l}</span>
                    <span style={{fontSize:9,color:c,fontWeight:700,fontFamily:M}}>{v}%</span>
                  </div>
                  <div style={{height:3,background:`${neon}10`,borderRadius:2}}>
                    <div style={{width:`${v}%`,height:"100%",background:c,borderRadius:2}}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Insights semaine */}
          {!isTrade&&insights.map((ins,i)=>(
            <div key={i} style={{background:`${ins.c}07`,border:`1px solid ${ins.c}15`,borderRadius:8,padding:"9px 12px",marginBottom:6,borderLeft:`3px solid ${ins.c}`}}>
              <span style={{fontSize:11,color:"#ffffff",fontFamily:M,lineHeight:1.5}}>{ins.txt}</span>
            </div>
          ))}

          <div style={{textAlign:"center",padding:"10px 0 4px"}}>
            <span style={{fontSize:8,color:`${neon}18`,fontFamily:M,letterSpacing:2}}>trackmytrade.app</span>
          </div>
        </div>

        {/* Bouton partager */}
        <div style={{padding:"0 18px 18px"}}>
          <button onClick={doShare} className="btn" style={{width:"100%",marginTop:12,background:`${neon}18`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:M,letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            {fr?"PARTAGER":"SHARE"}
          </button>
        </div>
      </div>
    </div>
  );
}


function SplashLogo({neon}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:14,animation:"slideFromLeft 0.7s cubic-bezier(0.34,1.3,0.64,1) both"}}>
      <div style={{width:64,height:64,borderRadius:16,background:`linear-gradient(135deg,${neon}22,${neon}08)`,border:`1.5px solid ${neon}65`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 40px ${neon}44,0 0 14px ${neon}22,inset 0 1px 0 ${neon}35`,position:"relative",overflow:"hidden",flexShrink:0,animation:"logoBoxGlow 3s ease-in-out infinite"}}>
        <div style={{position:"absolute",top:-3,left:-3,width:"55%",height:"55%",background:`linear-gradient(135deg,${neon}20,transparent 70%)`,borderRadius:"0 0 50% 0"}}/>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <polygon points="12,2 22,12 12,22 2,12" fill={`${neon}22`} stroke={neon} strokeWidth="1.5" strokeLinejoin="round"/>
          <polygon points="12,7 17,12 12,17 7,12" fill={neon} style={{filter:`drop-shadow(0 0 7px ${neon})`}}/>
        </svg>
      </div>
      <div style={{animation:"slideFromRight 0.7s cubic-bezier(0.34,1.3,0.64,1) both"}}>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:-1.5,lineHeight:1,whiteSpace:"nowrap",textShadow:`0 0 40px ${neon}44`,fontFamily:MONO}}>
          <b style={{color:neon}}>Track</b><span style={{color:"#ffffff1a",fontWeight:300}}>My</span><b style={{color:neon}}>Trade</b>
        </div>
        <div style={{fontSize:8,color:`${neon}55`,letterSpacing:5,marginTop:6,fontFamily:MONO}}>JOURNAL DE TRADING</div>
      </div>
    </div>
  );
}

function GridBackground({neon,height=240}) {
  const canvasRef=useRef();
  const rafRef=useRef();
  const startRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const cols=10,rows=8,cw=W/cols,rh=H/rows;
    const animate=ts=>{
      if(!startRef.current)startRef.current=ts;
      const t=(ts-startRef.current)/1000;
      ctx.clearRect(0,0,W,H);
      for(let r=0;r<=rows;r++){
        for(let c=0;c<=cols;c++){
          const cx=c*cw,cy=r*rh;
          const dist=Math.hypot(cx-W/2,cy-H/2)/150;
          const wave=Math.sin(t*1.5-dist*4.5)*0.5+0.5;
          const op=wave*(1-Math.min(1,dist*0.75))*0.45;
          if(op>0.02){
            ctx.beginPath();ctx.arc(cx,cy,1.3,0,Math.PI*2);
            ctx.fillStyle=`${neon}${Math.round(op*255).toString(16).padStart(2,"0")}`;ctx.fill();
          }
          if(r<rows&&c<cols){
            const lineOp=wave*(1-Math.min(1,dist*0.85))*0.15;
            if(lineOp>0.01){
              ctx.strokeStyle=`${neon}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;
              ctx.lineWidth=0.4;
              ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+cw,cy);ctx.stroke();
              ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+rh);ctx.stroke();
            }
          }
        }
      }
      rafRef.current=requestAnimationFrame(animate);
    };
    rafRef.current=requestAnimationFrame(animate);
    return()=>cancelAnimationFrame(rafRef.current);
  },[]);
  return <canvas ref={canvasRef} width={320} height={height} style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",maxWidth:"100%",pointerEvents:"none"}}/>;
}

function Onboarding({onDone}) {
  const [step,setStep]=useState(0);const [lang,setLang]=useState("fr");
  const t=T[lang];const neon="#00ff9d";

  const Stage = ({children,h=216}) => (
    <div style={{position:"relative",width:"100%",height:h,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 68% 52% at 50% 50%,${neon}10,transparent 70%)`,pointerEvents:"none"}}/>
      <GridBackground neon={neon} height={h}/>
      <div style={{position:"relative",zIndex:2,width:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>{children}</div>
    </div>
  );

  const slides=[
    {title:t.ob1Title,desc:t.ob1Desc,cta:t.discover,visual:(<Stage h={232}><SplashLogo neon={neon}/></Stage>)},
    {title:t.ob2Title,desc:t.ob2Desc,cta:t.next,visual:(
      <Stage><div style={{display:"flex",flexDirection:"column",gap:9,maxWidth:280,width:"100%",padding:"0 10px"}}>
        {[[lang==="fr"?"Setup validé":"Setup confirmed",true],[lang==="fr"?"Règles respectées":"Rules followed",true],[lang==="fr"?"Timing correct":"Right timing",true],[lang==="fr"?"Pas de revenge":"No revenge",false]].map(([item,ok],i)=>(
          <div key={i} className="fu" style={{background:ok?`${neon}0d`:"rgba(255,77,77,0.06)",border:`1px solid ${ok?neon+"2e":"rgba(255,77,77,0.2)"}`,borderRadius:11,padding:"11px 15px",fontSize:13,fontWeight:600,fontFamily:MONO,animationDelay:`${i*0.09}s`,display:"flex",alignItems:"center",gap:11,boxShadow:ok?`0 0 16px ${neon}0a`:"none"}}>
            <Icon name={ok?"check":"close"} size={15} color={ok?neon:"#ff4d4d"}/>
            <span style={{color:"#fff"}}>{item}</span>
          </div>
        ))}
      </div></Stage>
    )},
    {title:t.ob3Title,desc:t.ob3Desc,cta:t.next,visual:(
      <Stage><div style={{display:"flex",flexWrap:"wrap",gap:9,maxWidth:296,justifyContent:"center"}}>
        {["Scalping","ICT","Swing","Day trading","Price action","SMC","Breakout"].map((s,i)=>(
          <div key={s} className="fu" style={{background:`${neon}0d`,border:`1px solid ${neon}30`,borderRadius:22,padding:"9px 16px",fontSize:12.5,fontWeight:600,color:neon,fontFamily:MONO,animationDelay:`${i*0.06}s`,boxShadow:`0 0 16px ${neon}12`}}>{s}</div>
        ))}
      </div></Stage>
    )},
    {title:t.ob4Title,desc:t.ob4Desc,cta:t.next,visual:(
      <Stage><div style={{maxWidth:294,width:"100%",padding:"0 10px"}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          {[["WIN RATE","73%"],["P&L","+4.2%"],["P. FACTOR","1.85"]].map(([l,v])=>(
            <div key={l} style={{flex:1,background:"linear-gradient(150deg,#191922,#101016)",border:`1px solid ${neon}22`,borderRadius:13,padding:"13px 6px",textAlign:"center",boxShadow:`0 4px 20px ${neon}0c,inset 0 1px 0 ${neon}15`}}>
              <div style={{fontSize:18,fontWeight:900,color:"#fff",fontFamily:MONO,lineHeight:1,textShadow:`0 0 18px ${neon}66`}}>{v}</div>
              <div style={{fontSize:7,color:"#ffffff88",marginTop:6,letterSpacing:1.5,fontFamily:MONO}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{background:`linear-gradient(150deg,${neon}12,${neon}03)`,border:`1px solid ${neon}30`,borderRadius:13,padding:"13px 15px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:`0 4px 20px ${neon}0c`}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <Icon name="discipline" size={21} color={neon}/>
            <span style={{fontSize:10,color:"#ffffffcc",letterSpacing:2,fontFamily:MONO}}>DISCIPLINE</span>
          </div>
          <div style={{fontSize:23,fontWeight:900,color:"#fff",fontFamily:MONO,textShadow:`0 0 22px ${neon}77`}}>8<span style={{fontSize:11,color:"#ffffff44"}}>/10</span></div>
        </div>
      </div></Stage>
    )},
    {title:t.ob5Title,desc:t.ob5Desc,cta:t.start,visual:(
      <Stage><div style={{maxWidth:294,width:"100%",padding:"0 10px",display:"flex",flexDirection:"column",gap:11}}>
        <div style={{position:"relative",background:"linear-gradient(135deg,#11111a,#0c0c12)",border:`1px solid ${neon}26`,borderRadius:13,padding:"13px 15px 13px 19px",overflow:"hidden"}}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:`linear-gradient(180deg,${neon},${neon}33)`,boxShadow:`0 0 10px ${neon}77`}}/>
          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
            <Icon name="insight" size={15} color={neon} style={{marginTop:1}}/>
            <div style={{fontSize:11.5,color:"#ffffffcc",fontFamily:MONO,lineHeight:1.55}}>{lang==="fr"?"Tes setups conformes : 78% WR. Ton edge est dans ta discipline.":"Your compliant setups: 78% WR. Your edge is in your discipline."}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {[["Perso",neon],["FTMO","#00d4ff"],["Démo","#f0b429"]].map(([n,c])=>(
            <div key={n} style={{flex:1,display:"flex",alignItems:"center",gap:7,background:`${c}10`,border:`1px solid ${c}30`,borderRadius:10,padding:"9px 11px"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}`}}/>
              <span style={{fontSize:10,fontWeight:700,color:"#fff",fontFamily:MONO}}>{n}</span>
            </div>
          ))}
        </div>
      </div></Stage>
    )},
  ];
  const s=slides[step];

  return (
    <div style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:MONO,maxWidth:480,margin:"0 auto",color:"#fff"}}>
      <CSS neon={neon}/>
      <div style={{padding:"18px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>onDone(lang)} className="btn" style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:12,fontFamily:MONO,cursor:"pointer"}}>{lang==="fr"?"Passer":"Skip"}</button>
        <div style={{display:"flex",gap:6}}>
          {["fr","en"].map(l=><button key={l} onClick={()=>setLang(l)} className="btn" style={{background:lang===l?`${neon}22`:"transparent",border:`1px solid ${lang===l?neon:"#ffffff22"}`,color:lang===l?neon:"#ffffff77",borderRadius:7,padding:"5px 12px",fontSize:11,fontWeight:700,fontFamily:MONO}}>{l.toUpperCase()}</button>)}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 28px 22px"}}>
        <div className="fi" key={`v${step}${lang}`} style={{marginBottom:28,width:"100%"}}>{s.visual}</div>
        <div className="fi" key={`t${step}${lang}`} style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:23,fontWeight:700,color:neon,whiteSpace:"pre-line",lineHeight:1.32,marginBottom:15,fontFamily:MONO,textShadow:`0 0 30px ${neon}88`}}>{s.title}</div>
          <div style={{fontSize:13,color:"#ffffffaa",lineHeight:1.72,maxWidth:312,margin:"0 auto",fontFamily:MONO}}>{s.desc}</div>
        </div>
        <button onClick={()=>step<slides.length-1?setStep(step+1):onDone(lang)} className="btn" style={{width:"100%",maxWidth:300,background:`${neon}1c`,border:`1px solid ${neon}`,color:neon,borderRadius:13,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:14,boxShadow:`0 0 26px ${neon}2e`,textShadow:`0 0 12px ${neon}88`,transition:"all 0.2s"}}>{s.cta}</button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:12,fontFamily:MONO}}>{t.back}</button>}
      </div>
      <div style={{padding:"8px 28px 34px"}}><Dots total={slides.length} current={step} neon={neon}/></div>
    </div>
  );
}

function GuidedSetup({onDone,lang}) {
  const t=T[lang];const neon="#00ff9d";
  const [step,setStep]=useState(0);const [stratName,setStratName]=useState("");
  const [selAssets,setSelAssets]=useState(["XAU/USD"]);const [customAsset,setCustomAsset]=useState("");
  const [criteria,setCriteria]=useState([...DEFAULT_CRITERIA]);const [threshold,setThreshold]=useState(6);const [newItem,setNewItem]=useState("");
  const allAssets=[...new Set([...PRESET_ASSETS,...selAssets.filter(a=>!PRESET_ASSETS.includes(a))])];
  const TOTAL=4;const titles=[t.strategy,t.assets,t.criteria,t.threshold];const descs=[t.strategyDesc,t.assetsDesc,t.criteriaDesc,t.thresholdDesc];
  const canNext=step===1?selAssets.length>0:step===2?criteria.length>=2:true;
  const launch=()=>onDone({strategyName:stratName.trim()||"Ma Stratégie",defaultAsset:selAssets[0]||"XAU/USD",items:criteria,threshold,customAssets:selAssets});
  const inSt=mkInput(neon);
  const renderContent=()=>{
    if(step===0) return <input value={stratName} onChange={e=>setStratName(e.target.value)} placeholder="Ex: XAU/USD Scalping BB" style={{...inSt,fontSize:14,padding:14}} autoFocus/>;
    if(step===1) return <div><div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>{allAssets.map(a=><button key={a} onClick={()=>setSelAssets(p=>p.includes(a)?p.filter(x=>x!==a):[...p,a])} className="btn" style={{background:selAssets.includes(a)?`${neon}26`:"#131318",border:`1px solid ${selAssets.includes(a)?neon:`${neon}22`}`,color:selAssets.includes(a)?neon:"#ffffffaa",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,fontFamily:MONO}}>{a}</button>)}</div><div style={{display:"flex",gap:8}}><input value={customAsset} onChange={e=>setCustomAsset(e.target.value)} placeholder={t.customAsset} onKeyDown={e=>{if(e.key==="Enter"&&customAsset.trim()){setSelAssets(p=>[...p,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>{if(customAsset.trim()){setSelAssets(p=>[...p,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:"0 16px",fontSize:18}}>+</button></div></div>;
    if(step===2) return <div>{criteria.map((c,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:8}}><input value={c} onChange={e=>{const n=[...criteria];n[i]=e.target.value;setCriteria(n);}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>setCriteria(criteria.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",cursor:"pointer"}}>✕</button></div>)}<div style={{display:"flex",gap:8}}><input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={lang==="fr"?"Ajouter…":"Add…"} onKeyDown={e=>{if(e.key==="Enter"&&newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>{if(newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:"0 16px",fontSize:18}}>+</button></div></div>;
    return <div><div style={{display:"flex",gap:8,marginBottom:20}}>{Array.from({length:Math.min(7,criteria.length-1)},(_,i)=>i+2).map(n=><button key={n} onClick={()=>setThreshold(n)} className="btn" style={{flex:1,padding:"12px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:threshold===n?`${neon}33`:"#131318",border:`1px solid ${threshold===n?neon:`${neon}22`}`,color:threshold===n?neon:"#ffffffaa"}}>{n}</button>)}</div><div style={{background:`${neon}0d`,border:`1px solid ${neon}22`,borderRadius:10,padding:16}}><div style={{fontSize:12,color:neon,marginBottom:4}}>✓ {threshold}/{criteria.length}</div><div style={{fontSize:10,color:"#ffffff44"}}>{threshold/criteria.length>=0.875?`↑ ${t.highStd}`:threshold/criteria.length>=0.6?`· ${t.balanced}`:`↓ ${t.lowStd}`}</div></div></div>;
  };
  return (
    <div style={{background:"#0c0c12",minHeight:"100vh",fontFamily:MONO,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <CSS neon={neon}/>
      <div style={{padding:"24px 24px 16px",borderBottom:`1px solid ${neon}14`}}><div><SplashLogo neon={neon}/></div><div style={{marginTop:20}}><Dots total={TOTAL} current={step} neon={neon}/></div></div>
      <div style={{flex:1,padding:"28px 24px",overflow:"auto"}}>
        <div className="fu" key={step}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:3,marginBottom:6}}>{t.step} 0{step+1} / 04</div>
          <div style={{fontSize:22,fontWeight:700,color:neon,marginBottom:8,lineHeight:1.2}}>{titles[step]}</div>
          <div style={{fontSize:13,color:"#ffffffaa",marginBottom:24,lineHeight:1.7}}>{descs[step]}</div>
          {renderContent()}
        </div>
      </div>
      <div style={{padding:"16px 24px 36px",borderTop:`1px solid ${neon}14`}}>
        <button onClick={()=>canNext&&(step<TOTAL-1?setStep(step+1):launch())} className="btn" style={{width:"100%",background:canNext?`${neon}22`:`${neon}06`,border:`1px solid ${canNext?neon:`${neon}18`}`,color:canNext?neon:"#ffffff44",borderRadius:12,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:12,boxShadow:canNext?`0 0 20px ${neon}33, 0 4px 12px rgba(0,0,0,0.4)`:"none",textShadow:canNext?`0 0 10px ${neon}88`:"none"}}>{step===TOTAL-1?t.launch:t.continue}</button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#ffffff44",fontSize:12,fontFamily:MONO}}>{t.prevStep}</button>}
      </div>
    </div>
  );
}

function SettingsView({config,onSave,onLogout,onReset,onNewPhase,lang,onLangChange,neon,phases,onPhasesChange,onObjectifChange,onImport,accounts,activeAccountId,onSwitchAccount,onAccountsChange,onCreateAccount}) {
  const t=T[lang];const inSt=mkInput(neon);
  const [showLegal,setShowLegal]=useState(null);
  const [items,setItems]=useState([...config.items]);const [threshold,setThreshold]=useState(config.threshold);
  const [stratName,setStratName]=useState(config.strategyName||"");const [maxTrades,setMaxTrades]=useState(config.maxTrades||1);
  const [neonColor,setNeonColor]=useState(neon);const [calendarOn,setCalendarOn]=useState(config.calendarOn!==false);
  const [notifOn,setNotifOn]=useState(config.notifOn!==false);const [customAsset,setCustomAsset]=useState("");
  const [assets,setAssets]=useState(config.customAssets||PRESET_ASSETS);
  const [savedOk,setSavedOk]=useState(false);const [phaseConfirm,setPhaseConfirm]=useState(false);
  const [newPhaseName,setNewPhaseName]=useState("");
  const [phaseName,setPhaseName]=useState(config.phaseName||"");
  const [phaseStartDate,setPhaseStartDate]=useState(config.phaseStartDate||"");
  const [objPnl,setObjPnl]=useState(config.objPnl||"");
  const [objWr,setObjWr]=useState(config.objWr||"");const [defaultTf,setDefaultTf]=useState(config.defaultTimeframe||config.defaultTimeframe||config.lastTimeframe||"M5");
  const [objTrades,setObjTrades]=useState(config.objTrades||"");const [eliminatoires,setEliminatoires]=useState(config.eliminatoires||[]);
  const [capital,setCapital]=useState(config.capital||"");
  const [devise,setDevise]=useState(config.devise||"€");
  const [accountType,setAccountType]=useState(config.accountType||"perso");
  const [objDrawdown,setObjDrawdown]=useState(config.objDrawdown||"");
  const [acctEditIdx,setAcctEditIdx]=useState(null);
  const [acctEditName,setAcctEditName]=useState("");
  const [acctEditDate,setAcctEditDate]=useState("");
  const [acctDelConfirm,setAcctDelConfirm]=useState(null);
  const [archOpen,setArchOpen]=useState(false);
  const [modules,setModules]=useState({rejet:modOn(config,"rejet"),checkin:modOn(config,"checkin"),postSl:modOn(config,"postSl"),revenge:modOn(config,"revenge"),timeframe:modOn(config,"timeframe")});
  const [timeframes,setTimeframes]=useState(getTimeframes(config));
  const toggleTf=(tf)=>setTimeframes(prev=>{const has=prev.includes(tf);if(has&&prev.length<=1)return prev;const next=has?prev.filter(x=>x!==tf):[...prev,tf];return ALL_TIMEFRAMES.filter(x=>next.includes(x));});
  const save=()=>{
    const dft=timeframes.includes(defaultTf)?defaultTf:timeframes[0];
    onSave({items,threshold,strategyName:stratName,maxTrades,neonColor,calendarOn,notifOn,customAssets:assets,eliminatoires,defaultTimeframe:dft,modules,timeframes});
    setSavedOk(true);setTimeout(()=>setSavedOk(false),2000);};
  const doSaveAcct=(idx)=>{
    const name=acctEditName.trim()||"Phase";
    const date=acctEditDate;
    if(idx===0){setPhaseName(name);setPhaseStartDate(date);onSave({items,threshold,strategyName:stratName,maxTrades,neonColor,calendarOn,notifOn,customAssets:assets,eliminatoires,objPnl,phaseName:name,phaseStartDate:date,capital,devise,accountType,objDrawdown,defaultTimeframe:defaultTf});}
    else{const np=phases.map((ph,i)=>i===idx-1?{...ph,name,date}:ph);onPhasesChange(np);}
    setAcctEditIdx(null);
  };
  const doDelAcct=(idx)=>{
    if(idx===0){const np=phases.slice(1);onPhasesChange(np);}
    else{const np=phases.filter((_,i)=>i!==idx-1);onPhasesChange(np);}
    setAcctDelConfirm(null);
  };
  const Toggle=({label,val,set})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${neonColor}0d`}}>
      <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{label}</span>
      <button onClick={()=>set(!val)} className="btn" style={{width:44,height:24,borderRadius:12,background:val?`${neonColor}33`:"#ffffff12",border:`1px solid ${val?neonColor:`${neonColor}30`}`,position:"relative",transition:"all 0.2s"}}>
        <div style={{width:16,height:16,borderRadius:"50%",background:val?neonColor:"#ffffffaa",position:"absolute",top:3,left:val?24:4,transition:"all 0.2s"}}/>
      </button>
    </div>
  );
  const [tab,setTab]=useState("compte");
  const fr=lang==="fr";
  const TABS=[
    {id:"compte",  label:fr?"Compte":"Account"},
    {id:"strategie",label:fr?"Stratégie":"Strategy"},
    {id:"reglages",label:fr?"Réglages":"Settings"},
  ];
  const SaveBtn=()=>(
    <button onClick={save} className="btn" style={{width:"100%",background:`${neonColor}26`,border:`1px solid ${neonColor}`,color:neonColor,borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO,marginTop:4,marginBottom:2}}>{savedOk?t.savedOk:t.saveBtn}</button>
  );
  return (
    <div className="fi" style={{padding:20}}>
      {/* ── Sélecteur d'onglets ── */}
      <div style={{display:"flex",gap:4,background:"#0f0f14",borderRadius:10,padding:4,marginBottom:20}}>
        {TABS.map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)} className="btn"
            style={{flex:1,padding:"9px 0",borderRadius:7,fontSize:11,fontWeight:700,fontFamily:MONO,
              background:tab===tb.id?neonColor:"transparent",
              color:tab===tb.id?"#131318":"#ffffffaa",border:"none",transition:"all 0.2s"}}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ══ ONGLET COMPTE ══ */}
      {tab==="compte"&&(()=>{
        const updateAcc=(id,patch)=>onAccountsChange((accounts||[]).map(a=>a.id===id?{...a,...patch}:a));
        return <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,fontFamily:MONO}}>{fr?"MES COMPTES":"MY ACCOUNTS"} · {(accounts||[]).length}</div>
            <button onClick={()=>onCreateAccount&&onCreateAccount()} className="btn" style={{background:`${neonColor}14`,border:`1px solid ${neonColor}30`,color:neonColor,borderRadius:8,padding:"6px 12px",fontSize:10,fontWeight:700,fontFamily:MONO}}>+ {fr?"Ajouter":"Add"}</button>
          </div>
          {(accounts||[]).filter(a=>!a.archived).concat(archOpen?(accounts||[]).filter(a=>a.archived):[]).map(acc=>{
            const isActive=acc.id===activeAccountId;
            const c=acc.color||neonColor;
            const isDelC=acctDelConfirm===acc.id;
            return(
              <div key={acc.id} style={{background:isActive?`${c}08`:acc.archived?"#0d0d12":"#131318",border:`1px solid ${isActive?c+"35":acc.archived?"#ffffff06":"#ffffff0a"}`,borderRadius:12,padding:"12px 14px",marginBottom:8,borderLeft:`3px solid ${isActive?c:acc.archived?"#ffffff0a":"#ffffff18"}`,opacity:acc.archived?0.7:1}}>
                {/* Ligne titre */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{width:11,height:11,borderRadius:"50%",background:c,boxShadow:isActive?`0 0 7px ${c}`:undefined,flexShrink:0}}/>
                  <input value={acc.name} onChange={e=>updateAcc(acc.id,{name:e.target.value})} style={{background:"transparent",border:"none",color:"#ffffff",fontSize:13,fontWeight:isActive?700:500,fontFamily:MONO,outline:"none",flex:1,minWidth:0}}/>
                  {isActive&&<span style={{fontSize:8,color:c,background:`${c}18`,padding:"1px 6px",borderRadius:4,fontFamily:MONO,flexShrink:0}}>{fr?"EN COURS":"ACTIVE"}</span>}
                  {acc.archived&&<span style={{fontSize:8,color:"#ffffff44",background:"#ffffff0d",padding:"1px 6px",borderRadius:4,fontFamily:MONO,flexShrink:0}}>{fr?"ARCHIVÉ":"ARCHIVED"}</span>}
                </div>
                {/* Palette couleurs */}
                <div style={{display:"flex",gap:4,marginBottom:10}}>
                  {ACCOUNT_COLORS.map(col=>(
                    <button key={col} onClick={()=>updateAcc(acc.id,{color:col})} style={{width:18,height:18,borderRadius:"50%",background:col,border:`2px solid ${c===col?col:"transparent"}`,outline:c===col?`2px solid ${col}`:"none",outlineOffset:2,cursor:"pointer",padding:0,boxShadow:c===col?`0 0 5px ${col}`:undefined}}/>
                  ))}
                </div>
                {/* Actions */}
                {isDelC?(
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:10,color:"#ff4d4d",fontFamily:MONO,flex:1}}>{fr?"Supprimer ce compte et ses trades ?":"Delete account and its trades?"}</span>
                    <button onClick={()=>{onAccountsChange((accounts||[]).filter(a=>a.id!==acc.id), isActive?((accounts||[]).find(a=>a.id!==acc.id&&!a.archived)?.id||(accounts||[]).find(a=>a.id!==acc.id)?.id):undefined);setAcctDelConfirm(null);}} className="btn" style={{background:"rgba(255,77,77,0.2)",border:"1px solid #ff4d4d",color:"#ff4d4d",borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,fontFamily:MONO}}>✓</button>
                    <button onClick={()=>setAcctDelConfirm(null)} className="btn" style={{background:"transparent",border:"1px solid #ffffff15",color:"#ffffffaa",borderRadius:6,padding:"5px 8px",fontSize:11}}>✕</button>
                  </div>
                ):(
                  <div style={{display:"flex",gap:5,marginBottom:isActive?12:0}}>
                    {!isActive&&!acc.archived&&<button onClick={()=>onSwitchAccount&&onSwitchAccount(acc.id)} className="btn" style={{flex:2,background:`${c}14`,border:`1px solid ${c}30`,color:c,borderRadius:7,padding:"6px 0",fontSize:10,fontWeight:700,fontFamily:MONO}}>{fr?"ACTIVER":"SWITCH"}</button>}
                    <button onClick={()=>{const willArchive=!acc.archived;updateAcc(acc.id,{archived:willArchive});if(willArchive&&isActive){const next=(accounts||[]).find(a=>a.id!==acc.id&&!a.archived);if(next&&onSwitchAccount)onSwitchAccount(next.id);}}} className="btn"
                      style={{flex:1,background:acc.archived?`${neonColor}10`:"rgba(255,255,255,0.04)",border:`1px solid ${acc.archived?neonColor:"#ffffff12"}`,color:acc.archived?neonColor:"#ffffff66",borderRadius:7,padding:"6px 0",fontSize:9,fontWeight:700,fontFamily:MONO}}>
                      {acc.archived?(fr?"↩ Restaurer":"↩ Restore"):(fr?"⊘ Archiver":"⊘ Archive")}
                    </button>
                    {(accounts||[]).length>1&&<button onClick={()=>setAcctDelConfirm(acc.id)} className="btn" style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d55",borderRadius:7,padding:"6px 9px",display:"inline-flex",alignItems:"center"}}><Icon name="trash" size={14} color="#ff4d4d"/></button>}
                  </div>
                )}
                {/* Paramètres du compte actif */}
                {isActive&&!isDelC&&<div>
                  <div style={{display:"flex",gap:6,marginBottom:10}}>
                    {[["prop","Prop Firm"],["perso","Perso"],["demo","Démo"]].map(([v,l])=>(
                      <button key={v} onClick={()=>updateAcc(acc.id,{accountType:v})} className="btn" style={{flex:1,padding:"7px 0",background:(acc.accountType||"perso")===v?`${c}18`:"#131318",border:`1px solid ${(acc.accountType||"perso")===v?c:`${c}18`}`,borderRadius:8,fontSize:9,fontWeight:700,color:(acc.accountType||"perso")===v?c:"#ffffffaa",fontFamily:MONO}}>{l}</button>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:10}}>
                    <div style={{flex:2}}>
                      <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4}}>CAPITAL</div>
                      <input type="number" value={acc.capital||""} onChange={e=>updateAcc(acc.id,{capital:e.target.value})} placeholder="10000" style={{...inSt,marginBottom:0}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4}}>DEVISE</div>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {["€","$","£"].map(d=>(
                          <button key={d} onClick={()=>updateAcc(acc.id,{devise:d})} className="btn" style={{padding:"4px 0",background:(acc.devise||"€")===d?`${c}18`:"#131318",border:`1px solid ${(acc.devise||"€")===d?c:`${c}18`}`,borderRadius:6,fontSize:11,fontWeight:800,color:(acc.devise||"€")===d?c:"#ffffffaa",fontFamily:MONO}}>{d}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,color:"#ff4d4d88",marginBottom:4}}>DRAWDOWN MAX %</div>
                      <input type="number" value={acc.objDrawdown||""} onChange={e=>updateAcc(acc.id,{objDrawdown:e.target.value})} placeholder="5" style={{...inSt,marginBottom:0,borderColor:"#ff4d4d33"}}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4}}>{fr?"OBJECTIF P&L %":"P&L TARGET %"}</div>
                      <input type="number" value={acc.objPnl||""} onChange={e=>updateAcc(acc.id,{objPnl:e.target.value})} placeholder="+10" style={{...inSt,marginBottom:0}}/>
                    </div>
                  </div>
                </div>}
              </div>
            );
          })}
          {(accounts||[]).some(a=>a.archived)&&<button onClick={()=>setArchOpen(o=>!o)} className="btn" style={{width:"100%",background:"transparent",border:`1px solid ${neonColor}14`,color:"#ffffff77",borderRadius:10,padding:"10px 0",fontSize:10,fontWeight:700,fontFamily:MONO,marginTop:4}}>⊘ {fr?"Comptes archivés":"Archived accounts"} ({(accounts||[]).filter(a=>a.archived).length}) {archOpen?"▲":"▼"}</button>}
        </div>;
      })()}

      {/* ══ ONGLET STRATÉGIE ══ */}
      {tab==="strategie"&&<div>
        <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.strategyName}</div>
        <input value={stratName} onChange={e=>setStratName(e.target.value)} style={inSt}/>
        <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.maxTradesLabel}</div>
          <div style={{display:"flex",gap:6}}>
            {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setMaxTrades(n)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:maxTrades===n?`${neonColor}26`:"#131318",border:`1px solid ${maxTrades===n?neonColor:`${neonColor}22`}`,color:maxTrades===n?neonColor:"#ffffffbb"}}>{n}</button>)}
            <button onClick={()=>setMaxTrades(0)} className="btn" style={{flex:1.4,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:maxTrades===0?`${neonColor}26`:"#131318",border:`1px solid ${maxTrades===0?neonColor:`${neonColor}22`}`,color:maxTrades===0?neonColor:"#ffffffaa"}}>∞</button>
          </div>
        </div>
        <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>ACTIFS</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
          {assets.map(a=><div key={a} style={{display:"flex",alignItems:"center",gap:4,background:"#131318",border:`1px solid ${neon}26`,borderRadius:6,padding:"4px 8px"}}>
            <span style={{fontSize:11,color:"#ffffff",fontFamily:MONO}}>{a}</span>
            {!PRESET_ASSETS.includes(a)&&<button onClick={()=>setAssets(assets.filter(x=>x!==a))} style={{background:"transparent",border:"none",color:"#ff4d4d",fontSize:10,cursor:"pointer"}}>✕</button>}
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <input value={customAsset} onChange={e=>setCustomAsset(e.target.value)} placeholder={t.customAsset} onKeyDown={e=>{if(e.key==="Enter"&&customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} style={{...inSt,marginBottom:0,flex:1}}/>
          <button onClick={()=>{if(customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} className="btn" style={{background:`${neonColor}1a`,border:`1px solid ${neonColor}55`,color:neonColor,borderRadius:8,padding:"0 14px",fontSize:18}}>+</button>
        </div>
        {/* ── Modules activables ── */}
        <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>{fr?"MODULES DU FORMULAIRE":"FORM MODULES"}</div>
          <div style={{fontSize:9,color:"#ffffff44",marginBottom:8,lineHeight:1.5}}>{fr?"Active ou masque des champs à la saisie. Les données déjà enregistrées sont conservées.":"Show or hide fields when logging. Existing data is kept."}</div>
          {[["rejet",fr?"Qualité du rejet (1-10)":"Rejection quality (1-10)"],["checkin",fr?"Check-in (humeur / biais)":"Check-in (mood / bias)"],["postSl",fr?"Direction post-SL":"Post-SL direction"],["revenge",fr?"Revenge trade":"Revenge trade"],["timeframe",fr?"Timeframe":"Timeframe"]].map(([key,label])=>(()=>{
            const val=modules[key]!==false;
            return <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${neonColor}0d`}}>
              <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{label}</span>
              <button onClick={()=>setModules(m=>({...m,[key]:!val}))} className="btn" style={{width:44,height:24,borderRadius:12,background:val?`${neonColor}33`:"#ffffff12",border:`1px solid ${val?neonColor:`${neonColor}30`}`,position:"relative",transition:"all 0.2s"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:val?neonColor:"#ffffffaa",position:"absolute",top:3,left:val?24:4,transition:"all 0.2s"}}/>
              </button>
            </div>;
          })())}
        </div>
        {/* ── Timeframes visibles + défaut ── */}
        {modules.timeframe!==false&&<div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>{fr?"TIMEFRAMES AFFICHÉS":"VISIBLE TIMEFRAMES"}</div>
          <div style={{fontSize:9,color:"#ffffff44",marginBottom:8}}>{fr?"Coche ceux que tu utilises (min. 1).":"Tick the ones you use (min. 1)."}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:14}}>
            {ALL_TIMEFRAMES.map(tf=>{
              const on=timeframes.includes(tf);
              return <button key={tf} onClick={()=>toggleTf(tf)} className="btn" style={{flex:"1 0 13%",minWidth:42,padding:"9px 0",borderRadius:8,fontSize:10,fontWeight:700,fontFamily:MONO,background:on?`${neonColor}26`:"#131318",border:`1px solid ${on?neonColor:"#ffffff0d"}`,color:on?neonColor:"#ffffff55"}}>{tf}</button>;
            })}
          </div>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8}}>{fr?"TIMEFRAME PAR DÉFAUT":"DEFAULT TIMEFRAME"}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {timeframes.map(tf=>(
              <button key={tf} onClick={()=>setDefaultTf(tf)} className="btn"
                style={{flex:"1 0 13%",minWidth:42,padding:"9px 0",borderRadius:8,fontSize:9,fontWeight:700,fontFamily:MONO,
                  background:defaultTf===tf?`${neonColor}18`:"#131318",
                  border:`1px solid ${defaultTf===tf?neonColor:"#ffffff0d"}`,
                  color:defaultTf===tf?neonColor:"#ffffffbb"}}>
                {tf}
              </button>
            ))}
          </div>
        </div>}
        <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.thresholdLabel}</div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[4,5,6,7,8].map(n=><button key={n} onClick={()=>setThreshold(n)} className="btn" style={{flex:1,padding:8,borderRadius:8,fontSize:13,fontWeight:700,fontFamily:MONO,background:threshold===n?`${neonColor}33`:"#131318",border:`1px solid ${threshold===n?neonColor:`${neonColor}22`}`,color:threshold===n?neonColor:"#ffffffbb"}}>{n}</button>)}
        </div>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.criteriaLabel} ({items.length})</div>
        {items.map((item,i)=>{
          const isE=(eliminatoires||[]).includes(i);
          return <div key={i} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
            <input value={item} onChange={e=>{const n=[...items];n[i]=e.target.value;setItems(n);}} style={{...inSt,marginBottom:0,flex:1}}/>
            <button onClick={()=>setEliminatoires(p=>isE?p.filter(x=>x!==i):[...p,i])} title={isE?"Retirer éliminatoire":"Marquer éliminatoire"} style={{background:isE?"rgba(255,77,77,0.15)":"transparent",border:`1px solid ${isE?"#ff4d4d":"rgba(255,77,77,0.25)"}`,color:isE?"#ff4d4d":"#ffffff44",borderRadius:6,padding:"6px 8px",cursor:"pointer",flexShrink:0,display:"inline-flex",alignItems:"center"}}><Icon name="bolt" size={13} color={isE?"#ff4d4d":"#ffffff44"}/></button>
            <button onClick={()=>setItems(items.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",cursor:"pointer",flexShrink:0}}>✕</button>
          </div>;
        })}
        <button onClick={()=>setItems([...items,""])} style={{width:"100%",background:"transparent",border:`1px dashed ${neon}35`,color:"#ffffff44",borderRadius:8,padding:10,fontSize:12,cursor:"pointer",fontFamily:MONO,marginBottom:16}}>{t.addCriteria}</button>
        <SaveBtn/>
      </div>}

      {/* ══ ONGLET RÉGLAGES ══ */}
      {tab==="reglages"&&<div>
        <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.langLabel}</div>
          <div style={{display:"flex",gap:8}}>{[["fr","Français"],["en","English"]].map(([l,label])=><button key={l} onClick={()=>onLangChange(l)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:lang===l?`${neonColor}26`:"#131318",border:`1px solid ${lang===l?neonColor:`${neonColor}22`}`,color:lang===l?neonColor:"#ffffffbb"}}>{label}</button>)}</div>
        </div>
        <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.colorLabel}</div>
          <div style={{display:"flex",gap:8}}>{NEON_COLORS.map(c=><button key={c.value} onClick={()=>setNeonColor(c.value)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,background:neonColor===c.value?`${c.value}26`:"#131318",border:`2px solid ${neonColor===c.value?c.value:"transparent"}`,cursor:"pointer"}}><div style={{width:16,height:16,borderRadius:"50%",background:c.value,margin:"0 auto",boxShadow:neonColor===c.value?`0 0 8px ${c.value}`:"none"}}/></button>)}</div>
        </div>
        <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
          <Toggle label={t.calendarToggle} val={calendarOn} set={setCalendarOn}/>
          <Toggle label={t.enableNotif} val={notifOn} set={setNotifOn}/>
        </div>
        <SaveBtn/>
        <div style={{height:1,background:"rgba(255,77,77,0.1)",margin:"14px 0 10px"}}/>
        <button onClick={onImport} className="btn" style={{width:"100%",background:`${neon}0a`,border:`1px solid ${neon}28`,color:neon,borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:10}}>↑ {fr?"Importer un CSV (MT4/MT5/cTrader)":"Import CSV (MT4/MT5/cTrader)"}</button>
        <button onClick={onReset} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:10}}>{t.resetBtn}</button>
        <button onClick={onLogout} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.1)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:11,fontFamily:MONO,marginBottom:18}}>{t.logout}</button>
        {/* Section Légal */}
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{fr?"LÉGAL":"LEGAL"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[["mentions",fr?"Mentions légales":"Legal Notice"],["cgu",fr?"Conditions d'utilisation":"Terms of Use"],["privacy",fr?"Politique de confidentialité":"Privacy Policy"],["disclaimer",fr?"Avertissement sur les risques":"Risk Disclaimer"]].map(([k,label])=>(
            <button key={k} onClick={()=>setShowLegal(k)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#131318",border:"1px solid #ffffff10",color:"#ffffffcc",borderRadius:10,padding:"12px 14px",fontSize:12,fontFamily:MONO}}>
              <span style={{display:"flex",alignItems:"center",gap:9}}><Icon name="insight" size={14} color={neon}/>{label}</span>
              <span style={{color:"#ffffff44"}}>›</span>
            </button>
          ))}
        </div>
        <div style={{fontSize:9,color:"#ffffff33",fontFamily:MONO,marginTop:14,textAlign:"center"}}>TrackMyTrade · v1.0</div>
        {showLegal&&<LegalModal tab={showLegal} lang={lang} neon={neon} onClose={()=>setShowLegal(null)}/>}
      </div>}

    </div>
  );
}


// ── Gestionnaire de notifications ──
const NOTIF_PERMISSION_KEY = "tmt_notif_perm";

function InAppBanner({notifs, onDismiss, neon}) {
  if(!notifs||!notifs.length) return null;
  const n = notifs[0];
  const colors = { info: neon, warn: "#f0b429", danger: "#ff4d4d", success: neon };
  const c = colors[n.type] || neon;
  const M = "'Geist Mono','IBM Plex Mono',monospace";
  return (
    <div onClick={onDismiss} style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.72)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div className="slide-up" onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxWidth:340,background:"linear-gradient(150deg,#15151c,#0e0e14)",border:`1px solid ${c}3a`,borderRadius:18,padding:"26px 22px 22px",boxShadow:`0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${c}15, inset 0 1px 0 ${c}1a`,overflow:"hidden"}}>
        {/* Halo décoratif */}
        <div style={{position:"absolute",top:-40,right:-40,width:120,height:120,borderRadius:"50%",background:`radial-gradient(circle,${c}22,transparent 70%)`,pointerEvents:"none"}}/>
        {/* Glyphe dans un cercle */}
        <div style={{width:48,height:48,borderRadius:14,background:`${c}16`,border:`1px solid ${c}40`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14,boxShadow:`0 0 20px ${c}25`}}><Icon name={n.icon||"insight"} size={24} color={c} animate={n.type==="warn"||n.type==="danger"}/></div>
        <div style={{fontSize:15,fontWeight:800,color:"#ffffff",fontFamily:M,marginBottom:7,letterSpacing:0.2}}>{n.title}</div>
        <div style={{fontSize:12,color:"#ffffffaa",fontFamily:M,lineHeight:1.6,marginBottom:20}}>{n.body}</div>
        <button onClick={onDismiss} className="btn" style={{width:"100%",background:`${c}18`,border:`1px solid ${c}55`,color:c,borderRadius:10,padding:"11px 0",fontSize:12,fontWeight:700,fontFamily:M,letterSpacing:1,cursor:"pointer"}}>OK</button>
      </div>
    </div>
  );
}

function ImportCSVModal({onImport, onClose, lang, neon, config}) {
  const fr = lang === "fr";
  const M = "'Geist Mono','IBM Plex Mono',monospace";
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState(null);
  const fileRef = useRef();

  const detectFormat = (headers) => {
    const h = headers.map(x=>(x||"").toLowerCase().trim());
    if(h.some(x=>x.includes("ticket")||x.includes("magic"))) return "mt4";
    if(h.some(x=>x.includes("deal")||x.includes("entry reason"))) return "mt5";
    if(h.some(x=>x.includes("position id")||x.includes("direction"))) return "ctrader";
    if(h.some(x=>x.includes("order id")||x.includes("qty"))) return "generic";
    return "unknown";
  };

  const parseMT4 = (rows, headers) => {
    return rows.filter(r=>r.length>5).map(r=>{
      const get = (keys) => { for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return (r[i]||"").trim();} return ""; };
      const profit = parseFloat(get(["profit","pnl"])) || 0;
      const type = get(["type","action"]).toUpperCase();
      const sym = get(["symbol","instrument","pair"]);
      const openTime = get(["open time","opentime","open"]);
      const date = openTime ? openTime.split(" ")[0].replace(/\./g,"-") : "";
      const time = openTime ? (openTime.split(" ")[1]||"").slice(0,5) : "";
      if(!sym||!date) return null;
      const dir = type.includes("BUY")||type==="0"?"BUY":type.includes("SELL")||type==="1"?"SELL":"BUY";
      const result = profit>0?"WIN":profit<0?"LOSS":"BE";
      return {id:Date.now()+Math.random(),date,time,asset:sym,direction:dir,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:`Import MT4`};
    }).filter(Boolean);
  };

  const parseMT5 = (rows, headers) => {
    return rows.filter(r=>r.length>5).map(r=>{
      const get = (keys) => { for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return (r[i]||"").trim();} return ""; };
      const profit = parseFloat(get(["profit","commission","balance"])) || 0;
      const type = get(["type","action","deal type"]).toUpperCase();
      const sym = get(["symbol","instrument"]);
      const time = get(["time","open time","deal time"]);
      const date = time ? time.split(" ")[0].replace(/\./g,"-") : "";
      const timeStr = time ? (time.split(" ")[1]||"").slice(0,5) : "";
      if(!sym||!date) return null;
      const dir = type.includes("BUY")||type==="IN"?"BUY":type.includes("SELL")||type==="OUT"?"SELL":"BUY";
      const result = profit>0?"WIN":profit<0?"LOSS":"BE";
      return {id:Date.now()+Math.random(),date,time:timeStr,asset:sym,direction:dir,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:`Import MT5`};
    }).filter(Boolean);
  };

  const parseCTrader = (rows, headers) => {
    return rows.filter(r=>r.length>5).map(r=>{
      const get = (keys) => { for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return (r[i]||"").trim();} return ""; };
      const profit = parseFloat(get(["net profit","profit","pnl","gain"])) || 0;
      const dir = get(["direction","trade side","type"]).toUpperCase();
      const sym = get(["symbol","instrument"]);
      const openTime = get(["open time","entry time","time"]);
      const date = openTime ? openTime.split("T")[0].split(" ")[0] : "";
      const timeStr = openTime ? (openTime.split("T")[1]||openTime.split(" ")[1]||"").slice(0,5) : "";
      if(!sym||!date) return null;
      const direction = dir.includes("BUY")?"BUY":dir.includes("SELL")?"SELL":"BUY";
      const result = profit>0?"WIN":profit<0?"LOSS":"BE";
      return {id:Date.now()+Math.random(),date,time:timeStr,asset:sym,direction,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:`Import cTrader`};
    }).filter(Boolean);
  };

  const parseGeneric = (rows, headers) => {
    return rows.filter(r=>r.length>=4).map(r=>{
      const get = (keys) => { for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return (r[i]||"").trim();} return ""; };
      const profit = parseFloat(get(["profit","pnl","gain","return","%"])) || 0;
      const sym = get(["symbol","instrument","asset","pair","market"]) || "UNKNOWN";
      const dir = get(["direction","side","type","action"]).toUpperCase();
      const date = get(["date","time","open"]).split(" ")[0].replace(/\./g,"-") || new Date().toISOString().split("T")[0];
      const direction = dir.includes("BUY")||dir==="LONG"?"BUY":dir.includes("SELL")||dir==="SHORT"?"SELL":"BUY";
      const result = profit>0?"WIN":profit<0?"LOSS":"BE";
      return {id:Date.now()+Math.random(),date,time:"",asset:sym,direction,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:"Import CSV"};
    }).filter(Boolean);
  };

  const handleFile = (file) => {
    if(!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l=>l.trim());
        if(lines.length < 2) { setError(fr?"Fichier vide ou invalide":"Empty or invalid file"); return; }
        // Détecter séparateur
        const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
        const headers = lines[0].split(sep).map(h=>h.replace(/["\']/g,"").trim());
        const rows = lines.slice(1).map(l=>l.split(sep).map(c=>c.replace(/["\']/g,"").trim()));
        const fmt = detectFormat(headers);
        setPlatform(fmt);
        let trades = [];
        if(fmt==="mt4") trades = parseMT4(rows, headers);
        else if(fmt==="mt5") trades = parseMT5(rows, headers);
        else if(fmt==="ctrader") trades = parseCTrader(rows, headers);
        else trades = parseGeneric(rows, headers);
        if(!trades.length) { setError(fr?"Aucun trade valide trouvé":"No valid trades found"); return; }
        setParsed(trades);
        setStep("preview");
      } catch(err) { setError(`Erreur: ${err.message}`); }
    };
    reader.readAsText(file);
  };

  const platformLabel = {mt4:"MetaTrader 4",mt5:"MetaTrader 5",ctrader:"cTrader",generic:"Format générique",unknown:"Format inconnu"};
  const platformColor = {mt4:neon,mt5:neon,ctrader:"#00d4ff",generic:"#f0b429",unknown:"#ff4d4d"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="slide-up" style={{background:"#0f0f18",border:`1px solid ${neon}28`,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",paddingBottom:32}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:neon,opacity:0.7}}/>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${neon}10`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:M}}>
              {fr?"◈ IMPORT CSV":"◈ CSV IMPORT"}
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}44`,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontSize:9,color:`${neon}33`,marginTop:3,fontFamily:M}}>MT4 · MT5 · cTrader · Format générique</div>
        </div>

        <div style={{padding:"16px 20px"}}>
          {step==="upload"&&(
            <>
              <div style={{fontSize:11,color:"#ffffffaa",lineHeight:1.7,marginBottom:16,fontFamily:M}}>
                {fr?"Exporte ton historique depuis ta plateforme (Rapports → Historique) et importe le fichier CSV ou TSV ici."
                   :"Export your history from your platform (Reports → History) and import the CSV or TSV file here."}
              </div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e=>handleFile(e.target.files[0])} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} className="btn"
                style={{width:"100%",background:`${neon}0d`,border:`2px dashed ${neon}30`,borderRadius:12,padding:"24px 0",color:neon,fontSize:12,fontWeight:700,fontFamily:M,letterSpacing:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {fr?"Choisir un fichier CSV":"Choose a CSV file"}
              </button>
              {error&&<div style={{marginTop:12,background:"rgba(255,77,77,0.08)",border:"1px solid rgba(255,77,77,0.2)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#ff4d4d",fontFamily:M}}>{error}</div>}
              <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:6}}>
                {["MetaTrader 4","MetaTrader 5","cTrader"].map(p=>(
                  <div key={p} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:`${neon}06`,borderRadius:8,border:`1px solid ${neon}10`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:neon,opacity:0.6,flexShrink:0}}/>
                    <span style={{fontSize:10,color:"#ffffffaa",fontFamily:M}}>{p} — {fr?`Rapports → Détail du compte`:`Reports → Account history`}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {step==="preview"&&(
            <>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:`${platformColor[platform]||neon}14`,color:platformColor[platform]||neon,fontFamily:M,fontWeight:700,border:`1px solid ${platformColor[platform]||neon}28`}}>
                  {platformLabel[platform]||"Inconnu"} ✓
                </span>
                <span style={{fontSize:10,color:`${neon}55`,fontFamily:M}}>{parsed.length} {fr?"trades détectés":"trades detected"}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:280,overflowY:"auto"}}>
                {parsed.slice(0,8).map((t,i)=>(
                  <div key={i} style={{background:`${t.result==="WIN"?neon:"#ff4d4d"}08`,border:`1px solid ${t.result==="WIN"?neon:"#ff4d4d"}18`,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:"#ffffff",fontFamily:M}}>{t.asset} · {t.direction}</div>
                      <div style={{fontSize:9,color:`${neon}44`,fontFamily:M}}>{t.date}{t.time?" · "+t.time:""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:12,fontWeight:700,color:t.result==="WIN"?neon:"#ff4d4d",fontFamily:M}}>{t.result}</div>
                      <div style={{fontSize:10,color:parseFloat(t.pnlPct)>=0?neon:"#ff4d4d",fontFamily:M}}>{parseFloat(t.pnlPct)>=0?"+":""}{t.pnlPct}%</div>
                    </div>
                  </div>
                ))}
                {parsed.length>8&&<div style={{fontSize:10,color:`${neon}33`,textAlign:"center",fontFamily:M}}>+{parsed.length-8} {fr?"autres trades":"more trades"}</div>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setStep("upload")} className="btn" style={{flex:1,background:"transparent",border:`1px solid ${neon}22`,color:`${neon}55`,borderRadius:10,padding:"12px 0",fontSize:11,fontFamily:M}}>
                  {fr?"Annuler":"Cancel"}
                </button>
                <button onClick={()=>{onImport(parsed);setStep("done");}} className="btn" style={{flex:2,background:`${neon}20`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"12px 0",fontSize:12,fontWeight:700,fontFamily:M,letterSpacing:1}}>
                  {fr?`Importer ${parsed.length} trades`:`Import ${parsed.length} trades`}
                </button>
              </div>
            </>
          )}

          {step==="done"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={neon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{marginBottom:16}}><circle cx="12" cy="12" r="9"/><polyline points="7.5,12.5 10.5,15.5 17,8.5"/></svg>
              <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:M,marginBottom:6}}>{fr?"Import réussi !":"Import successful!"}</div>
              <div style={{fontSize:11,color:`${neon}55`,fontFamily:M,marginBottom:20}}>{parsed.length} {fr?"trades ajoutés à ton journal":"trades added to your journal"}</div>
              <button onClick={onClose} className="btn" style={{background:`${neon}18`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"12px 32px",fontSize:12,fontWeight:700,fontFamily:M}}>{fr?"Voir l'historique":"View history"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function ExportModal({trades,onClose,lang,neon}) {
  const t=T[lang];
  const dl=(c,n,tp)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([c],{type:tp}));a.download=n;a.click();};
  const pnl=trades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const wins=trades.filter(x=>x.result==="WIN").length;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="slide-up" style={{background:"#131318",border:`1px solid ${neon}35`,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:neon,fontFamily:MONO}}>{t.exportTitle}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffffaa",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          <Stat label={t.trades.toUpperCase()} value={trades.length} color="#38bdf8"/>
          <Stat label="WIN RATE" value={trades.length?Math.round(wins/trades.length*100)+"%":"—"} color={trades.length&&wins/trades.length>=0.5?neon:"#ff4d4d"}/>
          <Stat label="P&L" value={fmtPct(pnl)} color={pnl>=0?neon:"#ff4d4d"}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{const h=["Date","Asset","Dir","Result","P&L%","Score","Conform","Revenge","Humeur","Biais","Notes"];const rows=trades.map(x=>[x.date,x.asset,x.direction,x.result,x.pnlPct,x.setupScore,x.conforming?"Yes":"No",x.isRevenge?"Yes":"No",x.checkin?.humeur||"",x.checkin?.biais||"",`"${(x.notes||"").replace(/"/g,"'")}"`]);dl([h,...rows].map(r=>r.join(",")).join("\n"),`tmt-${today()}.csv`,"text/csv");}} className="btn" style={{flex:1,background:`${neon}1a`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>↓ CSV<br/><span style={{fontSize:9,opacity:0.6}}>{t.exportCsv}</span></button>
          <button onClick={()=>dl(JSON.stringify(trades,null,2),`tmt-${today()}.json`,"application/json")} className="btn" style={{flex:1,background:"rgba(56,189,248,0.1)",border:"1px solid #38bdf8",color:"#38bdf8",borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>↓ JSON<br/><span style={{fontSize:9,opacity:0.6}}>{t.exportJson}</span></button>
        </div>
      </div>
    </div>
  );
}


function Tutorial({neon="#00ff9d", onEnd}) {
  const STEPS = [
    {elId:"tut-account",    icon:"account", title:"Tes comptes",            body:"Ce bandeau montre ton compte actif, son capital et ta progression vers l'objectif. Clique dessus pour basculer entre tes comptes (prop firm, perso, démo).",  pos:"below"},
    {elId:"tut-kpi",        icon:"stats", title:"Win Rate & P&L",         body:"Tes deux chiffres clés en haut : Win Rate (% de trades gagnants) et P&L (performance en % et en devise, capital recalculé automatiquement).",  pos:"below"},
    {elId:"tut-discipline", icon:"discipline", title:"Discipline & Profit Factor", body:"Discipline : note /10 basée sur ta conformité aux règles et l'absence de revenge trades. Profit Factor : tes gains divisés par tes pertes — au-dessus de 1.5, ton edge est solide.",  pos:"below"},
    {elId:"tut-coach",      icon:"insight",  title:"Résumé & performance",   body:"Une lecture de tes stats en une phrase. Bascule entre Résumé (analyse écrite) et Courbe (équité). Clique sur le résumé pour le détail complet, filtrable par compte. Dès 5 trades.",  pos:"below"},
    {elId:"tut-lasttrade",  icon:"bolt", title:"Dernier Trade",          body:"Ton dernier trade enregistré. Clique pour voir le détail complet, le modifier, le partager ou le réassigner à un autre compte.",  pos:"below"},
    {elId:"tut-addtrade",   icon:"add",  title:"Enregistrer un Trade",   body:"Après chaque trade : actif, checklist, résultat et P&L en % ou en devise. Active ou masque des champs (rejet, check-in, timeframe…) dans Paramètres › Stratégie.",  pos:"above"},
    {elId:"tut-nav",        icon:"nav", title:"Navigation",             body:"Stats = Dashboard · + Trade = Saisir un trade · Historique = Tous tes trades filtrables · ⚙ = Paramètres, modules, actifs, seuil de conformité.",   pos:"above", last:true},
  ];
  const [step, setStep] = useState(0);
  const [spotRect, setSpotRect] = useState(null);
  const [ttPos, setTtPos] = useState({top:100, left:20});
  const [ttVisible, setTtVisible] = useState(false);
  const animRef = useRef(null);
  const prevRect = useRef(null);

  const getRect = id => {
    const el = document.getElementById(id);
    if(!el) return null;
    const r = el.getBoundingClientRect();
    return {x:r.left, y:r.top, w:r.width, h:r.height};
  };

  const calcTtPos = (r, pos) => {
    if(!r) return {top:100, left:20};
    const pad=14, ttH=195, ttW=282;
    const winW=window.innerWidth, winH=window.innerHeight;
    let top, left = Math.max(10, Math.min(r.x, winW - ttW - 10));
    if(pos==="below") {
      top = r.y + r.h + pad;
      if(top + ttH > winH - 10) top = r.y - ttH - pad;
    } else {
      top = r.y - ttH - pad;
      if(top < 10) top = r.y + r.h + pad;
    }
    return {top, left};
  };

  const lerp = (a,b,t) => a + (b-a)*t;
  const easeOut = t => 1 - Math.pow(1-t, 3);

  const animateTo = toRect => {
    const from = prevRect.current || toRect;
    const start = performance.now();
    const dur = 420;
    const frame = now => {
      const t = easeOut(Math.min((now-start)/dur, 1));
      setSpotRect({
        x: lerp(from.x, toRect.x, t),
        y: lerp(from.y, toRect.y, t),
        w: lerp(from.w, toRect.w, t),
        h: lerp(from.h, toRect.h, t),
      });
      if(t < 1) animRef.current = requestAnimationFrame(frame);
      else prevRect.current = toRect;
    };
    if(animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(frame);
  };

  // Applique le halo + tooltip une fois que l'élément est correctement positionné à l'écran
  const applyStep = (s, animate) => {
    const r = getRect(s.elId);
    if(r) {
      if(animate) animateTo(r);
      else { setSpotRect(r); prevRect.current = r; }
      setTtPos(calcTtPos(r, s.pos));
    } else {
      // Élément absent (ex: coach/compte pas encore visibles) → pas de halo, tooltip centré
      if(animRef.current) cancelAnimationFrame(animRef.current);
      setSpotRect(null); prevRect.current = null;
      const ttW=282, ttH=195;
      setTtPos({top:Math.max(80,(window.innerHeight-ttH)/2), left:Math.max(10,(window.innerWidth-ttW)/2)});
    }
    setTtVisible(false);
    setTimeout(() => setTtVisible(true), 60);
  };

  const showStep = (i, animate=false) => {
    const s = STEPS[i];
    const el = document.getElementById(s.elId);
    if(el && typeof el.scrollIntoView === "function") {
      // Centrer l'élément à l'écran AVANT de dessiner le halo
      // On masque le tooltip pendant le scroll pour éviter un flash mal placé
      setTtVisible(false);
      try { el.scrollIntoView({behavior:"smooth", block:"center", inline:"nearest"}); }
      catch(e){ try { el.scrollIntoView(); } catch(_){} }
      // Attendre la fin du scroll (≈ durée d'un smooth scroll) puis appliquer
      setTimeout(() => applyStep(s, animate), 380);
    } else {
      // Pas d'élément à scroller : appliquer directement (tooltip centré)
      applyStep(s, animate);
    }
  };

  useEffect(() => { setTimeout(() => showStep(0, false), 120); }, []);
  useEffect(() => () => { if(animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const next = () => {
    if(step >= STEPS.length - 1) { onEnd&&onEnd(); return; }
    const ns = step + 1;
    setStep(ns);
    showStep(ns, true);
  };

  const s = STEPS[step];
  const pad = 10;
  const sx = spotRect ? spotRect.x - pad : 0;
  const sy = spotRect ? spotRect.y - pad : 0;
  const sw = spotRect ? spotRect.w + pad*2 : 0;
  const sh = spotRect ? spotRect.h + pad*2 : 0;
  const pct = Math.round((step+1)/STEPS.length*100);

  return (
    <>
      <div className="tut-overlay" onClick={e => { if(e.target===e.currentTarget) { onEnd&&onEnd(); }}}>
        <svg className="tut-svg">
          <defs>
            <mask id="tut-mask">
              <rect width="100%" height="100%" fill="white"/>
              <rect x={sx} y={sy} width={sw} height={sh} rx="16" fill="black"/>
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(3,3,10,0.87)" mask="url(#tut-mask)"/>
          {spotRect&&<>
            <rect x={sx-1} y={sy-1} width={sw+2} height={sh+2} rx="17" fill="none" stroke={neon} strokeWidth="1.5" opacity="0.55"/>
            <rect x={sx-9} y={sy-9} width={sw+18} height={sh+18} rx="22" fill="none" stroke={neon} strokeWidth="10" opacity="0.04"/>
          </>}
        </svg>
      </div>
      <div className="tut-tooltip" style={{
        top: ttPos.top,
        left: ttPos.left,
        opacity: ttVisible ? 1 : 0,
        transform: ttVisible ? "translateY(0)" : (s.pos==="below" ? "translateY(10px)" : "translateY(-10px)"),
      }}>
        <div className="tut-icon"><Icon name={s.icon} size={20} color={neon}/></div>
        <div className="tut-title">{s.title}</div>
        <div className="tut-body">{s.body}</div>
        <div className="tut-foot">
          <div className="tut-prog-wrap">
            <div className="tut-prog-bar">
              <div className="tut-prog-fill" style={{width:`${pct}%`}}/>
            </div>
            <div className="tut-step-label">{step+1} / {STEPS.length}</div>
          </div>
          <button className="tut-btn-skip" onClick={()=>{ onEnd&&onEnd(); }}>Passer</button>
          <button className="tut-btn-next" onClick={next}>{s.last?"Terminer ✓":"Suivant →"}</button>
        </div>
      </div>
    </>
  );
}

// ── INSIGHTS : calcul des 4 conseils ──
function computeInsights(trades, lang){
  const fr = lang==="fr";
  const insights = [];
  if(!trades || trades.length < 10) return insights;
  const wins = trades.filter(x=>x.result==="WIN");
  const losses = trades.filter(x=>x.result==="LOSS");

  // 1. CONFORMITÉ (priorité haute, edge actionnable)
  const conf = trades.filter(x=>x.conforming);
  const nconf = trades.filter(x=>!x.conforming);
  if(conf.length>=3 && nconf.length>=3){
    const cWR = Math.round(conf.filter(x=>x.result==="WIN").length/conf.length*100);
    const nWR = Math.round(nconf.filter(x=>x.result==="WIN").length/nconf.length*100);
    if(cWR - nWR >= 10){
      insights.push({
        type:"edge", emoji:"📊", color:"NEON",
        title: fr?"La checklist paie":"Checklist pays off",
        body: fr?`Conformes : ${cWR}% WR vs ${nWR}% sans checklist. Tu gagnes +${cWR-nWR}% en suivant tes règles.`
             :`Compliant: ${cWR}% WR vs ${nWR}% without checklist. You gain +${cWR-nWR}% by sticking to rules.`
      });
    }
  }

  // 2. JOUR FORT / JOUR FAIBLE
  const byDay = {};
  trades.forEach(x=>{ const d=new Date(x.date).getDay(); if(!byDay[d]) byDay[d]={w:0,t:0}; byDay[d].t++; if(x.result==="WIN") byDay[d].w++; });
  const daysFr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  const daysEn=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dayNames = fr?daysFr:daysEn;
  const dayStats = Object.entries(byDay).filter(([,v])=>v.t>=2).map(([d,v])=>({day:dayNames[d], wr:Math.round(v.w/v.t*100), t:v.t})).sort((a,b)=>b.wr-a.wr);
  if(dayStats.length>=2 && (dayStats[0].wr - dayStats[dayStats.length-1].wr) >= 15){
    const best = dayStats[0];
    const worst = dayStats[dayStats.length-1];
    insights.push({
      type:"pattern", emoji:"📅", color:"#00d4ff",
      title: fr?"Pattern par jour":"Day pattern",
      body: fr?`${best.day} : ${best.wr}% WR sur ${best.t} trades. ${worst.day} : ${worst.wr}% sur ${worst.t}. ${worst.wr<40?`Évite le ${worst.day}.`:`Concentre-toi sur tes meilleurs jours.`}`
           :`${best.day}: ${best.wr}% WR over ${best.t} trades. ${worst.day}: ${worst.wr}% over ${worst.t}. ${worst.wr<40?`Avoid ${worst.day}.`:`Focus on your best days.`}`
    });
  }

  // 3. STREAK DISCIPLINE OU ALERTE REVENGE
  const now = new Date();
  const cutoff14 = new Date(now.getTime() - 14*86400000).toISOString().split("T")[0];
  const cutoff7 = new Date(now.getTime() - 7*86400000).toISOString().split("T")[0];
  const last14 = trades.filter(x=>x.date>=cutoff14);
  const last7 = trades.filter(x=>x.date>=cutoff7);
  const rev14 = last14.filter(x=>x.isRevenge);
  const rev7 = last7.filter(x=>x.isRevenge);
  if(rev7.length >= 2){
    const revWins = rev7.filter(x=>x.result==="WIN").length;
    const revWR = Math.round(revWins/rev7.length*100);
    insights.push({
      type:"alert", emoji:"⚠", color:"#ff4d4d",
      title: fr?"Revenge trades":"Revenge trades",
      body: fr?`${rev7.length} revenge trades cette semaine. Win rate : ${revWR}%. La pause obligatoire serait moins chère.`
           :`${rev7.length} revenge trades this week. Win rate: ${revWR}%. A mandatory pause would cost less.`
    });
  } else if(last14.length >= 5 && rev14.length === 0){
    insights.push({
      type:"reinforce", emoji:"✓", color:"NEON",
      title: fr?"Discipline qui tient":"Discipline holds",
      body: fr?`14 jours sans revenge trade sur ${last14.length} trades. Ne casse pas la série.`
           :`14 days without a revenge trade over ${last14.length} trades. Keep the streak going.`
    });
  }

  // 4. ASYMÉTRIE WIN/LOSS
  if(wins.length>=5 && losses.length>=5){
    const avgWin = wins.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/wins.length;
    const avgLoss = Math.abs(losses.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/losses.length);
    const ratio = avgLoss>0?avgWin/avgLoss:Infinity;
    if(ratio < 1 && avgWin>0 && avgLoss>0){
      insights.push({
        type:"lever", emoji:"🎯", color:"#f0b429",
        title: fr?"Asymétrie à corriger":"Asymmetry to fix",
        body: fr?`Tes WIN font +${avgWin.toFixed(1)}% en moyenne, tes LOSS -${avgLoss.toFixed(1)}%. Tu coupes tes gains trop tôt, ou tu laisses traîner les pertes.`
             :`Your WINs average +${avgWin.toFixed(1)}%, your LOSSes -${avgLoss.toFixed(1)}%. You cut winners too early, or let losers run.`
      });
    }
  }

  // Priorité : alert > edge > pattern > reinforce > lever, max 4
  const order = {alert:0, edge:1, pattern:2, reinforce:3, lever:4};
  return insights.sort((a,b)=>order[a.type]-order[b.type]).slice(0,4);
}

// ── Bloc Insights replié par défaut ──
function InsightsBlock({trades, lang, neon}){
  const fr = lang==="fr";
  const [open, setOpen] = useState(false);
  const insights = computeInsights(trades, lang);
  if(insights.length === 0) return null;
  return (<div style={{marginBottom:12}}>
    <button onClick={()=>setOpen(o=>!o)} className="btn"
      style={{width:"100%",display:"flex",alignItems:"center",gap:8,background:`${neon}08`,border:`1px solid ${open?neon:`${neon}26`}`,borderRadius:open?"10px 10px 0 0":10,padding:"10px 14px",cursor:"pointer",textAlign:"left"}}>
      <span style={{fontSize:14}}>◈</span>
      <span style={{fontSize:11,fontWeight:700,color:neon,fontFamily:MONO,letterSpacing:1.5,flex:1}}>
        {fr?"INSIGHTS":"INSIGHTS"} · {insights.length} {fr?(insights.length>1?"actions pour progresser":"action pour progresser"):(insights.length>1?"actions to improve":"action to improve")}
      </span>
      <span style={{fontSize:10,color:`${neon}99`,transition:"transform 0.2s",transform:open?"rotate(180deg)":"none"}}>▼</span>
    </button>
    {open&&<div className="slide-up" style={{background:"#0f0f16",border:`1px solid ${neon}26`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"10px 12px"}}>
      {insights.map((ins,i)=>{
        const c = ins.color==="NEON"?neon:ins.color;
        return <div key={i} style={{display:"flex",gap:10,padding:"10px 0",borderTop:i>0?`1px solid ${neon}0a`:"none"}}>
          <div style={{fontSize:18,flexShrink:0,lineHeight:1,marginTop:1}}>{ins.emoji}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:700,color:c,fontFamily:MONO,marginBottom:3,letterSpacing:0.5}}>{ins.title}</div>
            <div style={{fontSize:11,color:"#ffffffbb",fontFamily:MONO,lineHeight:1.55}}>{ins.body}</div>
          </div>
        </div>;
      })}
    </div>}
  </div>);
}

// ── COACH : calcul de la phrase du moment ──
// Retourne {type, glyph, color, message, variant} où variant est un index pour varier les formulations
function computeCoach(tradesInput, lang){
  const fr = lang==="fr";
  if(!tradesInput || tradesInput.length < 5) return null;

  // Tri par id décroissant : id = Date.now() au moment de la création,
  // donc trades[0] est toujours le plus récemment créé (= l'action en cours),
  // peu importe la date saisie. C'est ce qui détermine les streaks réels.
  const trades = [...tradesInput].sort((a,b)=>(Number(b.id)||0)-(Number(a.id)||0));
  const lastN = (n) => trades.slice(0, n);
  const wins = trades.filter(x=>x.result==="WIN");
  const losses = trades.filter(x=>x.result==="LOSS");
  const dayIdx = new Date().getDate() % 3;
  const totalPnl = trades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const wr = trades.length?Math.round(wins.length/trades.length*100):0;

  // ─── 1. ALERTE CRITIQUE ───
  const last5 = lastN(5);
  const recentLosses = last5.filter(x=>x.result==="LOSS").length;
  // Garde : la série de pertes n'est "en cours" QUE si le tout dernier trade (plus récent) est lui-même un LOSS.
  // Sinon, l'utilisateur vient de gagner et ce n'est plus la situation à commenter.
  const lastTradeIsLoss = trades[0] && trades[0].result === "LOSS";
  if(recentLosses >= 3 && lastTradeIsLoss){
    const v = fr ? [
      `${recentLosses} LOSS sur tes 5 derniers trades. Ce n'est pas le marché le problème à cet instant, c'est ton état mental. Les pertes en série poussent à "se refaire" — c'est exactement le piège. Ferme la plateforme et reviens demain avec les yeux clairs.`,
      `Série de ${recentLosses} pertes en cours. Statistiquement, ta prochaine décision sera prise sous stress, donc dégradée. La meilleure action de trading maintenant est de ne pas trader. Note ce que tu ressens, ça vaut plus qu'un trade de plus.`,
      `${recentLosses} LOSS récents : ton cerveau est en mode "récupération", le pire pour décider. Les meilleurs traders ne se distinguent pas par leurs gains mais par leur capacité à stopper l'hémorragie. Arrête-toi ici, aujourd'hui.`,
    ] : [
      `${recentLosses} losses in your last 5 trades. The problem right now isn't the market, it's your mental state. Losing streaks push you to "win it back" — that's the trap. Close the platform, come back tomorrow clear-headed.`,
      `${recentLosses}-loss streak active. Statistically your next decision will be made under stress, so degraded. The best trading move now is not to trade. Write down how you feel — it's worth more than one more trade.`,
      `${recentLosses} recent losses: your brain is in "recovery" mode, the worst for deciding. The best traders aren't defined by their wins but by their ability to stop the bleeding. Stop here, today.`,
    ];
    return {type:"alert", glyph:"⚠", color:"#ff4d4d", message:v[dayIdx]};
  }

  const now = new Date();
  const cutoff7 = new Date(now.getTime() - 7*86400000).toISOString().split("T")[0];
  const last7 = trades.filter(x=>x.date>=cutoff7);
  const rev7 = last7.filter(x=>x.isRevenge);
  if(rev7.length >= 2){
    const rWins = rev7.filter(x=>x.result==="WIN").length;
    const rWR = Math.round(rWins/rev7.length*100);
    const v = fr ? [
      `${rev7.length} revenge trades cette semaine, avec ${rWR}% de réussite seulement. Le revenge trade n'est pas une stratégie, c'est une émotion déguisée en décision. Chaque fois que tu forces, tu apprends à ton cerveau que c'est acceptable. Ta limite quotidienne existe pour ça — utilise-la.`,
      `${rev7.length} fois où tu as forcé un trade cette semaine. Le marché ne te doit rien et ne récompense pas l'insistance. Ces ${rWR}% de WR sur tes revenge le prouvent : tu joues à pile ou face en pariant gros. Coupe ce comportement avant qu'il devienne une habitude.`,
      `Revenge x${rev7.length} sur 7 jours. Le danger n'est pas la perte d'argent immédiate, c'est l'ancrage du réflexe : forcer après une frustration. Tu construis ta discipline ou ton auto-sabotage, un trade à la fois. Là, tu construis le mauvais.`,
    ] : [
      `${rev7.length} revenge trades this week, with only ${rWR}% success. Revenge trading isn't a strategy, it's an emotion disguised as a decision. Every time you force it, you teach your brain it's acceptable. Your daily limit exists for this — use it.`,
      `${rev7.length} times you forced a trade this week. The market owes you nothing and doesn't reward stubbornness. That ${rWR}% WR on your revenge trades proves it: you're flipping coins with big bets. Cut this before it becomes a habit.`,
      `Revenge x${rev7.length} over 7 days. The danger isn't the immediate money lost, it's anchoring the reflex: forcing after frustration. You build your discipline or your self-sabotage, one trade at a time. Right now, you're building the wrong one.`,
    ];
    return {type:"alert", glyph:"⚠", color:"#ff4d4d", message:v[dayIdx]};
  }

  // ─── 2. MOMENTUM POSITIF ───
  let streakWin = 0;
  for(const tr of trades){ if(tr.result==="WIN") streakWin++; else break; }
  if(streakWin >= 3){
    const v = fr ? [
      `${streakWin} WIN d'affilée. C'est exactement le moment où la plupart des comptes explosent : la confiance devient excès de confiance, et tu augmentes la taille "parce que ça marche". Le marché n'a aucune mémoire de ta série. Reste sur la même taille, la même checklist.`,
      `${streakWin} trades gagnants consécutifs. Profite-en, mais souviens-toi : une série de victoires ne change pas tes probabilités, elle change ta perception. L'euphorie est le biais le plus cher du trading. Ton job maintenant : être aussi rigoureux que sur le trade 1.`,
      `${streakWin} WIN de suite — bravo, et attention. Le vrai test n'est pas de gagner, c'est de ne pas se croire invincible après. Beaucoup rendent en un trade ce qu'ils ont mis cinq à gagner. Verrouille tes règles, ne touche pas à ton sizing.`,
    ] : [
      `${streakWin} WINs in a row. This is exactly when most accounts blow up: confidence becomes overconfidence, and you size up "because it's working". The market has no memory of your streak. Keep the same size, the same checklist.`,
      `${streakWin} consecutive winning trades. Enjoy it, but remember: a winning streak doesn't change your odds, it changes your perception. Euphoria is the most expensive bias in trading. Your job now: be as rigorous as on trade 1.`,
      `${streakWin} WINs straight — well done, and watch out. The real test isn't winning, it's not feeling invincible after. Many give back in one trade what took five to earn. Lock your rules, don't touch your sizing.`,
    ];
    return {type:"momentum", glyph:"▲", color:"NEON", message:v[dayIdx]};
  }

  if(last7.length >= 3){
    const weekPnl = last7.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
    if(weekPnl >= 3){
      const v = fr ? [
        `+${weekPnl.toFixed(1)}% sur les 7 derniers jours, ta semaine est solide. Le piège classique maintenant : vouloir "doubler" en sur-tradant ou en prenant des setups moyens. La régularité bat la performance ponctuelle sur le long terme. Encaisse cette semaine sans changer ta méthode.`,
        `Belle dynamique : +${weekPnl.toFixed(1)}% cette semaine. Mais une bonne semaine ne valide pas une stratégie — c'est la répétition sur des dizaines de semaines qui compte. Reste exigeant sur tes entrées, ne deviens pas gourmand parce que le compte est vert.`,
        `+${weekPnl.toFixed(1)}% en 7 jours, excellent rythme. Le danger n'est pas devant toi, il est en toi : la tentation de forcer pour prolonger la série. Les pros savent s'arrêter quand ça va bien autant que quand ça va mal. Protège tes gains.`,
      ] : [
        `+${weekPnl.toFixed(1)}% over the last 7 days, solid week. The classic trap now: wanting to "double up" by overtrading or taking mediocre setups. Consistency beats one-off performance long term. Bank this week without changing your method.`,
        `Strong momentum: +${weekPnl.toFixed(1)}% this week. But one good week doesn't validate a strategy — it's repetition over dozens of weeks that counts. Stay demanding on your entries, don't get greedy because the account is green.`,
        `+${weekPnl.toFixed(1)}% in 7 days, excellent pace. The danger isn't ahead of you, it's inside you: the temptation to force it to extend the streak. Pros know to stop when things go well as much as when they go badly. Protect your gains.`,
      ];
      return {type:"momentum", glyph:"▲", color:"NEON", message:v[dayIdx]};
    }
  }

  // ─── 3. EDGE CONFIRMÉ ───
  const conf = trades.filter(x=>x.conforming);
  const nconf = trades.filter(x=>!x.conforming);
  if(conf.length >= 5 && nconf.length >= 3){
    const cWR = Math.round(conf.filter(x=>x.result==="WIN").length/conf.length*100);
    const nWR = Math.round(nconf.filter(x=>x.result==="WIN").length/nconf.length*100);
    if(cWR - nWR >= 15){
      const v = fr ? [
        `Quand tu respectes ta checklist : ${cWR}% de réussite. Quand tu ne la respectes pas : ${nWR}%. L'écart de ${cWR-nWR} points est ton edge réel, et il est entièrement entre tes mains. Ta stratégie fonctionne — le seul variable instable, c'est ta discipline à l'exécution.`,
        `Tes setups conformes affichent ${cWR}% WR contre ${nWR}% hors règles. Ce n'est pas de la chance, c'est la preuve mathématique que tes critères filtrent les bons trades. Chaque entrée non-conforme est un pari contre tes propres statistiques. Pourquoi le ferais-tu ?`,
        `${cWR}% sur les trades conformes, ${nWR}% sur les autres. Tu as déjà trouvé ce qui marche : il est écrit dans ta checklist. Ton travail n'est plus de chercher une meilleure stratégie, mais d'avoir la discipline d'appliquer celle qui marche déjà, à chaque fois.`,
      ] : [
        `When you follow your checklist: ${cWR}% success. When you don't: ${nWR}%. The ${cWR-nWR}-point gap is your real edge, and it's entirely in your hands. Your strategy works — the only unstable variable is your execution discipline.`,
        `Your compliant setups show ${cWR}% WR versus ${nWR}% off-rules. That's not luck, it's mathematical proof your criteria filter the good trades. Every non-compliant entry is a bet against your own stats. Why would you?`,
        `${cWR}% on compliant trades, ${nWR}% on the rest. You've already found what works: it's written in your checklist. Your job is no longer to find a better strategy, but to have the discipline to apply the one that already works, every time.`,
      ];
      return {type:"edge", glyph:"◆", color:"NEON", message:v[dayIdx]};
    }
  }

  // ─── 4. LEVIER : asymétrie WIN/LOSS ───
  if(wins.length >= 5 && losses.length >= 5){
    const avgWin = wins.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/wins.length;
    const avgLoss = Math.abs(losses.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/losses.length);
    const ratio = avgLoss>0 ? avgWin/avgLoss : Infinity;
    if(ratio < 1 && avgWin > 0 && avgLoss > 0){
      const v = fr ? [
        `Tu gagnes ${wr}% du temps mais ton ratio gain/perte est de ${ratio.toFixed(2)} : tes WIN moyens (+${avgWin.toFixed(1)}%) sont plus petits que tes LOSS moyens (-${avgLoss.toFixed(1)}%). Tu peux avoir raison souvent et perdre quand même. Le problème n'est pas ton entrée, c'est ta sortie : tu coupes tes gains trop tôt par peur de les rendre.`,
        `Ratio ${ratio.toFixed(2)} : mathématiquement, même avec ${wr}% de réussite, cette asymétrie ronge ton compte. Tu sécurises tes gains à +${avgWin.toFixed(1)}% mais laisses courir tes pertes à -${avgLoss.toFixed(1)}%. C'est l'inverse de ce qu'il faut faire. Travaille à laisser respirer tes WIN et à couper tes LOSS plus net.`,
        `Tes gains moyens (+${avgWin.toFixed(1)}%) sont inférieurs à tes pertes moyennes (-${avgLoss.toFixed(1)}%). C'est le défaut numéro un des traders à bon WR : la peur de perdre un gain acquis te fait fermer trop vite. Un seul changement — tenir tes WIN un peu plus longtemps — peut transformer ta courbe.`,
      ] : [
        `You win ${wr}% of the time but your win/loss ratio is ${ratio.toFixed(2)}: your average WINs (+${avgWin.toFixed(1)}%) are smaller than your average LOSSes (-${avgLoss.toFixed(1)}%). You can be right often and still lose. The issue isn't your entry, it's your exit: you cut winners too early out of fear of giving them back.`,
        `Ratio ${ratio.toFixed(2)}: mathematically, even at ${wr}% win rate, this asymmetry erodes your account. You secure gains at +${avgWin.toFixed(1)}% but let losses run to -${avgLoss.toFixed(1)}%. That's the opposite of what works. Work on letting WINs breathe and cutting LOSSes sharper.`,
        `Your average wins (+${avgWin.toFixed(1)}%) are below your average losses (-${avgLoss.toFixed(1)}%). It's the number-one flaw of high-WR traders: fear of losing a booked gain makes you close too fast. One change — holding WINs a bit longer — can transform your curve.`,
      ];
      return {type:"lever", glyph:"◈", color:"#f0b429", message:v[dayIdx]};
    }
  }

  // ─── 5. ÉTAT STABLE ───
  if(trades.length >= 15){
    const v = fr ? [
      `${trades.length} trades enregistrés, ${totalPnl>=0?"+":""}${totalPnl.toFixed(1)}% au total. Tu es dans la phase la moins spectaculaire et la plus importante : la régularité. C'est ici, dans la routine sans drame, que se construit la rentabilité durable. Continue à journaliser chaque trade, c'est ton vrai avantage.`,
      `Phase stable sur ${trades.length} trades. Pas d'alerte, pas d'euphorie — et c'est une bonne nouvelle. Les comptes qui durent ne sont pas ceux qui font des gros coups, mais ceux qui évitent les gros trous. Ton travail invisible aujourd'hui paiera dans six mois.`,
      `${trades.length} trades, courbe ${totalPnl>=0?"positive":"à redresser"}. C'est le moment de creuser ton journal plutôt que ton compte : relis tes meilleurs trades, identifie ce qui les relie. La constance que tu montres est rare — la plupart abandonnent avant d'avoir assez de données pour progresser.`,
    ] : [
      `${trades.length} trades logged, ${totalPnl>=0?"+":""}${totalPnl.toFixed(1)}% total. You're in the least spectacular and most important phase: consistency. This is where, in drama-free routine, durable profitability is built. Keep journaling every trade, it's your real edge.`,
      `Stable phase over ${trades.length} trades. No alerts, no euphoria — and that's good news. Lasting accounts aren't the ones making big hits, but the ones avoiding big holes. Your invisible work today pays off in six months.`,
      `${trades.length} trades, ${totalPnl>=0?"positive":"recovering"} curve. Time to dig into your journal rather than your account: reread your best trades, find what connects them. The consistency you show is rare — most quit before having enough data to improve.`,
    ];
    return {type:"stable", glyph:"●", color:"#00d4ff", message:v[dayIdx]};
  }

  // ─── 6. DÉBUT DE PARCOURS ───
  const v = fr ? [
    `${trades.length} trades : c'est encore trop peu pour tirer des conclusions fiables, et c'est normal. À ce stade, ton objectif n'est pas de gagner, mais d'enregistrer fidèlement chaque trade pour construire un échantillon exploitable. La donnée que tu accumules aujourd'hui te révélera tes vrais patterns demain.`,
    `Phase d'observation, ${trades.length} trades au compteur. Résiste à l'envie de juger ta stratégie maintenant : sur si peu de trades, la chance domine encore tes résultats. Concentre-toi sur une seule chose : la rigueur de ta saisie. Le reste viendra avec le volume.`,
    `${trades.length} trades enregistrés. À ce point, ton journal vaut plus que ton solde : chaque entrée honnête, même sur un trade perdant, construit la lucidité qui te fera progresser. Reste constant, ne saute aucun trade, et laisse les statistiques se former.`,
  ] : [
    `${trades.length} trades: still too few for reliable conclusions, and that's normal. At this stage, your goal isn't to win, but to faithfully log every trade to build a usable sample. The data you accumulate today will reveal your true patterns tomorrow.`,
    `Observation phase, ${trades.length} trades in. Resist the urge to judge your strategy now: over so few trades, luck still dominates your results. Focus on one thing: the rigor of your logging. The rest comes with volume.`,
    `${trades.length} trades logged. At this point, your journal is worth more than your balance: every honest entry, even on a losing trade, builds the clarity that will make you improve. Stay consistent, skip no trade, let the stats form.`,
  ];
  return {type:"start", glyph:"○", color:"#ffffff66", message:v[dayIdx]};
}

function CoachSummaryCard({trades, lang, neon, onOpen}){
  const coach = computeCoach(trades, lang);
  if(!coach) return null;
  const c = coach.color === "NEON" ? neon : coach.color;
  const fr = lang==="fr";
  return (
    <button onClick={onOpen} className="btn" style={{
      position:"relative", width:"100%", textAlign:"left",
      background:"linear-gradient(135deg,#0f0f16 0%,#0c0c12 100%)",
      borderRadius:12, padding:"16px 16px 14px 22px",
      border:`1px solid ${c}22`,
      boxShadow:`0 4px 24px ${c}10, inset 0 1px 0 ${c}10`,
      overflow:"hidden", cursor:"pointer",
    }}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:`linear-gradient(180deg,${c}99,${c}33)`,boxShadow:`0 0 8px ${c}66`}}/>
      <div style={{position:"absolute",top:10,right:14,fontSize:22,color:`${c}22`,fontFamily:MONO,lineHeight:1,pointerEvents:"none"}}>{coach.glyph}</div>
      <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
        <div style={{fontSize:14,color:c,fontFamily:MONO,lineHeight:1.5,flexShrink:0,marginTop:1,textShadow:`0 0 8px ${c}88`}}>{coach.glyph}</div>
        <div style={{flex:1,minWidth:0,paddingRight:30}}>
          <div style={{fontSize:12,color:"#ffffffdd",fontFamily:MONO,lineHeight:1.6,fontWeight:400,letterSpacing:0.1}}>{coach.message}</div>
          <div style={{marginTop:10,display:"flex",alignItems:"center",gap:6}}>
            <div style={{height:1,width:14,background:`${c}44`}}/>
            <span style={{fontSize:8,color:`${c}99`,fontFamily:MONO,letterSpacing:1.5,fontWeight:700}}>{fr?"VOIR LE RÉSUMÉ COMPLET →":"VIEW FULL SUMMARY →"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [winW,setWinW]=useState(typeof window!=="undefined"?window.innerWidth:375);
  useEffect(()=>{const h=()=>setWinW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  const isDesktop=winW>=769;
  // Forcer le fond sombre dès le premier rendu — évite le flash blanc
  useEffect(()=>{document.body.style.background="#07070d";document.body.style.margin="0";},[]);
  const [phase,setPhase]=useState("splash");
  const [lang,setLang]=useState("fr");
  const [trades,setTrades]=useState([]);
  const [noTrades,setNoTrades]=useState([]);
  const [notif,setNotif]=useState(null);
  const [showNoTrades,setShowNoTrades]=useState(true);
  const [statsMode,setStatsMode]=useState("phase");
  const [phases,setPhases]=useState([]);
  const [accounts,setAccounts]=useState([]);
  const [activeAccountId,setActiveAccountId]=useState(null);
  const [showWeeklyRecap,setShowWeeklyRecap]=useState(false);
  const [showExport,setShowExport]=useState(false);
  const [showReset,setShowReset]=useState(false);
  const [objectif,setObjectif]=useState({pnl:"",wr:"",trades:"",drawdown:"",editMode:false});
  const [showNewPhase,setShowNewPhase]=useState(false);
  const [showShare,setShowShare]=useState(false);
  const [shareTarget,setShareTarget]=useState(null);
  const [showStats,setShowStats]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [inAppNotifs,setInAppNotifs]=useState([]);
  const [histSearch,setHistSearch]=useState("");
  const [phaseEditIndex,setPhaseEditIndex]=useState(null);  // which phase is being renamed
  const [phaseEditName,setPhaseEditName]=useState("");       // rename input value
  const [phaseDeleteConfirmIdx,setPhaseDeleteConfirmIdx]=useState(null); // which phase has delete confirm open
  const [view,setView]=useState("dashboard");
  const [accSwitchOpen,setAccSwitchOpen]=useState(false);
  const [accSwitchOpenPC,setAccSwitchOpenPC]=useState(false);
  const [statsAccountFilter,setStatsAccountFilter]=useState(null);
  const [histArchOpen,setHistArchOpen]=useState(false);
  const [form,setForm]=useState(emptyForm("XAU/USD","M5"));
  const [editingId,setEditingId]=useState(null);
  const [checkinOpen,setCheckinOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [histFilter,setHistFilter]=useState("ALL");
  const [histAsset,setHistAsset]=useState("ALL");
  const [confirmDeleteId,setConfirmDeleteId]=useState(null);
  const [detailTrade,setDetailTrade]=useState(null);
  const [editingNoTrade,setEditingNoTrade]=useState(null);
  const [config,setConfig]=useState({items:DEFAULT_CRITERIA,threshold:6,strategyName:"Ma Stratégie",defaultAsset:"XAU/USD",maxTrades:1,neonColor:"#00ff9d",calendarOn:true,notifOn:true,customAssets:[...PRESET_ASSETS],capital:"",devise:"€",accountType:"perso",phaseStartDate:"",modules:{rejet:true,checkin:true,postSl:true,revenge:true,timeframe:true},timeframes:[...DEFAULT_TIMEFRAMES]});
  const fileRef=useRef();const pageRef=useRef();const weeklyShownRef=useRef(false);const currentUserRef=useRef(null);
  // Source de vérité unique pour l'UID : Firebase Auth d'abord, puis le ref. JAMAIS l'email encodé (écritures).
  const uidNow=()=>{ try { if(auth&&auth.currentUser&&auth.currentUser.uid) return auth.currentUser.uid; } catch(e){} return currentUserRef.current?.uid||null; };
  const neon=config.neonColor||"#00ff9d";const t=T[lang];const inSt=mkInput(neon);
  // Couleurs dérivées du neon pour une cohérence visuelle complète
  const neonDim = neon+"66";   // texte secondaire
  const neonFaint = neon+"33"; // bordures légères
  const neonGhost = neon+"14"; // backgrounds subtils
  const neonBg = neon+"0a";    // backgrounds très légers

  // Session restore from localStorage on page load (connexion inchangée)
  useEffect(()=>{
    try {
      // Auto-login désactivé : le splash va toujours vers l'écran de login (comportement simple et fiable).
      // On nettoie un éventuel mot de passe stocké en clair par d'anciennes versions (sécurité).
      const saved=localStorage.getItem("tmt_user");
      if(saved){
        try {
          const o=JSON.parse(saved);
          if(o&&o.pwd){ delete o.pwd; localStorage.setItem("tmt_user",JSON.stringify(o)); }
        } catch(e){}
      }
    } catch(e){}
  },[]);

  useEffect(()=>{
    const isMonday=new Date().getDay()===1;
    if(phase==="app"&&view==="dashboard"&&!weeklyShownRef.current&&trades.length>=2&&isMonday){
      const todayKey=today();
      let alreadyShown=false;
      try{alreadyShown=localStorage.getItem("tmt_weekly_shown")===todayKey;}catch(e){}
      if(!alreadyShown){
        const cutoff=new Date(Date.now()-7*86400000).toISOString().split("T")[0];
        if(trades.some(x=>x.date>=cutoff)){
          weeklyShownRef.current=true;
          try{localStorage.setItem("tmt_weekly_shown",todayKey);}catch(e){}
          const id=setTimeout(()=>setShowWeeklyRecap(true),1000);
          return ()=>clearTimeout(id);
        }
      } else {
        weeklyShownRef.current=true;
      }
    }
  },[phase,view,trades]);

  const scrollToTop=()=>{if(pageRef.current)pageRef.current.scrollTo({top:0,behavior:"smooth"});};
  // ── Comptes ──
  const activeAccount=accounts.find(a=>a.id===activeAccountId)||accounts.find(a=>!a.archived)||accounts[0]||null;
  const activeAccounts=accounts.filter(a=>!a.archived);
  const saveAccounts=(newAccs,newActiveId)=>{
    setAccounts(newAccs);
    if(newActiveId!==undefined)setActiveAccountId(newActiveId);
    const uid=uidNow();
    if(currentUserRef.current?.email)saveUserData(uid,{accounts:newAccs,activeAccountId:newActiveId!==undefined?newActiveId:activeAccountId,trades});
  };
  const switchAccount=(id)=>{
    const acc=accounts.find(a=>a.id===id);if(!acc)return;
    setActiveAccountId(id);
    setConfig(c=>({...c,capital:acc.capital,devise:acc.devise,accountType:acc.accountType}));
    setObjectif(o=>({...o,pnl:acc.objPnl,drawdown:acc.objDrawdown}));
    const uid=uidNow();
    if(currentUserRef.current?.email)saveUserData(uid,{accounts,activeAccountId:id,trades});
  };
  // Phase uses trade.id (timestamp) not date — trades before phase creation excluded even if date is today
  const currentPhaseTs=phases.length>0?phases[phases.length-1].id:0;
  const getPhaseKey=useCallback(tradeId=>{if(phases.length===0)return 0;for(let i=phases.length-1;i>=0;i--){if(tradeId>phases[i].id)return i+1;}return 0;},[phases]);
  const handleNewPhase=(phaseData={})=>{
    const num=phases.length+2;
    const name=phaseData.name||`Phase ${num}`;
    const newPhases=[...phases,{id:Date.now(),date:today(),name}];
    setPhases(newPhases);setStatsMode("phase");
    setObjectif({pnl:phaseData.obj||"",wr:"",trades:"",drawdown:phaseData.drawdown||"",editMode:false});
    const newCfg={...config,capital:phaseData.capital||config.capital,devise:phaseData.devise||config.devise,accountType:phaseData.accountType||config.accountType};
    setConfig(newCfg);
    setNotif({txt:lang==="fr"?`${name} démarrée.\nStats remises à zéro.`:`${name} started.\nStats reset.`,color:neon,icon:"ok",lang});
    if(currentUserRef.current?.email) saveUserData(uidNow(),{phases:newPhases,config:newCfg});
  };

  // ── Phase management ──
  const getPhaseTradeCount = (phaseIndex) => {
    if(phases.length===0) return trades.length;
    if(phaseIndex===0) {
      return trades.filter(x=>x.id<=phases[0].id).length;
    }
    const from = phases[phaseIndex-1].id;
    const to   = phaseIndex < phases.length ? phases[phaseIndex].id : Infinity;
    return trades.filter(x=>x.id>from&&x.id<=to).length;
  };

  const handleRenamePhase = (phaseIndex, newName) => {
    if(!newName.trim()) return;
    if(phaseIndex===0) {
      // Rename the original phase = update config.phaseName
      const newCfg={...config,phaseName:newName.trim()};
      setConfig(newCfg);
      if(currentUserRef.current?.email) saveUserData(uidNow(),{config:newCfg});
    } else {
      // Rename a created phase = update name in phases array
      const newPhases=phases.map((ph,i)=>i===phaseIndex-1?{...ph,name:newName.trim()}:ph);
      setPhases(newPhases);
      if(currentUserRef.current?.email) saveUserData(uidNow(),{phases:newPhases});
    }
    setPhaseEditIndex(null);
  };

  const handleDeleteSpecificPhase = (phaseIndex) => {
    if(phaseIndex===0) {
      // Delete original phase: remove trades before phases[0], keep phases[1..]
      const boundary=phases.length>0?phases[0].id:Infinity;
      const newTrades=trades.filter(x=>x.id>boundary);
      const newNoTrades=noTrades.filter(x=>x.id>boundary);
      const newPhases=phases.slice(1);
      setTrades(newTrades);setNoTrades(newNoTrades);setPhases(newPhases);setStatsMode("phase");
      const uid=uidNow();
      if(currentUserRef.current?.email) saveUserData(uid,{trades:newTrades,noTrades:newNoTrades,phases:newPhases});
    } else {
      // Delete phase N: remove boundary entry, trades of this phase merge into previous
      const newPhases=phases.filter((_,i)=>i!==phaseIndex-1);
      setPhases(newPhases);setStatsMode("phase");
      const uid=uidNow();
      if(currentUserRef.current?.email) saveUserData(uid,{phases:newPhases});
    }
    setPhaseDeleteConfirmIdx(null);
    setNotif({txt:lang==="fr"?`Compte supprimé.`:`Account deleted.`,color:"#f0b429",icon:"warn",lang});
  };

  const currentPhaseName=activeAccount?activeAccount.name:(config.phaseName||"PHASE");
  const accountTrades=trades.filter(x=>activeAccount?(x.accountId||"ph_0")===activeAccount.id:true);
  const pf=statsMode==="all"?trades:accountTrades;
  const total=pf.length,wins=pf.filter(x=>x.result==="WIN").length,losses=pf.filter(x=>x.result==="LOSS").length;
  const winRate=total?Math.round(wins/total*100):0;
  const totalPnl=pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const discScore=calcDisc(pf);
  const scoreColor=discScore===null?"#ffffffbb":discScore>=8?neon:discScore>=5?"#f0b429":"#ff4d4d";
  const usedAssets=[...new Set(trades.map(x=>x.asset))];

  const checkRevenge=fd=>{if(!config.maxTrades||config.maxTrades===0)return false;const aid=form.accountId||activeAccountId;return trades.filter(x=>x.date===fd&&x.id!==editingId&&(x.accountId||"ph_0")===aid).length>=config.maxTrades;};
  // Helper : force le signe de la valeur P&L selon le résultat (BE laisse libre)
  const forceSign=(val,result)=>{
    if(val===""||val===null||val===undefined) return val;
    const s=String(val).replace(/^[+-]/,"");
    if(s===""||isNaN(parseFloat(s))) return val;
    if(result==="WIN") return s==="0"?"0":s; // pas de + dans le state (juste un nombre positif)
    if(result==="LOSS") return s==="0"?"0":"-"+s;
    return val; // BE ou autre : libre
  };
  const isRevengeNow=editingId===null&&checkRevenge(form.date);
  const pnlVal=form.pnlManual!==""?form.pnlManual:form.pnlPreset;
  const pnlIncoherent=pnlVal!==""&&((form.result==="WIN"&&parseFloat(pnlVal)<0)||(form.result==="LOSS"&&parseFloat(pnlVal)>0));

  const saveTrade=()=>{
    const score=form.checklist.length,pnl=form.pnlManual!==""?form.pnlManual:form.pnlPreset;
    const isRevenge=form.isRevenge||checkRevenge(form.date);
    const elim=config.eliminatoires||[];
      const elimFail=elim.some(ei=>!form.checklist.includes(ei));
      const conforming=isRevenge?false:elimFail?false:score>=config.threshold;
    let updated,ut=null;
    if(editingId!==null){updated=trades.map(x=>x.id===editingId?{...x,...form,pnlPct:pnl,setupScore:score,conforming,isRevenge,checklistMax:config.items.length}:x);}
    else{const trade={...form,pnlPct:pnl,id:Date.now(),setupScore:score,conforming,isRevenge,checklistMax:config.items.length,accountId:form.accountId||activeAccountId};ut=trade;updated=[trade,...trades].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);}
    setTrades(updated);
    if(currentUserRef.current?.email) saveUserData(uidNow(),{trades:updated,accounts,activeAccountId});
    const newCfgAfterSave={...config,lastPnlMode:form.pnlMode||"eur"};setConfig(newCfgAfterSave);if(currentUserRef.current?.email)saveUserData(uidNow(),{config:newCfgAfterSave});
    setForm(emptyForm(config.defaultAsset||"XAU/USD",config.defaultTimeframe||config.lastTimeframe||"M5",config.lastPnlMode||"eur",activeAccountId));setEditingId(null);setCheckinOpen(false);
    // Conseil biais/direction incohérents
    const biaisCheck=form.checkin?.biais||"";
    const isBullish=biaisCheck.includes("Haussier")||biaisCheck.includes("Bullish");
    const isBearish=biaisCheck.includes("Baissier")||biaisCheck.includes("Bearish");
    const biaisMismatch=biaisCheck&&((isBullish&&form.direction==="SELL")||(isBearish&&form.direction==="BUY"));
    if(biaisMismatch){
      setNotif({txt:lang==="fr"?`Biais ${biaisCheck} avec un ${form.direction}.\nTu trades à contre-sens de ton analyse.`:`Bias ${biaisCheck} with a ${form.direction}.\nYou're trading against your own analysis.`,color:"#f0b429",icon:"warn",lang});
    } else {
      // Notifs intelligentes basées sur les données
      const recentTrades=updated.slice(0,3);
      const lastLosses=recentTrades.filter(x=>x.result==="LOSS").length;
      const isDrawdownAlert=objectif.drawdown&&config.capital&&Math.abs(pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0))>=parseFloat(objectif.drawdown)*0.8;
      if(lastLosses>=2&&ut&&ut.result==="LOSS"){
        setNotif({txt:lang==="fr"?"2 LOSS de suite — pause recommandée avant le prochain trade.":"2 LOSS in a row — take a break before next trade.",color:"#ff4d4d",icon:"warn",lang});
      } else if(isDrawdownAlert){
        setNotif({txt:lang==="fr"?"⚠ Tu approches ton drawdown max. Reste prudent.":"⚠ Approaching max drawdown. Stay cautious.",color:"#f0b429",icon:"warn",lang});
      }
    }
    setSaved(true);setTimeout(()=>setSaved(false),2000);
    setView(editingId!==null?"history":"dashboard");scrollToTop();
  };

  const startEdit=x=>{setForm({date:x.date,asset:x.asset,direction:x.direction,checklist:[...x.checklist],result:x.result,pnlPreset:PNL_PRESETS.includes(x.pnlPct)?x.pnlPct:"",pnlManual:PNL_PRESETS.includes(x.pnlPct)?"":x.pnlPct,pnlMode:"pct",pnlEurManual:"",notes:x.notes||"",rejetScore:x.rejetScore||0,time:x.time||"",screenshot:x.screenshot||"",isRevenge:x.isRevenge||false,slDirection:x.slDirection||"",checkin:x.checkin||{humeur:"",biais:""},accountId:x.accountId||activeAccountId});setEditingId(x.id);setView("log");};
  // Réaffecter un trade à un autre compte
  const reassignTrade=(tradeId,accId)=>{
    const updated=trades.map(x=>x.id===tradeId?{...x,accountId:accId}:x);
    setTrades(updated);
    const uid=uidNow();
    if(currentUserRef.current?.email)saveUserData(uid,{trades:updated,accounts,activeAccountId});
  };
  const cancelEdit=()=>{setForm(emptyForm(config.defaultAsset||"XAU/USD",config.defaultTimeframe||config.lastTimeframe||"M5",config.lastPnlMode||"eur",activeAccountId));setEditingId(null);setView("history");scrollToTop();};
  const deleteTrade=id=>{
    const updated=trades.filter(x=>x.id!==id);
    setTrades(updated);setConfirmDeleteId(null);
    if(currentUserRef.current?.email) saveUserData(uidNow(),{trades:updated});
  };
  const handleReset=()=>{
    setObjectif({pnl:"",wr:"",trades:"",editMode:false});
    setTrades([]);setNoTrades([]);setPhases([]);setShowReset(false);
    if(currentUserRef.current?.email) saveUserData(uidNow(),{trades:[],noTrades:[],phases:[]});
  };

  const [histPhase,setHistPhase]=useState("ALL");
  const [histAccount,setHistAccount]=useState("ALL");
  const histFiltered=trades.filter(x=>{
    const matchResult=histFilter==="ALL"||x.result===histFilter;
    const matchAsset=histAsset==="ALL"||x.asset===histAsset;
    const matchAccount=histAccount==="ALL"||(x.accountId||"ph_0")===histAccount;
    const q=(histSearch||"").toLowerCase().trim();
    const matchSearch=!q||
      (x.asset||"").toLowerCase().includes(q)||
      (x.result||"").toLowerCase().includes(q)||
      (x.direction||"").toLowerCase().includes(q)||
      (x.notes||"").toLowerCase().includes(q)||
      (x.date||"").includes(q)||
      (x.checkin?.humeur||"").toLowerCase().includes(q);
    return matchResult&&matchAsset&&matchSearch&&matchAccount;
  });
  const mergedHistory=[...histFiltered.map(x=>({...x,_type:"trade"})),...(showNoTrades?noTrades.map(x=>({...x,_type:"notrade"})):[])].sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id);
  const editingTrade=editingId!==null?trades.find(x=>x.id===editingId):null;
  const allAssets=config.customAssets||PRESET_ASSETS;
  const usedAccountsInHist=[...new Set(trades.map(x=>x.accountId||"ph_0"))];
  const humeurPills=HUMEUR_PILLS[lang]||HUMEUR_PILLS.fr;
  const biaisPills=BIAIS_PILLS[lang]||BIAIS_PILLS.fr;

  // handleLogin must be defined before conditional returns (Rules of Hooks)
  const handleLogin=u=>{
    if(!u) return;
    // UID = Firebase Auth uniquement. Pas de fallback encEmail (sinon écritures refusées par les règles).
    const uid = u._uid || (auth&&auth.currentUser&&auth.currentUser.uid) || null;
    currentUserRef.current={email:u.email, uid};
    try { localStorage.setItem("tmt_user",JSON.stringify({email:u.email, uid})); } catch(e){} // pas de mot de passe stocké
    if(uid) flushPending(uid);
    const userData=u.userData;
    if(userData&&userData.setupDone){
      // Parser les strings JSON si nécessaire (ancien format Firestore)
      const parseSafe = (v) => {
        if(Array.isArray(v)) return v;
        if(typeof v === "string") { try { return JSON.parse(v); } catch(e) { return []; } }
        return [];
      };
      const parseObj = (v) => {
        if(v && typeof v === "object" && !Array.isArray(v)) return v;
        if(typeof v === "string") { try { return JSON.parse(v); } catch(e) { return {}; } }
        return {};
      };
      const trades = parseSafe(userData.trades);
      const noTrades = parseSafe(userData.noTrades);
      const phases = parseSafe(userData.phases);
      const config = parseObj(userData.config);
      if(noTrades.length) setNoTrades(noTrades);
      if(phases.length) setPhases(phases);
      if(Object.keys(config).length) setConfig(c=>({...c,...config}));
      if(userData.lang) setLang(userData.lang);
      if(userData.objectif&&typeof userData.objectif==="object") setObjectif(o=>({...o,...userData.objectif}));
      // Comptes (migration auto si nécessaire)
      const normalized={...userData,trades,phases,config};
      const {accounts:accs,activeAccountId:aid,trades:tgTrades,migrated}=ensureAccountsData(normalized);
      setAccounts(accs);setActiveAccountId(aid);setTrades(tgTrades);
      const act=accs.find(a=>a.id===aid)||accs[0];
      if(act)setConfig(c=>({...c,capital:act.capital,devise:act.devise,accountType:act.accountType}));
      if(act)setObjectif(o=>({...o,pnl:act.objPnl,drawdown:act.objDrawdown}));
      if(migrated)saveUserData(uid,{accounts:accs,activeAccountId:aid,trades:tgTrades});
      setPhase("app");
      // Vérifications bannières in-app
      setTimeout(()=>{
        const notifs_=[];
        const config_=parseObj(userData.config);
        const trades_=parseSafe(userData.trades);
        if(trades_.length>=3){
          const last=trades_[0];
          // Compter uniquement les jours ouvrés (lun-ven) depuis le dernier trade
          const countWorkdays=(fromDate)=>{
            let count=0;
            const d=new Date(fromDate);
            d.setDate(d.getDate()+1);
            const now=new Date();
            while(d<=now){
              const dow=d.getDay();
              if(dow>=1&&dow<=5) count++;
              d.setDate(d.getDate()+1);
            }
            return count;
          };
          const workdaysMissed=last?countWorkdays(last.date):999;
          if(workdaysMissed>=3) notifs_.push({type:"info",icon:"calendar",title:lang==="fr"?"Journal en pause":"Journal paused",body:lang==="fr"?`${workdaysMissed} jours ouvrés sans trade. Pense à journaliser !`:`${workdaysMissed} trading days without a log. Time to journal!`});
          const revStreak=trades_.slice(0,3).filter(x=>x.isRevenge).length;
          if(revStreak>=2) notifs_.push({type:"warn",icon:"fire",title:lang==="fr"?"Attention — Revenge":"Warning — Revenge",body:lang==="fr"?"Plusieurs revenge trades récents. Fais une pause.":"Multiple recent revenge trades. Take a break."});
        }
        // Limite : 1 notification par jour maximum (anti-spam à chaque connexion)
        if(notifs_.length){
          let lastShown="";
          try { lastShown=localStorage.getItem("tmt_last_notif_day")||""; } catch(e){}
          const todayStr=today();
          if(lastShown!==todayStr){
            setInAppNotifs(notifs_);
            try { localStorage.setItem("tmt_last_notif_day",todayStr); } catch(e){}
          }
        }
      },2000);
    } else {
      if(u.lang) setLang(u.lang);
      // Nouveau compte → onboarding si isNew, sinon setup direct
      if(u.isNew) setPhase("onboarding");
      else setPhase("setup");
    }
  };

  if(phase==="splash") return <SplashScreen onDone={()=>setPhase("login")} neon={neon}/>;
  if(phase==="onboarding") return <><CSS neon={neon}/><Onboarding onDone={l=>{setLang(l);setPhase("setup");}}/></>;
  if(phase==="login") return <LoginScreen onLogin={handleLogin} lang={lang} setLang={setLang} neon={neon}/>;
  if(phase==="setup") return <><CSS neon={neon}/><GuidedSetup onDone={async cfg=>{
    const newCfg={...config,...cfg};
    const firstAcc=mkAccount("ph_0",cfg.phaseName||cfg.strategyName||"Mon compte",cfg.neonColor||"#00ff9d",{capital:cfg.capital,devise:cfg.devise,accountType:cfg.accountType});
    setAccounts([firstAcc]);setActiveAccountId("ph_0");
    setConfig(newCfg);setForm(emptyForm(cfg.defaultAsset||"XAU/USD","M5","eur","ph_0"));setPhase("app");
    if(currentUserRef.current?.email) await saveUserData(uidNow(),{config:newCfg,setupDone:true,lang,trades:[],noTrades:[],phases:[],accounts:[firstAcc],activeAccountId:"ph_0"});
  }} lang={lang}/></>;

  return (
    <div className="app-fade-in" style={{display:"flex",background:"#0c0c12",minHeight:"100vh",color:"#ffffff",fontFamily:MONO}}>
      <CSS neon={neon}/>
      {notif&&<NotifCard notif={notif} onClose={()=>setNotif(null)}/>}
      <InAppBanner notifs={inAppNotifs} onDismiss={()=>setInAppNotifs(n=>n.slice(1))} neon={neon}/>
      {showTutorial&&<Tutorial neon={neon} onEnd={()=>setShowTutorial(false)}/>}
      {showImport&&<ImportCSVModal onImport={imported=>{const merged=[...imported,...trades].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);setTrades(merged);if(currentUserRef.current?.email)saveUserData(uidNow(),{trades:merged});}} onClose={()=>setShowImport(false)} lang={lang} neon={neon} config={config}/>}
      {showWeeklyRecap&&<WeeklyRecapModal trades={trades} lang={lang} neon={neon} onClose={()=>setShowWeeklyRecap(false)} onShareWeek={()=>{setShareTarget(null);setShowShare(true);}}/>}

      {/* ── SIDEBAR PC ── */}
      {isDesktop&&(
        <div style={{width:200,minWidth:200,background:"#09090f",borderRight:"1px solid #ffffff0a",display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
          <div style={{padding:"24px 18px 20px",borderBottom:"1px solid #ffffff08"}}>
            <div style={{marginBottom:6}}><SplashLogo neon={neon}/></div>
            <div style={{fontSize:10,color:"#ffffff33",letterSpacing:1}}>{config.strategyName}</div>
          </div>
          {/* Bandeau compte cliquable PC */}
          {activeAccount&&(()=>{
            const c=activeAccount.color||neon;
            const accPnl=trades.filter(x=>(x.accountId||"ph_0")===activeAccount.id).reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
            const hasObj=statsMode!=="all"&&objectif.pnl;
            const target=parseFloat(objectif.pnl)||1;
            const objPct=hasObj?Math.min(100,Math.max(0,accPnl/target*100)):0;
            const canSwitch=activeAccounts.length>1;
            return <div id="tut-account" style={{position:"relative",borderBottom:"1px solid #ffffff08"}}>
              <button onClick={()=>canSwitch&&setAccSwitchOpenPC(o=>!o)} className="btn" disabled={!canSwitch}
                style={{width:"100%",display:"block",background:accSwitchOpenPC?`${c}0d`:"transparent",border:"none",padding:"10px 18px",cursor:canSwitch?"pointer":"default",textAlign:"left",transition:"background 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:hasObj?5:0}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:c,boxShadow:`0 0 4px ${c}`,flexShrink:0}}/>
                  <span style={{fontSize:10,color:c,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{activeAccount.name}{config.capital?` · ${parseInt(config.capital).toLocaleString()}${config.devise||"€"}`:""}</span>
                  {canSwitch&&<span style={{fontSize:8,color:`${c}77`,flexShrink:0,transition:"transform 0.2s",transform:accSwitchOpenPC?"rotate(180deg)":"none"}}>▼</span>}
                </div>
                {hasObj&&<div style={{height:3,background:"#ffffff10",borderRadius:3,marginBottom:4}}>
                  <div style={{width:`${objPct}%`,height:"100%",background:`linear-gradient(90deg,${c}66,${c})`,borderRadius:3,boxShadow:`0 0 6px ${c}55`}}/>
                </div>}
                {(hasObj||activeAccounts.length>1)&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:8,color:"#ffffff44",fontFamily:MONO}}>{canSwitch?(lang==="fr"?"Changer de compte":"Switch account"):(lang==="fr"?"Phase en cours":"Current phase")}</span>
                  <span style={{fontSize:10,fontWeight:700,color:accPnl>=0?c:"#ff4d4d",fontFamily:MONO}}>{accPnl>=0?"+":""}{Math.round(accPnl*10)/10}%{hasObj?<span style={{fontSize:8,color:"#ffffff44",fontWeight:400}}> / +{objectif.pnl}%</span>:null}</span>
                </div>}
              </button>
              {accSwitchOpenPC&&canSwitch&&<>
                <div onClick={()=>setAccSwitchOpenPC(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
                <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:41,background:"#0f0f16",border:`1px solid ${c}28`,borderTop:"none",overflow:"hidden",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
                  {activeAccounts.filter(a=>a.id!==activeAccountId).map(acc=>(
                    <button key={acc.id} onClick={()=>{switchAccount(acc.id);setAccSwitchOpenPC(false);}} className="row"
                      style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"10px 18px",cursor:"pointer"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:acc.color||neon,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,textAlign:"left"}}>{acc.name}</span>
                    </button>
                  ))}
                </div>
              </>}
            </div>;
          })()}
          {total>0&&<div style={{padding:"12px 18px",borderBottom:"1px solid #ffffff08"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><div style={{fontSize:7,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>WIN RATE</div><div style={{fontSize:20,fontWeight:900,color:"#ffffff",textShadow:`0 0 20px ${neon}55`}}>{winRate}%</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>P&L</div><div style={{fontSize:20,fontWeight:900,color:totalPnl>=0?neon:"#ff4d4d"}}>{(()=>{const n=Math.round(totalPnl*10)/10;return `${n>=0?"+":""}${n}%`;})()}</div></div>
            </div>
            <div style={{fontSize:9,color:"#ffffff33"}}>{wins}W · {losses}L · {total} {lang==="fr"?"trades":"trades"}</div>
          </div>}
          <div id="tut-nav" style={{padding:"10px 10px",flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {[["dashboard","stats",lang==="fr"?"Statistiques":"Statistics"],["log",(editingId?"edit":"add"),(editingId?lang==="fr"?"Édition":"Edit":lang==="fr"?"Nouveau trade":"New trade")],["history","history",lang==="fr"?"Historique":"History"],["settings","settings",lang==="fr"?"Paramètres":"Settings"]].map(([v,icon,label])=>(
              <button key={v} id={v==="log"?"tut-addtrade":undefined} onClick={()=>{if(editingId&&v!=="log")cancelEdit();else{setView(v);if(pageRef.current)pageRef.current.scrollTo({top:0});scrollToTop();}}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:view===v?(editingId&&v==="log"?"rgba(240,180,41,0.12)":`${neon}12`):"transparent",border:`1px solid ${view===v?(editingId&&v==="log"?"#f0b42940":`${neon}30`):"transparent"}`,borderRadius:9,color:view===v?(editingId&&v==="log"?"#f0b429":"#ffffff"):"#ffffff66",fontFamily:MONO,fontSize:12,fontWeight:view===v?700:400,cursor:"pointer",textAlign:"left",width:"100%",transition:"all 0.15s"}}>
                <span style={{display:"inline-flex",width:18,justifyContent:"center"}}><Icon name={icon} size={16} color={view===v?(editingId&&v==="log"?"#f0b429":neon):"#ffffff55"}/></span>
                {label}
              </button>
            ))}
          </div>
          <div style={{padding:"10px 14px",borderTop:"1px solid #ffffff08",display:"flex",gap:8}}>
            <button onClick={()=>setShowExport(true)} style={{flex:1,padding:"8px 0",background:`${neon}0f`,border:`1px solid ${neon}26`,borderRadius:8,color:neon,fontFamily:MONO,fontSize:10,cursor:"pointer"}}>↓ Export</button>
            <button onClick={()=>setShowNewPhase(true)} style={{padding:"8px 10px",background:"transparent",border:`1px solid ${neon}20`,borderRadius:8,color:`${neon}88`,fontFamily:MONO,fontSize:10,cursor:"pointer"}}>▶</button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div ref={pageRef} className={isDesktop?"":"grid-bg"} style={{flex:1,overflowY:"auto",height:"100vh",maxWidth:isDesktop?"none":480,margin:isDesktop?0:"0 auto",paddingBottom:isDesktop?0:80,minWidth:0}}>
        <div style={{maxWidth:isDesktop?960:480,margin:"0 auto"}}>

      {!isDesktop&&<div style={{padding:"14px 16px 8px",borderBottom:`1px solid ${neon}1a`,background:"linear-gradient(180deg,#111118 0%,#0c0c12 100%)",backdropFilter:"blur(8px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <Logo size="sm" neon={neon}/>
          <button onClick={()=>setShowExport(true)} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}26`,borderRadius:8,padding:"6px 10px",color:`${neon}99`,fontSize:13}}>↓</button>
        </div>
      </div>}

      {/* === Bandeau compte/objectif DISCRET (mobile) === */}
      {!isDesktop&&activeAccount&&(()=>{
        const c=activeAccount.color||neon;
        const accPnl=trades.filter(x=>(x.accountId||"ph_0")===activeAccount.id).reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
        const hasObj=statsMode!=="all"&&objectif.pnl;
        const target=parseFloat(objectif.pnl)||1;
        const objPct=hasObj?Math.min(100,Math.max(0,accPnl/target*100)):0;
        const canSwitch=activeAccounts.length>1;
        return <div id="tut-account" style={{position:"relative",background:"rgba(9,9,16,0.6)",borderBottom:`1px solid #ffffff06`}}>
          {hasObj&&<div style={{height:3,background:"#ffffff08",borderRadius:3,margin:"6px 16px 0"}}>
            <div style={{width:`${objPct}%`,height:"100%",background:`linear-gradient(90deg,${c}66,${c})`,borderRadius:3,transition:"width 0.6s ease",boxShadow:`0 0 4px ${c}55`}}/>
          </div>}
          <button onClick={()=>canSwitch&&setAccSwitchOpen(o=>!o)} className="btn" disabled={!canSwitch}
            style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",padding:"6px 18px",cursor:canSwitch?"pointer":"default",textAlign:"left"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>
            <span style={{fontSize:10,color:c,fontFamily:MONO,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {activeAccount.name}{config.capital?` · ${parseInt(config.capital).toLocaleString()}${config.devise||"€"}`:""}
            </span>
            <span style={{flex:1}}/>
            <span style={{fontSize:11,fontWeight:800,color:accPnl>=0?c:"#ff4d4d",fontFamily:MONO,flexShrink:0}}>{accPnl>=0?"+":""}{Math.round(accPnl*10)/10}%</span>
            {hasObj&&<span style={{fontSize:9,color:"#ffffff44",fontWeight:400,fontFamily:MONO,flexShrink:0}}>/ +{objectif.pnl}%</span>}
            {canSwitch&&<span style={{fontSize:8,color:`${c}77`,marginLeft:3,flexShrink:0,transition:"transform 0.2s",transform:accSwitchOpen?"rotate(180deg)":"none"}}>▼</span>}
          </button>
          {accSwitchOpen&&canSwitch&&<>
            <div onClick={()=>setAccSwitchOpen(false)} style={{position:"fixed",inset:0,zIndex:40}}/>
            <div className="slide-up" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:41,background:"#0f0f16",border:`1px solid ${c}28`,borderTop:"none",overflow:"hidden",boxShadow:"0 12px 32px rgba(0,0,0,0.6)"}}>
              {activeAccounts.filter(a=>a.id!==activeAccountId).map(acc=>(
                <button key={acc.id} onClick={()=>{switchAccount(acc.id);setAccSwitchOpen(false);}} className="row"
                  style={{width:"100%",display:"flex",alignItems:"center",gap:7,background:"transparent",border:"none",borderTop:`1px solid ${neon}0a`,padding:"10px 18px",cursor:"pointer"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:acc.color||neon,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:500,color:"#ffffffcc",fontFamily:MONO,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,textAlign:"left"}}>{acc.name}</span>
                </button>
              ))}
            </div>
          </>}
        </div>;
      })()}
      {!isDesktop&&<div id="tut-nav" style={{display:"flex",gap:6,padding:"10px 20px",borderBottom:`1px solid ${neon}14`}}>
        {[["dashboard",t.stats],["log",editingId?t.editLabel:`+ ${t.addTrade.replace("+ ","")}`],["history",t.history],["settings",t.settings]].map(([v,l])=>(
          <button id={v==="log"?"tut-addtrade":undefined} key={v} className="btn" onClick={()=>{if(editingId&&v!=="log")cancelEdit();else{setView(v);scrollToTop();}}}
            style={{background:view===v?(editingId&&v==="log"?"rgba(240,180,41,0.15)":neon):"transparent",border:`1px solid ${view===v?(editingId&&v==="log"?"#f0b429":neon):`${neon}26`}`,color:view===v?(editingId&&v==="log"?"#f0b429":"#000"):"#ffffffaa",borderRadius:6,padding:v==="settings"?"7px 12px":"7px 0",fontSize:11,fontWeight:700,letterSpacing:1,fontFamily:MONO,flex:v==="settings"?0:1}}>{l}</button>
        ))}
      </div>}

      {isDesktop&&<div style={{padding:"24px 32px 20px",borderBottom:"1px solid #ffffff08",background:"linear-gradient(180deg,#111118,#0c0c12)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:26,fontWeight:900,color:"#ffffff",letterSpacing:-0.5}}>{view==="dashboard"?(lang==="fr"?"Statistiques":"Statistics"):view==="log"?(editingId?lang==="fr"?"✏ Édition":"✏ Edit":lang==="fr"?"Nouveau trade":"New trade"):view==="history"?(lang==="fr"?"Historique":"History"):lang==="fr"?"Paramètres":"Settings"}</div>
          <div style={{fontSize:10,color:"#ffffff33",marginTop:4}}>{config.strategyName}{total>0?` · ${total} trades`:""}</div>
        </div>
        {view==="dashboard"&&<button onClick={()=>setShowNewPhase(true)} style={{padding:"9px 18px",background:`${neon}10`,border:`1px solid ${neon}25`,borderRadius:10,fontSize:11,color:neon,fontFamily:MONO,cursor:"pointer",fontWeight:700}}>▶ {lang==="fr"?"Nouvelle phase":"New phase"}</button>}
      </div>}

      
      {view==="dashboard"&&(
        <div className="fi" style={{padding:20}}>
          <StreakBadge trades={pf} neon={neon} lang={lang}/>
          <button onClick={()=>setShowTutorial(true)} className="btn" style={{position:"fixed",bottom:isDesktop?24:88,right:20,zIndex:50,width:40,height:40,borderRadius:"50%",background:`linear-gradient(145deg,#1e1e2e,#131320)`,border:`1px solid ${neon}35`,color:neon,fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px rgba(0,0,0,0.6),0 0 12px ${neon}18`,cursor:"pointer"}}>?</button>
          {trades.length>0&&(
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
              <div style={{flex:1,display:"flex",gap:4,background:"#0f0f14",borderRadius:8,padding:3}}>
                {[["phase",t.phaseEnCours],["all",t.toutHistorique]].map(([m,l])=>(
                  <button key={m} onClick={()=>setStatsMode(m)} className="btn" style={{flex:1,padding:"7px 0",borderRadius:6,fontSize:10,fontWeight:700,fontFamily:MONO,background:statsMode===m?neon:"transparent",color:statsMode===m?"#131318":"#ffffffaa",border:"none",transition:"all 0.2s"}}>{l}</button>
                ))}
              </div>
              <button onClick={()=>setShowNewPhase(true)} className="btn" style={{padding:"7px 10px",background:`${neon}10`,border:`1px solid ${neon}30`,borderRadius:8,fontSize:9,fontWeight:700,color:neon,whiteSpace:"nowrap",flexShrink:0}}>▶ Phase</button>
            </div>
          )}
          {/* === NIVEAU 1 : Win Rate + P&L (50/50, gros) === */}
          {total>0&&(()=>{
            const dv=config.devise||"€";
            const gain=config.capital?Math.round(parseFloat(config.capital)*totalPnl/100):null;
            const cap_total=config.capital?Math.round(parseFloat(config.capital))+(gain||0):null;
            const wrColor=winRate>=30?neon:"#ff4d4d";
            const pnlColor=totalPnl>=0?neon:"#ff4d4d";
            const pnlRound=Math.round(totalPnl*10)/10;
            return <div id="tut-kpi" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              {/* Win Rate */}
              <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${wrColor}22`,borderRadius:14,padding:"14px 16px",boxShadow:`0 4px 24px ${wrColor}18, inset 0 1px 0 ${wrColor}15`}}>
                <div style={{fontSize:9,color:"#ffffffbb",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.winRate}</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:MONO,lineHeight:1,textShadow:`0 0 32px ${wrColor}aa`,color:"#ffffff"}}>{winRate}%</div>
                <div style={{fontSize:10,color:"#ffffff44",marginTop:6,fontFamily:MONO}}>{wins}W · {losses}L · {total} {t.trades}</div>
              </div>
              {/* P&L */}
              <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${pnlColor}22`,borderRadius:14,padding:"14px 16px",boxShadow:`0 4px 24px ${pnlColor}18, inset 0 1px 0 ${pnlColor}15`}}>
                <div style={{fontSize:9,color:"#ffffffbb",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.totalPnl}</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:MONO,lineHeight:1,textShadow:`0 0 32px ${pnlColor}aa`,color:"#ffffff"}}>{pnlRound>=0?"+":""}{pnlRound}%</div>
                {gain!==null?<div style={{fontSize:10,marginTop:5,display:"flex",alignItems:"baseline",gap:5,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,fontWeight:700,color:pnlColor,fontFamily:MONO}}>{gain>=0?"+":""}{gain.toLocaleString()}{dv}</span>
                  <span style={{color:"#ffffff33",fontSize:10,fontFamily:MONO}}>→ {cap_total.toLocaleString()}{dv}</span>
                </div>:<div style={{fontSize:10,color:"#ffffff44",marginTop:6,fontFamily:MONO}}>{total} {t.trades}</div>}
              </div>
            </div>;
          })()}
          {/* === Profit Factor : case pleine largeur sous la Discipline === */}
          {/* (rendu plus bas, après la Discipline) */}
          {/* === Discipline pleine largeur (gros) === */}
          {total>=2&&discScore!==null&&(
            <div id="tut-discipline" style={{background:`linear-gradient(145deg,${scoreColor}12,${scoreColor}05)`,border:`1px solid ${scoreColor}30`,borderRadius:14,padding:"16px 18px",marginBottom:12,boxShadow:`0 8px 32px ${scoreColor}12,inset 0 1px 0 ${scoreColor}18`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,fontFamily:MONO,marginBottom:4}}>{t.disciplineLabel}</div>
                  <div style={{fontSize:42,fontWeight:900,fontFamily:MONO,lineHeight:1,textShadow:`0 0 40px ${scoreColor}cc, 0 0 8px ${scoreColor}88, 0 2px 10px rgba(0,0,0,0.7)`,color:"#ffffff"}}>{discScore}<span style={{fontSize:15,color:"#ffffff44",textShadow:"none"}}>/10</span></div>
                  <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,background:`${scoreColor}15`,borderRadius:20,padding:"3px 10px",border:`1px solid ${scoreColor}30`}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:scoreColor,boxShadow:`0 0 6px ${scoreColor}`}}/>
                    <span style={{fontSize:8,color:scoreColor,fontWeight:700,letterSpacing:1}}>{discScore>=8?t.disciplineExcellent:discScore>=6?t.disciplineGood:discScore>=4?t.disciplineWork:t.disciplinePoor}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:130}}>
                  {[{l:t.conformiteLabel,v:Math.round(pf.filter(x=>x.conforming).length/total*100),c:neon},{l:t.sansRevengeLabel,v:Math.round(pf.filter(x=>!x.isRevenge).length/total*100),c:pf.filter(x=>x.isRevenge).length===0?neon:"#f0b429"}].map(({l,v,c})=>(
                    <div key={l}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:8,color:"#ffffffaa",fontFamily:MONO}}>{l}</span><span style={{fontSize:9,fontWeight:700,color:"#ffffff",fontFamily:MONO}}>{v}%</span></div>
                      <div style={{height:3,background:"#ffffff10",borderRadius:2}}><div style={{width:`${v}%`,height:"100%",background:`linear-gradient(90deg,${c}99,${c})`,borderRadius:2,transition:"width 0.5s",boxShadow:`0 0 8px ${c}55`}}/></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* === Case Profit Factor pleine largeur === */}
          {total>0&&(()=>{
            const wins_=pf.filter(x=>x.result==="WIN");
            const losses_=pf.filter(x=>x.result==="LOSS");
            const grossWin=wins_.reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
            const grossLoss=losses_.reduce((s,x)=>s+Math.abs(parseFloat(x.pnlPct)||0),0);
            const pfVal=grossLoss>0?grossWin/grossLoss:(grossWin>0?Infinity:0);
            if(grossWin===0&&grossLoss===0) return null;
            const pfStr=pfVal===Infinity?"∞":pfVal.toFixed(2);
            const pfColor=pfVal>=1.5?neon:pfVal>=1?"#f0b429":"#ff4d4d";
            const pfLabel=pfVal>=1.5?(lang==="fr"?"Edge solide":"Strong edge"):pfVal>=1?(lang==="fr"?"Rentable":"Profitable"):pfVal>0?(lang==="fr"?"Perdant":"Losing"):"—";
            // Position du curseur sur une échelle 0→3 (PF=1 à 33%, PF=1.5 à 50%, PF=3 à 100%)
            const gaugePct=pfVal===Infinity?100:Math.min(100,Math.max(0,(pfVal/3)*100));
            return <div style={{background:`linear-gradient(145deg,${pfColor}10,${pfColor}04)`,border:`1px solid ${pfColor}28`,borderRadius:14,padding:"12px 18px 14px",marginBottom:12,boxShadow:`0 4px 20px ${pfColor}10,inset 0 1px 0 ${pfColor}15`}}>
              {/* Ligne haut : label + badge + valeur */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,fontFamily:MONO,textTransform:"uppercase"}}>Profit Factor</span>
                  <span style={{display:"inline-flex",alignItems:"center",gap:5,background:`${pfColor}15`,borderRadius:20,padding:"2px 9px",border:`1px solid ${pfColor}30`}}>
                    <span style={{width:4,height:4,borderRadius:"50%",background:pfColor,boxShadow:`0 0 5px ${pfColor}`}}/>
                    <span style={{fontSize:8,color:pfColor,fontWeight:700,letterSpacing:0.5}}>{pfLabel}</span>
                  </span>
                </div>
                <span style={{fontSize:24,fontWeight:900,color:"#ffffff",fontFamily:MONO,lineHeight:1,textShadow:`0 0 20px ${pfColor}aa, 0 2px 6px rgba(0,0,0,0.6)`}}>{pfStr}</span>
              </div>
              {/* Mini-jauge à paliers : segment actif éclairé, autres discrets */}
              {(()=>{
                const activeZone = pfVal<1?"red":pfVal<1.5?"orange":"green";
                const op = (z)=>activeZone===z?"cc":"1f"; // segment actif vif, autres très discrets
                const glow = (z,c)=>activeZone===z?`0 0 12px ${c}88, inset 0 0 8px ${c}55`:"none";
                return <div style={{position:"relative",height:8,borderRadius:4,marginBottom:6,padding:"0 1px"}}>
                  <div style={{position:"relative",height:"100%",borderRadius:4,overflow:"hidden",display:"flex",border:"1px solid #ffffff10"}}>
                    <div style={{width:"33.33%",height:"100%",background:`#ff4d4d${op("red")}`,boxShadow:glow("red","#ff4d4d"),transition:"all 0.3s"}}/>
                    <div style={{width:"16.67%",height:"100%",background:`#f0b429${op("orange")}`,boxShadow:glow("orange","#f0b429"),transition:"all 0.3s"}}/>
                    <div style={{flex:1,height:"100%",background:`${neon}${op("green")}`,boxShadow:glow("green",neon),transition:"all 0.3s"}}/>
                  </div>
                  {/* Curseur rond pulsant avec gros halo */}
                  <div style={{position:"absolute",top:"50%",left:`${gaugePct}%`,transform:"translate(-50%,-50%)",width:14,height:14,borderRadius:"50%",background:"#ffffff",border:`2px solid ${pfColor}`,boxShadow:`0 0 0 3px ${pfColor}33, 0 0 12px ${pfColor}, 0 0 22px ${pfColor}88, 0 2px 6px rgba(0,0,0,0.6)`,zIndex:2}}/>
                </div>;
              })()}
              {/* Graduations */}
              <div style={{position:"relative",height:9}}>
                {[["0","0%"],["1","33.33%"],["1.5","50%"],["3+","100%"]].map(([lbl,pos])=>(
                  <span key={lbl} style={{position:"absolute",left:pos,transform:pos==="0%"?"none":pos==="100%"?"translateX(-100%)":"translateX(-50%)",fontSize:7,color:"#ffffff44",fontFamily:MONO}}>{lbl}</span>
                ))}
              </div>
            </div>;
          })()}
          {/* === Courbe + Résumé groupés (au-dessus du dernier trade) === */}
          {total>=5&&<div id="tut-coach" style={{marginBottom:12,display:"flex",flexDirection:"column",gap:10}}>
            <PerformanceChart trades={pf} neon={neon} lang={lang}/>
            <CoachSummaryCard trades={pf} lang={lang} neon={neon} onOpen={()=>setShowStats(true)}/>
          </div>}
          {trades.length>0&&(
            <div id="tut-lasttrade" className="row" onClick={()=>setDetailTrade(trades[0])} style={{background:`${rc(trades[0].result,neon)}0a`,border:`1px solid ${rc(trades[0].result,neon)}35`,borderRadius:12,padding:14,marginBottom:12,borderLeft:`3px solid ${rc(trades[0].result,neon)}`,boxShadow:`0 4px 20px ${rc(trades[0].result,neon)}14`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{t.lastTrade} · {trades[0].date}{trades[0].time?" · "+trades[0].time:""}</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#ffffff"}}>{trades[0].asset} · {trades[0].direction}</div>
                  <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:rc(trades[0].result,neon),textShadow:`0 0 12px ${rc(trades[0].result,neon)}99`}}>{trades[0].result}</span>
                    {trades[0].pnlPct!==""&&parseFloat(trades[0].pnlPct)!==0&&(()=>{
                      const pv=parseFloat(trades[0].pnlPct);
                      const rounded=Math.round(pv*10)/10;
                      const c=pv>0?neon:"#ff4d4d";
                      const gain=config.capital?Math.round(parseFloat(config.capital)*pv/100):null;
                      const dv=config.devise||"€";
                      return <span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1}}>
                        <span style={{fontSize:12,color:c,fontWeight:600,textShadow:`0 0 10px ${c}88`,fontFamily:MONO}}>{rounded>=0?"+":""}{rounded}%</span>
                        {gain!==null&&<span style={{fontSize:10,color:c,opacity:0.75,fontFamily:MONO}}>{gain>=0?"+":""}{gain.toLocaleString()}{dv}</span>}
                      </span>;
                    })()}
                    {modOn(config,"revenge")&&trades[0].isRevenge&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(255,77,77,0.15)",color:"#ff4d4d",border:"1px solid rgba(255,77,77,0.3)"}}>REVENGE</span>}
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:trades[0].conforming?`${neon}1a`:"rgba(255,77,77,0.1)",color:trades[0].conforming?neon:"#ff4d4d",border:`1px solid ${trades[0].conforming?`${neon}35`:"rgba(255,77,77,0.2)"}`}}>{trades[0].conforming?t.conformLabel:t.nonConformLabel}</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,marginLeft:10}}>
                  <ScoreRing score={trades[0].setupScore} max={trades[0].checklistMax||config.items.length} size={42} threshold={config.threshold} neon={neon}/>
                  <button onClick={e=>{e.stopPropagation();startEdit(trades[0]);}} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}26`,color:neon,borderRadius:6,padding:"3px 8px",fontSize:10,fontFamily:MONO}}>✏</button>
              
                </div>
              </div>
            </div>
          )}
          {/* Résumé & insights : accès direct si trop peu de trades pour le coach (<5) */}
          {total>=3&&total<5&&<button onClick={()=>setShowStats(true)} className="btn" style={{width:"100%",background:`${neon}0d`,border:`1px solid ${neon}28`,borderRadius:10,padding:"12px 0",color:neon,fontSize:11,fontWeight:700,fontFamily:MONO,letterSpacing:2,marginBottom:12}}>
            {lang==="fr"?"◈ RÉSUMÉ & INSIGHTS":"◈ SUMMARY & INSIGHTS"}
          </button>}
          <NoTradeButton onSave={e=>{
            const updated=[e,...noTrades];
            setNoTrades(updated);
            if(currentUserRef.current?.email) saveUserData(uidNow(),{noTrades:updated});
          }} alreadyDone={noTrades.some(x=>x.date===today())} lang={lang} neon={neon} accounts={accounts} activeAccountId={activeAccountId}/>
          {total>0&&<>
            <AdvancedStats trades={pf} neon={neon} lang={lang}/>
            <ConformityBar trades={pf} threshold={config.threshold} maxItems={config.items.length} neon={neon} lang={lang}/>
            {config.calendarOn&&<TradingCalendar trades={trades} neon={neon} lang={lang}/>}
          </>}
          {total===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{display:"inline-block",marginBottom:20}}><SplashLogo neon={neon}/></div><div style={{fontSize:13,color:"#ffffffbb",marginBottom:8,fontWeight:700}}>{t.journalEmpty}</div><div style={{fontSize:11,color:"#ffffff55",marginBottom:24,lineHeight:1.6}}>{t.journalEmptyDesc}</div><button onClick={()=>setView("log")} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:"12px 28px",fontSize:12,fontFamily:MONO,fontWeight:700}}>{t.firstTrade}</button></div>}
        </div>
      )}

      {view==="log"&&(
        <div className="fi" style={{padding:20}}>
          {isRevengeNow&&<div style={{background:"rgba(255,77,77,0.1)",border:"1px solid rgba(255,77,77,0.4)",borderRadius:10,padding:"12px 14px",marginBottom:16}}><div style={{fontSize:12,color:"#ff4d4d",fontFamily:MONO,fontWeight:700}}>{t.revengeWarning}</div></div>}
          {editingId!==null&&editingTrade&&<div style={{background:"rgba(240,180,41,0.08)",border:"1px solid rgba(240,180,41,0.3)",borderRadius:10,padding:"12px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:11,color:"#f0b429",fontWeight:700,marginBottom:2}}>{t.modifyTrade}</div><div style={{fontSize:10,color:"#ffffffaa"}}>{editingTrade.asset} · {editingTrade.date}</div></div><button onClick={cancelEdit} className="btn" style={{background:"transparent",border:"1px solid rgba(240,180,41,0.4)",color:"#f0b429",borderRadius:6,padding:"5px 10px",fontSize:10,fontFamily:MONO,fontWeight:700}}>{t.cancelEdit}</button></div>}
          {editingId===null&&<div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:16,textTransform:"uppercase"}}>{t.newTrade}</div>}

          {modOn(config,"checkin")&&<div style={{marginBottom:14}}>
            <button onClick={()=>setCheckinOpen(!checkinOpen)} className="btn" style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:checkinOpen?`${neon}0d`:"transparent",border:`1px solid ${checkinOpen?neon:`${neon}26`}`,borderRadius:checkinOpen?"10px 10px 0 0":10,color:checkinOpen?neon:"#ffffffbb",fontFamily:MONO,fontSize:12}}>
              <span>{checkinOpen?"▼":"▶"} {t.checkinToggle}{(form.checkin.humeur||form.checkin.biais)?" ✓":""}</span>
              <span style={{fontSize:9,color:"#ffffff44"}}>{t.optional}</span>
            </button>
            {checkinOpen&&(
              <div style={{background:"#131318",border:`1px solid ${neon}26`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:14}}>
                <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.humeurLabel}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {humeurPills.map(h=>(
                    <button key={h} onClick={()=>setForm(f=>({...f,checkin:{...f.checkin,humeur:f.checkin.humeur===h?"":h}}))} className="btn"
                      style={{background:form.checkin.humeur===h?`${neon}18`:"#131318",border:`1px solid ${form.checkin.humeur===h?neon:"#ffffff15"}`,color:form.checkin.humeur===h?"#ffffff":"#ffffffbb",borderRadius:8,padding:"7px 12px",fontSize:11,fontFamily:MONO,fontWeight:form.checkin.humeur===h?700:400}}>{h}</button>
                  ))}
                </div>
                <input value={humeurPills.includes(form.checkin.humeur)?"":form.checkin.humeur} onChange={e=>setForm(f=>({...f,checkin:{...f.checkin,humeur:e.target.value}}))} placeholder={t.humeurPlaceholder} style={{...inSt,marginBottom:12,fontSize:12}}/>
                <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.biaisLabel}</div>
                <div style={{display:"flex",gap:6}}>
                  {biaisPills.map(b=>{
                    const isUp=b.startsWith("↑");const isDown=b.startsWith("↓");
                    const bc=isUp?neon:isDown?"#ff4d4d":"#ffffffbb";
                    const activeBg=isUp?`${neon}18`:isDown?"rgba(255,77,77,0.12)":"rgba(255,255,255,0.08)";
                    return <button key={b} onClick={()=>setForm(f=>({...f,checkin:{...f.checkin,biais:f.checkin.biais===b?"":b}}))} className="btn"
                      style={{flex:1,background:form.checkin.biais===b?activeBg:"#131318",border:`1px solid ${form.checkin.biais===b?bc:"#ffffff12"}`,color:form.checkin.biais===b?bc:"#ffffffbb",borderRadius:8,padding:"9px 0",fontSize:12,fontFamily:MONO,fontWeight:700}}>{b}</button>;
                  })}
                </div>
              </div>
            )}
          </div>}

          {activeAccounts.length>1&&<div style={{marginBottom:12}}>
            <div style={{fontSize:8,color:"#ffffff33",letterSpacing:2,marginBottom:6}}>{lang==="fr"?"COMPTE":"ACCOUNT"}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {activeAccounts.map(acc=>{
                const sel=(form.accountId||activeAccountId)===acc.id;const c=acc.color||neon;
                return <button key={acc.id} onClick={()=>setForm({...form,accountId:acc.id})} className="btn"
                  style={{display:"flex",alignItems:"center",gap:5,padding:"8px 12px",background:sel?`${c}18`:"#131318",border:`1px solid ${sel?c:`${c}22`}`,borderRadius:8,fontSize:11,fontWeight:sel?700:400,color:sel?c:"#ffffffaa",fontFamily:MONO}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:c,flexShrink:0}}/>{acc.name}
                </button>;
              })}
            </div>
          </div>}
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:8}}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{...inSt,marginBottom:0,flex:2,colorScheme:"dark",color:"#ffffffcc"}}/><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{...inSt,marginBottom:0,flex:1,colorScheme:"dark",color:form.time?"#ffffffcc":"#ffffff66"}}/></div>
            <div style={{fontSize:9,color:"#ffffffaa",marginTop:5}}>{t.entryTime}</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})} style={{flex:2,background:"#131318",border:`1px solid ${neon}35`,borderRadius:8,color:"#ffffff",padding:"12px",fontSize:12,fontFamily:MONO,outline:"none"}}>{allAssets.map(a=><option key={a}>{a}</option>)}</select>
            {["BUY","SELL"].map(d=><button key={d} onClick={()=>setForm({...form,direction:d})} className="btn" style={{flex:1,padding:10,background:form.direction===d?(d==="BUY"?`${neon}33`:"rgba(255,77,77,0.2)"):"#131318",border:`1px solid ${form.direction===d?(d==="BUY"?neon:"#ff4d4d"):`${neon}35`}`,color:form.direction===d?(d==="BUY"?neon:"#ff4d4d"):"#ffffff44",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO}}>{d}</button>)}
          </div>
          {/* Timeframe */}
          {modOn(config,"timeframe")&&<div style={{marginBottom:10}}>
            <div style={{fontSize:8,color:"#ffffff33",letterSpacing:2,marginBottom:6}}>TIMEFRAME</div>
            <div style={{display:"flex",gap:4}}>
              {getTimeframes(config).map(tf=>(
                <button key={tf} onClick={()=>{setForm({...form,timeframe:tf});const nc={...config,lastTimeframe:tf};setConfig(nc);if(currentUserRef.current?.email)saveUserData(uidNow(),{config:nc});}} className="btn"
                  style={{flex:1,padding:"7px 0",background:form.timeframe===tf?`${neon}18`:"#131318",border:`1px solid ${form.timeframe===tf?neon:"#ffffff0d"}`,borderRadius:7,fontSize:9,fontWeight:700,color:form.timeframe===tf?neon:"#ffffffbb",fontFamily:MONO}}>
                  {tf}
                </button>
              ))}
            </div>
          </div>}
          {modOn(config,"revenge")&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,marginBottom:10}}>
            <span style={{fontSize:12,color:form.isRevenge||isRevengeNow?"#ff4d4d":"#ffffffbb",fontFamily:MONO}}>{t.revengeLabel} {(form.isRevenge||isRevengeNow)?"⚠":""}</span>
            <button onClick={()=>setForm({...form,isRevenge:!form.isRevenge})} className="btn" style={{width:44,height:24,borderRadius:12,background:(form.isRevenge||isRevengeNow)?"rgba(255,77,77,0.3)":"#ffffff12",border:`1px solid ${(form.isRevenge||isRevengeNow)?"#ff4d4d":"rgba(255,77,77,0.2)"}`,position:"relative",transition:"all 0.2s"}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:(form.isRevenge||isRevengeNow)?"#ff4d4d":"#ffffffaa",position:"absolute",top:3,left:(form.isRevenge||isRevengeNow)?24:4,transition:"all 0.2s"}}/>
            </button>
          </div>}
          <div style={{background:"#131318",border:`1px solid ${neon}26`,borderRadius:10,padding:14,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div><div style={{fontSize:9,color:"#ffffff44",letterSpacing:2}}>{t.checklistSetup}</div><div style={{fontSize:10,marginTop:4,color:form.checklist.length>=config.threshold?neon:"#ff4d4d"}}>{form.checklist.length>=config.threshold?t.conform:`⚠ ${config.threshold-form.checklist.length} ${t.missing}`}</div></div>
              <ScoreRing score={form.checklist.length} max={config.items.length} threshold={config.threshold} neon={neon}/>
            </div>
            {config.items.map((item,i)=>(
              <label key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${neon}08`,cursor:"pointer"}}>
                <input type="checkbox" checked={form.checklist.includes(i)} onChange={e=>setForm({...form,checklist:e.target.checked?[...form.checklist,i]:form.checklist.filter(x=>x!==i)})}/>
                <span style={{fontSize:12,color:form.checklist.includes(i)?"#ffffff":"#ffffffaa"}}>{item}</span>
              </label>
            ))}
          </div>
          {modOn(config,"rejet")&&<div style={{background:"#131318",border:`1px solid ${neon}1a`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2}}>{t.rejectQuality} <span style={{color:"#ffffffaa"}}>{t.optional}</span></div>
              {form.rejetScore>0&&<span style={{fontSize:15,fontWeight:800,color:form.rejetScore>=8?neon:form.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:MONO}}>{form.rejetScore}/10</span>}
            </div>
            <div style={{display:"flex",gap:3}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} onClick={()=>setForm({...form,rejetScore:form.rejetScore===n?0:n})} className="btn" style={{flex:1,padding:"6px 0",borderRadius:5,fontSize:11,fontWeight:700,fontFamily:MONO,background:form.rejetScore>=n?(n>=8?`${neon}33`:n>=5?"rgba(240,180,41,0.2)":"rgba(255,77,77,0.2)"):"#131318",border:`1px solid ${form.rejetScore>=n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"#ffffff12"}`,color:form.rejetScore>=n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"#ffffffbb"}}>{n}</button>
              ))}
            </div>
          </div>}
          <div style={{display:"flex",gap:8,marginBottom:10}}>{["WIN","LOSS","BE"].map(r=><button key={r} onClick={()=>setForm({...form,result:r,slDirection:r!=="LOSS"?"":form.slDirection,pnlPreset:forceSign(form.pnlPreset,r),pnlManual:forceSign(form.pnlManual,r)})} className="btn" style={{flex:1,background:form.result===r?`${rc(r,neon)}22`:"#131318",border:`1px solid ${form.result===r?rc(r,neon):`${neon}26`}`,color:form.result===r?rc(r,neon):"#ffffffbb",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>{r}</button>)}</div>
          {modOn(config,"postSl")&&form.result==="LOSS"&&(
            <div style={{background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:9,color:"#ff4d4d",letterSpacing:2,marginBottom:8}}>{t.slDirectionLabel} <span style={{color:"#ffffffaa"}}>{t.optional}</span></div>
              <div style={{display:"flex",gap:8}}>
                {[["with",t.slWith,neon],["against",t.slAgainst,"#ff4d4d"]].map(([v,l,c])=>(
                  <button key={v} onClick={()=>setForm({...form,slDirection:form.slDirection===v?"":v})} className="btn" style={{flex:1,padding:"8px 0",borderRadius:7,fontSize:11,fontFamily:MONO,fontWeight:700,background:form.slDirection===v?`${c}22`:"#131318",border:`1px solid ${form.slDirection===v?c:`${c}26`}`,color:form.slDirection===v?c:"#ffffffaa"}}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{marginBottom:pnlIncoherent?4:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2}}>{t.pnl}</div>
              {config.capital&&<div style={{display:"flex",gap:3,background:"#131318",borderRadius:6,padding:2}}>
                {["eur","pct"].map(m=>(
                  <button key={m} onClick={()=>setForm(f=>({...f,pnlMode:m,pnlPreset:"",pnlManual:""}))} className="btn" style={{padding:"3px 8px",borderRadius:4,fontSize:9,fontWeight:700,fontFamily:MONO,background:(form.pnlMode||"pct")===m?neon:"transparent",color:(form.pnlMode||"pct")===m?"#000":"#ffffff66",border:"none"}}>{m==="pct"?"%":"€"}</button>
                ))}
              </div>}
            </div>
            {(form.pnlMode||"eur")==="eur"?(
              <div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {(()=>{
                    const cap=parseFloat(config.capital)||0;
                    const euroPresets=[-1000,-500,-250,0,500,1000,2000,5000].map(v=>({v,pct:cap?parseFloat((v/cap*100).toFixed(3)):0}));
                    return euroPresets.map(({v,pct})=>{
                      const isActive=form.pnlManual===""&&form.pnlPreset===String(pct);
                      const c=v>0?neon:v<0?"#ff4d4d":"#f0b429";
                      return <button key={v} onClick={()=>setForm({...form,pnlPreset:forceSign(String(Math.abs(pct)),form.result),pnlManual:""})} className="btn"
                        style={{padding:"7px 8px",borderRadius:6,fontSize:10,fontWeight:700,fontFamily:MONO,
                          background:isActive?`${c}22`:"#131318",
                          border:`1px solid ${isActive?c:`${neon}14`}`,
                          color:isActive?c:"#ffffffaa"}}>
                        {v===0?"0":v>0?`+${v>=1000?v/1000+"K":v}`:v<=-1000?v/1000+"K":v}{config.devise||"€"}
                      </button>;
                    });
                  })()}
                </div>
                <div style={{position:"relative"}}>
                  <input type="number" step="1" placeholder={`Montant ${config.devise||"€"}`} value={form.pnlEurManual||""}
                    onChange={e=>{
                      const euros=parseFloat(e.target.value)||0;
                      const cap=parseFloat(config.capital)||1;
                      const pct=parseFloat((euros/cap*100).toFixed(3));
                      setForm(f=>({...f,pnlEurManual:e.target.value,pnlManual:forceSign(String(Math.abs(pct)),f.result),pnlPreset:""}));
                    }}
                    style={{width:"100%",background:"#131318",border:`1px solid ${neon}35`,borderRadius:8,color:"#ffffff",padding:"10px 50px 10px 14px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
                  <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#ffffff44",fontFamily:MONO}}>{config.devise||"€"}</span>
                </div>
              </div>
            ):(
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {PNL_PRESETS.map(v=>(
                  <button key={v} onClick={()=>setForm({...form,pnlPreset:forceSign(v.replace(/^[+-]/,""),form.result),pnlManual:""})} className="btn" style={{padding:"8px 0",borderRadius:6,fontSize:11,fontWeight:700,fontFamily:MONO,flex:1,background:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?`${neon}33`:parseFloat(v)<0?"rgba(255,77,77,0.2)":"rgba(240,180,41,0.2)"):"#131318",border:`1px solid ${form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?neon:parseFloat(v)<0?"#ff4d4d":"#f0b429"):`${neon}14`}`,color:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?neon:parseFloat(v)<0?"#ff4d4d":"#f0b429"):"#ffffffaa"}}>{v}%</button>
                ))}
                <input type="number" step="0.1" placeholder={t.manualPnl} value={form.pnlManual} onChange={e=>setForm({...form,pnlManual:forceSign(e.target.value.replace(/^[+-]/,""),form.result),pnlPreset:""})} style={{width:52,background:"#131318",border:`1px solid ${form.pnlManual?`${neon}66`:`${neon}14`}`,borderRadius:6,color:form.pnlManual?(parseFloat(form.pnlManual)>=0?neon:"#ff4d4d"):"#ffffffaa",padding:"8px 4px",fontSize:10,fontFamily:MONO,outline:"none",textAlign:"center",flexShrink:0}}/>
              </div>
            )}
            {pnlVal!==""&&(
              <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:5}}>
                <span style={{fontSize:11,color:parseFloat(pnlVal)>=0?neon:"#ff4d4d",fontFamily:MONO,fontWeight:700}}>{fmtPct(parseFloat(pnlVal))}</span>
                {config.capital&&<span style={{fontSize:11,color:parseFloat(pnlVal)>=0?neon+"88":"#ff4d4d88",fontFamily:MONO}}>{parseFloat(pnlVal)>=0?"+":""}{Math.round(parseFloat(config.capital)*parseFloat(pnlVal)/100).toLocaleString()}{config.devise||"€"}</span>}
              </div>
            )}
          </div>
          {pnlIncoherent&&<div style={{fontSize:10,color:"#f0b429",background:"rgba(240,180,41,0.08)",border:"1px solid rgba(240,180,41,0.2)",borderRadius:6,padding:"6px 10px",marginBottom:10}}>⚠ P&L {t.inconsistent} {form.result}</div>}
          <textarea placeholder={t.notesPlaceholder} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} style={{width:"100%",background:"#131318",border:`1px solid ${neon}26`,borderRadius:8,color:"#ffffff",padding:"12px",fontSize:12,fontFamily:MONO,resize:"none",marginBottom:10,outline:"none"}}/>
          <div style={{marginBottom:16}}>
            <input type="file" ref={fileRef} accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setForm(fm=>({...fm,screenshot:ev.target.result}));r.readAsDataURL(f);}}/>
            <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{width:"100%",display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"8px 12px",borderRadius:8,border:`1px dashed ${neon}26`,color:form.screenshot?neon:"#ffffffaa",fontSize:11,fontFamily:MONO,background:"transparent"}}>{form.screenshot?t.screenshotAdded:t.addScreenshot}</button>
            {form.screenshot&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}><img src={form.screenshot} alt="" style={{height:40,borderRadius:4,border:`1px solid ${neon}26`}}/><button onClick={()=>setForm({...form,screenshot:""})} style={{background:"transparent",border:"none",color:"#ff4d4d",fontSize:12,cursor:"pointer"}}>✕</button></div>}
          </div>
          <button onClick={saveTrade} className="btn" style={{width:"100%",background:editingId!==null?"rgba(240,180,41,0.18)":(isRevengeNow||form.isRevenge?"rgba(255,77,77,0.15)":form.checklist.length>=config.threshold?`${neon}2a`:"rgba(255,77,77,0.1)"),border:`1px solid ${editingId!==null?"#f0b429":(isRevengeNow||form.isRevenge?"#ff4d4d":form.checklist.length>=config.threshold?neon:"#ff4d4d")}`,color:editingId!==null?"#f0b429":(isRevengeNow||form.isRevenge?"#ff4d4d":form.checklist.length>=config.threshold?neon:"#ff4d4d"),borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO,letterSpacing:1}}>
            {editingId!==null?t.updateBtn:isRevengeNow||form.isRevenge?"⚠ REVENGE — Non-conforme":form.checklist.length>=config.threshold?t.saveConform:`${t.saveNonConform} — ${form.checklist.length}/${config.items.length}`}
          </button>
          {saved&&(
        <div className="slide-up" style={{marginTop:12,background:`${neon}12`,border:`1px solid ${neon}40`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={neon} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="7.5,12.5 10.5,15.5 17,8.5"/></svg>
          <span style={{fontSize:13,fontWeight:700,color:neon,fontFamily:MONO}}>{editingId!==null?t.tradeUpdated:t.tradeSaved}</span>
        </div>
      )}
        </div>
      )}

      {view==="history"&&(
        <div className="fi" style={{padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase"}}>{t.histTitle} · {trades.length} {t.trades}</div>
            {noTrades.length>0&&<button onClick={()=>setShowNoTrades(v=>!v)} className="btn" style={{background:"transparent",border:`1px solid ${neon}18`,color:"#ffffffaa",borderRadius:6,padding:"4px 10px",fontSize:10,fontFamily:MONO}}>{showNoTrades?t.hideBtn:t.showBtn}</button>}
          </div>
          <div style={{position:"relative",marginBottom:10}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffffaa" strokeWidth="2" strokeLinecap="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}} aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={histSearch} onChange={e=>setHistSearch(e.target.value)}
              placeholder={lang==="fr"?"Rechercher par actif, date, notes…":"Search by asset, date, notes…"}
              style={{width:"100%",background:"#131318",border:`1px solid ${histSearch?neon:`${neon}22`}`,borderRadius:8,color:"#ffffff",padding:"9px 32px 9px 32px",fontSize:11,fontFamily:MONO,outline:"none"}}/>
            {histSearch&&<button onClick={()=>setHistSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:`${neon}55`,cursor:"pointer",fontSize:14}}>✕</button>}
          </div>
          {trades.length>0&&<>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["ALL",t.allLabel],["WIN","WIN"],["LOSS","LOSS"],["BE","BE"]].map(([v,l])=>(
                <button key={v} className="btn" onClick={()=>setHistFilter(v)} style={{flex:1,background:histFilter===v?(v==="ALL"?`${neon}26`:`${rc(v,neon)}22`):"transparent",border:`1px solid ${histFilter===v?(v==="ALL"?neon:rc(v,neon)):`${neon}26`}`,color:histFilter===v?(v==="ALL"?neon:rc(v,neon)):"#ffffffaa",borderRadius:6,padding:"6px 0",fontSize:11,fontWeight:700,fontFamily:MONO}}>{l}</button>
              ))}
            </div>

            {accounts.length>1&&(()=>{
              const liveAccs=accounts.filter(a=>!a.archived);
              const archAccs=accounts.filter(a=>a.archived);
              const pill=(v,l,c)=>(
                <button key={v} className="btn" onClick={()=>setHistAccount(v)} style={{background:histAccount===v?(v==="ALL"?`${neon}1a`:`${c}22`):"transparent",border:`1px solid ${histAccount===v?(v==="ALL"?neon:c):`${neon}1a`}`,color:histAccount===v?(v==="ALL"?neon:c):"#ffffffaa",borderRadius:5,padding:"4px 10px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                  {v!=="ALL"&&<div style={{width:5,height:5,borderRadius:"50%",background:c}}/>}{l}
                </button>
              );
              return <div style={{marginBottom:8}}>
                <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2,alignItems:"center"}}>
                  {pill("ALL",lang==="fr"?"Tous":"All",neon)}
                  {liveAccs.map(a=>pill(a.id,a.name,a.color||neon))}
                  {archAccs.length>0&&<button className="btn" onClick={()=>setHistArchOpen(o=>!o)} style={{background:histArchOpen?`${neon}10`:"transparent",border:`1px solid ${neon}1a`,color:"#ffffff88",borderRadius:5,padding:"4px 10px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap",flexShrink:0}}>⊘ {lang==="fr"?"Archivés":"Archived"} ({archAccs.length}) {histArchOpen?"▲":"▼"}</button>}
                </div>
                {histArchOpen&&archAccs.length>0&&<div style={{display:"flex",gap:4,overflowX:"auto",paddingTop:6,paddingBottom:2}}>
                  {archAccs.map(a=>pill(a.id,`⊘ ${a.name}`,a.color||neon))}
                </div>}
              </div>;
            })()}
            {usedAssets.length>1&&<div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
              {["ALL",...usedAssets].map(a=><button key={a} className="btn" onClick={()=>setHistAsset(a)} style={{background:histAsset===a?`${neon}1a`:"transparent",border:`1px solid ${histAsset===a?`${neon}55`:`${neon}1a`}`,color:histAsset===a?neon:"#ffffffaa",borderRadius:5,padding:"4px 8px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap"}}>{a}</button>)}
            </div>}
          </>}
          {trades.length===0&&<div style={{textAlign:"center",padding:40,color:"#ffffff55",fontSize:12}}>{t.noTrades}</div>}
          {(()=>{
            const els=[];let lastPk=null;
            for(const x of mergedHistory){
              if(x._type==="trade"&&phases.length>0){
                const pk=getPhaseKey(x.id);
                if(lastPk!==null&&pk!==lastPk){
                  const phStart=lastPk>0?phases[lastPk-1].date:"0000-00-00";
                  const phEnd=lastPk<phases.length?phases[lastPk].date:"9999-99-99";
                  const phTr=trades.filter(z=>z.date>=phStart&&z.date<phEnd);
                  const phWR=phTr.length?Math.round(phTr.filter(z=>z.result==="WIN").length/phTr.length*100):0;
                  const phPnl=phTr.reduce((s,z)=>s+(parseFloat(z.pnlPct)||0),0);
                  els.push(<div key={`sep-${lastPk}`} style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0 14px"}}><div style={{flex:1,height:1,background:`${neon}18`}}/><div style={{background:`${neon}08`,border:`1px solid ${neon}20`,borderRadius:8,padding:"5px 12px",textAlign:"center",flexShrink:0}}><span style={{fontSize:9,color:neon,fontFamily:MONO,fontWeight:700,letterSpacing:1}}>{lastPk===0?(config.phaseName||(lang==="fr"?"Phase 1":"Phase 1")):(phases[lastPk-1]?.name||("Phase "+(lastPk+1)))}</span><span style={{fontSize:9,color:"#ffffff44",fontFamily:MONO}}> · {t.phaseSince} {phStart}</span><span style={{fontSize:9,color:"#ffffffaa",fontFamily:MONO}}> · {phTr.length}t · {phWR}% · {fmtPct(phPnl)}</span></div><div style={{flex:1,height:1,background:`${neon}18`}}/></div>);
                }
                lastPk=pk;
              }
              if(x._type==="notrade"){
                const nAcc=(accounts||[]).find(a=>a.id===x.accountId);
                els.push(<div key={x.id} className="row" onClick={()=>setEditingNoTrade(x)} style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}><span style={{fontSize:16,color:"#ffffff66",flexShrink:0}}>⊘</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,color:"#ffffffaa",fontFamily:MONO,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>{t.noTradeToday}{nAcc&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9,color:nAcc.color||neon,fontWeight:600,opacity:0.85}}><span style={{width:5,height:5,borderRadius:"50%",background:nAcc.color||neon}}/>{nAcc.name}</span>}</div><div style={{fontSize:10,color:"#ffffffaa",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.date}{x.reason?" · "+x.reason:""}</div></div></div><span style={{color:"#ffffff44",fontSize:11,flexShrink:0,marginLeft:8}}>✎</span></div>);
              } else {
                els.push(
                  <div key={x.id} className="row" onClick={()=>setDetailTrade(x)} style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0a",borderRadius:14,padding:14,marginBottom:10,borderLeft:`3px solid ${rc(x.result,neon)}`}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <div><div style={{fontSize:13,fontWeight:700,color:"#ffffff"}}>{x.asset} · {x.direction}{modOn(config,"timeframe")&&x.timeframe&&<span style={{fontSize:9,color:"#ffffff44",marginLeft:6,background:"#ffffff08",padding:"2px 6px",borderRadius:4,fontWeight:400}}>{x.timeframe}</span>}</div><div style={{fontSize:10,color:"#ffffff66",marginTop:3}}>{x.date}{x.time?" · "+x.time:""}</div></div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <ScoreRing score={x.setupScore} max={x.checklistMax||config.items.length} size={42} threshold={config.threshold} neon={neon}/>
                        <div style={{textAlign:"right"}}>
                        <div style={{fontSize:12,fontWeight:900,color:rc(x.result,neon),background:`${rc(x.result,neon)}18`,padding:"3px 10px",borderRadius:7,border:`1px solid ${rc(x.result,neon)}35`}}>{x.result}</div>
                        {x.pnlPct!==""&&(()=>{
                          const pv=parseFloat(x.pnlPct);
                          const rounded=Math.round(pv*10)/10;
                          const c=pv>=0?neon:"#ff4d4d";
                          const gain=config.capital&&pv!==0?Math.round(parseFloat(config.capital)*pv/100):null;
                          const dv=config.devise||"€";
                          return <div>
                            <div style={{fontSize:11,color:c,fontWeight:600,fontFamily:MONO}}>{rounded>=0?"+":""}{rounded}%</div>
                            {gain!==null&&<div style={{fontSize:10,color:c,opacity:0.7,fontFamily:MONO}}>{gain>=0?"+":""}{gain.toLocaleString()}{dv}</div>}
                          </div>;
                        })()}
                      </div>
                      </div>
                    </div>
                    <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:x.conforming?`${neon}1a`:"rgba(255,77,77,0.1)",color:x.conforming?neon:"#ff4d4d",border:`1px solid ${x.conforming?`${neon}35`:"rgba(255,77,77,0.2)"}`}}>{x.conforming?t.conformLabel:t.nonConformLabel}</span>
                        {modOn(config,"revenge")&&x.isRevenge&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"rgba(255,77,77,0.15)",color:"#ff4d4d",border:"1px solid rgba(255,77,77,0.3)"}}>REVENGE</span>}
                        {modOn(config,"checkin")&&x.checkin?.humeur&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:`${neon}0d`,color:"#ffffffaa",border:`1px solid ${neon}18`}}>{x.checkin.humeur}</span>}
                        {modOn(config,"postSl")&&x.slDirection&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:x.slDirection==="with"?`${neon}15`:"rgba(255,77,77,0.1)",color:x.slDirection==="with"?neon:"#ff4d4d",border:`1px solid ${x.slDirection==="with"?`${neon}35`:"rgba(255,77,77,0.2)"}`}}>{x.slDirection==="with"?t.slWith:t.slAgainst}</span>}
                      </div>
                      {modOn(config,"rejet")&&x.rejetScore>0&&<span style={{fontSize:10,color:"#ffffff44"}}>{t.rejectStat} <b style={{color:x.rejetScore>=8?neon:x.rejetScore>=5?"#f0b429":"#ff4d4d"}}>{x.rejetScore}/10</b></span>}
                    </div>
                    {x.notes&&<div style={{fontSize:11,color:"#ffffffaa",marginTop:6,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{x.notes}"</div>}
                    <div style={{marginTop:10,display:"flex",gap:8}} onClick={e=>e.stopPropagation()}>
                      {confirmDeleteId===x.id?(
                        <><span style={{fontSize:10,color:"#ffffffaa"}}>{t.deleteConfirm}</span><button onClick={()=>deleteTrade(x.id)} className="btn" style={{background:"rgba(255,77,77,0.18)",border:"1px solid #ff4d4d",color:"#ff4d4d",borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO,fontWeight:700}}>{t.deleteBtn}</button><button onClick={()=>setConfirmDeleteId(null)} className="btn" style={{background:"transparent",border:`1px solid ${neon}26`,color:"#ffffffaa",borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO}}>{t.cancelBtn}</button></>
                      ):(
                        <>
                  <button onClick={e=>{e.stopPropagation();startEdit(x);}} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}35`,color:neon,borderRadius:6,padding:"5px 12px",fontSize:10,fontFamily:MONO,fontWeight:700}}>✏ {lang==="fr"?"MODIFIER":"EDIT"}</button>
                  
                  <button onClick={()=>setConfirmDeleteId(x.id)} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.15)",color:"#ff4d4d88",borderRadius:6,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:MONO}}>{t.deleteLink}</button>
                </>
                      )}
                    </div>
                  </div>
                );
              }
            }
            return els;
          })()}
        </div>
      )}

      
      {view==="settings"&&<SettingsView config={config} onSave={cfg=>{
        const newCfg={...config,...cfg};
        setConfig(newCfg);
        if(currentUserRef.current?.email) saveUserData(uidNow(),{config:newCfg});
      }} onLogout={async()=>{
        currentUserRef.current=null;
        try{localStorage.removeItem("tmt_user");}catch(e){}
        if(auth) try{ await signOut(auth); }catch(e){}
        setTrades([]);setNoTrades([]);setPhases([]);setAccounts([]);setActiveAccountId(null);setPhase("onboarding");
      }} onReset={()=>setShowReset(true)} onNewPhase={handleNewPhase} lang={lang} onLangChange={l=>{
        setLang(l);
        if(currentUserRef.current?.email) saveUserData(uidNow(),{lang:l});
      }} neon={neon} phases={phases} onPhasesChange={np=>{setPhases(np);if(currentUserRef.current?.email)saveUserData(uidNow(),{phases:np});}} onObjectifChange={obj=>{setObjectif(obj);if(currentUserRef.current?.email)saveUserData(uidNow(),{objectif:obj});}} onImport={()=>setShowImport(true)}
      accounts={accounts} activeAccountId={activeAccountId} onSwitchAccount={switchAccount}
      onAccountsChange={(newAccs,newActiveId)=>{
        setAccounts(newAccs);
        const aid=newActiveId!==undefined?newActiveId:activeAccountId;
        if(newActiveId!==undefined)setActiveAccountId(newActiveId);
        const act=newAccs.find(a=>a.id===aid);
        if(act){setConfig(c=>({...c,capital:act.capital,devise:act.devise,accountType:act.accountType}));setObjectif(o=>({...o,pnl:act.objPnl,drawdown:act.objDrawdown}));}
        const uid=uidNow();
        if(currentUserRef.current?.email)saveUserData(uid,{accounts:newAccs,activeAccountId:aid,trades});
      }}
      onCreateAccount={()=>{
        const id="acc_"+Date.now();
        const used=accounts.length;
        const nc=mkAccount(id,(lang==="fr"?"Nouveau compte":"New account"),ACCOUNT_COLORS[used%ACCOUNT_COLORS.length],{devise:config.devise});
        const newAccs=[...accounts,nc];
        setAccounts(newAccs);
        const uid=uidNow();
        if(currentUserRef.current?.email)saveUserData(uid,{accounts:newAccs,activeAccountId,trades});
      }}/>}

      {!isDesktop&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(9,9,16,0.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${neon}18`,padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:9,color:`${neon}22`,fontFamily:"'Geist Mono','IBM Plex Mono',monospace"}}>◈ TrackMyTrade</div>
      </div>}

      {detailTrade&&<TradeDetailModal trade={detailTrade} config={config} onClose={()=>setDetailTrade(null)} onEdit={startEdit} onShare={t=>{setShareTarget(t);setShowShare(true);}} lang={lang} neon={neon} accounts={accounts} onReassign={(tid,aid)=>{reassignTrade(tid,aid);setDetailTrade(dt=>dt?{...dt,accountId:aid}:dt);}}/>}
      {showExport&&<ExportModal trades={trades} onClose={()=>setShowExport(false)} lang={lang} neon={neon}/>}
      {showStats&&<StatsInsightsModal trades={trades} lang={lang} neon={neon} onClose={()=>setShowStats(false)} accounts={accounts} activeAccountId={activeAccountId}/>}
      {editingNoTrade&&<NoTradeEditModal entry={editingNoTrade} lang={lang} neon={neon} accounts={accounts} onClose={()=>setEditingNoTrade(null)}
        onSave={updated=>{
          const next=noTrades.map(n=>n.id===updated.id?updated:n);
          setNoTrades(next);
          if(currentUserRef.current?.email) saveUserData(uidNow(),{noTrades:next});
        }}
        onDelete={id=>{
          const next=noTrades.filter(n=>n.id!==id);
          setNoTrades(next);
          if(currentUserRef.current?.email) saveUserData(uidNow(),{noTrades:next});
        }}/>}
      {showShare&&<ShareModal trade={shareTarget} trades={trades} lang={lang} neon={neon} config={config} onClose={()=>{setShowShare(false);setShareTarget(null);}}/> }
      {showReset&&<ResetModal trades={trades} onReset={handleReset} onClose={()=>setShowReset(false)} lang={lang} neon={neon}/>}
      {showNewPhase&&<NewPhaseModal onConfirm={data=>{handleNewPhase(data);setShowNewPhase(false);}} onClose={()=>setShowNewPhase(false)} lang={lang} neon={neon} phases={phases} config={config}/>}
      </div>
      </div>
    </div>
  );
}

function NewPhaseModal({onConfirm,onClose,lang,neon,phases,config}){
  const MONO="'Geist Mono','IBM Plex Mono',monospace";
  const num=(phases?.length||0)+2;
  const [name,setName]=useState(`Phase ${num}`);
  const [accountType,setAccountType]=useState(config?.accountType||"perso");
  const [capital,setCapital]=useState(config?.capital||"");
  const [devise,setDevise]=useState(config?.devise||"€");
  const [obj,setObj]=useState("");
  const [drawdown,setDrawdown]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,10,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#0f0f18",borderRadius:"24px 24px 0 0",padding:"20px 20px 36px",width:"100%",maxWidth:480,border:"1px solid #ffffff0f",borderBottom:"none",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#ffffff"}}>▶ Nouvelle phase</div>
            <div style={{fontSize:9,color:"#ffffff33",marginTop:3}}>Les stats repartent à zéro · Historique conservé</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:18,cursor:"pointer",padding:"4px 8px"}}>✕</button>
        </div>

        {/* Nom */}
        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6}}>NOM DE LA PHASE</div>
        <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO,marginBottom:14,outline:"none"}}/>

        {/* Type */}
        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>TYPE DE COMPTE</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["prop","Prop Firm"],["perso","Perso"],["demo","Démo"]].map(([v,l])=>(
            <button key={v} onClick={()=>setAccountType(v)} style={{flex:1,padding:"10px 0",background:accountType===v?`${neon}18`:"#131318",border:`1px solid ${accountType===v?neon:"#ffffff0d"}`,borderRadius:10,fontSize:10,fontWeight:700,color:accountType===v?neon:"#ffffff33",fontFamily:MONO,cursor:"pointer"}}>
              {l}
            </button>
          ))}
        </div>

        {/* Capital + Devise */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:2}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6}}>CAPITAL</div>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)} placeholder="10000" style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6}}>DEVISE</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["€","$","£","CHF"].map(d=>(
                <button key={d} onClick={()=>setDevise(d)} style={{padding:"5px 0",background:devise===d?`${neon}18`:"#131318",border:`1px solid ${devise===d?neon:"#ffffff0d"}`,borderRadius:7,fontSize:12,fontWeight:800,color:devise===d?neon:"#ffffff30",fontFamily:MONO,cursor:"pointer"}}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drawdown + Objectif */}
        <div style={{display:"flex",gap:10,marginBottom:22}}>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ff4d4d88",letterSpacing:2,marginBottom:6}}>DRAWDOWN MAX %</div>
            <input type="number" value={drawdown} onChange={e=>setDrawdown(e.target.value)} placeholder="5" style={{width:"100%",background:"#131318",border:"1px solid #ff4d4d33",borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6}}>OBJECTIF P&L %</div>
            <input type="number" value={obj} onChange={e=>setObj(e.target.value)} placeholder="+10" style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
          </div>
        </div>

        {/* Confirm */}
        <button onClick={()=>onConfirm({name,accountType,capital,devise,obj,drawdown})}
          style={{width:"100%",background:`linear-gradient(135deg,${neon}22,${neon}0c)`,border:`1.5px solid ${neon}`,borderRadius:14,padding:"15px 0",fontSize:13,fontWeight:900,color:"#ffffff",fontFamily:MONO,cursor:"pointer",boxShadow:`0 4px 28px ${neon}22,inset 0 1px 0 ${neon}30`,letterSpacing:1}}>
          ✓ Lancer {name}
        </button>
      </div>
    </div>
  );
}