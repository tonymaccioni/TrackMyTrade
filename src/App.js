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
const saveUserData = async (id, data) => { if(!db)return; try { await setDoc(doc(db,"users",id), data, {merge:true}); } catch(e) { console.error("Firestore save:",e); } };
const loadUserData = async id => { if(!db)return null; try { const s=await getDoc(doc(db,"users",id)); return s.exists()?s.data():null; } catch(e) { return null; } };
const authLogin = async (email, pwd) => {
  if(!auth) return null;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pwd);
    const uid = cred.user.uid;
    // Essayer d'abord avec UID (nouveau système)
    let d = await loadUserData(uid);
    // Si pas trouvé, essayer avec email encodé (ancien système)
    if(!d) d = await loadUserData(encEmail(email));
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
const PNL_PRESETS = ["-1","-0.5","0","+1","+2","+3","+4","+5"];
const NEON_COLORS = [{name:"Vert",value:"#00ff9d"},{name:"Bleu",value:"#00d4ff"},{name:"Violet",value:"#bf00ff"},{name:"Rose",value:"#ff00aa"},{name:"Or",value:"#f0b429"}];
const HUMEUR_PILLS = {fr:["◎ Focus","◌ Neutre","△ Tendu","◷ Fatigué"],en:["◎ Focus","◌ Neutral","△ Tense","◷ Tired"]};
const BIAIS_PILLS = {fr:["↑ Haussier","→ Range","↓ Baissier"],en:["↑ Bullish","→ Range","↓ Bearish"]};
const NTR = {fr:["Pas de setup valide","Hors fenêtre","Marché difficile","Journée chargée","Jour de repos"],en:["No valid setup","Out of window","Difficult market","Busy day","Rest day"]};
const today = () => new Date().toISOString().split("T")[0];
const rc = (r, neon="#00ff9d") => r==="WIN"?neon:r==="LOSS"?"#ff4d4d":"#f0b429";
const fmtPct = v => { if(v===""||v===null||v===undefined) return "—"; const n=Number(v),abs=Math.abs(n); const s=abs%1===0?abs.toFixed(0):abs*10%1===0?abs.toFixed(1):abs*100%1===0?abs.toFixed(2):abs.toFixed(3); return `${n>=0?"+":""}${n<0?"-":""}${s}%`; };
const calcDisc = list => { if(!list||!list.length) return null; return Math.round((list.filter(x=>x.conforming).length/list.length*0.6+list.filter(x=>!x.isRevenge).length/list.length*0.4)*10); };
const emptyForm = (asset="XAU/USD", tf="M5", mode="pct") => ({date:today(),asset,direction:"BUY",checklist:[],result:"WIN",pnlPreset:"",pnlManual:"",pnlMode:mode,pnlEurManual:"",notes:"",rejetScore:0,time:"",timeframe:tf,screenshot:"",isRevenge:false,slDirection:"",checkin:{humeur:"",biais:""}});
const mkInput = neon => ({width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:8,color:"#ffffff",padding:"12px 14px",fontSize:13,fontFamily:MONO,marginBottom:10,outline:"none"});
// Auth handled by Firebase Auth

const T = {
  fr:{
    welcome:"Bienvenue sur\nTrackMyTrade",welcomeDesc:"Le journal de trading qui transforme ta discipline en données concrètes. Chaque trade enregistré est un pas vers la rentabilité.",
    checklist:"Ta checklist,\nton filtre",checklistDesc:"Configure tes critères d'entrée. Chaque setup reçoit une note automatique — conforme ou non-conforme. Les chiffres ne mentent pas.",
    measure:"Mesure ce qui\nfonctionne",measureDesc:"Courbe de capital, conformité des setups, résumé hebdomadaire. Les données te font progresser.",
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
    revengeLabel:"Revenge trade",revengeWarning:"⚠️ Limite atteinte — tagué Revenge trade",
    statsTitle:"STATISTIQUES",expectancy:"Expectancy",bestAsset:"Meilleur actif",avgWin:"Gain moyen",avgLoss:"Perte moyenne",
    calendarTitle:"CALENDRIER",calendarToggle:"Afficher le calendrier",enableNotif:"Activer les conseils",
    addAsset:"+ Ajouter un actif",customAsset:"Nom de l'actif…",
    slDirectionLabel:"DIRECTION POST-SL",slWith:"Dans le bon sens ✓",slAgainst:"Contre moi ✗",ratio:"Ratio G/P",
    loginTitle:"Connexion",loginEmail:"Adresse email",loginPassword:"Mot de passe",
    loginBtn:"Se connecter",signupBtn:"Créer un compte",loginSwitch:"Pas encore de compte ?",signupSwitch:"Déjà un compte ?",
    loginError:"Email ou mot de passe incorrect",signupError:"Email déjà utilisé",
    loginEmailPlaceholder:"ton@email.com",loginPasswordPlaceholder:"········",
    disciplineLabel:"DISCIPLINE",disciplineExcellent:"Excellent",disciplineGood:"Bon",disciplineWork:"À améliorer",disciplinePoor:"Insuffisant",
    conformiteLabel:"Conformité",sansRevengeLabel:"Sans revenge",
    phaseEnCours:"Compte en cours",toutHistorique:"Tout",
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
    welcome:"Welcome to\nTrackMyTrade",welcomeDesc:"The trading journal that turns your discipline into concrete data. Every logged trade is a step toward profitability.",
    checklist:"Your checklist,\nyour filter",checklistDesc:"Set your entry criteria. Each setup gets an automatic score — compliant or non-compliant. Numbers don't lie.",
    measure:"Measure what\nworks",measureDesc:"Equity curve, setup compliance, weekly summary. Data makes you progress.",
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
    revengeLabel:"Revenge trade",revengeWarning:"⚠️ Limit reached — tagged as Revenge trade",
    statsTitle:"STATISTICS",expectancy:"Expectancy",bestAsset:"Best asset",avgWin:"Avg win",avgLoss:"Avg loss",
    calendarTitle:"CALENDAR",calendarToggle:"Show calendar",enableNotif:"Enable tips",
    addAsset:"+ Add asset",customAsset:"Asset name…",
    slDirectionLabel:"POST-SL DIRECTION",slWith:"Went my way ✓",slAgainst:"Against me ✗",ratio:"Win/Loss ratio",
    loginTitle:"Sign in",loginEmail:"Email address",loginPassword:"Password",
    loginBtn:"Sign in",signupBtn:"Create account",loginSwitch:"No account yet?",signupSwitch:"Already have an account?",
    loginError:"Invalid email or password",signupError:"Email already in use",
    loginEmailPlaceholder:"your@email.com",loginPasswordPlaceholder:"········",
    disciplineLabel:"DISCIPLINE",disciplineExcellent:"Excellent",disciplineGood:"Good",disciplineWork:"Needs work",disciplinePoor:"Poor",
    conformiteLabel:"Compliance",sansRevengeLabel:"Revenge-free",
    phaseEnCours:"Current account",toutHistorique:"All",
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

function TradeDetailModal({trade,config,onClose,onEdit,onShare,lang,neon}) {
  const t=T[lang];
  if(!trade) return null;
  const ci=trade.checkin;
  const hasCI=ci&&(ci.humeur||ci.biais);
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
        {trade.isRevenge&&<div style={{background:"rgba(255,77,77,0.1)",border:"1px solid rgba(255,77,77,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:"#ff4d4d",fontFamily:MONO}}>REVENGE TRADE</div>}
        {hasCI&&<div style={{background:`${neon}05`,border:`1px solid ${neon}18`,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
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
              {trade.slDirection&&<div style={{fontSize:10,marginTop:4,color:trade.slDirection==="with"?neon:"#ff4d4d"}}>{trade.slDirection==="with"?`✓ ${lang==="fr"?"Dans mon sens":"My way"}`:`✗ ${lang==="fr"?"Contre moi":"Against me"}`}</div>}
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
          {trade.rejetScore>0&&<div style={{flex:1,background:`${neon}0a`,border:`1px solid ${neon}1a`,borderRadius:8,padding:12,display:"flex",alignItems:"center",gap:10}}>
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
  if(!trades||trades.length<2) return null;

  // Calculer P&L cumulé par trade (ordre chronologique)
  const sorted = [...trades].sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
  let cum = 0;
  const points = sorted.map(t => {
    cum += parseFloat(t.pnlPct)||0;
    return {pnl: parseFloat(t.pnlPct)||0, cum: parseFloat(cum.toFixed(2)), result: t.result, date: t.date};
  });

  const W = 320, H = 130, PAD = {t:18, r:12, b:20, l:36};
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const cums = points.map(p=>p.cum);
  const minV = Math.min(0, ...cums);
  const maxV = Math.max(0, ...cums);
  const range = maxV - minV || 1;

  const toX = i => PAD.l + (i / (points.length-1)) * chartW;
  const toY = v => PAD.t + chartH - ((v - minV) / range) * chartH;
  const zeroY = toY(0);

  // Construire le path
  const pathD = points.map((p,i) => `${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(points.length-1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Valeur finale
  const finalVal = points[points.length-1].cum;
  const finalX = toX(points.length-1);
  const finalY = toY(finalVal);
  const color = finalVal >= 0 ? neon : "#ff4d4d";

  // Labels Y
  const yLabels = [];
  const step = range / 3;
  for(let i=0;i<=3;i++) {
    const v = minV + step*i;
    yLabels.push({v: parseFloat(v.toFixed(1)), y: toY(v)});
  }

  return (
    <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:9,color:`${neon}44`,letterSpacing:2,fontFamily:MONO}}>
          {fr?"P&L CUMULÉ":"CUMULATIVE P&L"}
        </div>
        <div style={{fontSize:12,fontWeight:700,color:color,fontFamily:MONO}}>
          {finalVal>=0?"+":""}{finalVal.toFixed(1)}%
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
          </linearGradient>
          <clipPath id="chartClip">
            <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH}/>
          </clipPath>
        </defs>

        {/* Grille horizontale */}
        {yLabels.map(({v,y})=>(
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke={neon} strokeOpacity="0.06" strokeWidth="1"/>
            <text x={PAD.l-4} y={y+3} fontFamily={MONO} fontSize="7" fill={neon} fillOpacity="0.35" textAnchor="end">
              {v>0?"+":""}{v}%
            </text>
          </g>
        ))}

        {/* Ligne zéro */}
        {minV<0&&maxV>0&&<line x1={PAD.l} y1={zeroY} x2={W-PAD.r} y2={zeroY} stroke={neon} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="4,3"/>}

        {/* Aire */}
        <path d={areaD} fill="url(#areaGrad)" clipPath="url(#chartClip)"/>

        {/* Courbe */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#chartClip)"/>

        {/* Points WIN/LOSS */}
        {points.map((p,i)=>(
          <circle key={i} cx={toX(i)} cy={toY(p.cum)} r="2.5"
            fill={p.result==="WIN"?neon:p.result==="LOSS"?"#ff4d4d":"#f0b429"}
            opacity="0.8"/>
        ))}

        {/* Point final mis en valeur */}
        <circle cx={finalX} cy={finalY} r="5" fill={color} opacity="0.9"/>
        <circle cx={finalX} cy={finalY} r="8" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="1"/>
      </svg>

      {/* Légende */}
      <div style={{display:"flex",gap:12,marginTop:4}}>
        {[{c:neon,l:"WIN"},{c:"#ff4d4d",l:"LOSS"},{c:"#f0b429",l:"BE"}].map(({c,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
            <span style={{fontSize:8,color:`${neon}33`,fontFamily:MONO}}>{l}</span>
          </div>
        ))}
        <span style={{fontSize:8,color:`${neon}22`,fontFamily:MONO,marginLeft:"auto"}}>{points.length} {fr?"trades":"trades"}</span>
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

function NoTradeButton({onSave,alreadyDone,lang,neon}) {
  const t=T[lang];
  const ntr=NTR[lang]||NTR.fr;
  const [open,setOpen]=useState(false);
  const [reason,setReason]=useState("");
  if(alreadyDone) return <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{color:"#ffffff66"}}>⊘</span><span style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO}}>{t.noTradeToday}</span></div>;
  if(!open) return <button onClick={()=>setOpen(true)} className="btn" style={{width:"100%",background:"transparent",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,color:"#ffffffaa",fontFamily:MONO,fontSize:12}}><span>⊘</span><span>{t.noTradeToday}</span></button>;
  return (
    <div style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:14,marginBottom:12}}>
      <div style={{fontSize:10,color:"#ffffffaa",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.noTradeReason}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        {ntr.map(r=><button key={r} onClick={()=>setReason(reason===r?"":r)} className="btn" style={{background:reason===r?"rgba(255,255,255,0.1)":"#131318",border:`1px solid ${reason===r?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}`,color:reason===r?"#ffffff":"#ffffffbb",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{r}</button>)}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{onSave({id:Date.now(),date:today(),reason});setOpen(false);setReason("");}} className="btn" style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",color:"#ffffff",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.confirmBtn}</button>
        <button onClick={()=>{setOpen(false);setReason("");}} className="btn" style={{background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"#ffffffaa",borderRadius:8,padding:"10px 12px",fontFamily:MONO}}>✕</button>
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
  const [email,setEmail]=useState("");const [pwd,setPwd]=useState("");
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  const [signupDone,setSignupDone]=useState(false);
  const [resetSent,setResetSent]=useState(false);
  const [resetLoading,setResetLoading]=useState(false);
  const inSt=mkInput(neon);
  const pwdPlaceholder=fr?"Mot de passe (6 car. min.)":"Password (6 chars min.)";
  const submit=async()=>{
    setError("");if(!email.trim()||!pwd.trim())return;
    if(pwd.trim().length<6){setError(fr?"Mot de passe trop court (6 car. min.)":"Password too short");return;}
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
    <div style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <CSS neon={neon}/>
      <div style={{position:"absolute",top:20,right:20,display:"flex",gap:6}}>
        {["fr","en"].map(l=><button key={l} onClick={()=>setLang(l)} className="btn" style={{background:lang===l?`${neon}26`:"transparent",border:`1px solid ${lang===l?neon:`${neon}33`}`,color:lang===l?neon:"#ffffffaa",borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,fontFamily:MONO}}>{l.toUpperCase()}</button>)}
      </div>
      <div style={{marginBottom:24}}><SplashLogo neon={neon}/></div>
      <div className="slide-up" style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",fontSize:9,color:"#ffffff44",letterSpacing:4,marginBottom:20,fontFamily:MONO}}>{mode==="login"?t.loginTitle.toUpperCase():t.signupBtn.toUpperCase()}</div>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={t.loginEmailPlaceholder} style={{...inSt,marginBottom:10,fontSize:14}} autoFocus/>
        <input type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={pwdPlaceholder} style={{...inSt,marginBottom:error?10:16,fontSize:14}}/>
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
            <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}} style={{background:"transparent",border:"none",color:neon,fontSize:11,cursor:"pointer",fontFamily:MONO,textDecoration:"underline"}}>{mode==="login"?t.signupBtn:t.loginTitle}</button>
          </div>
          {mode==="login"&&<div style={{fontSize:10,color:"#ffffff55",fontFamily:MONO,marginTop:4}}>{fr?"CGU & Confidentialité":"Terms & Privacy"}</div>}
        </div>
      </div>
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
    const done=setTimeout(onDone,2700);
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
function StatsInsightsModal({trades,lang,neon,onClose}) {
  const fr=lang==="fr";
  const MONO2="'Geist Mono','IBM Plex Mono',monospace";
  if(!trades||trades.length<3) return null;

  const wins=trades.filter(x=>x.result==="WIN");
  const losses=trades.filter(x=>x.result==="LOSS");
  const wr=Math.round(wins.length/trades.length*100);
  const avgWin=wins.length?wins.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/wins.length:0;
  const avgLoss=losses.length?Math.abs(losses.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0)/losses.length):0;
  const ratio=avgLoss>0?(avgWin/avgLoss):0;
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
    insights.push({type:"global",icon:"diamond",txt:`Sur ${trades.length} trades, tu affiches ${wr}% WR pour ${fmtP(totalPnl)} de P&L total. ${wr>=55?"Ton edge est réel.":wr>=45?"Proche de l'équilibre.":"Travaille la sélection des setups."} Ratio G/P : ${ratio.toFixed(2)}${ratio>=1.5?" — excellent.":" — à améliorer."} Discipline : ${disc}/10.`});
    if(conf.length>=2&&nconf.length>=2) insights.push({type:confWR-nconfWR>10?"good":"warn",icon:confWR-nconfWR>10?"check":"warn",txt:`Conformes : ${confWR}% WR vs ${nconfWR}% non-conformes.${confWR-nconfWR>10?` +${confWR-nconfWR}% quand tu respectes tes règles.`:""}`});
    if(assetStats.length>=2) insights.push({type:"asset",icon:"actif",txt:`${assetStats[0].a} est ton meilleur actif (${assetStats[0].wr}% WR, ${fmtP(assetStats[0].pnl)}).${assetStats[assetStats.length-1].wr<40?` Évite ${assetStats[assetStats.length-1].a} — seulement ${assetStats[assetStats.length-1].wr}% WR.`:""}`});
    if(dayStats.length>=2) insights.push({type:dayStats[dayStats.length-1].wr<40?"warn":"day",icon:"clock",txt:`Tu trades mieux le ${dayStats[0].day} (${dayStats[0].wr}% WR).${dayStats[dayStats.length-1].wr<40?` Le ${dayStats[dayStats.length-1].day} est ta pire journée (${dayStats[dayStats.length-1].wr}% WR).`:""}`});
    if(hourStats.length>=1) insights.push({type:"hour",icon:"clock",txt:`Meilleure plage : autour de ${hourStats[0].h} avec ${hourStats[0].wr}% WR sur ${hourStats[0].t} trades.`});
    if(humeurStats.length>=2) insights.push({type:humeurStats[humeurStats.length-1].wr<40?"warn":"mood",icon:"humeur",txt:`En état "${humeurStats[0].h}" : ${humeurStats[0].wr}% WR. En état "${humeurStats[humeurStats.length-1].h}" : ${humeurStats[humeurStats.length-1].wr}%.${humeurStats[humeurStats.length-1].wr<40?" Ne trade pas dans cet état.":""}`});
    if(highRWR!==null&&lowRWR!==null) insights.push({type:highRWR>lowRWR?"good":"neutral",icon:"star",txt:`Rejet ≥8 : ${highRWR}% WR vs ${lowRWR}% avec rejet <8.${highRWR-lowRWR>15?" La qualité du rejet change tout.":""}`});
    if(revs.length>0) insights.push({type:"danger",icon:"flame",txt:`${revs.length} revenge trade${revs.length>1?"s":""} — ${Math.round(revs.filter(x=>x.result==="LOSS").length/revs.length*100)}% de pertes. Stop.`});
  } else {
    insights.push({type:"global",icon:"diamond",txt:`Over ${trades.length} trades, ${wr}% WR for ${fmtP(totalPnl)} P&L. ${wr>=55?"Your edge is real.":wr>=45?"Near breakeven.":"Work on setup selection."} R/R: ${ratio.toFixed(2)}. Discipline: ${disc}/10.`});
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
  const slides=[
    {visual:(
      <div style={{position:"relative",width:"100%",height:240,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 70% 55% at 50% 50%,${neon}10,transparent 68%)`,pointerEvents:"none"}}/>
        <GridBackground neon={neon} height={240}/>
        <div style={{position:"relative",zIndex:2}}><SplashLogo neon={neon}/></div>
      </div>
    ),title:t.welcome,desc:t.welcomeDesc,cta:t.discover},
    {visual:(
      <div style={{position:"relative",width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        <GridBackground neon={neon} height={220}/>
        <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",gap:8,maxWidth:280,width:"100%",padding:"0 10px"}}>
          {[["HA M5 claire",true],["MM20 orientée",true],["BB approche",true],["Rejet propre",false]].map(([item,ok],i)=>(
            <div key={i} className="fu" style={{background:ok?`${neon}0d`:"rgba(255,77,77,0.06)",border:`1px solid ${ok?neon+"30":"rgba(255,77,77,0.2)"}`,borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,color:ok?neon:"#ff4d4d",fontFamily:MONO,animationDelay:`${i*0.08}s`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:14,flexShrink:0,color:ok?neon:"#ff4d4d"}}>{ok?"✓":"✗"}</span>
              <span style={{color:"#ffffff"}}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    ),title:t.checklist,desc:t.checklistDesc,cta:t.next},
    {visual:(
      <div style={{position:"relative",width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        <GridBackground neon={neon} height={220}/>
        <div style={{position:"relative",zIndex:2,maxWidth:280,width:"100%",padding:"0 10px"}}>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            {[["WIN RATE","73%"],["P&L","+4.2%"]].map(([l,v])=>(
              <div key={l} style={{flex:1,background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${neon}22`,borderRadius:14,padding:"14px 12px",textAlign:"center",boxShadow:`0 4px 24px ${neon}10,inset 0 1px 0 ${neon}15`}}>
                <div style={{fontSize:26,fontWeight:900,color:"#ffffff",fontFamily:MONO,lineHeight:1,textShadow:`0 0 20px ${neon}55`}}>{v}</div>
                <div style={{fontSize:9,color:"#ffffffaa",marginTop:6,letterSpacing:2,textTransform:"uppercase"}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${neon}22`,borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,marginBottom:6}}>CONFORMITÉ</div>
              <div style={{height:3,width:140,background:"#ffffff10",borderRadius:2,overflow:"hidden"}}>
                <div style={{width:"73%",height:"100%",background:`linear-gradient(90deg,${neon}66,${neon})`,borderRadius:2,boxShadow:`0 0 8px ${neon}55`}}/>
              </div>
            </div>
            <div style={{fontSize:20,fontWeight:900,color:"#ffffff",fontFamily:MONO,textShadow:`0 0 20px ${neon}55`}}>73%</div>
          </div>
        </div>
      </div>
    ),title:t.measure,desc:t.measureDesc,cta:t.start},
  ];
  const s=slides[step];
  return (
    <div style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:MONO,maxWidth:480,margin:"0 auto",color:"#ffffff"}}>
      <CSS neon={neon}/>
      <div style={{padding:"16px 24px 0",display:"flex",justifyContent:"flex-end",gap:6}}>
        {["fr","en"].map(l=><button key={l} onClick={()=>setLang(l)} className="btn" style={{background:lang===l?`${neon}26`:"transparent",border:`1px solid ${lang===l?neon:`${neon}33`}`,color:lang===l?neon:"#ffffffaa",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,fontFamily:MONO}}>{l.toUpperCase()}</button>)}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"12px 28px 24px"}}>
        <div className="fi" key={`v${step}${lang}`} style={{marginBottom:28,width:"100%"}}>{s.visual}</div>
        <div className="fi" key={`t${step}${lang}`} style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:24,fontWeight:700,color:neon,whiteSpace:"pre-line",lineHeight:1.25,marginBottom:12,fontFamily:MONO,textShadow:`0 0 30px ${neon}99`}}>{s.title}</div>
          <div style={{fontSize:13,color:"#ffffffaa",lineHeight:1.8,maxWidth:300,margin:"0 auto"}}>{s.desc}</div>
        </div>
        <button onClick={()=>step<slides.length-1?setStep(step+1):onDone(lang)} className="btn" style={{width:"100%",maxWidth:300,background:`${neon}22`,border:`1px solid ${neon}`,color:neon,borderRadius:12,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:12,boxShadow:`0 0 24px ${neon}33`,textShadow:`0 0 12px ${neon}88`}}>{s.cta}</button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:12,fontFamily:MONO}}>{t.back}</button>}
      </div>
      <div style={{padding:"8px 28px 32px"}}><Dots total={slides.length} current={step} neon={neon}/></div>
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

function SettingsView({config,onSave,onLogout,onReset,lang,onLangChange,neon,accounts,activeAccountId,onActivateAccount,onCloseAccount,onNewAccount,isPro,onObjectifChange,onImport}) {
  const t=T[lang];const inSt=mkInput(neon);
  const [tab,setTab]=useState("accounts");
  const [neonColor,setNeonColor]=useState(neon);
  const [savedOk,setSavedOk]=useState(false);
  // Stratégie
  const [items,setItems]=useState([...config.items]);
  const [threshold,setThreshold]=useState(config.threshold);
  const [stratName,setStratName]=useState(config.strategyName||"");
  const [maxTrades,setMaxTrades]=useState(config.maxTrades||1);
  const [calendarOn,setCalendarOn]=useState(config.calendarOn!==false);
  const [notifOn,setNotifOn]=useState(config.notifOn!==false);
  const [customAsset,setCustomAsset]=useState("");
  const [assets,setAssets]=useState(config.customAssets||PRESET_ASSETS);
  const [eliminatoires,setEliminatoires]=useState(config.eliminatoires||[]);

  const saveStrategy=()=>{
    onSave({items,threshold,strategyName:stratName,maxTrades,calendarOn,notifOn,customAssets:assets,eliminatoires,neonColor});
    setSavedOk(true);setTimeout(()=>setSavedOk(false),2000);
  };

  const tabs=[
    {id:"accounts",label:lang==="fr"?"Comptes":"Accounts"},
    {id:"strategy",label:lang==="fr"?"Stratégie":"Strategy"},
    {id:"prefs",label:lang==="fr"?"Préférences":"Prefs"},
  ];

  const activeAcc=accounts?.find(a=>a.status==="active");
  const [showFilter,setShowFilter]=useState("active"); // active | all | closed

  return (
    <div className="fi" style={{padding:20}}>
      {/* Onglets */}
      <div style={{display:"flex",gap:4,marginBottom:16,background:"#0f0f14",borderRadius:10,padding:3}}>
        {tabs.map(({id,label})=>(
          <button key={id} onClick={()=>setTab(id)} className="btn"
            style={{flex:1,padding:"8px 0",borderRadius:7,fontSize:11,fontWeight:700,fontFamily:MONO,
              background:tab===id?neon:"transparent",
              color:tab===id?"#000":"#ffffffaa",border:"none"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB COMPTES ── */}
      {tab==="accounts"&&(
        <div>
          {/* Filtre */}
          <div style={{display:"flex",gap:4,marginBottom:14}}>
            {[["active",lang==="fr"?"Actifs":"Active"],["all",lang==="fr"?"Tous":"All"],["closed",lang==="fr"?"Clôturés":"Closed"]].map(([v,l])=>(
              <button key={v} onClick={()=>setShowFilter(v)} className="btn"
                style={{flex:1,padding:"6px 0",borderRadius:7,fontSize:10,fontWeight:700,fontFamily:MONO,
                  background:showFilter===v?"#ffffff12":"transparent",
                  border:`1px solid ${showFilter===v?"#ffffff26":"#ffffff0a"}`,
                  color:showFilter===v?"#ffffff":"#ffffffaa"}}>
                {l}
              </button>
            ))}
          </div>

          {/* Liste comptes */}
          {(accounts||[]).filter(a=>{
            if(showFilter==="active") return a.status!=="closed";
            if(showFilter==="closed") return a.status==="closed";
            return true;
          }).map(acc=>{
            const accTrades=[];// trades filtrés par compte — pas accessible ici directement
            const isActive=acc.status==="active";
            const isClosed=acc.status==="closed";
            const c=isActive?neon:isClosed?"#ff4d4d44":"#ffffff44";
            return (
              <div key={acc.id} style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${isActive?neon+"33":"#ffffff0a"}`,borderRadius:14,padding:14,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:isClosed?"#ffffff55":"#ffffff"}}>{acc.name}</div>
                    <div style={{fontSize:10,color:"#ffffff44",marginTop:2,fontFamily:MONO}}>
                      {acc.type==="prop"?"Prop Firm":acc.type==="demo"?"Démo":"Perso"} · {acc.capital?`${parseInt(acc.capital).toLocaleString()} ${acc.devise||"€"}`:lang==="fr"?"Capital non défini":"No capital"} · {lang==="fr"?"depuis":"since"} {acc.createdAt}
                    </div>
                  </div>
                  <span style={{fontSize:9,padding:"3px 8px",borderRadius:10,fontWeight:700,fontFamily:MONO,
                    background:isActive?`${neon}18`:isClosed?"rgba(255,77,77,0.1)":"#ffffff0a",
                    color:isActive?neon:isClosed?"#ff4d4d":"#ffffff55",
                    border:`1px solid ${isActive?neon+"44":isClosed?"rgba(255,77,77,0.25)":"#ffffff14"}`}}>
                    {isActive?(lang==="fr"?"● ACTIF":"● ACTIVE"):isClosed?(lang==="fr"?"CLÔTURÉ":"CLOSED"):(lang==="fr"?"INACTIF":"INACTIVE")}
                  </span>
                </div>
                {!isClosed&&<div style={{display:"flex",gap:6}}>
                  {!isActive&&<button onClick={()=>onActivateAccount(acc.id)} className="btn"
                    style={{flex:2,padding:"8px 0",background:`${neon}18`,border:`1px solid ${neon}44`,color:neon,borderRadius:8,fontSize:11,fontWeight:700,fontFamily:MONO}}>
                    ▶ {lang==="fr"?"Activer":"Activate"}
                    {!isPro&&accounts.find(a=>a.status==="active")&&acc.status!=="active"&&<span style={{fontSize:9,opacity:0.7}}> Pro</span>}
                  </button>}
                  {isActive&&<div style={{flex:2,display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:`${neon}08`,borderRadius:8,border:`1px solid ${neon}14`}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:neon,boxShadow:`0 0 6px ${neon}`}}/>
                    <span style={{fontSize:10,color:neon,fontFamily:MONO}}>{lang==="fr"?"Compte actif":"Active account"}</span>
                  </div>}
                  <button onClick={()=>{if(window.confirm(lang==="fr"?`Clôturer ${acc.name} ?`:`Close ${acc.name}?`))onCloseAccount(acc.id);}} className="btn"
                    style={{flex:1,padding:"8px 0",background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d88",borderRadius:8,fontSize:10,fontFamily:MONO}}>
                    ⊘ {lang==="fr"?"Clôturer":"Close"}
                  </button>
                </div>}
                {isClosed&&<div style={{fontSize:10,color:"#ffffff33",fontFamily:MONO}}>{lang==="fr"?"Clôturé le":"Closed on"} {acc.closedAt}</div>}
              </div>
            );
          })}

          {(accounts||[]).filter(a=>showFilter==="active"?a.status!=="closed":showFilter==="closed"?a.status==="closed":true).length===0&&(
            <div style={{textAlign:"center",padding:"24px 0",color:"#ffffff44",fontSize:12}}>
              {lang==="fr"?"Aucun compte dans cette catégorie":"No accounts in this category"}
            </div>
          )}

          {/* Ajouter compte */}
          <button onClick={onNewAccount} className="btn"
            style={{width:"100%",background:"transparent",border:`1px dashed ${neon}35`,borderRadius:10,padding:"12px 0",color:neon,fontSize:12,fontFamily:MONO,marginTop:4}}>
            + {lang==="fr"?"Nouveau compte":"New account"}
          </button>

          {!isPro&&<div style={{textAlign:"center",padding:"12px 0 4px",fontSize:10,color:"#ffffff33",fontFamily:MONO}}>
            {lang==="fr"?"Version Free · 1 compte actif à la fois":"Free · 1 active account at a time"}
          </div>}

          <div style={{height:1,background:"rgba(255,77,77,0.1)",margin:"16px 0 10px"}}/>
          <button onClick={onImport} className="btn" style={{width:"100%",background:`${neon}0a`,border:`1px solid ${neon}28`,color:neon,borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:10}}>
            ↑ {lang==="fr"?"Importer un CSV (MT4/MT5/cTrader)":"Import CSV (MT4/MT5/cTrader)"}
          </button>
          <button onClick={onReset} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:8}}>
            {t.resetBtn}
          </button>
          <button onClick={onLogout} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.1)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:11,fontFamily:MONO}}>
            {t.logout}
          </button>
        </div>
      )}

      {/* ── TAB STRATÉGIE ── */}
      {tab==="strategy"&&(
        <div>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.criteriaLabel} ({items.length})</div>
          {items.map((item,i)=>{
            const isE=(eliminatoires||[]).includes(i);
            return <div key={i} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
              <input value={item} onChange={e=>{const n=[...items];n[i]=e.target.value;setItems(n);}} style={{...inSt,marginBottom:0,flex:1}}/>
              <button onClick={()=>setEliminatoires(p=>isE?p.filter(x=>x!==i):[...p,i])} title={isE?"Retirer éliminatoire":"Marquer éliminatoire"} style={{background:isE?"rgba(255,77,77,0.15)":"transparent",border:`1px solid ${isE?"#ff4d4d":"rgba(255,77,77,0.25)"}`,color:isE?"#ff4d4d":"#ffffff44",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:10,fontWeight:700,flexShrink:0}}>⚡</button>
              <button onClick={()=>setItems(items.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",cursor:"pointer",flexShrink:0}}>✕</button>
            </div>;
          })}
          <button onClick={()=>setItems([...items,""])} style={{width:"100%",background:"transparent",border:`1px dashed ${neon}35`,color:"#ffffff44",borderRadius:8,padding:10,fontSize:12,cursor:"pointer",fontFamily:MONO,marginBottom:16}}>{t.addCriteria}</button>

          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8}}>{t.thresholdLabel}</div>
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {[3,4,5,6,7,8].map(n=><button key={n} onClick={()=>setThreshold(n)} className="btn" style={{flex:1,padding:8,borderRadius:8,fontSize:13,fontWeight:700,fontFamily:MONO,background:threshold===n?`${neon}33`:"#131318",border:`1px solid ${threshold===n?neon:`${neon}22`}`,color:threshold===n?neon:"#ffffffbb"}}>{n}</button>)}
          </div>

          <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>ACTIFS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
            {assets.map(a=><div key={a} style={{display:"flex",alignItems:"center",gap:4,background:"#131318",border:`1px solid ${neon}26`,borderRadius:6,padding:"4px 8px"}}>
              <span style={{fontSize:11,color:"#ffffff",fontFamily:MONO}}>{a}</span>
              {!PRESET_ASSETS.includes(a)&&<button onClick={()=>setAssets(assets.filter(x=>x!==a))} style={{background:"transparent",border:"none",color:"#ff4d4d",fontSize:10,cursor:"pointer"}}>✕</button>}
            </div>)}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={customAsset} onChange={e=>setCustomAsset(e.target.value)} placeholder={t.customAsset} onKeyDown={e=>{if(e.key==="Enter"&&customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} style={{...inSt,marginBottom:0,flex:1}}/>
            <button onClick={()=>{if(customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:"0 14px",fontSize:18}}>+</button>
          </div>

          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8}}>{t.maxTradesLabel}</div>
          <div style={{display:"flex",gap:6,marginBottom:20}}>
            {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setMaxTrades(n)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:maxTrades===n?`${neon}26`:"#131318",border:`1px solid ${maxTrades===n?neon:`${neon}22`}`,color:maxTrades===n?neon:"#ffffffbb"}}>{n}</button>)}
            <button onClick={()=>setMaxTrades(0)} className="btn" style={{flex:1.4,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:maxTrades===0?`${neon}26`:"#131318",border:`1px solid ${maxTrades===0?neon:`${neon}22`}`,color:maxTrades===0?neon:"#ffffffaa"}}>∞</button>
          </div>

          <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8}}>{t.strategyName}</div>
          <input value={stratName} onChange={e=>setStratName(e.target.value)} style={{...inSt,marginBottom:16}}/>

          <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${neon}0d`}}>
              <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{t.calendarToggle}</span>
              <button onClick={()=>setCalendarOn(!calendarOn)} className="btn" style={{width:44,height:24,borderRadius:12,background:calendarOn?`${neon}33`:"#ffffff12",border:`1px solid ${calendarOn?neon:`${neon}30`}`,position:"relative"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:calendarOn?neon:"#ffffffaa",position:"absolute",top:3,left:calendarOn?24:4,transition:"all 0.2s"}}/>
              </button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0"}}>
              <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{t.enableNotif}</span>
              <button onClick={()=>setNotifOn(!notifOn)} className="btn" style={{width:44,height:24,borderRadius:12,background:notifOn?`${neon}33`:"#ffffff12",border:`1px solid ${notifOn?neon:`${neon}30`}`,position:"relative"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:notifOn?neon:"#ffffffaa",position:"absolute",top:3,left:notifOn?24:4,transition:"all 0.2s"}}/>
              </button>
            </div>
          </div>

          <button onClick={saveStrategy} className="btn" style={{width:"100%",background:`${neon}26`,border:`1px solid ${neon}`,color:neon,borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO}}>{savedOk?t.savedOk:t.saveBtn}</button>
        </div>
      )}

      {/* ── TAB PRÉFÉRENCES ── */}
      {tab==="prefs"&&(
        <div>
          <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.langLabel}</div>
            <div style={{display:"flex",gap:8}}>{[["fr","Français"],["en","English"]].map(([l,label])=><button key={l} onClick={()=>onLangChange(l)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:lang===l?`${neon}26`:"#131318",border:`1px solid ${lang===l?neon:`${neon}22`}`,color:lang===l?neon:"#ffffffbb"}}>{label}</button>)}</div>
          </div>
          <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14,marginBottom:14}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10}}>{t.colorLabel}</div>
            <div style={{display:"flex",gap:8}}>{NEON_COLORS.map(c=><button key={c.value} onClick={()=>setNeonColor(c.value)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,background:neonColor===c.value?`${c.value}26`:"#131318",border:`2px solid ${neonColor===c.value?c.value:"transparent"}`,cursor:"pointer"}}><div style={{width:16,height:16,borderRadius:"50%",background:c.value,margin:"0 auto",boxShadow:neonColor===c.value?`0 0 8px ${c.value}`:"none"}}/></button>)}</div>
          </div>
          <div style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0e",borderRadius:14,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0"}}>
              <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{t.calendarToggle}</span>
              <button onClick={()=>setCalendarOn(!calendarOn)} className="btn" style={{width:44,height:24,borderRadius:12,background:calendarOn?`${neon}33`:"#ffffff12",border:`1px solid ${calendarOn?neon:`${neon}30`}`,position:"relative"}}>
                <div style={{width:16,height:16,borderRadius:"50%",background:calendarOn?neon:"#ffffffaa",position:"absolute",top:3,left:calendarOn?24:4,transition:"all 0.2s"}}/>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function InAppBanner({notifs, onDismiss, neon}) {
  if(!notifs||!notifs.length) return null;
  const n = notifs[0];
  const colors = {
    info: neon,
    warn: "#f0b429",
    danger: "#ff4d4d",
    success: neon,
  };
  const c = colors[n.type] || neon;
  return (
    <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,zIndex:600,padding:"8px 12px",pointerEvents:"none"}}>
      <div className="slide-up" style={{background:`${c}12`,border:`1px solid ${c}35`,borderLeft:`3px solid ${c}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:10,backdropFilter:"blur(8px)",pointerEvents:"all"}}>
        <span style={{fontSize:16,flexShrink:0}}>{n.emoji||"◈"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:c,fontFamily:"'Geist Mono','IBM Plex Mono',monospace",marginBottom:2}}>{n.title}</div>
          <div style={{fontSize:10,color:`${c}88`,fontFamily:"'Geist Mono','IBM Plex Mono',monospace",lineHeight:1.5}}>{n.body}</div>
        </div>
        <button onClick={onDismiss} style={{background:"transparent",border:"none",color:`${c}55`,fontSize:16,cursor:"pointer",flexShrink:0,marginTop:-2}}>✕</button>
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
    {elId:"tut-kpi",        icon:"📈", title:"Win Rate & P&L",        body:"Tes KPI en temps réel. Win Rate = % trades gagnants. P&L = performance % et en devise. Le capital total est recalculé automatiquement.",  pos:"below"},
    {elId:"tut-discipline", icon:"🎯", title:"Score Discipline",       body:"Note sur 10 calculée sur ta conformité aux règles (60%) et l'absence de revenge trades (40%). Objectif : 8/10 minimum.",                   pos:"below"},
    {elId:"tut-lasttrade",  icon:"⚡", title:"Dernier Trade",          body:"Ton dernier trade enregistré. Clique pour voir le détail complet : checklist, score de rejet, notes et screenshot.",                        pos:"below"},
    {elId:"tut-addtrade",   icon:"✚",  title:"Enregistrer un Trade",   body:"Après chaque trade : sélectionne ton actif, coche ta checklist, note le résultat et le P&L en % ou en devise. Le score de conformité est calculé automatiquement.",  pos:"above"},
    {elId:"tut-nav",        icon:"🧭", title:"Navigation",             body:"Stats = Dashboard · + Trade = Saisir un trade · Historique = Tous tes trades filtrables · ⚙ = Paramètres, actifs, seuil de conformité.",   pos:"above"},
    {elId:"tut-nav",        icon:"📋", title:"Phases de trading",      body:"Une phase = un compte ou une période. Crée une nouvelle phase dans ⚙ pour remettre les stats à zéro tout en conservant l'historique complet. Idéal pour les prop firms.",  pos:"above", last:true},
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

  const showStep = (i, animate=false) => {
    const s = STEPS[i];
    const r = getRect(s.elId);
    if(r) {
      if(animate) animateTo(r);
      else { setSpotRect(r); prevRect.current = r; }
      setTtPos(calcTtPos(r, s.pos));
    }
    setTtVisible(false);
    setTimeout(() => setTtVisible(true), 60);
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
        <div className="tut-icon">{s.icon}</div>
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
  const [accounts,setAccounts]=useState([]);
  const [activeAccountId,setActiveAccountId]=useState(null);
  const [isPro,setIsPro]=useState(false);
  const [showWeeklyRecap,setShowWeeklyRecap]=useState(false);
  const [showExport,setShowExport]=useState(false);
  const [showReset,setShowReset]=useState(false);
  const [objectif,setObjectif]=useState({pnl:"",wr:"",trades:"",drawdown:"",editMode:false});
  const [showNewAccount,setShowNewAccount]=useState(false);
  const [showShare,setShowShare]=useState(false);
  const [shareTarget,setShareTarget]=useState(null);
  const [showStats,setShowStats]=useState(false);
  const [showTutorial,setShowTutorial]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [inAppNotifs,setInAppNotifs]=useState([]);
  const [histSearch,setHistSearch]=useState("");
  const [view,setView]=useState("dashboard");
  const [form,setForm]=useState(emptyForm("XAU/USD","M5"));
  const [editingId,setEditingId]=useState(null);
  const [checkinOpen,setCheckinOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [histFilter,setHistFilter]=useState("ALL");
  const [histAsset,setHistAsset]=useState("ALL");
  const [confirmDeleteId,setConfirmDeleteId]=useState(null);
  const [detailTrade,setDetailTrade]=useState(null);
  const [config,setConfig]=useState({items:DEFAULT_CRITERIA,threshold:6,strategyName:"Ma Stratégie",defaultAsset:"XAU/USD",maxTrades:1,neonColor:"#00ff9d",calendarOn:true,notifOn:true,customAssets:[...PRESET_ASSETS],capital:"",devise:"€",accountType:"perso"});
  const fileRef=useRef();const pageRef=useRef();const weeklyShownRef=useRef(false);const currentUserRef=useRef(null);
  const neon=config.neonColor||"#00ff9d";const t=T[lang];const inSt=mkInput(neon);
  // Couleurs dérivées du neon pour une cohérence visuelle complète
  const neonDim = neon+"66";   // texte secondaire
  const neonFaint = neon+"33"; // bordures légères
  const neonGhost = neon+"14"; // backgrounds subtils
  const neonBg = neon+"0a";    // backgrounds très légers

  // Session restore from localStorage on page load
  useEffect(()=>{
    try {
      const saved=localStorage.getItem("tmt_user");
      if(saved){
        const {email,pwd,uid}=JSON.parse(saved);
        const p = pwd||"";
        authLogin(email,p).then(userData=>{
          if(userData){
            const resolvedUid = userData._uid || uid || encEmail(email);
            currentUserRef.current={email, uid:resolvedUid};
            if(userData.setupDone){
              if(Array.isArray(userData.trades))setTrades(userData.trades);
              if(Array.isArray(userData.noTrades))setNoTrades(userData.noTrades);
              if(userData.config&&typeof userData.config==="object")setConfig(c=>({...c,...userData.config}));
              if(userData.lang)setLang(userData.lang);
              setPhase("app");
            } else { setPhase("setup"); }
          }
        }).catch(()=>{});
      }
    } catch(e){}
  },[]);

  useEffect(()=>{
    const isMonday=new Date().getDay()===1;
    if(phase==="app"&&view==="dashboard"&&!weeklyShownRef.current&&trades.length>=2&&isMonday){
      const cutoff=new Date(Date.now()-7*86400000).toISOString().split("T")[0];
      if(trades.some(x=>x.date>=cutoff)){weeklyShownRef.current=true;const id=setTimeout(()=>setShowWeeklyRecap(true),1000);return ()=>clearTimeout(id);}
    }
  },[phase,view,trades]);

  const scrollToTop=()=>{if(pageRef.current)pageRef.current.scrollTo({top:0,behavior:"smooth"});};
  // Phase uses trade.id (timestamp) not date — trades before phase creation excluded even if date is today
  // accounts system replaces phases
  
  const handleNewAccount=(data={})=>{
    const newAcc={id:Date.now(),name:data.name||`Compte ${accounts.length+1}`,type:data.accountType||"perso",capital:data.capital||"",devise:data.devise||"€",status:"inactive",createdAt:today(),objPnl:data.obj||"",objDrawdown:data.drawdown||""};
    const newAccounts=[...accounts,newAcc];
    setAccounts(newAccounts);
    if(currentUserRef.current?.uid) saveUserData(currentUserRef.current.uid,{accounts:newAccounts});
    setNotif({txt:lang==="fr"?`${newAcc.name} créé !`:`${newAcc.name} created!`,color:neon,icon:"ok",lang});
  };

  const handleActivateAccount=(accId)=>{
    const already=accounts.find(a=>a.status==="active");
    if(already&&already.id!==accId&&!isPro){
      setNotif({txt:lang==="fr"?"Version Pro requise.\nSwitcher entre comptes actifs est une fonctionnalité Pro.":"Pro required.\nSwitching active accounts is a Pro feature.",color:"#f0b429",icon:"warn",lang});
      return;
    }
    const newAccounts=accounts.map(a=>({...a,status:a.id===accId?"active":"inactive"}));
    const acc=accounts.find(a=>a.id===accId);
    setAccounts(newAccounts);
    setActiveAccountId(accId);
    if(acc){
      const newCfg={...config,phaseName:acc.name,capital:acc.capital,devise:acc.devise,accountType:acc.type};
      setConfig(newCfg);
      if(currentUserRef.current?.uid) saveUserData(currentUserRef.current.uid,{accounts:newAccounts,config:newCfg});
    }
  };

  const handleCloseAccount=(accId)=>{
    const newAccounts=accounts.map(a=>a.id===accId?{...a,status:"closed",closedAt:today()}:a);
    setAccounts(newAccounts);
    if(activeAccountId===accId) setActiveAccountId(null);
    if(currentUserRef.current?.uid) saveUserData(currentUserRef.current.uid,{accounts:newAccounts});
  };

  const activeAcc=accounts.find(a=>a.id===activeAccountId);
  const activeAcc=accounts.find(a=>a.id===activeAccountId)||null;
  const pf=activeAccountId
    ? (statsMode==="phase"?trades.filter(x=>x.accountId===activeAccountId):trades.filter(x=>x.accountId===activeAccountId||!x.accountId))
    : trades;
  const total=pf.length,wins=pf.filter(x=>x.result==="WIN").length,losses=pf.filter(x=>x.result==="LOSS").length;
  const winRate=total?Math.round(wins/total*100):0;
  const totalPnl=pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const discScore=calcDisc(pf);
  const scoreColor=discScore===null?"#ffffffbb":discScore>=8?neon:discScore>=5?"#f0b429":"#ff4d4d";
  const usedAssets=[...new Set(trades.map(x=>x.asset))];

  const checkRevenge=fd=>{if(!config.maxTrades||config.maxTrades===0)return false;return trades.filter(x=>x.date===fd&&x.id!==editingId).length>=config.maxTrades;};
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
    else{const trade={...form,pnlPct:pnl,id:Date.now(),setupScore:score,conforming,isRevenge,checklistMax:config.items.length,accountId:activeAccountId||null};ut=trade;updated=[trade,...trades].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);}
    setTrades(updated);
    if(currentUserRef.current?.email) saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{trades:updated});
    const newCfgAfterSave={...config,lastPnlMode:form.pnlMode||"pct"};setConfig(newCfgAfterSave);if(currentUserRef.current?.email)saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{config:newCfgAfterSave});
    setForm(emptyForm(config.defaultAsset||"XAU/USD",config.lastTimeframe||"M5",config.lastPnlMode||"pct"));setEditingId(null);setCheckinOpen(false);
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

  const startEdit=x=>{setForm({date:x.date,asset:x.asset,direction:x.direction,checklist:[...x.checklist],result:x.result,pnlPreset:PNL_PRESETS.includes(x.pnlPct)?x.pnlPct:"",pnlManual:PNL_PRESETS.includes(x.pnlPct)?"":x.pnlPct,pnlMode:"pct",pnlEurManual:"",notes:x.notes||"",rejetScore:x.rejetScore||0,time:x.time||"",screenshot:x.screenshot||"",isRevenge:x.isRevenge||false,slDirection:x.slDirection||"",checkin:x.checkin||{humeur:"",biais:""}});setEditingId(x.id);setView("log");};
  const cancelEdit=()=>{setForm(emptyForm(config.defaultAsset||"XAU/USD",config.lastTimeframe||"M5",config.lastPnlMode||"pct"));setEditingId(null);setView("history");scrollToTop();};
  const deleteTrade=id=>{
    const updated=trades.filter(x=>x.id!==id);
    setTrades(updated);setConfirmDeleteId(null);
    if(currentUserRef.current?.email) saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{trades:updated});
  };
  const handleReset=()=>{
    setObjectif({pnl:"",wr:"",trades:"",editMode:false});
    setTrades([]);setNoTrades([]);setAccounts([]);setActiveAccountId(null);setShowReset(false);
    if(currentUserRef.current?.email) saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{trades:[],noTrades:[],accounts:[]});
  };

  const [histAccount,setHistAccount]=useState("ALL");
  const histFiltered=trades.filter(x=>{
    const matchResult=histFilter==="ALL"||x.result===histFilter;
    const matchAsset=histAsset==="ALL"||x.asset===histAsset;
    const matchAccount=histAccount==="ALL"||(x.accountId?x.accountId===histAccount:histAccount==="none");
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
  const humeurPills=HUMEUR_PILLS[lang]||HUMEUR_PILLS.fr;
  const biaisPills=BIAIS_PILLS[lang]||BIAIS_PILLS.fr;

  // handleLogin must be defined before conditional returns (Rules of Hooks)
  const handleLogin=u=>{
    if(!u) return;
    const uid = u._uid || encEmail(u.email);
    currentUserRef.current={email:u.email, uid};
    try { localStorage.setItem("tmt_user",JSON.stringify({email:u.email, uid})); } catch(e){}
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
      if(trades.length) setTrades(trades);
      if(noTrades.length) setNoTrades(noTrades);
      const accs=parseSafe(userData.accounts);
      if(accs.length){setAccounts(accs);const active=accs.find(a=>a.status==="active");if(active)setActiveAccountId(active.id);}
      if(Object.keys(config).length) setConfig(c=>({...c,...config}));
      if(userData.lang) setLang(userData.lang);
      if(userData.objectif&&typeof userData.objectif==="object") setObjectif(o=>({...o,...userData.objectif}));
      setPhase("app");
      // Vérifications bannières in-app
      setTimeout(()=>{
        const notifs_=[];
        const config_=parseObj(userData.config);
        const trades_=parseSafe(userData.trades);
        if(trades_.length>=3){
          const last=trades_[0];
          const days=last?Math.floor((Date.now()-new Date(last.date))/86400000):999;
          if(days>=3) notifs_.push({type:"info",emoji:"📅",title:lang==="fr"?"Journal en pause":"Journal paused",body:lang==="fr"?`${days} jours sans trade. Pense à journaliser !`:`${days} days without a trade. Time to journal!`});
          const revStreak=trades_.slice(0,3).filter(x=>x.isRevenge).length;
          if(revStreak>=2) notifs_.push({type:"warn",emoji:"🔥",title:lang==="fr"?"Attention — Revenge":"Warning — Revenge",body:lang==="fr"?"Plusieurs revenge trades récents. Fais une pause.":"Multiple recent revenge trades. Take a break."});
        }
        if(notifs_.length) setInAppNotifs(notifs_);
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
    setConfig(newCfg);setForm(emptyForm(cfg.defaultAsset||"XAU/USD"));
    // Créer un compte par défaut actif
    const defaultAcc={id:Date.now(),name:cfg.strategyName||"Mon compte",type:"perso",capital:cfg.capital||"",devise:cfg.devise||"€",status:"active",createdAt:today(),objPnl:"",objDrawdown:""};
    setAccounts([defaultAcc]);
    setActiveAccountId(defaultAcc.id);
    setPhase("app");
    if(currentUserRef.current?.uid) await saveUserData(currentUserRef.current.uid,{config:newCfg,setupDone:true,lang,trades:[],noTrades:[],accounts:[defaultAcc]});
  }} lang={lang}/></>;

  return (
    <div style={{display:"flex",background:"#0c0c12",minHeight:"100vh",color:"#ffffff",fontFamily:MONO}}>
      <CSS neon={neon}/>
      {notif&&<NotifCard notif={notif} onClose={()=>setNotif(null)}/>}
      <InAppBanner notifs={inAppNotifs} onDismiss={()=>setInAppNotifs(n=>n.slice(1))} neon={neon}/>
      {showTutorial&&<Tutorial neon={neon} onEnd={()=>setShowTutorial(false)}/>}
      {showImport&&<ImportCSVModal onImport={imported=>{const merged=[...imported,...trades].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);setTrades(merged);if(currentUserRef.current?.email)saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{trades:merged});}} onClose={()=>setShowImport(false)} lang={lang} neon={neon} config={config}/>}
      {showWeeklyRecap&&<WeeklyRecapModal trades={trades} lang={lang} neon={neon} onClose={()=>setShowWeeklyRecap(false)} onShareWeek={()=>{setShareTarget(null);setShowShare(true);}}/>}

      {/* ── SIDEBAR PC ── */}
      {isDesktop&&(
        <div style={{width:240,minWidth:240,background:"#09090f",borderRight:"1px solid #ffffff0a",display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,flexShrink:0}}>
          <div style={{padding:"24px 18px 20px",borderBottom:"1px solid #ffffff08"}}>
            <div style={{marginBottom:6}}><SplashLogo neon={neon}/></div>
            <div style={{fontSize:10,color:"#ffffff33",letterSpacing:1}}>{config.strategyName}</div>
          </div>
          {(objectif.pnl||config.capital)&&(()=>{
            const cur=pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
            const pct=objectif.pnl?Math.min(100,Math.max(0,cur/(parseFloat(objectif.pnl)||1)*100)):0;
            return <div style={{padding:"10px 18px",borderBottom:"1px solid #ffffff08"}}>
              <div style={{fontSize:9,color:neon,fontWeight:700,marginBottom:4}}>{activeAcc?.name||config.phaseName||"PHASE"}{config.capital?` · ${parseInt(config.capital).toLocaleString()}${config.devise||"€"}`:""}</div>
              {objectif.pnl&&<div style={{height:3,background:"#ffffff10",borderRadius:3,marginBottom:4}}><div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${neon}66,${neon})`,borderRadius:3,boxShadow:`0 0 6px ${neon}55`}}/></div>}
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:8,color:"#ffffff44"}}>{lang==="fr"?"Compte en cours":"Current account"}</span>
                <span style={{fontSize:10,fontWeight:700,color:cur>=0?neon:"#ff4d4d"}}>{cur>=0?"+":""}{cur.toFixed(1)}%{objectif.pnl?<span style={{fontSize:8,color:"#ffffff44",fontWeight:400}}> / +{objectif.pnl}%</span>:null}</span>
              </div>
            </div>;
          })()}
          {/* Compte actif dans sidebar */}
          {activeAcc&&<div style={{padding:"10px 18px",borderBottom:"1px solid #ffffff08"}}>
            <div style={{fontSize:9,color:neon,fontWeight:700,marginBottom:2,fontFamily:MONO}}>{activeAcc.name}</div>
            <div style={{fontSize:9,color:"#ffffff33"}}>{activeAcc.type==="prop"?"Prop Firm":activeAcc.type==="demo"?"Démo":"Perso"}{activeAcc.capital?` · ${parseInt(activeAcc.capital).toLocaleString()}${activeAcc.devise||"€"}`:""}</div>
          </div>}
          {total>0&&<div style={{padding:"12px 18px",borderBottom:"1px solid #ffffff08"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div><div style={{fontSize:7,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>WIN RATE</div><div style={{fontSize:20,fontWeight:900,color:"#ffffff",textShadow:`0 0 20px ${neon}55`}}>{winRate}%</div></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:7,color:"#ffffff44",letterSpacing:2,marginBottom:4}}>P&L</div><div style={{fontSize:20,fontWeight:900,color:totalPnl>=0?neon:"#ff4d4d"}}>{(()=>{const n=Math.round(totalPnl*10)/10;return`${n>=0?"+":""}${n}%`;})()}</div></div>
            </div>
            <div style={{fontSize:9,color:"#ffffff33"}}>{wins}W · {losses}L · {total} {lang==="fr"?"trades":"trades"}</div>
          </div>}
          <div style={{padding:"10px 10px",flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {[["dashboard","◈",lang==="fr"?"Statistiques":"Statistics"],["log","+",(editingId?lang==="fr"?"✏ Édition":"✏ Edit":lang==="fr"?"Nouveau trade":"New trade")],["history","≡",lang==="fr"?"Historique":"History"],["settings","⚙",lang==="fr"?"Paramètres":"Settings"]].map(([v,icon,label])=>(
              <button key={v} onClick={()=>{if(editingId&&v!=="log")cancelEdit();else{setView(v);if(pageRef.current)pageRef.current.scrollTo({top:0});scrollToTop();}}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:view===v?(editingId&&v==="log"?"rgba(240,180,41,0.12)":`${neon}12`):"transparent",border:`1px solid ${view===v?(editingId&&v==="log"?"#f0b42940":`${neon}30`):"transparent"}`,borderRadius:9,color:view===v?(editingId&&v==="log"?"#f0b429":"#ffffff"):"#ffffff66",fontFamily:MONO,fontSize:12,fontWeight:view===v?700:400,cursor:"pointer",textAlign:"left",width:"100%",transition:"all 0.15s"}}>
                <span style={{color:view===v?(editingId&&v==="log"?"#f0b429":neon):"#ffffff33",fontSize:14,width:18,textAlign:"center"}}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <div style={{padding:"10px 14px",borderTop:"1px solid #ffffff08",display:"flex",gap:8}}>
            <button onClick={()=>setShowExport(true)} style={{flex:1,padding:"8px 0",background:`${neon}0f`,border:`1px solid ${neon}26`,borderRadius:8,color:neon,fontFamily:MONO,fontSize:10,cursor:"pointer"}}>↓ Export</button>

          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div ref={pageRef} className={isDesktop?"":"grid-bg"} style={{flex:1,overflowY:"auto",height:"100vh",maxWidth:isDesktop?"none":480,margin:isDesktop?0:"0 auto",paddingBottom:isDesktop?0:80,minWidth:0}}>
        <div style={{maxWidth:isDesktop?960:480,margin:"0 auto"}}>

      {!isDesktop&&<div style={{padding:"16px 20px 10px",borderBottom:`1px solid ${neon}1a`,background:"linear-gradient(180deg,#111118 0%,#0c0c12 100%)",backdropFilter:"blur(8px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><SplashLogo neon={neon}/><div style={{fontSize:10,color:"#ffffff44",marginTop:4}}>{config.strategyName}</div></div>
          <button onClick={()=>setShowExport(true)} className="btn" style={{background:`${neon}0f`,border:`1px solid ${neon}26`,borderRadius:8,padding:"7px 11px",color:`${neon}99`,fontSize:13}}>↓</button>
        </div>
      </div>}

      {!isDesktop&&(objectif.pnl||config.capital)&&(()=>{
        const cur=pf.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
        const target=parseFloat(objectif.pnl)||1;
        const pct=objectif.pnl?Math.min(100,Math.max(0,cur/target*100)):0;
        return <div style={{background:"rgba(9,9,16,0.6)",borderBottom:`1px solid #ffffff06`,padding:"7px 18px 6px"}}>
          {objectif.pnl&&<div style={{height:3,background:"#ffffff10",borderRadius:3,marginBottom:6}}>
            <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${neon}66,${neon})`,borderRadius:3,transition:"width 0.6s ease",boxShadow:`0 0 8px ${neon}55`}}/>
          </div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:neon,fontFamily:MONO,fontWeight:700,letterSpacing:0.5}}>
              {activeAcc?.name||config.phaseName||"PHASE"}{config.capital?` · ${parseInt(config.capital).toLocaleString()}${config.devise||"€"}`:""}
            </span>
            <span style={{fontSize:11,fontWeight:800,color:cur>=0?neon:"#ff4d4d",fontFamily:MONO}}>
              {cur>=0?"+":""}{cur.toFixed(1)}%{objectif.pnl?<span style={{fontSize:9,color:"#ffffff44",fontWeight:400}}> / +{objectif.pnl}%</span>:null}
            </span>
          </div>
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
        
      </div>}

      
      {view==="dashboard"&&(
        <div className="fi" style={{padding:20}}>
          <StreakBadge trades={pf} neon={neon} lang={lang}/>
          <button onClick={()=>setShowTutorial(true)} className="btn" style={{position:"fixed",bottom:isDesktop?24:88,right:20,zIndex:50,width:40,height:40,borderRadius:"50%",background:`linear-gradient(145deg,#1e1e2e,#131320)`,border:`1px solid ${neon}35`,color:neon,fontSize:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px rgba(0,0,0,0.6),0 0 12px ${neon}18`,cursor:"pointer"}}>?</button>
          {trades.length>0&&(
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
              <div style={{flex:1,display:"flex",gap:4,background:"#0f0f14",borderRadius:8,padding:3}}>
                {[["phase",lang==="fr"?"Ce compte":"This account"],["all",t.toutHistorique]].map(([m,l])=>(
                  <button key={m} onClick={()=>setStatsMode(m)} className="btn" style={{flex:1,padding:"7px 0",borderRadius:6,fontSize:10,fontWeight:700,fontFamily:MONO,background:statsMode===m?neon:"transparent",color:statsMode===m?"#131318":"#ffffffaa",border:"none",transition:"all 0.2s"}}>{l}</button>
                ))}
              </div>

            </div>
          )}
          {total>0&&(
            <div id="tut-kpi" style={{display:isDesktop?"grid":"flex",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
              <div style={{flex:1,background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${neon}22`,borderRadius:14,padding:"14px 16px",boxShadow:`0 4px 24px ${winRate>=50?neon+"18":"#ff4d4d18"}, inset 0 1px 0 ${neon}15`}}>
                <div style={{fontSize:9,color:"#ffffffbb",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.winRate}</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:MONO,lineHeight:1,textShadow:`0 0 32px ${winRate>=50?neon+"aa":"#ff4d4daa"}`,color:"#ffffff"}}>{winRate}%</div>
                <div style={{fontSize:10,color:"#ffffff44",marginTop:6}}>{wins}W · {losses}L · {total} {t.trades}</div>
              </div>
              <div style={{flex:1,background:"linear-gradient(145deg,#1a1a24,#131318)",border:`1px solid ${neon}22`,borderRadius:14,padding:"14px 16px",boxShadow:`0 4px 24px ${totalPnl>=0?neon+"18":"#ff4d4d18"}, inset 0 1px 0 ${neon}15`}}>
                <div style={{fontSize:9,color:"#ffffffbb",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.totalPnl}</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:MONO,lineHeight:1,textShadow:`0 0 32px ${totalPnl>=0?neon+"aa":"#ff4d4daa"}`,color:"#ffffff"}}>{(()=>{const n=Math.round(totalPnl*10)/10;return `${n>=0?"+":""}${n}%`;})()} </div>
                {config.capital?(()=>{
                  const gain=Math.round(parseFloat(config.capital)*totalPnl/100);
                  const cap_total=Math.round(parseFloat(config.capital))+gain;
                  const dv=config.devise||"€";
                  return <div style={{fontSize:10,marginTop:5,display:"flex",alignItems:"baseline",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:totalPnl>=0?neon:"#ff4d4d",fontFamily:MONO}}>{totalPnl>=0?"+":""}{gain.toLocaleString()}{dv}</span>
                    <span style={{color:"#ffffff33",fontSize:10}}>→ {cap_total.toLocaleString()}{dv}</span>
                  </div>;
                })():<div style={{fontSize:10,color:"#ffffff44",marginTop:6}}>{total} {t.trades}</div>}
              </div>
            </div>
          )}
          {total>=2&&discScore!==null&&(
            <div id="tut-discipline" style={{background:`linear-gradient(145deg,${scoreColor}12,${scoreColor}05)`,border:`1px solid ${scoreColor}30`,borderRadius:14,padding:"14px 16px",marginBottom:12,boxShadow:`0 8px 32px ${scoreColor}12,inset 0 1px 0 ${scoreColor}18`}}>
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
                    {trades[0].isRevenge&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(255,77,77,0.15)",color:"#ff4d4d",border:"1px solid rgba(255,77,77,0.3)"}}>REVENGE</span>}
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
          {total>=3&&<button onClick={()=>setShowStats(true)} className="btn" style={{width:"100%",background:`${neon}0d`,border:`1px solid ${neon}28`,borderRadius:10,padding:"12px 0",color:neon,fontSize:11,fontWeight:700,fontFamily:MONO,letterSpacing:2,marginBottom:12}}>
            {lang==="fr"?"◈ RÉSUMÉ & INSIGHTS":"◈ SUMMARY & INSIGHTS"}
          </button>}
          <NoTradeButton onSave={e=>{
            const updated=[e,...noTrades];
            setNoTrades(updated);
            if(currentUserRef.current?.email) saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{noTrades:updated});
          }} alreadyDone={noTrades.some(x=>x.date===today())} lang={lang} neon={neon}/>
          {total>0&&<>
            <AdvancedStats trades={pf} neon={neon} lang={lang}/>
            <ConformityBar trades={pf} threshold={config.threshold} maxItems={config.items.length} neon={neon} lang={lang}/>
            <PerformanceChart trades={pf} neon={neon} lang={lang}/>
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

          <div style={{marginBottom:14}}>
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
          </div>

          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:8}}><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{...inSt,marginBottom:0,flex:2,colorScheme:"dark",color:"#ffffffcc"}}/><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{...inSt,marginBottom:0,flex:1,colorScheme:"dark",color:form.time?"#ffffffcc":"#ffffff66"}}/></div>
            <div style={{fontSize:9,color:"#ffffffaa",marginTop:5}}>{t.entryTime}</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <select value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})} style={{flex:2,background:"#131318",border:`1px solid ${neon}35`,borderRadius:8,color:"#ffffff",padding:"12px",fontSize:12,fontFamily:MONO,outline:"none"}}>{allAssets.map(a=><option key={a}>{a}</option>)}</select>
            {["BUY","SELL"].map(d=><button key={d} onClick={()=>setForm({...form,direction:d})} className="btn" style={{flex:1,padding:10,background:form.direction===d?(d==="BUY"?`${neon}33`:"rgba(255,77,77,0.2)"):"#131318",border:`1px solid ${form.direction===d?(d==="BUY"?neon:"#ff4d4d"):`${neon}35`}`,color:form.direction===d?(d==="BUY"?neon:"#ff4d4d"):"#ffffff44",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO}}>{d}</button>)}
          </div>
          {/* Timeframe */}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:8,color:"#ffffff33",letterSpacing:2,marginBottom:6}}>TIMEFRAME</div>
            <div style={{display:"flex",gap:4}}>
              {["M1","M5","M15","H1","H4","D1"].map(tf=>(
                <button key={tf} onClick={()=>{setForm({...form,timeframe:tf});const nc={...config,lastTimeframe:tf};setConfig(nc);if(currentUserRef.current?.email)saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{config:nc});}} className="btn"
                  style={{flex:1,padding:"7px 0",background:form.timeframe===tf?`${neon}18`:"#131318",border:`1px solid ${form.timeframe===tf?neon:"#ffffff0d"}`,borderRadius:7,fontSize:9,fontWeight:700,color:form.timeframe===tf?neon:"#ffffffbb",fontFamily:MONO}}>
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,marginBottom:10}}>
            <span style={{fontSize:12,color:form.isRevenge||isRevengeNow?"#ff4d4d":"#ffffffbb",fontFamily:MONO}}>{t.revengeLabel} {(form.isRevenge||isRevengeNow)?"⚠️":""}</span>
            <button onClick={()=>setForm({...form,isRevenge:!form.isRevenge})} className="btn" style={{width:44,height:24,borderRadius:12,background:(form.isRevenge||isRevengeNow)?"rgba(255,77,77,0.3)":"#ffffff12",border:`1px solid ${(form.isRevenge||isRevengeNow)?"#ff4d4d":"rgba(255,77,77,0.2)"}`,position:"relative",transition:"all 0.2s"}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:(form.isRevenge||isRevengeNow)?"#ff4d4d":"#ffffffaa",position:"absolute",top:3,left:(form.isRevenge||isRevengeNow)?24:4,transition:"all 0.2s"}}/>
            </button>
          </div>
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
          <div style={{background:"#131318",border:`1px solid ${neon}1a`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2}}>{t.rejectQuality} <span style={{color:"#ffffffaa"}}>{t.optional}</span></div>
              {form.rejetScore>0&&<span style={{fontSize:15,fontWeight:800,color:form.rejetScore>=8?neon:form.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:MONO}}>{form.rejetScore}/10</span>}
            </div>
            <div style={{display:"flex",gap:3}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} onClick={()=>setForm({...form,rejetScore:form.rejetScore===n?0:n})} className="btn" style={{flex:1,padding:"6px 0",borderRadius:5,fontSize:11,fontWeight:700,fontFamily:MONO,background:form.rejetScore>=n?(n>=8?`${neon}33`:n>=5?"rgba(240,180,41,0.2)":"rgba(255,77,77,0.2)"):"#131318",border:`1px solid ${form.rejetScore>=n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"#ffffff12"}`,color:form.rejetScore>=n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"#ffffffbb"}}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>{["WIN","LOSS","BE"].map(r=><button key={r} onClick={()=>setForm({...form,result:r,slDirection:r!=="LOSS"?"":form.slDirection})} className="btn" style={{flex:1,background:form.result===r?`${rc(r,neon)}22`:"#131318",border:`1px solid ${form.result===r?rc(r,neon):`${neon}26`}`,color:form.result===r?rc(r,neon):"#ffffffbb",borderRadius:8,padding:10,fontSize:12,fontWeight:700,fontFamily:MONO}}>{r}</button>)}</div>
          {form.result==="LOSS"&&(
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
                {["pct","eur"].map(m=>(
                  <button key={m} onClick={()=>setForm(f=>({...f,pnlMode:m,pnlPreset:"",pnlManual:""}))} className="btn" style={{padding:"3px 8px",borderRadius:4,fontSize:9,fontWeight:700,fontFamily:MONO,background:(form.pnlMode||"pct")===m?neon:"transparent",color:(form.pnlMode||"pct")===m?"#000":"#ffffff66",border:"none"}}>{m==="pct"?"%":"€"}</button>
                ))}
              </div>}
            </div>
            {(form.pnlMode||"pct")==="pct"?(
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {PNL_PRESETS.map(v=>(
                  <button key={v} onClick={()=>setForm({...form,pnlPreset:v,pnlManual:""})} className="btn" style={{padding:"8px 0",borderRadius:6,fontSize:11,fontWeight:700,fontFamily:MONO,flex:1,background:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?`${neon}33`:parseFloat(v)<0?"rgba(255,77,77,0.2)":"rgba(240,180,41,0.2)"):"#131318",border:`1px solid ${form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?neon:parseFloat(v)<0?"#ff4d4d":"#f0b429"):`${neon}14`}`,color:form.pnlPreset===v&&form.pnlManual===""?(parseFloat(v)>0?neon:parseFloat(v)<0?"#ff4d4d":"#f0b429"):"#ffffffaa"}}>{v}%</button>
                ))}
                <input type="number" step="0.1" placeholder={t.manualPnl} value={form.pnlManual} onChange={e=>setForm({...form,pnlManual:e.target.value,pnlPreset:""})} style={{width:52,background:"#131318",border:`1px solid ${form.pnlManual?`${neon}66`:`${neon}14`}`,borderRadius:6,color:form.pnlManual?(parseFloat(form.pnlManual)>=0?neon:"#ff4d4d"):"#ffffffaa",padding:"8px 4px",fontSize:10,fontFamily:MONO,outline:"none",textAlign:"center",flexShrink:0}}/>
              </div>
            ):(
              <div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                  {(()=>{
                    const cap=parseFloat(config.capital)||0;
                    const euroPresets=[-500,-250,0,500,1000,2000,5000].map(v=>({v,pct:cap?parseFloat((v/cap*100).toFixed(3)):0}));
                    return euroPresets.map(({v,pct})=>{
                      const isActive=form.pnlManual===""&&form.pnlPreset===String(pct);
                      const c=v>0?neon:v<0?"#ff4d4d":"#f0b429";
                      return <button key={v} onClick={()=>setForm({...form,pnlPreset:String(pct),pnlManual:""})} className="btn"
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
                      setForm(f=>({...f,pnlEurManual:e.target.value,pnlManual:String(pct),pnlPreset:""}));
                    }}
                    style={{width:"100%",background:"#131318",border:`1px solid ${neon}35`,borderRadius:8,color:"#ffffff",padding:"10px 50px 10px 14px",fontSize:13,fontFamily:MONO,outline:"none"}}/>
                  <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#ffffff44",fontFamily:MONO}}>{config.devise||"€"}</span>
                </div>
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
            {editingId!==null?t.updateBtn:isRevengeNow||form.isRevenge?"⚠️ REVENGE — Non-conforme":form.checklist.length>=config.threshold?t.saveConform:`${t.saveNonConform} — ${form.checklist.length}/${config.items.length}`}
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
            {accounts.length>0&&<div style={{display:"flex",gap:4,marginBottom:8,overflowX:"auto",paddingBottom:2}}>
              {[{id:"ALL",name:lang==="fr"?"Tous comptes":"All"},...accounts].map(acc=>(
                <button key={acc.id||"ALL"} className="btn" onClick={()=>setHistAccount(acc.id==="ALL"?"ALL":acc.id)}
                  style={{background:histAccount===(acc.id==="ALL"?"ALL":acc.id)?`${neon}1a`:"transparent",border:`1px solid ${histAccount===(acc.id==="ALL"?"ALL":acc.id)?neon:`${neon}1a`}`,color:histAccount===(acc.id==="ALL"?"ALL":acc.id)?neon:"#ffffffaa",borderRadius:5,padding:"4px 10px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap"}}>{acc.name}</button>
              ))}
            </div>}
            {usedAssets.length>1&&<div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
              {["ALL",...usedAssets].map(a=><button key={a} className="btn" onClick={()=>setHistAsset(a)} style={{background:histAsset===a?`${neon}1a`:"transparent",border:`1px solid ${histAsset===a?`${neon}55`:`${neon}1a`}`,color:histAsset===a?neon:"#ffffffaa",borderRadius:5,padding:"4px 8px",fontSize:9,fontWeight:700,fontFamily:MONO,whiteSpace:"nowrap"}}>{a}</button>)}
            </div>}
          </>}
          {trades.length===0&&<div style={{textAlign:"center",padding:40,color:"#ffffff55",fontSize:12}}>{t.noTrades}</div>}
          {(()=>{
            const els=[];let lastPk=null;
            for(const x of mergedHistory){

              if(x._type==="notrade"){
                els.push(<div key={x.id} style={{background:"rgba(90,90,90,0.06)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,padding:"12px 14px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:16,color:"#ffffff66"}}>⊘</span><div><div style={{fontSize:12,color:"#ffffffaa",fontFamily:MONO,fontWeight:700}}>{t.noTradeToday}</div><div style={{fontSize:10,color:"#ffffffaa",marginTop:2}}>{x.date}{x.reason?" · "+x.reason:""}</div></div></div><button onClick={()=>{const upd=noTrades.filter(n=>n.id!==x.id);setNoTrades(upd);if(currentUserRef.current?.email)saveUserData(currentUserRef.current?.uid||encEmail(currentUserRef.current?.email||""),{noTrades:upd});}} style={{background:"transparent",border:"none",color:"#ffffff55",fontSize:12,cursor:"pointer"}}>✕</button></div>);
              } else {
                els.push(
                  <div key={x.id} className="row" onClick={()=>setDetailTrade(x)} style={{background:"linear-gradient(145deg,#1a1a24,#131318)",border:"1px solid #ffffff0a",borderRadius:14,padding:14,marginBottom:10,borderLeft:`3px solid ${rc(x.result,neon)}`}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <div><div style={{fontSize:13,fontWeight:700,color:"#ffffff"}}>{x.asset} · {x.direction}{x.timeframe&&<span style={{fontSize:9,color:"#ffffff44",marginLeft:6,background:"#ffffff08",padding:"2px 6px",borderRadius:4,fontWeight:400}}>{x.timeframe}</span>}</div><div style={{fontSize:10,color:"#ffffff66",marginTop:3}}>{x.date}{x.time?" · "+x.time:""}</div></div>
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
                        {x.isRevenge&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"rgba(255,77,77,0.15)",color:"#ff4d4d",border:"1px solid rgba(255,77,77,0.3)"}}>REVENGE</span>}
                        {x.checkin?.humeur&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:`${neon}0d`,color:"#ffffffaa",border:`1px solid ${neon}18`}}>{x.checkin.humeur}</span>}
                        {x.slDirection&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:x.slDirection==="with"?`${neon}15`:"rgba(255,77,77,0.1)",color:x.slDirection==="with"?neon:"#ff4d4d",border:`1px solid ${x.slDirection==="with"?`${neon}35`:"rgba(255,77,77,0.2)"}`}}>{x.slDirection==="with"?t.slWith:t.slAgainst}</span>}
                      </div>
                      {x.rejetScore>0&&<span style={{fontSize:10,color:"#ffffff44"}}>{t.rejectStat} <b style={{color:x.rejetScore>=8?neon:x.rejetScore>=5?"#f0b429":"#ff4d4d"}}>{x.rejetScore}/10</b></span>}
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
        if(currentUserRef.current?.uid) saveUserData(currentUserRef.current.uid,{config:newCfg});
      }} onLogout={async()=>{
        currentUserRef.current=null;
        try{localStorage.removeItem("tmt_user");}catch(e){}
        if(auth) try{ await signOut(auth); }catch(e){}
        setTrades([]);setNoTrades([]);setAccounts([]);setActiveAccountId(null);setPhase("login");
      }} onReset={()=>setShowReset(true)}
      lang={lang} onLangChange={l=>{
        setLang(l);
        if(currentUserRef.current?.uid) saveUserData(currentUserRef.current.uid,{lang:l});
      }} neon={neon}
      accounts={accounts} activeAccountId={activeAccountId}
      onActivateAccount={handleActivateAccount}
      onCloseAccount={handleCloseAccount}
      onNewAccount={()=>setShowNewAccount(true)}
      isPro={isPro}
      onObjectifChange={obj=>{setObjectif(obj);if(currentUserRef.current?.uid)saveUserData(currentUserRef.current.uid,{objectif:obj});}}
      onImport={()=>setShowImport(true)}/>}

      {!isDesktop&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"rgba(9,9,16,0.97)",backdropFilter:"blur(12px)",borderTop:`1px solid ${neon}18`,padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:9,color:`${neon}22`,fontFamily:"'Geist Mono','IBM Plex Mono',monospace"}}>◈ TrackMyTrade</div>
      </div>}

      {detailTrade&&<TradeDetailModal trade={detailTrade} config={config} onClose={()=>setDetailTrade(null)} onEdit={startEdit} onShare={t=>{setShareTarget(t);setShowShare(true);}} lang={lang} neon={neon}/>}
      {showExport&&<ExportModal trades={trades} onClose={()=>setShowExport(false)} lang={lang} neon={neon}/>}
      {showStats&&<StatsInsightsModal trades={trades} lang={lang} neon={neon} onClose={()=>setShowStats(false)}/>}
      {showShare&&<ShareModal trade={shareTarget} trades={trades} lang={lang} neon={neon} config={config} onClose={()=>{setShowShare(false);setShareTarget(null);}}/> }
      {showReset&&<ResetModal trades={trades} onReset={handleReset} onClose={()=>setShowReset(false)} lang={lang} neon={neon}/>}
      {showNewAccount&&<NewAccountModal onConfirm={data=>{handleNewAccount(data);setShowNewAccount(false);}} onClose={()=>setShowNewAccount(false)} lang={lang} neon={neon}  config={config}/>}
      </div>
      </div>
    </div>
  );
}
function NewAccountModal({onConfirm,onClose,lang,neon}){
  const MONO2="'Geist Mono','IBM Plex Mono',monospace";
  const [name,setName]=useState("");
  const [accountType,setAccountType]=useState("perso");
  const [capital,setCapital]=useState("");
  const [devise,setDevise]=useState("€");
  const [obj,setObj]=useState("");
  const [drawdown,setDrawdown]=useState("");
  const fr=lang==="fr";
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,10,0.92)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#0f0f18",borderRadius:"24px 24px 0 0",padding:"20px 20px 36px",width:"100%",maxWidth:480,border:"1px solid #ffffff0f",borderBottom:"none",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#ffffff",fontFamily:MONO2}}>{fr?"Nouveau compte":"New account"}</div>
            <div style={{fontSize:9,color:"#ffffff33",marginTop:3,fontFamily:MONO2}}>{fr?"Les trades s'enregistreront sur ce compte":"Trades will be recorded on this account"}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO2}}>{fr?"NOM DU COMPTE":"ACCOUNT NAME"}</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder={fr?"ex: FTMO 100K, Compte perso...":"e.g. FTMO 100K, Personal..."}
          style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO2,marginBottom:14,outline:"none"}} autoFocus/>

        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO2}}>{fr?"TYPE DE COMPTE":"ACCOUNT TYPE"}</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["prop","Prop Firm"],["perso",fr?"Perso":"Personal"],["demo","Demo"]].map(([v,l])=>(
            <button key={v} onClick={()=>setAccountType(v)} style={{flex:1,padding:"10px 0",background:accountType===v?`${neon}18`:"#131318",border:`1px solid ${accountType===v?neon:"#ffffff0d"}`,borderRadius:10,fontSize:10,fontWeight:700,color:accountType===v?neon:"#ffffff33",fontFamily:MONO2,cursor:"pointer"}}>{l}</button>
          ))}
        </div>

        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:2}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO2}}>CAPITAL</div>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)} placeholder="10000"
              style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO2,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO2}}>DEVISE</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["€","$","£","CHF"].map(d=>(
                <button key={d} onClick={()=>setDevise(d)} style={{padding:"5px 0",background:devise===d?`${neon}18`:"#131318",border:`1px solid ${devise===d?neon:"#ffffff0d"}`,borderRadius:7,fontSize:12,fontWeight:800,color:devise===d?neon:"#ffffff30",fontFamily:MONO2,cursor:"pointer"}}>{d}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:10,marginBottom:22}}>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ff4d4d88",letterSpacing:2,marginBottom:6,fontFamily:MONO2}}>DRAWDOWN MAX %</div>
            <input type="number" value={drawdown} onChange={e=>setDrawdown(e.target.value)} placeholder="5"
              style={{width:"100%",background:"#131318",border:"1px solid #ff4d4d33",borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO2,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO2}}>{fr?"OBJECTIF P&L %":"P&L TARGET %"}</div>
            <input type="number" value={obj} onChange={e=>setObj(e.target.value)} placeholder="+10"
              style={{width:"100%",background:"#131318",border:`1px solid ${neon}33`,borderRadius:10,color:"#ffffff",padding:"11px 14px",fontSize:13,fontFamily:MONO2,outline:"none"}}/>
          </div>
        </div>

        <button onClick={()=>{if(!name.trim()){return;}onConfirm({name:name.trim(),accountType,capital,devise,obj,drawdown});}}
          style={{width:"100%",background:name.trim()?`linear-gradient(135deg,${neon}22,${neon}0c)`:"#ffffff08",border:`1.5px solid ${name.trim()?neon:"#ffffff1a"}`,borderRadius:14,padding:"15px 0",fontSize:13,fontWeight:900,color:name.trim()?neon:"#ffffff33",fontFamily:MONO2,cursor:"pointer",letterSpacing:1}}>
          {fr?"✓ Creer ce compte":"✓ Create account"}
        </button>
      </div>
    </div>
  );
}