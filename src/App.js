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

const encEmail = e => e.replace(/\./g,"_DOT_").replace(/@/g,"_AT_");
const saveUserData = async (id, data) => { if(!db)return; try { await setDoc(doc(db,"users",id), data, {merge:true}); } catch(e) { console.error("Firestore save:",e); } };
const loadUserData = async id => { if(!db)return null; try { const s=await getDoc(doc(db,"users",id)); return s.exists()?s.data():null; } catch(e) { return null; } };
const authLogin = async (email, pwd) => {
  if(!auth) return null;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pwd);
    const uid = cred.user.uid;
    let d = await loadUserData(uid);
    if(!d) d = await loadUserData(encEmail(email));
    return { ...(d || { setupDone: false }), _uid: uid };
  } catch(e) { return null; }
};
const authRegister = async (email, pwd, lang) => {
  if(!auth) return false;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    const uid = cred.user.uid;
    await saveUserData(uid, {setupDone:false, lang, trades:[], noTrades:[], phases:[]});
    return true;
  } catch(e) { return false; }
};

const PRESET_ASSETS = ["XAU/USD","EUR/USD","GBP/USD","NAS100","BTC/USD","ETH/USD","US30","SPX500","GBP/JPY","USD/JPY"];
const DEFAULT_CRITERIA = ["HA M5 claire (pas de doji)","MM20 bien orientée","BB approche sur M1","Bougie de rejet propre","Fenêtre horaire respectée","Pas de distraction","Contexte macro neutre"];
const MONO = "'Geist Mono','IBM Plex Mono',monospace";
const DISPLAY = "'Inter',sans-serif";
const PNL_PRESETS = ["-1","-0.5","0","+1","+2","+3","+4","+5"];
const NEON_COLORS = [{name:"Vert",value:"#00ff9d"},{name:"Bleu",value:"#00d4ff"},{name:"Violet",value:"#bf00ff"},{name:"Rose",value:"#ff00aa"},{name:"Or",value:"#f0b429"}];
const HUMEUR_PILLS = {fr:["◎ Focus","◌ Neutre","△ Tendu","◷ Fatigué"],en:["◎ Focus","◌ Neutral","△ Tense","◷ Tired"]};
const BIAIS_PILLS = {fr:["↑ Haussier","→ Range","↓ Baissier"],en:["↑ Bullish","→ Range","↓ Bearish"]};
const NTR = {fr:["Pas de setup valide","Hors fenêtre","Marché difficile","Journée chargée","Jour de repos"],en:["No valid setup","Out of window","Difficult market","Busy day","Rest day"]};
const today = () => new Date().toISOString().split("T")[0];
const rc = (r, neon="#00ff9d") => r==="WIN"?neon:r==="LOSS"?"#ff4d4d":"#f0b429";
const fmtPct = v => { if(v===""||v===null||v===undefined) return "—"; const n=Number(v),abs=Math.abs(n); const s=abs%1===0?abs.toFixed(0):abs*10%1===0?abs.toFixed(1):abs.toFixed(2); return `${n>=0?"+":""}${n<0?"-":""}${s}%`; };
const calcDisc = list => { if(!list||!list.length) return null; return Math.round((list.filter(x=>x.conforming).length/list.length*0.6+list.filter(x=>!x.isRevenge).length/list.length*0.4)*10); };
const emptyForm = (asset="XAU/USD", tf="M5") => ({date:today(),asset,direction:"BUY",checklist:[],result:"WIN",pnlPreset:"",pnlManual:"",notes:"",rejetScore:0,time:"",timeframe:tf,screenshot:"",isRevenge:false,slDirection:"",checkin:{humeur:"",biais:""}});
const mkInput = neon => ({width:"100%",background:"linear-gradient(145deg,#16162a,#0e0e1e)",border:`1px solid rgba(255,255,255,0.08)`,borderTop:`1px solid rgba(255,255,255,0.14)`,boxShadow:"inset 0 2px 6px rgba(0,0,0,0.4)",borderRadius:10,color:"#ffffff",padding:"12px 14px",fontSize:13,fontFamily:MONO,marginBottom:10,outline:"none"});

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

// ── CSS GLOBAL ──
const CSS = ({neon="#00ff9d"}) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Geist+Mono:wght@400;500;700;800;900&family=IBM+Plex+Mono:wght@400;500;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#07070f}
    input,select,textarea{outline:none;font-family:${MONO};font-size:16px}
    input[type=checkbox]{accent-color:${neon};width:16px;height:16px;cursor:pointer}
    input[type=date],input[type=time]{color-scheme:dark}
    input[type=file]{display:none}
    .btn{transition:all 0.15s;cursor:pointer}
    .btn:hover{opacity:0.85;transform:translateY(-1px)}
    .row{transition:background 0.2s;cursor:pointer}
    .row:hover{background:rgba(255,255,255,0.04)!important}
    ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${neon}26}

    /* ══ CARD SYSTEM ══ */
    .glass-card{
      position:relative;overflow:hidden;
      background:linear-gradient(145deg,#1d1d2e 0%,#131320 100%);
      border:1px solid rgba(255,255,255,0.05);
      border-top:1px solid rgba(255,255,255,0.14);
      border-radius:16px;
      box-shadow:0 1px 0 rgba(255,255,255,0.1) inset,0 -1px 0 rgba(0,0,0,0.5) inset,0 20px 60px rgba(0,0,0,0.8),0 4px 16px rgba(0,0,0,0.5);
      transition:transform .25s cubic-bezier(.16,1,.3,1),box-shadow .25s;
    }
    .glass-card::before{
      content:'';position:absolute;inset:0;
      background:linear-gradient(118deg,rgba(255,255,255,0.065) 0%,transparent 45%,rgba(0,0,0,0.08) 100%);
      border-radius:inherit;pointer-events:none;z-index:0;
    }
    .glass-card::after{
      content:'';position:absolute;top:0;left:10%;right:10%;height:1px;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,0.28) 45%,rgba(255,255,255,0.28) 55%,transparent);
      pointer-events:none;z-index:0;
    }
    .glass-card>*{position:relative;z-index:1}
    .glass-card:hover{transform:translateY(-2px);box-shadow:0 1px 0 rgba(255,255,255,0.15) inset,0 -1px 0 rgba(0,0,0,0.6) inset,0 32px 80px rgba(0,0,0,0.9),0 8px 24px rgba(0,0,0,0.6)}

    .glass-card-neon{
      position:relative;overflow:hidden;
      background:linear-gradient(145deg,#162418 0%,#0d1510 100%);
      border:1px solid rgba(0,255,157,0.1);
      border-top:1px solid rgba(0,255,157,0.22);
      border-radius:16px;
      box-shadow:0 1px 0 rgba(0,255,157,0.15) inset,0 -1px 0 rgba(0,0,0,0.5) inset,0 20px 60px rgba(0,0,0,0.8),0 0 50px rgba(0,255,157,0.04);
    }
    .glass-card-neon::before{
      content:'';position:absolute;inset:0;
      background:linear-gradient(118deg,rgba(255,255,255,0.05) 0%,transparent 45%);
      border-radius:inherit;pointer-events:none;z-index:0;
    }
    .glass-card-neon::after{
      content:'';position:absolute;top:0;left:10%;right:10%;height:1px;
      background:linear-gradient(90deg,transparent,rgba(0,255,157,0.18) 45%,rgba(0,255,157,0.18) 55%,transparent);
      pointer-events:none;z-index:0;
    }
    .glass-card-neon>*{position:relative;z-index:1}

    .inner-card{
      position:relative;overflow:hidden;
      background:linear-gradient(145deg,rgba(255,255,255,0.035),rgba(0,0,0,0.25));
      border:1px solid rgba(255,255,255,0.04);
      border-top:1px solid rgba(255,255,255,0.09);
      border-radius:10px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.05),0 4px 16px rgba(0,0,0,0.45);
    }
    .inner-card::before{
      content:'';position:absolute;inset:0;border-radius:inherit;
      background:linear-gradient(118deg,rgba(255,255,255,0.035) 0%,transparent 50%);
      pointer-events:none;
    }
    .inner-card>*{position:relative;z-index:1}

    /* ══ BOUTON SOLID NEON ══ */
    .btn-neon-solid{
      background:linear-gradient(180deg,${neon} 0%,${neon}cc 100%) !important;
      border:none !important;
      border-top:1px solid rgba(255,255,255,0.28) !important;
      color:#07140d !important;
      font-weight:700 !important;
      box-shadow:0 1px 0 rgba(255,255,255,0.3) inset,0 6px 22px ${neon}44,0 2px 8px rgba(0,0,0,0.4) !important;
      transition:all .2s cubic-bezier(.16,1,.3,1) !important;
    }
    .btn-neon-solid:hover{transform:translateY(-2px) !important;box-shadow:0 1px 0 rgba(255,255,255,0.38) inset,0 10px 32px ${neon}55,0 4px 12px rgba(0,0,0,0.5) !important;opacity:1 !important}
    .btn-neon-solid:active{transform:translateY(0) !important;box-shadow:0 1px 0 rgba(255,255,255,0.18) inset,0 4px 14px ${neon}33 !important}

    /* ══ CHIFFRES DISPLAY (Inter) ══ */
    .val-display{font-family:'Inter',sans-serif !important;font-weight:800 !important;letter-spacing:-2px !important}

    /* ══ AURORA ══ */
    @keyframes auA{from{transform:translate(0,0)}to{transform:translate(8%,6%)}}
    @keyframes auB{from{transform:translate(0,0)}to{transform:translate(-7%,-5%)}}
    @keyframes auC{from{transform:translate(0,0)}to{transform:translate(-5%,8%)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:1;text-shadow:0 0 8px ${neon}66}50%{opacity:0.85;text-shadow:0 0 14px ${neon}aa}}
    @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes logoBoxGlow{0%,100%{box-shadow:0 0 8px ${neon}22}50%{box-shadow:0 0 20px ${neon}55,0 0 6px ${neon}33}}
    @keyframes dotPulse{0%,40%,100%{width:6px;background:${neon}22;box-shadow:none}50%{width:22px;background:${neon};box-shadow:0 0 12px ${neon}99}}
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
    @keyframes ring{0%,100%{transform:scale(1);opacity:0.12}50%{transform:scale(1.08);opacity:0.22}}
    @keyframes slideFromLeft{0%{opacity:0;transform:translateX(-60px)}65%{transform:translateX(6px)}80%{transform:translateX(-2px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes slideFromRight{0%{opacity:0;transform:translateX(60px)}65%{transform:translateX(-6px)}80%{transform:translateX(2px)}100%{opacity:1;transform:translateX(0)}}
    @keyframes fadeInSlow{0%{opacity:0}100%{opacity:1}}
    .slide-up{animation:slideUp 0.28s cubic-bezier(0.34,1.3,0.64,1)}
    .fu{animation:fadeUp 0.45s ease both}
    .fi{animation:fadeIn 0.4s ease both}
    .glow{animation:pulse 3s ease-in-out infinite}
    .grid-bg{background-image:linear-gradient(${neon}06 1px,transparent 1px),linear-gradient(90deg,${neon}06 1px,transparent 1px);background-size:32px 32px}
    .view-in{animation:fadeIn 0.22s ease both}
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
    <div className="glass-card" style={{padding:16,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontFamily:MONO}}>{t.statsTitle}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div className="inner-card" style={{padding:10,boxShadow:`inset 0 1px 0 ${neon}15`}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4,fontFamily:MONO}}>{t.expectancy}</div><div style={{fontSize:20,fontWeight:800,color:exp>=0?neon:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-1,textShadow:`0 0 14px ${exp>=0?neon:"#ff4d4d"}99`}}>{fmtPct(exp)}</div></div>
        {best&&<div className="inner-card" style={{padding:10}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4,fontFamily:MONO}}>{t.bestAsset}</div><div style={{fontSize:16,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.5}}>{best[0]}</div><div style={{fontSize:10,color:"#ffffffaa",fontFamily:MONO}}>{Math.round(best[1].w/best[1].t*100)}% WR</div></div>}
        <div className="inner-card" style={{padding:10}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4,fontFamily:MONO}}>{t.avgWin}</div><div style={{fontSize:20,fontWeight:800,color:neon,fontFamily:DISPLAY,letterSpacing:-1,textShadow:`0 0 14px ${neon}99`}}>{fmtPct(avgWin)}</div></div>
        <div className="inner-card" style={{padding:10}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4,fontFamily:MONO}}>{t.avgLoss}</div><div style={{fontSize:20,fontWeight:800,color:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-1,textShadow:"0 0 14px #ff4d4d99"}}>-{avgLoss%1===0?avgLoss.toFixed(0):avgLoss.toFixed(1)}%</div></div>
        {wins.length>0&&losses.length>0&&(()=>{const r=avgWin/avgLoss;return<div className="inner-card" style={{padding:10,gridColumn:"1/-1"}}><div style={{fontSize:9,color:"#ffffffaa",marginBottom:4,fontFamily:MONO}}>{t.ratio}</div><div style={{fontSize:20,fontWeight:800,color:r>=1?neon:"#f0b429",fontFamily:DISPLAY,letterSpacing:-1}}>{r.toFixed(2)}</div></div>;})()}
        {revs.length>0&&<div style={{background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",borderRadius:8,padding:10,gridColumn:"1/-1"}}><div style={{fontSize:9,color:"#ff4d4d",marginBottom:4,fontFamily:MONO}}>REVENGE TRADES</div><div style={{fontSize:16,fontWeight:700,color:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-0.5}}>{revs.length} · {Math.round(revs.filter(x=>x.result==="LOSS").length/revs.length*100)}% LOSS</div></div>}
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
    <div className="glass-card" style={{border:`1px solid ${color}28`,borderRadius:14,padding:"14px 16px",flex:1}}>
      <div style={{fontSize:9,color:"#ffffffaa",textTransform:"uppercase",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-1.5,lineHeight:1,textShadow:`0 0 20px ${color}cc, 0 2px 6px rgba(0,0,0,0.6)`}}>{value}</div>
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
      <div className="slide-up glass-card" style={{border:`1px solid ${iC}30`,borderRadius:20,width:"100%",maxWidth:320,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:iC,opacity:0.85}}/>
        <div style={{padding:"26px 22px 22px"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><Icon/></div>
          <div style={{fontSize:17,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,lineHeight:1.35,textAlign:"center",marginBottom:parts[1]?8:0}}>{parts[0]}</div>
          {parts[1]&&<div style={{fontSize:12,color:"#ffffffaa",fontFamily:MONO,lineHeight:1.65,textAlign:"center"}}>{parts[1]}</div>}
          {trade&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,margin:"16px 0 4px",padding:"9px 14px",background:`${iC}0d`,borderRadius:10,border:`1px solid ${iC}20`}}>
            <span style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO}}>{trade.asset}</span>
            <span style={{fontSize:10,color:"#ffffffaa"}}>·</span>
            <span style={{fontSize:13,fontWeight:800,color:rc(trade.result,neon),fontFamily:DISPLAY}}>{trade.result}</span>
            {trade.pnlPct!==""&&parseFloat(trade.pnlPct)!==0&&<><span style={{fontSize:10,color:"#ffffffaa"}}>·</span><span style={{fontSize:12,fontWeight:700,color:parseFloat(trade.pnlPct)>=0?neon:"#ff4d4d",fontFamily:DISPLAY}}>{fmtPct(parseFloat(trade.pnlPct))}</span></>}
          </div>}
          <button onClick={onClose} className="btn btn-neon-solid" style={{width:"100%",marginTop:trade?12:18,borderRadius:10,padding:"11px 0",fontSize:11,fontWeight:700,fontFamily:MONO,letterSpacing:1.5}}>{fr?"COMPRIS":"GOT IT"}</button>
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
      <div className="slide-up glass-card" style={{border:`1px solid ${neon}35`,borderRadius:20,width:"100%",maxWidth:340,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:neon,opacity:0.85}}/>
        <div style={{padding:"24px 22px 22px"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:3,marginBottom:6,fontFamily:MONO}}>{t.weeklySubtitle}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5}}>{t.weeklyTitle}</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{l:"WIN RATE",v:`${wr}%`,c:wr>=50?neon:"#ff4d4d"},{l:"P&L",v:fmtPct(pnl),c:pnl>=0?neon:"#ff4d4d"},{l:t.trades.toUpperCase(),v:week.length,c:neon}].map(({l,v,c})=>(
              <div key={l} className="inner-card" style={{flex:1,padding:"10px 6px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:DISPLAY,letterSpacing:-1.5,lineHeight:1,textShadow:`0 0 18px ${c}cc`}}>{v}</div>
                <div style={{fontSize:8,color:"#ffffffaa",marginTop:4,letterSpacing:1,fontFamily:MONO}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{background:`${sC}0d`,border:`1px solid ${sC}30`,borderRadius:12,padding:"12px 16px",marginBottom:14,boxShadow:`0 4px 24px ${sC}14, inset 0 1px 0 ${sC}22`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,fontFamily:MONO,marginBottom:4}}>{t.disciplineLabel}</div>
                <div style={{fontSize:34,fontWeight:800,color:sC,fontFamily:DISPLAY,letterSpacing:-2.5,lineHeight:1,textShadow:`0 0 24px ${sC}cc`}}>{score}<span style={{fontSize:14,color:"#ffffff44",fontFamily:MONO,letterSpacing:0}}>/10</span></div>
                <div style={{fontSize:9,color:sC,marginTop:3,fontFamily:MONO}}>{score>=8?t.disciplineExcellent:score>=6?t.disciplineGood:score>=4?t.disciplineWork:t.disciplinePoor}</div>
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
            {insights.map((ins,i)=><div key={i} className="inner-card" style={{padding:"8px 12px",fontSize:11,color:"#ffffffbb",fontFamily:MONO,lineHeight:1.5}}>{ins}</div>)}
          </div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{onClose();}} className="btn btn-neon-solid" style={{flex:2,borderRadius:10,padding:"12px 0",fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.weeklyClose}</button>
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
      <div className="slide-up glass-card" style={{border:`1px solid ${neon}35`,borderRadius:16,width:"100%",maxWidth:480,maxHeight:"88vh",overflow:"auto",padding:20}} onClick={e=>e.stopPropagation()}>
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
        {hasCI&&<div className="inner-card" style={{padding:"10px 12px",marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>CHECK-IN</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {ci.humeur&&<span style={{fontSize:11,padding:"4px 10px",background:`${neon}12`,border:`1px solid ${neon}26`,borderRadius:6,color:"#ffffff",fontFamily:MONO}}>{ci.humeur}</span>}
            {ci.biais&&<span style={{fontSize:11,padding:"4px 10px",background:`${neon}12`,border:`1px solid ${neon}26`,borderRadius:6,color:"#ffffff",fontFamily:MONO}}>{ci.biais}</span>}
          </div>
        </div>}
        <div style={{background:`${rc(trade.result,neon)}10`,border:`1px solid ${rc(trade.result,neon)}35`,borderRadius:10,padding:16,marginBottom:14,borderLeft:`3px solid ${rc(trade.result,neon)}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5}}>{trade.asset} · {trade.direction}</div>
              <div style={{fontSize:11,color:"#ffffffaa",marginTop:4,fontFamily:MONO}}>{trade.date}{trade.time?" · "+trade.time:""}</div>
              {trade.slDirection&&<div style={{fontSize:10,marginTop:4,color:trade.slDirection==="with"?neon:"#ff4d4d",fontFamily:MONO}}>{trade.slDirection==="with"?`✓ ${lang==="fr"?"Dans mon sens":"My way"}`:`✗ ${lang==="fr"?"Contre moi":"Against me"}`}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:800,color:rc(trade.result,neon),fontFamily:DISPLAY,letterSpacing:-1,textShadow:`0 0 20px ${rc(trade.result,neon)}cc`,display:"flex",alignItems:"center",gap:6}}>{trade.result==="WIN"&&<IcoWin neon={neon} size={22}/>}{trade.result==="LOSS"&&<IcoLoss size={22}/>}{trade.result==="BE"&&<IcoBE size={22}/>}{trade.result}</div>
              {trade.pnlPct!==""&&<div style={{fontSize:14,color:parseFloat(trade.pnlPct)>=0?neon:"#ff4d4d",fontWeight:700,fontFamily:DISPLAY,letterSpacing:-0.5}}>{fmtPct(parseFloat(trade.pnlPct))}</div>}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div className="inner-card" style={{flex:1,padding:12,display:"flex",alignItems:"center",gap:10}}>
            <ScoreRing score={trade.setupScore} max={trade.checklistMax||config.items.length} size={44} threshold={config.threshold} neon={neon}/>
            <div>
              <div style={{fontSize:10,color:"#ffffffbb",letterSpacing:1,fontFamily:MONO}}>{t.setupScore}</div>
              <div style={{fontSize:12,color:trade.conforming?neon:"#ff4d4d",fontWeight:700,marginTop:3,fontFamily:MONO}}>{trade.conforming?t.conformLabel:t.nonConformLabel}</div>
            </div>
          </div>
          {trade.rejetScore>0&&<div className="inner-card" style={{flex:1,padding:12,display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:28,fontWeight:800,color:trade.rejetScore>=8?neon:trade.rejetScore>=5?"#f0b429":"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-1.5}}>{trade.rejetScore}</div>
            <div>
              <div style={{fontSize:10,color:"#ffffffbb",letterSpacing:1,fontFamily:MONO}}>{t.rejectLabel}</div>
              <div style={{fontSize:11,color:"#ffffffaa",marginTop:3,fontFamily:MONO}}>{trade.rejetScore>=8?t.excellent:trade.rejetScore>=5?t.correct:t.weak}</div>
            </div>
          </div>}
        </div>
        <div className="inner-card" style={{padding:12,marginBottom:14}}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.checklistDetail}</div>
          {config.items.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #ffffff06"}}>
              <span style={{fontSize:13,color:(trade.checklist||[]).includes(i)?neon:"#ffffff44"}}>{(trade.checklist||[]).includes(i)?"✓":"✗"}</span>
              <span style={{fontSize:11,color:(trade.checklist||[]).includes(i)?"#ffffff":"#ffffffaa",fontFamily:MONO}}>{item}</span>
            </div>
          ))}
        </div>
        {trade.screenshot&&<div style={{marginBottom:14}}><div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.screenshotLabel}</div><img src={trade.screenshot} alt="" style={{width:"100%",borderRadius:8,border:`1px solid ${neon}26`}}/></div>}
        {trade.notes&&<div className="inner-card" style={{padding:12}}><div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>{t.notesLabel}</div><div style={{fontSize:12,color:"#ffffffaa",lineHeight:1.6,fontStyle:"italic"}}>"{trade.notes}"</div></div>}
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
    <div className="glass-card" style={{padding:16,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontFamily:MONO}}>{t.conformityTitle} {threshold}/{maxItems}</div>
      <div style={{display:"flex",height:8,borderRadius:6,overflow:"hidden",marginBottom:14,background:"#ffffff10"}}>
        <div style={{width:`${cPct}%`,background:neon,transition:"width 0.5s"}}/><div style={{flex:1,background:"#ff4d4d44"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div className="inner-card" style={{flex:1,padding:12,border:`1px solid ${neon}28`}}>
          <div style={{fontSize:9,color:neon,letterSpacing:1,marginBottom:8,fontFamily:MONO}}>{t.conformShort}</div>
          <div style={{fontSize:26,fontWeight:800,color:neon,fontFamily:DISPLAY,letterSpacing:-2,textShadow:`0 0 20px ${neon}cc`}}>{conf.length}</div>
          {cWR!==null&&<div style={{marginTop:8,padding:"4px 8px",background:`${neon}18`,borderRadius:6}}><span style={{fontSize:16,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-1}}>{cWR}%</span><span style={{fontSize:10,color:"#ffffffaa",marginLeft:6,fontFamily:MONO}}>{t.winRateLabel}</span></div>}
        </div>
        {nonConf.length>0&&<div className="inner-card" style={{flex:1,background:"rgba(255,77,77,0.04)",border:"1px solid rgba(255,77,77,0.15)",padding:12}}>
          <div style={{fontSize:9,color:"#ff4d4d",letterSpacing:1,marginBottom:8,fontFamily:MONO}}>{t.nonConformShort}</div>
          <div style={{fontSize:26,fontWeight:800,color:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-2,textShadow:"0 0 20px #ff4d4dcc"}}>{nonConf.length}</div>
          {nWR!==null&&<div style={{marginTop:8,padding:"4px 8px",background:"rgba(255,77,77,0.15)",borderRadius:6}}><span style={{fontSize:16,fontWeight:700,color:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-1}}>{nWR}%</span><span style={{fontSize:10,color:"#ffffffaa",marginLeft:6,fontFamily:MONO}}>{t.winRateLabel}</span></div>}
        </div>}
      </div>
    </div>
  );
}

function PerformanceChart({trades, neon, lang}) {
  const fr = lang === "fr";
  if(!trades||trades.length<2) return null;
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
  const pathD = points.map((p,i) => `${i===0?'M':'L'}${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(points.length-1).toFixed(1)},${zeroY.toFixed(1)} L${toX(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
  const finalVal = points[points.length-1].cum;
  const finalX = toX(points.length-1);
  const finalY = toY(finalVal);
  const color = finalVal >= 0 ? neon : "#ff4d4d";
  const yLabels = [];
  const step = range / 3;
  for(let i=0;i<=3;i++) { const v = minV + step*i; yLabels.push({v: parseFloat(v.toFixed(1)), y: toY(v)}); }
  return (
    <div className="glass-card" style={{padding:"12px 14px",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:9,color:`${neon}44`,letterSpacing:2,fontFamily:MONO}}>{fr?"P&L CUMULÉ":"CUMULATIVE P&L"}</div>
        <div style={{fontSize:14,fontWeight:700,color,fontFamily:DISPLAY,letterSpacing:-0.5}}>{finalVal>=0?"+":""}{finalVal.toFixed(1)}%</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
          </linearGradient>
          <clipPath id="chartClip"><rect x={PAD.l} y={PAD.t} width={chartW} height={chartH}/></clipPath>
        </defs>
        {yLabels.map(({v,y})=>(
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke={neon} strokeOpacity="0.06" strokeWidth="1"/>
            <text x={PAD.l-4} y={y+3} fontFamily={MONO} fontSize="7" fill={neon} fillOpacity="0.35" textAnchor="end">{v>0?"+":""}{v}%</text>
          </g>
        ))}
        {minV<0&&maxV>0&&<line x1={PAD.l} y1={zeroY} x2={W-PAD.r} y2={zeroY} stroke={neon} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="4,3"/>}
        <path d={areaD} fill="url(#areaGrad)" clipPath="url(#chartClip)"/>
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" clipPath="url(#chartClip)"/>
        {points.map((p,i)=>(
          <circle key={i} cx={toX(i)} cy={toY(p.cum)} r="2.5" fill={p.result==="WIN"?neon:p.result==="LOSS"?"#ff4d4d":"#f0b429"} opacity="0.8"/>
        ))}
        <circle cx={finalX} cy={finalY} r="5" fill={color} opacity="0.9"/>
        <circle cx={finalX} cy={finalY} r="8" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="1"/>
      </svg>
      <div style={{display:"flex",gap:12,marginTop:4}}>
        {[{c:neon,l:"WIN"},{c:"#ff4d4d",l:"LOSS"},{c:"#f0b429",l:"BE"}].map(({c,l})=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
            <span style={{fontSize:8,color:`${neon}33`,fontFamily:MONO}}>{l}</span>
          </div>
        ))}
        <span style={{fontSize:8,color:`${neon}22`,fontFamily:MONO,marginLeft:"auto"}}>{points.length} trades</span>
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
    <div className="glass-card" style={{padding:14,marginBottom:12}}>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:12,textTransform:"uppercase",fontFamily:MONO}}>{t.calendarTitle} · {mN[lang][month]} {year}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>{dN[lang].map((d,i)=><div key={i} style={{fontSize:8,color:"#ffffff44",textAlign:"center",fontFamily:MONO}}>{d}</div>)}</div>
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
  if(alreadyDone) return <div className="inner-card" style={{padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{color:"#ffffff66"}}>⊘</span><span style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO}}>{t.noTradeToday}</span></div>;
  if(!open) return <button onClick={()=>setOpen(true)} className="btn" style={{width:"100%",background:"transparent",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,color:"#ffffffaa",fontFamily:MONO,fontSize:12}}><span>⊘</span><span>{t.noTradeToday}</span></button>;
  return (
    <div className="glass-card" style={{padding:14,marginBottom:12}}>
      <div style={{fontSize:10,color:"#ffffffaa",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.noTradeReason}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        {ntr.map(r=><button key={r} onClick={()=>setReason(reason===r?"":r)} className="btn" style={{background:reason===r?"rgba(255,255,255,0.1)":"transparent",border:`1px solid ${reason===r?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}`,color:reason===r?"#ffffff":"#ffffffbb",borderRadius:6,padding:"5px 10px",fontSize:11,fontFamily:MONO}}>{r}</button>)}
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
      <div className="slide-up glass-card" style={{border:"1px solid rgba(255,77,77,0.3)",borderRadius:20,width:"100%",maxWidth:340,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:"#ff4d4d",opacity:0.8}}/>
        <div style={{padding:"26px 22px 22px"}}>
          {step==="confirm"?(
            <>
              <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><svg width="52" height="52" viewBox="0 0 24 24" fill="none"><path d="M12 3L22.5 21H1.5L12 3Z" fill="rgba(255,77,77,0.1)" stroke="#ff4d4d" strokeWidth="1.5" strokeLinejoin="round"/><line x1="12" y1="9.5" x2="12" y2="15" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="18" r="1.5" fill="#ff4d4d"/></svg></div>
              <div style={{fontSize:16,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,textAlign:"center",marginBottom:8}}>{t.resetTitle}</div>
              <div style={{fontSize:12,color:"#ffffffaa",textAlign:"center",lineHeight:1.65,marginBottom:22,fontFamily:MONO}}><span style={{color:"#ff4d4d",fontWeight:700}}>{trades.length}</span> {t.resetWarning}</div>
              <button onClick={doExport} className="btn btn-neon-solid" style={{width:"100%",borderRadius:10,padding:"13px 0",fontSize:12,fontFamily:MONO,marginBottom:10}}>{t.resetExportBtn}</button>
              <button onClick={onReset} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.25)",color:"#ff4d4d88",borderRadius:10,padding:"10px 0",fontSize:11,fontFamily:MONO,marginBottom:10}}>{t.resetSkipBtn}</button>
              <button onClick={onClose} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#ffffff44",fontSize:11,fontFamily:MONO,padding:"6px 0"}}>{t.resetCancel}</button>
            </>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"center",marginBottom:18}}><svg width="52" height="52" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" fill={`${neon}10`} stroke={neon} strokeWidth="1.5"/><polyline points="7.5,12.5 10.5,15.5 17,8.5" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <div style={{fontSize:16,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,textAlign:"center",marginBottom:8}}>{t.resetExportedTitle}</div>
              <div style={{fontSize:12,color:"#ffffffaa",textAlign:"center",lineHeight:1.65,marginBottom:22,fontFamily:MONO}}>{t.resetExportedDesc}</div>
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
        const ok=await authRegister(em,pwd,lang);
        if(ok){setSignupDone(true);setLoading(false);}
        else{setError(t.signupError);setLoading(false);}
      }
    } catch(e){setError(e.message||t.loginError);setLoading(false);}
  };
  if(signupDone) return (
    <div style={{background:"#0c0c12",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,fontFamily:MONO,maxWidth:480,margin:"0 auto"}}>
      <CSS neon={neon}/>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:24,width:"100%",height:120,overflow:"hidden"}}>
        <GridBackground neon={neon} height={120}/>
        <div style={{position:"relative",zIndex:2}}><SplashLogo neon={neon}/></div>
      </div>
      <div className="slide-up" style={{width:"100%",maxWidth:360,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={`${neon}15`} stroke={neon} strokeWidth="1.5"/><polyline points="7,12.5 10.5,16 17,8.5" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{fontSize:20,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,marginBottom:10}}>{fr?"Compte créé !":"Account created!"}</div>
        <div style={{fontSize:13,color:"#ffffffaa",fontFamily:MONO,lineHeight:1.7,marginBottom:28}}>{fr?`Bienvenue sur TrackMyTrade.\nTon compte est prêt.`:`Welcome to TrackMyTrade.\nYour account is ready.`}</div>
        <button onClick={()=>onLogin({email:email.trim().toLowerCase(),pwd,userData:null})} className="btn btn-neon-solid"
          style={{width:"100%",borderRadius:10,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,letterSpacing:2}}>
          {fr?"CONFIGURER MA STRATÉGIE →":"SET UP MY STRATEGY →"}
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
        {error&&<div style={{fontSize:11,color:"#ff4d4d",marginBottom:14,padding:"8px 12px",background:"rgba(255,77,77,0.08)",borderRadius:8,border:"1px solid rgba(255,77,77,0.2)",fontFamily:MONO}}>{error}</div>}
        <button onClick={submit} disabled={loading} className="btn btn-neon-solid"
          style={{width:"100%",borderRadius:10,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:20,letterSpacing:2}}>
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
    const hex=neon;
    const PTS=[[52,88],[248,65],[32,215],[268,192],[142,35],[72,335],[232,305],[25,445],[275,382],[115,488],[195,452],[45,532],[255,515],[128,148],[185,348],[88,188],[218,162],[158,545],[38,308],[262,458]];
    const animate=ts=>{
      if(!startRef.current)startRef.current=ts;
      const t=(ts-startRef.current)/1000;
      ctx.clearRect(0,0,W,H);
      for(let r=0;r<=rows;r++){for(let c=0;c<=cols;c++){const cx=c*cw,cy=r*rh;const dist=Math.hypot(cx-W/2,cy-H/2)/185;const wave=Math.sin(t*1.5-dist*4.5)*0.5+0.5;const op=wave*(1-Math.min(1,dist*0.75))*0.42;if(op<0.02)continue;ctx.beginPath();ctx.arc(cx,cy,1.4,0,Math.PI*2);ctx.fillStyle=`${hex}${Math.round(op*255).toString(16).padStart(2,"0")}`;ctx.fill();if(r<rows&&c<cols){const lineOp=wave*(1-Math.min(1,dist*0.85))*0.1;if(lineOp>0.01){ctx.strokeStyle=`${hex}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+cw,cy);ctx.stroke();ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+rh);ctx.stroke();}}}}
      const pts=PTS.map(([x,y],i)=>({x:x+Math.sin(t*1.05+i*1.4)*9,y:y+Math.cos(t*0.88+i*0.75)*7,op:0.35+Math.sin(t*1.4+i*0.9)*0.18,r:1.2+(i%4)*0.55}));
      for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);if(d>110)continue;const lineOp=(1-d/110)*0.18;ctx.strokeStyle=`${hex}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}}
      for(let i=0;i<pts.length;i++){const p=pts[i];const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r+4);grad.addColorStop(0,`${hex}${Math.round(p.op*0.3*255).toString(16).padStart(2,"0")}`);grad.addColorStop(1,"transparent");ctx.beginPath();ctx.arc(p.x,p.y,p.r+4,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`${hex}${Math.round(p.op*255).toString(16).padStart(2,"0")}`;ctx.fill();}
      rafRef.current=requestAnimationFrame(animate);
    };
    rafRef.current=requestAnimationFrame(animate);
    return()=>{clearTimeout(done);cancelAnimationFrame(rafRef.current);};
  },[]);
  return (
    <div style={{background:"#07070d",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",overflow:"hidden",position:"relative"}}>
      <CSS neon={neon}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 75% 60% at 50% 50%,${neon}12,transparent 68%)`,pointerEvents:"none",zIndex:1}}/>
      <canvas ref={canvasRef} width={300} height={580} style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:1,maxWidth:"100%"}}/>
      <div style={{position:"relative",zIndex:10,display:"flex",alignItems:"center",gap,animation:"slideFromLeft 0.95s cubic-bezier(0.34,1.3,0.64,1) 0.15s both"}}>
        <div style={{width:boxSize,height:boxSize,borderRadius:isMobile?18:32,background:`linear-gradient(135deg,${neon}22,${neon}08)`,border:`1.5px solid ${neon}65`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 50px ${neon}55,0 0 18px ${neon}22,inset 0 1px 0 ${neon}35`,position:"relative",overflow:"hidden",animation:"logoBoxGlow 3s ease-in-out infinite",flexShrink:0}}>
          <div style={{position:"absolute",top:-4,left:-4,width:"55%",height:"55%",background:`linear-gradient(135deg,${neon}20,transparent 70%)`,borderRadius:"0 0 60% 0"}}/>
          <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none"><polygon points="12,2 22,12 12,22 2,12" fill={`${neon}22`} stroke={neon} strokeWidth="1.5" strokeLinejoin="round"/><polygon points="12,7 17,12 12,17 7,12" fill={neon} style={{filter:`drop-shadow(0 0 7px ${neon})`}}/></svg>
        </div>
        <div style={{animation:"slideFromRight 0.95s cubic-bezier(0.34,1.3,0.64,1) 0.15s both"}}>
          <div style={{fontSize,fontWeight:900,letterSpacing:-2,lineHeight:1,whiteSpace:"nowrap",fontFamily:"'Inter',sans-serif",textShadow:`0 0 50px ${neon}55`}}>
            <b style={{color:neon}}>Track</b><span style={{color:"#ffffff1a",fontWeight:300}}>My</span><b style={{color:neon}}>Trade</b>
          </div>
          <div style={{fontSize:isMobile?8:11,color:`${neon}55`,letterSpacing:isMobile?4:6,marginTop:10,animation:"fadeInSlow 0.6s ease 0.8s both",fontFamily:MONO}}>JOURNAL DE TRADING</div>
        </div>
      </div>
      <div style={{position:"absolute",bottom:44,display:"flex",gap:8,zIndex:10}}>
        {[0,1,2,3].map(i=>(<div key={i} style={{width:6,height:6,borderRadius:3,background:`${neon}22`,animation:`dotPulse 2.2s ease-in-out ${i*0.55}s infinite`}}/>))}
      </div>
    </div>
  );
}

// ── ICÔNES ANIMÉES ──
function IcoWin({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="14" stroke={neon} strokeWidth="1.2" fill={neon+"08"} style={{animation:"icoRadar 2s ease-out infinite",transformOrigin:"19px 19px"}}/><circle cx="19" cy="19" r="14" stroke={neon} strokeWidth="1.2" fill="none" opacity="0.25"/><polyline points="11.5,19.5 16,24.5 27,13" stroke={neon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" style={{animation:"icoCheck 0.5s ease 0.15s both"}}/></svg>);
}
function IcoLoss({size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="14" stroke="#ff4d4d" strokeWidth="1.2" fill="#ff4d4d08"/><line x1="12" y1="12" x2="26" y2="26" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="22" style={{animation:"icoX 0.3s ease 0.1s both"}}/><line x1="26" y1="12" x2="12" y2="26" stroke="#ff4d4d" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="22" style={{animation:"icoX 0.3s ease 0.25s both"}}/></svg>);
}
function IcoBE({size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="14" stroke="#f0b429" strokeWidth="1.2" fill="#f0b42908"/><line x1="11" y1="19" x2="27" y2="19" stroke="#f0b429" strokeWidth="2.2" strokeLinecap="round"/><line x1="11" y1="15" x2="19" y2="19" stroke="#f0b429" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/><line x1="19" y1="19" x2="27" y2="23" stroke="#f0b429" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/></svg>);
}
function IcoWarn({size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoBounce 1.4s ease-in-out infinite 0.4s"}}><path d="M19 7L34 31H4L19 7Z" stroke="#f0b429" strokeWidth="1.3" strokeLinejoin="round" fill="#f0b42910"/><line x1="19" y1="16" x2="19" y2="23" stroke="#f0b429" strokeWidth="2.2" strokeLinecap="round"/><circle cx="19" cy="27" r="1.5" fill="#f0b429"/></svg>);
}
function IcoBlock({size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoShake 0.55s ease 0.3s both"}}><circle cx="19" cy="19" r="14" stroke="#ff4d4d" strokeWidth="1.3" fill="#ff4d4d08"/><line x1="8" y1="8" x2="30" y2="30" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round"/></svg>);
}
function IcoTip({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="4.5" stroke="#00d4ff" strokeWidth="1.5" style={{animation:"icoPulse 2s ease-in-out infinite"}}/><g style={{animation:"icoSpin 7s linear infinite",transformOrigin:"19px 19px"}}><line x1="19" y1="4" x2="19" y2="8" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/><line x1="19" y1="30" x2="19" y2="34" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/><line x1="4" y1="19" x2="8" y2="19" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/><line x1="30" y1="19" x2="34" y2="19" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/></g></svg>);
}
function IcoFlame({size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><g style={{animation:"icoFlame 0.9s ease-in-out infinite",transformOrigin:"19px 34px"}}><path d="M19 5 C19 5 29 15 29 24 C29 31 24.5 37 19 38 C13.5 37 9 31 9 24 C9 15 19 5 19 5Z" stroke="#ff4d4d" strokeWidth="1.3" strokeLinejoin="round" fill="#ff4d4d0d"/></g><g style={{animation:"icoFlame2 0.7s ease-in-out infinite 0.1s",transformOrigin:"19px 34px"}}><path d="M19 15 C19 15 25 21 25 27 C25 31.5 22.5 35.5 19 37 C15.5 35.5 13 31.5 13 27 C13 21 19 15 19 15Z" fill="#f0b429" fillOpacity="0.25" stroke="#f0b429" strokeWidth="0.8" strokeLinejoin="round"/></g><g style={{animation:"icoFlame 0.6s ease-in-out infinite 0.2s",transformOrigin:"19px 35px"}}><path d="M19 24 C18 22 17 20 18 18 C19 20 21 21 19 28Z" fill="#f0b429" fillOpacity="0.6"/></g></svg>);
}
function IcoClock({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="13" stroke={neon} strokeWidth="1.2" fill={neon+"06"} opacity="0.7"/><line x1="19" y1="11" x2="19" y2="19" stroke={neon} strokeWidth="2" strokeLinecap="round" style={{animation:"icoClock 3s linear infinite",transformOrigin:"19px 19px"}}/><line x1="19" y1="19" x2="24.5" y2="22.5" stroke={neon} strokeWidth="1.5" strokeLinecap="round"/><circle cx="19" cy="19" r="1.8" fill={neon}/></svg>);
}
function IcoDiamond({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><g style={{animation:"icoDiamond 5s linear infinite",transformOrigin:"19px 19px"}}><polygon points="19,5 33,19 19,33 5,19" stroke={neon} strokeWidth="1.2" fill={neon+"0a"}/></g><polygon points="19,12 26,19 19,26 12,19" fill={neon} fillOpacity="0.3" style={{animation:"icoPulse 2s ease-in-out infinite"}}/></svg>);
}
function IcoHumeur({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><circle cx="19" cy="19" r="9" stroke={neon} strokeWidth="1.2" fill={neon+"08"} style={{animation:"icoHeartbeat 1.8s ease-in-out infinite 0.5s",transformOrigin:"19px 19px"}}/><circle cx="19" cy="19" r="4" fill={neon} fillOpacity="0.4" style={{animation:"icoPulse 1.8s ease-in-out infinite 0.5s",transformOrigin:"19px 19px"}}/><circle cx="19" cy="19" r="15" stroke={neon} strokeWidth="0.6" fill="none" style={{animation:"icoRadar 2.5s ease-out infinite",transformOrigin:"19px 19px"}}/></svg>);
}
function IcoActif({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true"><polyline points="4,28 10,20 16,24 22,14 28,18 34,8" stroke={neon} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" style={{animation:"icoDraw 1.2s ease 0.2s both"}}/><line x1="4" y1="32" x2="34" y2="32" stroke={neon} strokeWidth="0.8" opacity="0.2"/><circle cx="34" cy="8" r="2.5" fill={neon} fillOpacity="0.6" style={{animation:"icoPulse 1.5s ease-in-out infinite"}}/></svg>);
}
function IcoStar({neon,size=32}) {
  return (<svg width={size} height={size} viewBox="0 0 38 38" fill="none" aria-hidden="true" style={{animation:"icoPop 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both"}}><polygon points="19,5 22.5,14.5 33,14.5 24.5,20.5 27.5,31 19,25 10.5,31 13.5,20.5 5,14.5 15.5,14.5" stroke={neon} strokeWidth="1.2" strokeLinejoin="round" fill={neon+"12"}/></svg>);
}

function StatsInsightsModal({trades,lang,neon,onClose}) {
  const fr=lang==="fr";
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
  const daysFr=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  const daysEn=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const byDay={};
  trades.forEach(x=>{const d=new Date(x.date).getDay();if(!byDay[d])byDay[d]={w:0,t:0};byDay[d].t++;if(x.result==="WIN")byDay[d].w++;});
  const dayStats=Object.entries(byDay).filter(([,v])=>v.t>=2).map(([d,v])=>({day:(fr?daysFr:daysEn)[d],wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);
  const byAsset={};
  trades.forEach(x=>{if(!byAsset[x.asset])byAsset[x.asset]={w:0,t:0,pnl:0};byAsset[x.asset].t++;byAsset[x.asset].pnl+=parseFloat(x.pnlPct)||0;if(x.result==="WIN")byAsset[x.asset].w++;});
  const assetStats=Object.entries(byAsset).filter(([,v])=>v.t>=2).map(([a,v])=>({a,wr:Math.round(v.w/v.t*100),pnl:parseFloat(v.pnl.toFixed(1)),t:v.t})).sort((a,b)=>b.wr-a.wr);
  const byHour={};
  trades.filter(x=>x.time).forEach(x=>{const h=parseInt(x.time.split(":")[0]);const k=`${h}h`;if(!byHour[k])byHour[k]={w:0,t:0};byHour[k].t++;if(x.result==="WIN")byHour[k].w++;});
  const hourStats=Object.entries(byHour).filter(([,v])=>v.t>=2).map(([h,v])=>({h,wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);
  const byHumeur={};
  trades.filter(x=>x.checkin&&x.checkin.humeur).forEach(x=>{const h=x.checkin.humeur;if(!byHumeur[h])byHumeur[h]={w:0,t:0};byHumeur[h].t++;if(x.result==="WIN")byHumeur[h].w++;});
  const humeurStats=Object.entries(byHumeur).filter(([,v])=>v.t>=2).map(([h,v])=>({h,wr:Math.round(v.w/v.t*100),t:v.t})).sort((a,b)=>b.wr-a.wr);
  const highRejet=trades.filter(x=>x.rejetScore>=8);
  const lowRejet=trades.filter(x=>x.rejetScore>0&&x.rejetScore<8);
  const highRWR=highRejet.length?Math.round(highRejet.filter(x=>x.result==="WIN").length/highRejet.length*100):null;
  const lowRWR=lowRejet.length?Math.round(lowRejet.filter(x=>x.result==="WIN").length/lowRejet.length*100):null;
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
      <div className="slide-up glass-card" style={{borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",paddingBottom:40}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:neon,opacity:0.7,borderRadius:"20px 20px 0 0"}}/>
        <div style={{position:"sticky",top:0,background:"#0f0f18",padding:"16px 20px 12px",borderBottom:`1px solid ${neon}10`,zIndex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <IcoDiamond neon={neon} size={22}/>
              <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3}}>{fr?"RÉSUMÉ COMPLET":"FULL SUMMARY"}</div>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}55`,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontSize:10,color:`${neon}33`,marginTop:4,fontFamily:MONO}}>{trades.length} {fr?"trades analysés":"trades analyzed"}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"16px 20px 8px"}}>
          {[{l:"WIN RATE",v:`${wr}%`,c:wr>=50?neon:"#ff4d4d",delay:"0.05s"},{l:"P&L",v:fmtP(totalPnl),c:totalPnl>=0?neon:"#ff4d4d",delay:"0.12s"},{l:"TRADES",v:`${trades.length}`,c:neon,delay:"0.19s"}].map(({l,v,c,delay})=>(
            <div key={l} className="inner-card" style={{padding:"10px 0",textAlign:"center",animation:`kpiPop 0.5s cubic-bezier(0.34,1.56,0.64,1) ${delay} both`}}>
              <div style={{fontSize:8,color:`${neon}44`,fontFamily:MONO,letterSpacing:1,marginBottom:4}}>{l}</div>
              <div style={{fontSize:22,fontWeight:800,color:c,fontFamily:DISPLAY,letterSpacing:-1.5,lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{margin:"0 20px 14px",background:`${discC}08`,border:`1px solid ${discC}18`,borderRadius:10,padding:"12px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO,letterSpacing:2}}>DISCIPLINE</span>
            <span style={{fontSize:24,fontWeight:800,color:discC,fontFamily:DISPLAY,letterSpacing:-2}}>{disc}<span style={{fontSize:12,color:`${neon}33`,fontFamily:MONO,letterSpacing:0}}>/10</span></span>
          </div>
          {[{l:fr?"Conformité":"Compliance",v:confPct,c:neon,delay:"0.3s"},{l:fr?"Sans revenge":"No revenge",v:noRevPct,c:revs.length===0?neon:"#f0b429",delay:"0.5s"}].map(({l,v,c,delay})=>(
            <div key={l} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO}}>{l}</span>
                <span style={{fontSize:9,color:c,fontWeight:700,fontFamily:MONO}}>{v}%</span>
              </div>
              <div style={{height:3,background:`${neon}10`,borderRadius:2,overflow:"hidden"}}>
                <div style={{["--bar-w"]:`${v}%`,height:"100%",background:c,borderRadius:2,animation:`barFill 0.8s ease ${delay} both`}}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:10}}>
          {insights.map((ins,i)=>{
            const c=typeColor[ins.type];
            return (
              <div key={i} className="inner-card" style={{padding:"12px 14px",borderLeft:`3px solid ${c}`,display:"flex",gap:10,alignItems:"flex-start",animation:`fadeUp 0.35s ease ${0.1+i*0.08}s both`}}>
                <div style={{flexShrink:0,marginTop:2}}>{renderIcon(ins.icon,c,24)}</div>
                <p style={{fontSize:12,color:"#ffffff",lineHeight:1.7,fontFamily:MONO,margin:0}}>{ins.txt}</p>
              </div>
            );
          })}
        </div>
        <div style={{padding:"0 20px 16px",marginTop:4}}>
          <button onClick={()=>{
            const wr_=Math.round(trades.filter(x=>x.result==="WIN").length/trades.length*100);
            const pnl_=trades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0).toFixed(1);
            const text=`TrackMyTrade — ${trades.length} trades · ${wr_}% WR · ${pnl_>0?"+":""}${pnl_}% P&L`;
            if(navigator.share)navigator.share({text,url:"https://trackmytrade.app"}).catch(()=>{});
            else if(navigator.clipboard)navigator.clipboard.writeText(text);
          }} className="btn btn-neon-solid" style={{width:"100%",borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:MONO,letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:10}}>
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
  const fmtP = v => {
    if(v===undefined||v===null||v==="") return "—";
    const n=Number(v), a=Math.abs(n);
    return (n>=0?"+":"")+(a%1===0?a.toFixed(0):a.toFixed(1))+"%";
  };
  const rc2 = r => r==="WIN"?neon:r==="LOSS"?"#ff4d4d":"#f0b429";
  const isTrade = !!(trade && trade.asset);
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
  const insights = [];
  if(week.length>=3) {
    const nc = week.filter(x=>!x.conforming);
    const cWRv = wConf?Math.round(week.filter(x=>x.conforming&&x.result==="WIN").length/wConf*100):0;
    const ncWR = nc.length?Math.round(nc.filter(x=>x.result==="WIN").length/nc.length*100):0;
    if(wConf>=2&&nc.length>=2&&cWRv-ncWR>10) insights.push({c:neon, txt:fr?`Conformes : ${cWRv}% WR vs ${ncWR}% non-conformes`:`Compliant: ${cWRv}% WR vs ${ncWR}% non-compliant`});
    if(wRev>0) insights.push({c:"#ff4d4d", txt:fr?`${wRev} revenge trade${wRev>1?"s":""} — à corriger`:`${wRev} revenge trade${wRev>1?"s":""} — fix this`});
    else insights.push({c:neon, txt:fr?"Aucun revenge trade ✓":"No revenge trades ✓"});
  }
  const doShare = () => {
    try {
      const text = isTrade
        ? `${trade.result} · ${trade.asset} · ${fmtP(trade.pnlPct)} — TrackMyTrade`
        : fr ? `Semaine : ${wWR}% WR · ${fmtP(wPnl)} P&L · ${week.length} trades · Discipline ${disc}/10 — TrackMyTrade`
             : `Week: ${wWR}% WR · ${fmtP(wPnl)} P&L · ${week.length} trades · Discipline ${disc}/10 — TrackMyTrade`;
      if(navigator.share) navigator.share({text, url:"https://trackmytrade.app"}).catch(()=>{});
      else if(navigator.clipboard) navigator.clipboard.writeText(text);
    } catch(e) {}
  };
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
      <div className="slide-up glass-card" style={{width:"100%",maxWidth:360,borderRadius:20,overflow:"hidden",border:`1px solid ${neon}28`}} onClick={e=>e.stopPropagation()}>
        <div style={{height:4,background:`linear-gradient(90deg,${neon},${neon}55)`}}/>
        <div style={{padding:"18px 18px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO,letterSpacing:3}}>TRACKMYTRADE</span>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}44`,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
          </div>
          <div style={{fontSize:15,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3,marginBottom:3}}>{isTrade?(fr?"◈ RÉCAP TRADE":"◈ TRADE RECAP"):(fr?"◈ RÉSUMÉ SEMAINE":"◈ WEEKLY RECAP")}</div>
          <div style={{fontSize:9,color:`${neon}33`,fontFamily:MONO,marginBottom:14}}>{isTrade?`${trade.date||""}${trade.time?" · "+trade.time:""}`:fr?`7 derniers jours · ${week.length} trades`:`Last 7 days · ${week.length} trades`}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
            {(isTrade
              ? [{l:"RÉSULTAT",v:tResult,c:rc2(tResult)},{l:"P&L",v:tPnl,c:parseFloat(trade.pnlPct||0)>=0?neon:"#ff4d4d"},{l:"SCORE",v:tScore,c:tConforming?neon:"#ff4d4d"}]
              : [{l:"WIN RATE",v:`${wWR}%`,c:wWR>=50?neon:"#ff4d4d"},{l:"P&L",v:fmtP(wPnl),c:wPnl>=0?neon:"#ff4d4d"},{l:"TRADES",v:`${week.length}`,c:neon}]
            ).map(({l,v,c},i)=>(
              <div key={i} className="inner-card" style={{padding:"10px 0",textAlign:"center"}}>
                <div style={{fontSize:8,color:`${neon}44`,fontFamily:MONO,letterSpacing:1,marginBottom:4}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:c,fontFamily:DISPLAY,letterSpacing:-1,lineHeight:1}}>{v}</div>
              </div>
            ))}
          </div>
          {isTrade&&(
            <div style={{background:`${rc2(tResult)}08`,border:`1px solid ${rc2(tResult)}20`,borderRadius:10,padding:"12px 14px",marginBottom:10,borderLeft:`3px solid ${rc2(tResult)}`}}>
              <div style={{fontSize:15,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.3,marginBottom:8}}>{tAsset} · {tDir}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:tNotes?8:0}}>
                <span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:tConforming?`${neon}14`:"rgba(255,77,77,0.1)",color:tConforming?neon:"#ff4d4d",fontFamily:MONO}}>{tConforming?(fr?"✓ conforme":"✓ compliant"):(fr?"✗ non-conforme":"✗ non-compliant")}</span>
                {tRevenge&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"rgba(255,77,77,0.1)",color:"#ff4d4d",fontFamily:MONO}}>REVENGE</span>}
                {tRejet>0&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:`${neon}0a`,color:`${neon}77`,fontFamily:MONO}}>Rejet {tRejet}/10</span>}
                {tHumeur&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:`${neon}08`,color:`${neon}66`,fontFamily:MONO}}>{tHumeur}</span>}
              </div>
              {tNotes&&<div style={{fontSize:11,color:`${neon}55`,fontStyle:"italic",lineHeight:1.5,fontFamily:MONO}}>"{tNotes.length>80?tNotes.slice(0,80)+"…":tNotes}"</div>}
            </div>
          )}
          {isTrade&&configItems.length>0&&(
            <div className="inner-card" style={{padding:"10px 12px",marginBottom:10}}>
              {configItems.slice(0,7).map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:i<Math.min(configItems.length,7)-1?`1px solid ${neon}08`:"none"}}>
                  <span style={{fontSize:11,color:tChecklist.includes(i)?neon:"#ffffff44",flexShrink:0}}>{tChecklist.includes(i)?"✓":"✗"}</span>
                  <span style={{fontSize:10,color:tChecklist.includes(i)?"#ffffff":"#ffffffaa",fontFamily:MONO}}>{item}</span>
                </div>
              ))}
            </div>
          )}
          {!isTrade&&(
            <div style={{background:`${discC}08`,border:`1px solid ${discC}18`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO,letterSpacing:2}}>DISCIPLINE</span>
                <span style={{fontSize:24,fontWeight:800,color:discC,fontFamily:DISPLAY,letterSpacing:-2}}>{disc}<span style={{fontSize:12,color:`${neon}33`,fontFamily:MONO,letterSpacing:0}}>/10</span></span>
              </div>
              {[{l:fr?"Conformité":"Compliance",v:confPct,c:neon},{l:fr?"Sans revenge":"No revenge",v:noRevPct,c:wRev===0?neon:"#f0b429"}].map(({l,v,c})=>(
                <div key={l} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO}}>{l}</span>
                    <span style={{fontSize:9,color:c,fontWeight:700,fontFamily:MONO}}>{v}%</span>
                  </div>
                  <div style={{height:3,background:`${neon}10`,borderRadius:2}}><div style={{width:`${v}%`,height:"100%",background:c,borderRadius:2}}/></div>
                </div>
              ))}
            </div>
          )}
          {!isTrade&&insights.map((ins,i)=>(
            <div key={i} className="inner-card" style={{padding:"9px 12px",marginBottom:6,borderLeft:`3px solid ${ins.c}`}}>
              <span style={{fontSize:11,color:"#ffffff",fontFamily:MONO,lineHeight:1.5}}>{ins.txt}</span>
            </div>
          ))}
          <div style={{textAlign:"center",padding:"10px 0 4px"}}><span style={{fontSize:8,color:`${neon}18`,fontFamily:MONO,letterSpacing:2}}>trackmytrade.app</span></div>
        </div>
        <div style={{padding:"0 18px 18px"}}>
          <button onClick={doShare} className="btn btn-neon-solid" style={{width:"100%",marginTop:12,borderRadius:10,padding:"13px 0",fontSize:12,fontWeight:700,fontFamily:MONO,letterSpacing:2,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
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
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><polygon points="12,2 22,12 12,22 2,12" fill={`${neon}22`} stroke={neon} strokeWidth="1.5" strokeLinejoin="round"/><polygon points="12,7 17,12 12,17 7,12" fill={neon} style={{filter:`drop-shadow(0 0 7px ${neon})`}}/></svg>
      </div>
      <div style={{animation:"slideFromRight 0.7s cubic-bezier(0.34,1.3,0.64,1) both"}}>
        <div style={{fontSize:28,fontWeight:900,letterSpacing:-1.5,lineHeight:1,whiteSpace:"nowrap",textShadow:`0 0 40px ${neon}44`,fontFamily:"'Inter',sans-serif"}}>
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
      for(let r=0;r<=rows;r++){for(let c=0;c<=cols;c++){const cx=c*cw,cy=r*rh;const dist=Math.hypot(cx-W/2,cy-H/2)/150;const wave=Math.sin(t*1.5-dist*4.5)*0.5+0.5;const op=wave*(1-Math.min(1,dist*0.75))*0.45;if(op>0.02){ctx.beginPath();ctx.arc(cx,cy,1.3,0,Math.PI*2);ctx.fillStyle=`${neon}${Math.round(op*255).toString(16).padStart(2,"0")}`;ctx.fill();}if(r<rows&&c<cols){const lineOp=wave*(1-Math.min(1,dist*0.85))*0.15;if(lineOp>0.01){ctx.strokeStyle=`${neon}${Math.round(lineOp*255).toString(16).padStart(2,"0")}`;ctx.lineWidth=0.4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+cw,cy);ctx.stroke();ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+rh);ctx.stroke();}}}}
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
    {visual:(<div style={{position:"relative",width:"100%",height:240,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 70% 55% at 50% 50%,${neon}10,transparent 68%)`,pointerEvents:"none"}}/><GridBackground neon={neon} height={240}/><div style={{position:"relative",zIndex:2}}><SplashLogo neon={neon}/></div></div>),title:t.welcome,desc:t.welcomeDesc,cta:t.discover},
    {visual:(<div style={{position:"relative",width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><GridBackground neon={neon} height={220}/><div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",gap:8,maxWidth:280,width:"100%",padding:"0 10px"}}>{[["HA M5 claire",true],["MM20 orientée",true],["BB approche",true],["Rejet propre",false]].map(([item,ok],i)=>(<div key={i} className="fu" style={{background:ok?`${neon}0d`:"rgba(255,77,77,0.06)",border:`1px solid ${ok?neon+"30":"rgba(255,77,77,0.2)"}`,borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,color:ok?neon:"#ff4d4d",fontFamily:MONO,animationDelay:`${i*0.08}s`,display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:14,flexShrink:0,color:ok?neon:"#ff4d4d"}}>{ok?"✓":"✗"}</span><span style={{color:"#ffffff"}}>{item}</span></div>))}</div></div>),title:t.checklist,desc:t.checklistDesc,cta:t.next},
    {visual:(<div style={{position:"relative",width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}><GridBackground neon={neon} height={220}/><div style={{position:"relative",zIndex:2,maxWidth:280,width:"100%",padding:"0 10px"}}><div style={{display:"flex",gap:10,marginBottom:10}}>{[["WIN RATE","73%"],["P&L","+4.2%"]].map(([l,v])=>(<div key={l} className="glass-card" style={{flex:1,padding:"14px 12px",textAlign:"center"}}><div style={{fontSize:26,fontWeight:900,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-2,lineHeight:1,textShadow:`0 0 20px ${neon}55`}}>{v}</div><div style={{fontSize:9,color:"#ffffffaa",marginTop:6,letterSpacing:2,textTransform:"uppercase",fontFamily:MONO}}>{l}</div></div>))}</div><div className="glass-card" style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:9,color:"#ffffffaa",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>CONFORMITÉ</div><div style={{height:3,width:140,background:"#ffffff10",borderRadius:2,overflow:"hidden"}}><div style={{width:"73%",height:"100%",background:`linear-gradient(90deg,${neon}66,${neon})`,borderRadius:2,boxShadow:`0 0 8px ${neon}55`}}/></div></div><div style={{fontSize:20,fontWeight:900,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-1.5,textShadow:`0 0 20px ${neon}55`}}>73%</div></div></div></div>),title:t.measure,desc:t.measureDesc,cta:t.start},
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
          <div style={{fontSize:24,fontWeight:700,color:neon,whiteSpace:"pre-line",lineHeight:1.25,marginBottom:12,fontFamily:DISPLAY,letterSpacing:-1,textShadow:`0 0 30px ${neon}99`}}>{s.title}</div>
          <div style={{fontSize:13,color:"#ffffffaa",lineHeight:1.8,maxWidth:300,margin:"0 auto",fontFamily:MONO}}>{s.desc}</div>
        </div>
        <button onClick={()=>step<slides.length-1?setStep(step+1):onDone(lang)} className="btn btn-neon-solid" style={{width:"100%",maxWidth:300,borderRadius:12,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:12,letterSpacing:1}}>{s.cta}</button>
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
    if(step===1) return <div><div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>{allAssets.map(a=><button key={a} onClick={()=>setSelAssets(p=>p.includes(a)?p.filter(x=>x!==a):[...p,a])} className="btn" style={{background:selAssets.includes(a)?`${neon}26`:"transparent",border:`1px solid ${selAssets.includes(a)?neon:`${neon}22`}`,color:selAssets.includes(a)?neon:"#ffffffaa",borderRadius:8,padding:"9px 14px",fontSize:12,fontWeight:700,fontFamily:MONO}}>{a}</button>)}</div><div style={{display:"flex",gap:8}}><input value={customAsset} onChange={e=>setCustomAsset(e.target.value)} placeholder={t.customAsset} onKeyDown={e=>{if(e.key==="Enter"&&customAsset.trim()){setSelAssets(p=>[...p,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>{if(customAsset.trim()){setSelAssets(p=>[...p,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:"0 16px",fontSize:18}}>+</button></div></div>;
    if(step===2) return <div>{criteria.map((c,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:8}}><input value={c} onChange={e=>{const n=[...criteria];n[i]=e.target.value;setCriteria(n);}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>setCriteria(criteria.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",cursor:"pointer"}}>✕</button></div>)}<div style={{display:"flex",gap:8}}><input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={lang==="fr"?"Ajouter…":"Add…"} onKeyDown={e=>{if(e.key==="Enter"&&newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} style={{...inSt,marginBottom:0,flex:1}}/><button onClick={()=>{if(newItem.trim()){setCriteria([...criteria,newItem.trim()]);setNewItem("");}}} className="btn" style={{background:`${neon}1a`,border:`1px solid ${neon}55`,color:neon,borderRadius:8,padding:"0 16px",fontSize:18}}>+</button></div></div>;
    return <div><div style={{display:"flex",gap:8,marginBottom:20}}>{Array.from({length:Math.min(7,criteria.length-1)},(_,i)=>i+2).map(n=><button key={n} onClick={()=>setThreshold(n)} className="btn" style={{flex:1,padding:"12px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:threshold===n?`${neon}33`:"transparent",border:`1px solid ${threshold===n?neon:`${neon}22`}`,color:threshold===n?neon:"#ffffffaa"}}>{n}</button>)}</div><div className="inner-card" style={{padding:16}}><div style={{fontSize:12,color:neon,marginBottom:4,fontFamily:MONO}}>✓ {threshold}/{criteria.length}</div><div style={{fontSize:10,color:"#ffffff44",fontFamily:MONO}}>{threshold/criteria.length>=0.875?`↑ ${t.highStd}`:threshold/criteria.length>=0.6?`· ${t.balanced}`:`↓ ${t.lowStd}`}</div></div></div>;
  };
  return (
    <div style={{background:"#0c0c12",minHeight:"100vh",fontFamily:MONO,maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <CSS neon={neon}/>
      <div style={{padding:"24px 24px 16px",borderBottom:`1px solid ${neon}14`}}><SplashLogo neon={neon}/><div style={{marginTop:20}}><Dots total={TOTAL} current={step} neon={neon}/></div></div>
      <div style={{flex:1,padding:"28px 24px",overflow:"auto"}}>
        <div className="fu" key={step}>
          <div style={{fontSize:9,color:"#ffffff44",letterSpacing:3,marginBottom:6,fontFamily:MONO}}>{t.step} 0{step+1} / 04</div>
          <div style={{fontSize:22,fontWeight:700,color:neon,marginBottom:8,lineHeight:1.2,fontFamily:DISPLAY,letterSpacing:-1}}>{titles[step]}</div>
          <div style={{fontSize:13,color:"#ffffffaa",marginBottom:24,lineHeight:1.7,fontFamily:MONO}}>{descs[step]}</div>
          {renderContent()}
        </div>
      </div>
      <div style={{padding:"16px 24px 36px",borderTop:`1px solid ${neon}14`}}>
        <button onClick={()=>canNext&&(step<TOTAL-1?setStep(step+1):launch())} className={`btn${canNext?" btn-neon-solid":""}`} style={{width:"100%",background:canNext?undefined:`${neon}06`,border:canNext?undefined:`1px solid ${neon}18`,color:canNext?undefined:"#ffffff44",borderRadius:12,padding:16,fontSize:14,fontWeight:700,fontFamily:MONO,marginBottom:12}}>{step===TOTAL-1?t.launch:t.continue}</button>
        {step>0&&<button onClick={()=>setStep(step-1)} className="btn" style={{width:"100%",background:"transparent",border:"none",color:"#ffffff44",fontSize:12,fontFamily:MONO}}>{t.prevStep}</button>}
      </div>
    </div>
  );
}

function SettingsView({config,onSave,onLogout,onReset,onNewPhase,lang,onLangChange,neon,phases,onObjectifChange,onImport}) {
  const t=T[lang];const inSt=mkInput(neon);
  const [items,setItems]=useState([...config.items]);const [threshold,setThreshold]=useState(config.threshold);
  const [stratName,setStratName]=useState(config.strategyName||"");const [maxTrades,setMaxTrades]=useState(config.maxTrades||1);
  const [neonColor,setNeonColor]=useState(neon);const [calendarOn,setCalendarOn]=useState(config.calendarOn!==false);
  const [notifOn,setNotifOn]=useState(config.notifOn!==false);const [customAsset,setCustomAsset]=useState("");
  const [assets,setAssets]=useState(config.customAssets||PRESET_ASSETS);
  const [savedOk,setSavedOk]=useState(false);const [phaseConfirm,setPhaseConfirm]=useState(false);
  const [newPhaseName,setNewPhaseName]=useState("");
  const [phaseName,setPhaseName]=useState(config.phaseName||"");
  const [objPnl,setObjPnl]=useState(config.objPnl||"");
  const [objWr,setObjWr]=useState(config.objWr||"");
  const [objTrades,setObjTrades]=useState(config.objTrades||"");const [eliminatoires,setEliminatoires]=useState(config.eliminatoires||[]);
  const [capital,setCapital]=useState(config.capital||"");
  const [devise,setDevise]=useState(config.devise||"€");
  const [accountType,setAccountType]=useState(config.accountType||"perso");
  const [objDrawdown,setObjDrawdown]=useState(config.objDrawdown||"");
  const save=()=>{const savedObj={pnl:objPnl,wr:"",trades:"",drawdown:objDrawdown,editMode:false};
    onSave({items,threshold,strategyName:stratName,maxTrades,neonColor,calendarOn,notifOn,customAssets:assets,eliminatoires,objPnl,phaseName,capital,devise,accountType,objDrawdown});
    onObjectifChange(savedObj);setSavedOk(true);setTimeout(()=>setSavedOk(false),2000);};
  const Toggle=({label,val,set})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${neonColor}0d`}}>
      <span style={{fontSize:12,color:"#ffffff",fontFamily:MONO}}>{label}</span>
      <button onClick={()=>set(!val)} className="btn" style={{width:44,height:24,borderRadius:12,background:val?`${neonColor}33`:"#ffffff12",border:`1px solid ${val?neonColor:`${neonColor}30`}`,position:"relative",transition:"all 0.2s"}}>
        <div style={{width:16,height:16,borderRadius:"50%",background:val?neonColor:"#ffffffaa",position:"absolute",top:3,left:val?24:4,transition:"all 0.2s"}}/>
      </button>
    </div>
  );
  return (
    <div className="fi" style={{padding:20}}>
      <div className="glass-card" style={{padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.langLabel}</div>
        <div style={{display:"flex",gap:8}}>{[["fr","Français"],["en","English"]].map(([l,label])=><button key={l} onClick={()=>onLangChange(l)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:lang===l?`${neonColor}26`:"transparent",border:`1px solid ${lang===l?neonColor:`${neonColor}22`}`,color:lang===l?neonColor:"#ffffffbb"}}>{label}</button>)}</div>
      </div>
      <div className="glass-card" style={{padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.colorLabel}</div>
        <div style={{display:"flex",gap:8}}>{NEON_COLORS.map(c=><button key={c.value} onClick={()=>setNeonColor(c.value)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,background:neonColor===c.value?`${c.value}26`:"transparent",border:`2px solid ${neonColor===c.value?c.value:"transparent"}`,cursor:"pointer"}}><div style={{width:16,height:16,borderRadius:"50%",background:c.value,margin:"0 auto",boxShadow:neonColor===c.value?`0 0 8px ${c.value}`:"none"}}/></button>)}</div>
      </div>
      <div className="glass-card" style={{padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.maxTradesLabel}</div>
        <div style={{display:"flex",gap:6}}>
          {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setMaxTrades(n)} className="btn" style={{flex:1,padding:"10px 0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:MONO,background:maxTrades===n?`${neonColor}26`:"transparent",border:`1px solid ${maxTrades===n?neonColor:`${neonColor}22`}`,color:maxTrades===n?neonColor:"#ffffffbb"}}>{n}</button>)}
          <button onClick={()=>setMaxTrades(0)} className="btn" style={{flex:1.4,padding:"10px 0",borderRadius:8,fontSize:12,fontWeight:700,fontFamily:MONO,background:maxTrades===0?`${neonColor}26`:"transparent",border:`1px solid ${maxTrades===0?neonColor:`${neonColor}22`}`,color:maxTrades===0?neonColor:"#ffffffaa"}}>∞</button>
        </div>
      </div>
      <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>ACTIFS</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        {assets.map(a=><div key={a} className="inner-card" style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px"}}>
          <span style={{fontSize:11,color:"#ffffff",fontFamily:MONO}}>{a}</span>
          {!PRESET_ASSETS.includes(a)&&<button onClick={()=>setAssets(assets.filter(x=>x!==a))} style={{background:"transparent",border:"none",color:"#ff4d4d",fontSize:10,cursor:"pointer"}}>✕</button>}
        </div>)}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <input value={customAsset} onChange={e=>setCustomAsset(e.target.value)} placeholder={t.customAsset} onKeyDown={e=>{if(e.key==="Enter"&&customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} style={{...inSt,marginBottom:0,flex:1}}/>
        <button onClick={()=>{if(customAsset.trim()){setAssets([...assets,customAsset.trim().toUpperCase()]);setCustomAsset("");}}} className="btn" style={{background:`${neonColor}1a`,border:`1px solid ${neonColor}55`,color:neonColor,borderRadius:8,padding:"0 14px",fontSize:18}}>+</button>
      </div>
      <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.strategyName}</div>
      <input value={stratName} onChange={e=>setStratName(e.target.value)} style={inSt}/>
      <div style={{fontSize:9,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.thresholdLabel}</div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[4,5,6,7,8].map(n=><button key={n} onClick={()=>setThreshold(n)} className="btn" style={{flex:1,padding:8,borderRadius:8,fontSize:13,fontWeight:700,fontFamily:MONO,background:threshold===n?`${neonColor}33`:"transparent",border:`1px solid ${threshold===n?neonColor:`${neonColor}22`}`,color:threshold===n?neonColor:"#ffffffbb"}}>{n}</button>)}
      </div>
      <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.criteriaLabel} ({items.length})</div>
      {items.map((item,i)=>{
        const isE=(eliminatoires||[]).includes(i);
        return <div key={i} style={{display:"flex",gap:6,marginBottom:8,alignItems:"center"}}>
          <input value={item} onChange={e=>{const n=[...items];n[i]=e.target.value;setItems(n);}} style={{...inSt,marginBottom:0,flex:1}}/>
          <button onClick={()=>setEliminatoires(p=>isE?p.filter(x=>x!==i):[...p,i])} title={isE?"Retirer éliminatoire":"Marquer éliminatoire"} style={{background:isE?"rgba(255,77,77,0.15)":"transparent",border:`1px solid ${isE?"#ff4d4d":"rgba(255,77,77,0.25)"}`,color:isE?"#ff4d4d":"#ffffff44",borderRadius:6,padding:"6px 8px",cursor:"pointer",fontSize:10,fontWeight:700,flexShrink:0}}>⚡</button>
          <button onClick={()=>setItems(items.filter((_,idx)=>idx!==i))} style={{background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d",borderRadius:6,padding:"8px 10px",cursor:"pointer",flexShrink:0}}>✕</button>
        </div>;
      })}
      <button onClick={()=>setItems([...items,""])} style={{width:"100%",background:"transparent",border:`1px dashed ${neon}35`,color:"#ffffff44",borderRadius:8,padding:10,fontSize:12,cursor:"pointer",fontFamily:MONO,marginBottom:16}}>{t.addCriteria}</button>
      <div className="glass-card" style={{padding:14,marginBottom:16}}>
        <Toggle label={t.calendarToggle} val={calendarOn} set={setCalendarOn}/>
        <Toggle label={t.enableNotif} val={notifOn} set={setNotifOn}/>
      </div>
      <div className="glass-card" style={{padding:14,marginBottom:14}}>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:12,fontFamily:MONO}}>PHASE EN COURS</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4,fontFamily:MONO}}>{lang==="fr"?"NOM DE LA PHASE":"PHASE NAME"}</div>
          <input value={phaseName} onChange={e=>setPhaseName(e.target.value)} placeholder={lang==="fr"?"ex: FTMO 1ère étape…":"e.g. FTMO Step 1…"} style={{...inSt,fontSize:12,marginBottom:0}}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4,fontFamily:MONO}}>TYPE DE COMPTE</div>
          <div style={{display:"flex",gap:6}}>
            {[["prop","Prop Firm"],["perso","Perso"],["demo","Démo"]].map(([v,l])=>(
              <button key={v} onClick={()=>setAccountType(v)} className="btn" style={{flex:1,padding:"9px 0",background:accountType===v?`${neonColor}18`:"transparent",border:`1px solid ${accountType===v?neonColor:`${neonColor}22`}`,borderRadius:8,fontSize:10,fontWeight:700,color:accountType===v?neonColor:"#ffffffaa",fontFamily:MONO}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{flex:2}}>
            <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4,fontFamily:MONO}}>CAPITAL</div>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)} placeholder="10000" style={{...inSt,marginBottom:0}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4,fontFamily:MONO}}>DEVISE</div>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {["€","$","£","CHF"].map(d=>(
                <button key={d} onClick={()=>setDevise(d)} className="btn" style={{padding:"5px 0",background:devise===d?`${neonColor}18`:"transparent",border:`1px solid ${devise===d?neonColor:`${neonColor}22`}`,borderRadius:6,fontSize:11,fontWeight:800,color:devise===d?neonColor:"#ffffffaa",fontFamily:MONO}}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ff4d4d88",marginBottom:4,fontFamily:MONO}}>DRAWDOWN MAX %</div>
            <input type="number" value={objDrawdown} onChange={e=>setObjDrawdown(e.target.value)} placeholder="5" style={{...inSt,marginBottom:0,borderColor:"#ff4d4d33"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",marginBottom:4,fontFamily:MONO}}>{lang==="fr"?"OBJECTIF P&L %":"P&L TARGET %"}</div>
            <input type="number" value={objPnl} onChange={e=>setObjPnl(e.target.value)} placeholder="+10" style={{...inSt,marginBottom:0}}/>
          </div>
        </div>
      </div>
      <button onClick={save} className="btn btn-neon-solid" style={{width:"100%",borderRadius:10,padding:14,fontSize:13,fontWeight:700,fontFamily:MONO,marginBottom:10}}>{savedOk?t.savedOk:t.saveBtn}</button>
      <div style={{height:1,background:`${neon}14`,margin:"14px 0"}}/>
      {!phaseConfirm?(
        <button onClick={()=>setPhaseConfirm(true)} className="btn" style={{width:"100%",background:`${neon}0a`,border:`1px solid ${neon}28`,color:neon,borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:10}}>{t.newPhaseBtn}</button>
      ):(
        <div className="inner-card" style={{padding:14,marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3,marginBottom:4}}>{t.newPhaseConfirmQ}</div>
          <div style={{fontSize:11,color:"#ffffffaa",marginBottom:10,lineHeight:1.5,fontFamily:MONO}}>{t.newPhaseDesc}</div>
          <input value={newPhaseName} onChange={e=>setNewPhaseName(e.target.value)}
            placeholder={lang==="fr"?"Nom de cette phase (ex: FTMO Step 1)…":"Phase name (e.g. FTMO Step 1)…"}
            style={{...inSt,marginBottom:10,fontSize:12}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{onNewPhase(newPhaseName);setPhaseConfirm(false);setNewPhaseName("");}} className="btn btn-neon-solid" style={{flex:2,borderRadius:8,padding:"10px 0",fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.newPhaseConfirmBtn}</button>
            <button onClick={()=>{setPhaseConfirm(false);setNewPhaseName("");}} className="btn" style={{flex:1,background:"transparent",border:`1px solid ${neon}26`,color:"#ffffffaa",borderRadius:8,padding:"10px 0",fontSize:11,fontFamily:MONO}}>{t.cancelBtn}</button>
          </div>
        </div>
      )}
      <div style={{height:1,background:"rgba(255,77,77,0.1)",margin:"6px 0 10px"}}/>
      <button onClick={onReset} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:12,fontFamily:MONO,marginBottom:10}}>{t.resetBtn}</button>
      <button onClick={onLogout} className="btn" style={{width:"100%",background:"transparent",border:"1px solid rgba(255,77,77,0.1)",color:"#ff4d4d88",borderRadius:10,padding:12,fontSize:11,fontFamily:MONO}}>{t.logout}</button>
    </div>
  );
}

function InAppBanner({notifs, onDismiss, neon}) {
  if(!notifs||!notifs.length) return null;
  const n = notifs[0];
  const colors = {info: neon, warn: "#f0b429", danger: "#ff4d4d", success: neon};
  const c = colors[n.type] || neon;
  return (
    <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,zIndex:600,padding:"8px 12px",pointerEvents:"none"}}>
      <div className="slide-up inner-card" style={{background:`${c}12`,border:`1px solid ${c}35`,borderLeft:`3px solid ${c}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:10,pointerEvents:"all"}}>
        <span style={{fontSize:16,flexShrink:0}}>{n.emoji||"◈"}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:c,fontFamily:DISPLAY,letterSpacing:-0.2,marginBottom:2}}>{n.title}</div>
          <div style={{fontSize:10,color:`${c}88`,fontFamily:MONO,lineHeight:1.5}}>{n.body}</div>
        </div>
        <button onClick={onDismiss} style={{background:"transparent",border:"none",color:`${c}55`,fontSize:16,cursor:"pointer",flexShrink:0,marginTop:-2}}>✕</button>
      </div>
    </div>
  );
}

function ImportCSVModal({onImport, onClose, lang, neon, config}) {
  const fr = lang === "fr";
  const [step, setStep] = useState("upload");
  const [parsed, setParsed] = useState([]);
  const [error, setError] = useState(null);
  const [platform, setPlatform] = useState(null);
  const fileRef = useRef();
  const detectFormat = (headers) => {
    const h = headers.map(x=>(x||"").toLowerCase().trim());
    if(h.some(x=>x.includes("ticket")||x.includes("magic"))) return "mt4";
    if(h.some(x=>x.includes("deal")||x.includes("entry reason"))) return "mt5";
    if(h.some(x=>x.includes("position id")||x.includes("direction"))) return "ctrader";
    return "generic";
  };
  const parseMT4=(rows,headers)=>rows.filter(r=>r.length>5).map(r=>{const get=(keys)=>{for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return(r[i]||"").trim();}return"";};const profit=parseFloat(get(["profit","pnl"]))||0;const type=get(["type","action"]).toUpperCase();const sym=get(["symbol","instrument","pair"]);const openTime=get(["open time","opentime","open"]);const date=openTime?openTime.split(" ")[0].replace(/\./g,"-"):"";const time=openTime?(openTime.split(" ")[1]||"").slice(0,5):"";if(!sym||!date)return null;const dir=type.includes("BUY")||type==="0"?"BUY":"SELL";const result=profit>0?"WIN":profit<0?"LOSS":"BE";return{id:Date.now()+Math.random(),date,time,asset:sym,direction:dir,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:"Import MT4"};}).filter(Boolean);
  const parseMT5=(rows,headers)=>rows.filter(r=>r.length>5).map(r=>{const get=(keys)=>{for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return(r[i]||"").trim();}return"";};const profit=parseFloat(get(["profit","commission","balance"]))||0;const type=get(["type","action","deal type"]).toUpperCase();const sym=get(["symbol","instrument"]);const time=get(["time","open time","deal time"]);const date=time?time.split(" ")[0].replace(/\./g,"-"):"";const timeStr=time?(time.split(" ")[1]||"").slice(0,5):"";if(!sym||!date)return null;const dir=type.includes("BUY")||type==="IN"?"BUY":"SELL";const result=profit>0?"WIN":profit<0?"LOSS":"BE";return{id:Date.now()+Math.random(),date,time:timeStr,asset:sym,direction:dir,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:"Import MT5"};}).filter(Boolean);
  const parseCTrader=(rows,headers)=>rows.filter(r=>r.length>5).map(r=>{const get=(keys)=>{for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return(r[i]||"").trim();}return"";};const profit=parseFloat(get(["net profit","profit","pnl","gain"]))||0;const dir=get(["direction","trade side","type"]).toUpperCase();const sym=get(["symbol","instrument"]);const openTime=get(["open time","entry time","time"]);const date=openTime?openTime.split("T")[0].split(" ")[0]:"";const timeStr=openTime?(openTime.split("T")[1]||openTime.split(" ")[1]||"").slice(0,5):"";if(!sym||!date)return null;const direction=dir.includes("BUY")?"BUY":"SELL";const result=profit>0?"WIN":profit<0?"LOSS":"BE";return{id:Date.now()+Math.random(),date,time:timeStr,asset:sym,direction,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:"Import cTrader"};}).filter(Boolean);
  const parseGeneric=(rows,headers)=>rows.filter(r=>r.length>=4).map(r=>{const get=(keys)=>{for(const k of keys){const i=headers.findIndex(h=>h.toLowerCase().includes(k));if(i>=0)return(r[i]||"").trim();}return"";};const profit=parseFloat(get(["profit","pnl","gain","return","%"]))||0;const sym=get(["symbol","instrument","asset","pair","market"])||"UNKNOWN";const dir=get(["direction","side","type","action"]).toUpperCase();const date=get(["date","time","open"]).split(" ")[0].replace(/\./g,"-")||new Date().toISOString().split("T")[0];const direction=dir.includes("BUY")||dir==="LONG"?"BUY":"SELL";const result=profit>0?"WIN":profit<0?"LOSS":"BE";return{id:Date.now()+Math.random(),date,time:"",asset:sym,direction,result,pnlPct:profit.toFixed(2),setupScore:0,checklistMax:config.items?.length||7,checklist:[],conforming:false,isRevenge:false,notes:"Import CSV"};}).filter(Boolean);
  const handleFile=(file)=>{
    if(!file)return;setError(null);
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{const text=e.target.result;const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2){setError(fr?"Fichier vide ou invalide":"Empty or invalid file");return;}const sep=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";const headers=lines[0].split(sep).map(h=>h.replace(/["\']/g,"").trim());const rows=lines.slice(1).map(l=>l.split(sep).map(c=>c.replace(/["\']/g,"").trim()));const fmt=detectFormat(headers);setPlatform(fmt);let trades=[];if(fmt==="mt4")trades=parseMT4(rows,headers);else if(fmt==="mt5")trades=parseMT5(rows,headers);else if(fmt==="ctrader")trades=parseCTrader(rows,headers);else trades=parseGeneric(rows,headers);if(!trades.length){setError(fr?"Aucun trade valide trouvé":"No valid trades found");return;}setParsed(trades);setStep("preview");}catch(err){setError(`Erreur: ${err.message}`);}
    };reader.readAsText(file);
  };
  const platformLabel={mt4:"MetaTrader 4",mt5:"MetaTrader 5",ctrader:"cTrader",generic:"Format générique",unknown:"Format inconnu"};
  const platformColor={mt4:neon,mt5:neon,ctrader:"#00d4ff",generic:"#f0b429",unknown:"#ff4d4d"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div className="slide-up glass-card" style={{borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",paddingBottom:32}} onClick={e=>e.stopPropagation()}>
        <div style={{height:3,background:neon,opacity:0.7}}/>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${neon}10`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3}}>{fr?"◈ IMPORT CSV":"◈ CSV IMPORT"}</div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:`${neon}44`,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{fontSize:9,color:`${neon}33`,marginTop:3,fontFamily:MONO}}>MT4 · MT5 · cTrader · Format générique</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          {step==="upload"&&(
            <>
              <div style={{fontSize:11,color:"#ffffffaa",lineHeight:1.7,marginBottom:16,fontFamily:MONO}}>{fr?"Exporte ton historique depuis ta plateforme (Rapports → Historique) et importe le fichier CSV ou TSV ici.":"Export your history from your platform (Reports → History) and import the CSV or TSV file here."}</div>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e=>handleFile(e.target.files[0])} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} className="btn" style={{width:"100%",background:`${neon}0d`,border:`2px dashed ${neon}30`,borderRadius:12,padding:"24px 0",color:neon,fontSize:12,fontWeight:700,fontFamily:MONO,letterSpacing:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {fr?"Choisir un fichier CSV":"Choose a CSV file"}
              </button>
              {error&&<div style={{marginTop:12,background:"rgba(255,77,77,0.08)",border:"1px solid rgba(255,77,77,0.2)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#ff4d4d",fontFamily:MONO}}>{error}</div>}
            </>
          )}
          {step==="preview"&&(
            <>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:`${platformColor[platform]||neon}14`,color:platformColor[platform]||neon,fontFamily:MONO,fontWeight:700,border:`1px solid ${platformColor[platform]||neon}28`}}>{platformLabel[platform]||"Inconnu"} ✓</span>
                <span style={{fontSize:10,color:`${neon}55`,fontFamily:MONO}}>{parsed.length} {fr?"trades détectés":"trades detected"}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16,maxHeight:280,overflowY:"auto"}}>
                {parsed.slice(0,8).map((t,i)=>(
                  <div key={i} className="inner-card" style={{padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderLeft:`2px solid ${t.result==="WIN"?neon:"#ff4d4d"}`}}>
                    <div><div style={{fontSize:11,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY}}>{t.asset} · {t.direction}</div><div style={{fontSize:9,color:`${neon}44`,fontFamily:MONO}}>{t.date}{t.time?" · "+t.time:""}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:700,color:t.result==="WIN"?neon:"#ff4d4d",fontFamily:DISPLAY}}>{t.result}</div><div style={{fontSize:10,color:parseFloat(t.pnlPct)>=0?neon:"#ff4d4d",fontFamily:MONO}}>{parseFloat(t.pnlPct)>=0?"+":""}{t.pnlPct}%</div></div>
                  </div>
                ))}
                {parsed.length>8&&<div style={{fontSize:10,color:`${neon}33`,textAlign:"center",fontFamily:MONO}}>+{parsed.length-8} {fr?"autres trades":"more trades"}</div>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setStep("upload")} className="btn" style={{flex:1,background:"transparent",border:`1px solid ${neon}22`,color:`${neon}55`,borderRadius:10,padding:"12px 0",fontSize:11,fontFamily:MONO}}>{fr?"Annuler":"Cancel"}</button>
                <button onClick={()=>{onImport(parsed);setStep("done");}} className="btn btn-neon-solid" style={{flex:2,borderRadius:10,padding:"12px 0",fontSize:12,fontWeight:700,fontFamily:MONO,letterSpacing:1}}>{fr?`Importer ${parsed.length} trades`:`Import ${parsed.length} trades`}</button>
              </div>
            </>
          )}
          {step==="done"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={neon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{marginBottom:16}}><circle cx="12" cy="12" r="9"/><polyline points="7.5,12.5 10.5,15.5 17,8.5"/></svg>
              <div style={{fontSize:14,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3,marginBottom:6}}>{fr?"Import réussi !":"Import successful!"}</div>
              <div style={{fontSize:11,color:`${neon}55`,fontFamily:MONO,marginBottom:20}}>{parsed.length} {fr?"trades ajoutés à ton journal":"trades added to your journal"}</div>
              <button onClick={onClose} className="btn btn-neon-solid" style={{borderRadius:10,padding:"12px 32px",fontSize:12,fontWeight:700,fontFamily:MONO}}>{fr?"Voir l'historique":"View history"}</button>
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
      <div className="slide-up glass-card" style={{borderRadius:"16px 16px 0 0",width:"100%",maxWidth:480,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:neon,fontFamily:DISPLAY,letterSpacing:-0.3}}>{t.exportTitle}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffffaa",fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          <Stat label={t.trades.toUpperCase()} value={trades.length} color="#38bdf8"/>
          <Stat label="WIN RATE" value={trades.length?Math.round(wins/trades.length*100)+"%":"—"} color={trades.length&&wins/trades.length>=0.5?neon:"#ff4d4d"}/>
          <Stat label="P&L" value={fmtPct(pnl)} color={pnl>=0?neon:"#ff4d4d"}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{const h=["Date","Asset","Dir","Result","P&L%","Score","Conform","Revenge","Humeur","Biais","Notes"];const rows=trades.map(x=>[x.date,x.asset,x.direction,x.result,x.pnlPct,x.setupScore,x.conforming?"Yes":"No",x.isRevenge?"Yes":"No",x.checkin?.humeur||"",x.checkin?.biais||"",`"${(x.notes||"").replace(/"/g,"'")}"`]);dl([h,...rows].map(r=>r.join(",")).join("\n"),`tmt-${today()}.csv`,"text/csv");}} className="btn btn-neon-solid" style={{flex:1,borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>↓ CSV<br/><span style={{fontSize:9,opacity:0.7}}>{t.exportCsv}</span></button>
          <button onClick={()=>dl(JSON.stringify(trades,null,2),`tmt-${today()}.json`,"application/json")} className="btn" style={{flex:1,background:"rgba(56,189,248,0.1)",border:"1px solid #38bdf8",color:"#38bdf8",borderRadius:10,padding:14,fontSize:12,fontWeight:700,fontFamily:MONO}}>↓ JSON<br/><span style={{fontSize:9,opacity:0.6}}>{t.exportJson}</span></button>
        </div>
      </div>
    </div>
  );
}

function NewPhaseModal({onConfirm,onClose,lang,neon,phases,config}){
  const num=(phases?.length||0)+2;
  const [name,setName]=useState(`Phase ${num}`);
  const [accountType,setAccountType]=useState(config?.accountType||"perso");
  const [capital,setCapital]=useState(config?.capital||"");
  const [devise,setDevise]=useState(config?.devise||"€");
  const [obj,setObj]=useState("");
  const [drawdown,setDrawdown]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(6,6,10,0.88)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div className="glass-card" style={{borderRadius:"24px 24px 0 0",padding:"20px 20px 36px",width:"100%",maxWidth:480,borderBottom:"none",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:800,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5}}>▶ Nouvelle phase</div>
            <div style={{fontSize:9,color:"#ffffff33",marginTop:3,fontFamily:MONO}}>Les stats repartent à zéro · Historique conservé</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#ffffff44",fontSize:18,cursor:"pointer",padding:"4px 8px"}}>✕</button>
        </div>
        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>NOM DE LA PHASE</div>
        <input value={name} onChange={e=>setName(e.target.value)} style={{...mkInput(neon),marginBottom:14}}/>
        <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>TYPE DE COMPTE</div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["prop","Prop Firm"],["perso","Perso"],["demo","Démo"]].map(([v,l])=>(
            <button key={v} onClick={()=>setAccountType(v)} style={{flex:1,padding:"10px 0",background:accountType===v?`${neon}18`:"transparent",border:`1px solid ${accountType===v?neon:"#ffffff0d"}`,borderRadius:10,fontSize:10,fontWeight:700,color:accountType===v?neon:"#ffffff33",fontFamily:MONO,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          <div style={{flex:2}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>CAPITAL</div>
            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)} placeholder="10000" style={{...mkInput(neon),marginBottom:0}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>DEVISE</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {["€","$","£","CHF"].map(d=>(
                <button key={d} onClick={()=>setDevise(d)} style={{padding:"5px 0",background:devise===d?`${neon}18`:"transparent",border:`1px solid ${devise===d?neon:"#ffffff0d"}`,borderRadius:7,fontSize:12,fontWeight:800,color:devise===d?neon:"#ffffff30",fontFamily:MONO,cursor:"pointer"}}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:22}}>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ff4d4d88",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>DRAWDOWN MAX %</div>
            <input type="number" value={drawdown} onChange={e=>setDrawdown(e.target.value)} placeholder="5" style={{...mkInput(neon),marginBottom:0,borderColor:"#ff4d4d33"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:8,color:"#ffffffbb",letterSpacing:2,marginBottom:6,fontFamily:MONO}}>OBJECTIF P&L %</div>
            <input type="number" value={obj} onChange={e=>setObj(e.target.value)} placeholder="+10" style={{...mkInput(neon),marginBottom:0}}/>
          </div>
        </div>
        <button onClick={()=>onConfirm({name,accountType,capital,devise,obj,drawdown})} className="btn btn-neon-solid"
          style={{width:"100%",borderRadius:14,padding:"15px 0",fontSize:13,fontWeight:900,fontFamily:MONO,letterSpacing:1}}>
          ✓ Lancer {name}
        </button>
      </div>
    </div>
  );
}

// ══ MAIN APP ══
export default function App() {
  const [splash,setSplash]=useState(true);
  const [user,setUser]=useState(()=>{try{const u=localStorage.getItem("tmt_user");return u?JSON.parse(u):null;}catch{return null;}});
  const [setupDone,setSetupDone]=useState(false);
  const [onboardDone,setOnboardDone]=useState(()=>!!localStorage.getItem("tmt_onboard"));
  const [config,setConfig]=useState({items:DEFAULT_CRITERIA,threshold:6,strategyName:"XAU/USD Scalping",defaultAsset:"XAU/USD",defaultTF:"M5",maxTrades:1,neonColor:"#00ff9d",calendarOn:true,notifOn:true,customAssets:PRESET_ASSETS,eliminatoires:[],objPnl:"",phaseName:"",capital:"",devise:"€",accountType:"perso",objDrawdown:""});
  const [trades,setTrades]=useState([]);
  const [noTrades,setNoTrades]=useState([]);
  const [phases,setPhases]=useState([]);
  const [phaseIdx,setPhaseIdx]=useState(0);
  const [view,setView]=useState("dashboard");
  const [form,setForm]=useState(null);
  const [editId,setEditId]=useState(null);
  const [filter,setFilter]=useState("all");
  const [detail,setDetail]=useState(null);
  const [notif,setNotif]=useState(null);
  const [banner,setBanner]=useState(null);
  const [saved,setSaved]=useState(false);
  const [showWeekly,setShowWeekly]=useState(false);
  const [showCalendar,setShowCalendar]=useState(false);
  const [showInsights,setShowInsights]=useState(false);
  const [showExport,setShowExport]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [showShare,setShowShare]=useState(null);
  const [shareTarget,setShareTarget]=useState(null);
  const [showNewPhase,setShowNewPhase]=useState(false);
  const [showReset,setShowReset]=useState(false);
  const [objectif,setObjectif]=useState({pnl:"",wr:"",trades:"",drawdown:"",editMode:false});
  const [lang,setLang]=useState("fr");
  const [reviewAsked,setReviewAsked]=useState(false);
  const [reviewSubmitted,setReviewSubmitted]=useState(false);
  const [reviewRating,setReviewRating]=useState(0);
  const [reviewText,setReviewText]=useState("");
  const neon=config.neonColor||"#00ff9d";
  const t=T[lang];

  // ── load user data ──
  useEffect(()=>{
    const init=async()=>{
      const stored=localStorage.getItem("tmt_user");
      if(!stored)return;
      const u=JSON.parse(stored);
      setUser(u);
      const data=await loadUserData(u._uid);
      if(data){
        if(data.trades)setTrades(data.trades);
        if(data.noTrades)setNoTrades(data.noTrades);
        if(data.phases)setPhases(data.phases);
        if(data.config)setConfig(c=>({...c,...data.config}));
        if(data.lang)setLang(data.lang);
        if(data.phaseIdx!==undefined)setPhaseIdx(data.phaseIdx);
        setSetupDone(data.setupDone||false);
      }
    };
    init();
  },[]);

  // ── persist user data ──
  const persist=useCallback(async(newTrades,newNoTrades,newConfig,newLang,newPhases,newPhaseIdx)=>{
    if(!user?._uid)return;
    const payload={
      trades:newTrades||trades,noTrades:newNoTrades||noTrades,
      config:newConfig||config,lang:newLang||lang,
      phases:newPhases||phases,phaseIdx:newPhaseIdx??phaseIdx,
      setupDone:true
    };
    await saveUserData(user._uid,payload);
  },[user,trades,noTrades,config,lang,phases,phaseIdx]);

  // ── splash ──
  useEffect(()=>{if(splash)setTimeout(()=>setSplash(false),2700);},[]);

  // ── weekly recap ──
  const weeklyRef=useRef(false);
  useEffect(()=>{
    if(!weeklyRef.current&&trades.length>=5&&new Date().getDay()===1){
      const cut=new Date(Date.now()-7*86400000).toISOString().split("T")[0];
      const w=trades.filter(x=>x.date>=cut);
      if(w.length>=3){setShowWeekly(true);weeklyRef.current=true;}
    }
  },[trades]);

  // ── review ask ──
  useEffect(()=>{
    if(!reviewAsked&&!reviewSubmitted&&trades.length>=10&&trades.length%10===0){
      setReviewAsked(true);
    }
  },[trades.length]);

  const handleLogin=async(data)=>{
    const {email,_uid,userData}=data;
    const u={email,_uid};
    localStorage.setItem("tmt_user",JSON.stringify(u));
    setUser(u);
    if(userData){
      if(userData.trades)setTrades(userData.trades);
      if(userData.noTrades)setNoTrades(userData.noTrades);
      if(userData.phases)setPhases(userData.phases);
      if(userData.config)setConfig(c=>({...c,...userData.config}));
      if(userData.lang)setLang(userData.lang);
      if(userData.phaseIdx!==undefined)setPhaseIdx(userData.phaseIdx);
      setSetupDone(userData.setupDone||false);
    }
  };

  const handleLogout=()=>{
    localStorage.removeItem("tmt_user");
    setUser(null);setTrades([]);setNoTrades([]);setSetupDone(false);setPhases([]);setPhaseIdx(0);
    if(auth)signOut(auth).catch(()=>{});
  };

  const handleSetup=async(cfg)=>{
    const newCfg={...config,...cfg};setConfig(newCfg);setSetupDone(true);
    const newForm=emptyForm(cfg.defaultAsset||"XAU/USD",cfg.defaultTF||"M5");setForm(newForm);setView("log");
    if(user?._uid)await saveUserData(user._uid,{setupDone:true,config:newCfg,trades:[],noTrades:[],phases:[],lang});
  };

  const handleSaveConfig=async(newCfg)=>{
    const merged={...config,...newCfg};setConfig(merged);
    if(user?._uid)await saveUserData(user._uid,{config:merged});
  };

  // ── compute phase-filtered trades ──
  const allPhases=[{id:0,startDate:"1970-01-01",label:t.toutHistorique},...(phases||[]).map((p,i)=>({...p,id:i+1,label:p.label||p.name||`Phase ${i+2}`}))];
  const curPhase=allPhases[phaseIdx]||allPhases[0];
  const phaseTrades=phaseIdx===0?trades:trades.filter(x=>x.date>=curPhase.startDate);
  const phaseSince=phaseIdx>0&&curPhase.startDate?curPhase.startDate:"";

  // ── stats ──
  const wins=phaseTrades.filter(x=>x.result==="WIN");
  const losses=phaseTrades.filter(x=>x.result==="LOSS");
  const wr=phaseTrades.length?Math.round(wins.length/phaseTrades.length*100):null;
  const totalPnl=phaseTrades.reduce((s,x)=>s+(parseFloat(x.pnlPct)||0),0);
  const disc=calcDisc(phaseTrades);
  const discColor=disc===null?neon:disc>=8?neon:disc>=5?"#f0b429":"#ff4d4d";

  // ── today ──
  const tod=today();
  const todayTrades=trades.filter(x=>x.date===tod);
  const todayNoTrade=noTrades.find(x=>x.date===tod);
  const lastTrade=trades.length?trades[0]:null;

  const startEdit=(trade)=>{
    setForm({...trade,pnlPreset:PNL_PRESETS.includes(String(trade.pnlPct))?String(trade.pnlPct):"",pnlManual:!PNL_PRESETS.includes(String(trade.pnlPct))?String(trade.pnlPct):""});
    setEditId(trade.id);setView("log");
  };

  const saveTrade=async()=>{
    if(!form)return;
    const cfgItems=config.items||[];const cfgThresh=config.threshold||6;
    const checkElim=(config.eliminatoires||[]).every(i=>(form.checklist||[]).includes(i));
    const score=(form.checklist||[]).length;
    const conforming=checkElim&&score>=cfgThresh;
    const today_count=trades.filter(x=>x.date===tod&&x.id!==editId).length;
    const max=config.maxTrades||1;
    const isRevenge=max>0&&today_count>=max;
    const pnlV=form.pnlPreset||form.pnlManual||"";
    const hasBiasIncoherence=form.checkin?.biais&&form.direction&&((form.checkin.biais.includes("Haussier")||form.checkin.biais.includes("Bullish"))&&form.direction==="SELL"||(form.checkin.biais.includes("Baissier")||form.checkin.biais.includes("Bearish"))&&form.direction==="BUY");
    const trade={...(editId?{}:{id:Date.now()}),id:editId||Date.now(),date:form.date||tod,time:form.time||"",asset:form.asset||config.defaultAsset||"XAU/USD",direction:form.direction||"BUY",checklist:form.checklist||[],result:form.result||"WIN",pnlPct:pnlV,notes:form.notes||"",rejetScore:form.rejetScore||0,timeframe:form.timeframe||config.defaultTF||"M5",screenshot:form.screenshot||"",conforming,setupScore:score,checklistMax:cfgItems.length,isRevenge,slDirection:form.slDirection||"",checkin:form.checkin||{}};
    let newTrades;
    if(editId){newTrades=trades.map(x=>x.id===editId?trade:x);}
    else{newTrades=[trade,...trades];}
    setTrades(newTrades);setForm(emptyForm(config.defaultAsset||"XAU/USD",config.defaultTF||"M5"));setEditId(null);setView("dashboard");setSaved(true);setTimeout(()=>setSaved(false),2000);
    await persist(newTrades,undefined,undefined,undefined,undefined,undefined);
    const advice=getAdvice(trade,newTrades,lang,neon);
    if(advice)setNotif({...advice,trade,lang,icon:advice.icon});
    if(hasBiasIncoherence&&config.notifOn!==false)setBanner({type:"warn",emoji:"⚠️",title:lang==="fr"?`Biais ${form.checkin.biais} mais ${form.direction}`:`Bias ${form.checkin.biais} but ${form.direction}`,body:lang==="fr"?"Incohérence biais/direction détectée.":"Bias/direction mismatch detected."});
  };

  const deleteTrade=async(id)=>{
    const newT=trades.filter(x=>x.id!==id);setTrades(newT);
    await persist(newT);
  };

  const handleNoTrade=async(nt)=>{
    const newNT=[nt,...noTrades.filter(x=>x.date!==nt.date)];setNoTrades(newNT);
    await persist(undefined,newNT);
  };

  const handleNewPhase=async(phaseData)=>{
    const newPhase={id:Date.now(),startDate:tod,label:phaseData.name||`Phase ${phases.length+2}`,name:phaseData.name,accountType:phaseData.accountType,capital:phaseData.capital,devise:phaseData.devise,obj:phaseData.obj,drawdown:phaseData.drawdown};
    const newPhases=[...(phases||[]),newPhase];
    const newIdx=allPhases.length;
    setPhases(newPhases);setPhaseIdx(newIdx);setShowNewPhase(false);
    await persist(undefined,undefined,undefined,undefined,newPhases,newIdx);
  };

  const handleReset=async()=>{
    setTrades([]);setNoTrades([]);setPhases([]);setPhaseIdx(0);setShowReset(false);
    await persist([],[],undefined,undefined,[],0);
  };

  const handleImport=async(importedTrades)=>{
    const merged=[...importedTrades,...trades].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    setTrades(merged);setShowImport(false);
    await persist(merged);
  };

  const inSt=mkInput(neon);

  // filtered history
  const filterTypes=["all","WIN","LOSS","BE"];
  const filtered=phaseTrades.filter(x=>filter==="all"||x.result===filter).sort((a,b)=>{const dc=b.date.localeCompare(a.date);return dc!==0?dc:(b.time||"").localeCompare(a.time||"");});

  // ── conformity %  ──
  const conformPct=phaseTrades.length?Math.round(phaseTrades.filter(x=>x.conforming).length/phaseTrades.length*100):null;
  const revengePct=phaseTrades.length?Math.round(phaseTrades.filter(x=>x.isRevenge).length/phaseTrades.length*100):0;

  // objectif progress
  const objPnlNum=parseFloat(config.objPnl||objectif.pnl);
  const objDrawdownNum=parseFloat(config.objDrawdown||objectif.drawdown);
  const objPnlPct=(!isNaN(objPnlNum)&&objPnlNum!==0)?Math.min(100,Math.max(0,Math.round(totalPnl/objPnlNum*100))):null;
  const inDrawdown=!isNaN(objDrawdownNum)&&objDrawdownNum>0&&totalPnl<0&&Math.abs(totalPnl)>objDrawdownNum;

  // checklist conformity indicator
  const checklistOk=form&&(form.checklist||[]).length>=(config.threshold||6);
  const elimOk=form&&(config.eliminatoires||[]).every(i=>(form.checklist||[]).includes(i));
  const formConform=checklistOk&&elimOk;

  // ── PHASE SELECTOR ──
  const PhaseBar=()=>(
    <div style={{display:"flex",gap:6,padding:"10px 20px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      {allPhases.map((p,i)=>(
        <button key={i} onClick={()=>{setPhaseIdx(i);persist(undefined,undefined,undefined,undefined,undefined,i);}}
          className="btn" style={{whiteSpace:"nowrap",fontSize:9,padding:"5px 12px",borderRadius:20,fontFamily:MONO,fontWeight:700,background:phaseIdx===i?`${neon}28`:"rgba(255,255,255,0.04)",border:`1px solid ${phaseIdx===i?neon:"rgba(255,255,255,0.08)"}`,color:phaseIdx===i?neon:"#ffffffaa",flexShrink:0}}>
          {p.label}{i>0&&p.startDate?` · ${t.phaseSince} ${p.startDate}`:""}
        </button>
      ))}
      <button onClick={()=>setShowNewPhase(true)} className="btn"
        style={{whiteSpace:"nowrap",fontSize:9,padding:"5px 12px",borderRadius:20,fontFamily:MONO,fontWeight:700,background:"transparent",border:`1px dashed ${neon}28`,color:`${neon}55`,flexShrink:0}}>
        {t.newPhaseBtn}
      </button>
    </div>
  );

  // ── CHECK-IN SECTION ──
  const CheckInSection=()=>{
    const humeurPills=HUMEUR_PILLS[lang]||HUMEUR_PILLS.fr;
    const biaisPills=BIAIS_PILLS[lang]||BIAIS_PILLS.fr;
    const cur=form?.checkin||{};
    const set=(k,v)=>setForm(f=>({...f,checkin:{...f.checkin,[k]:f.checkin?.[k]===v?"":v}}));
    const hasBiasInco=cur.biais&&form.direction&&((cur.biais.includes("Haussier")||cur.biais.includes("Bullish"))&&form.direction==="SELL"||(cur.biais.includes("Baissier")||cur.biais.includes("Bearish"))&&form.direction==="BUY");
    return(
      <div className="glass-card" style={{padding:14,marginBottom:12}}>
        <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:10,fontFamily:MONO}}>{t.checkinToggle}</div>
        <div style={{marginBottom:8}}>
          <div style={{fontSize:9,color:"#ffffffaa",marginBottom:6,fontFamily:MONO}}>{t.humeurLabel}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {humeurPills.map(h=><button key={h} onClick={()=>set("humeur",h)} className="btn" style={{fontSize:11,padding:"6px 12px",borderRadius:8,background:cur.humeur===h?`${neon}1a`:"transparent",border:`1px solid ${cur.humeur===h?neon:`${neon}22`}`,color:cur.humeur===h?neon:"#ffffffbb",fontFamily:MONO}}>{h}</button>)}
          </div>
        </div>
        <div>
          <div style={{fontSize:9,color:"#ffffffaa",marginBottom:6,fontFamily:MONO}}>{t.biaisLabel}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {biaisPills.map(b=><button key={b} onClick={()=>set("biais",b)} className="btn" style={{fontSize:11,padding:"6px 12px",borderRadius:8,background:cur.biais===b?`${neon}1a`:"transparent",border:`1px solid ${cur.biais===b?neon:`${neon}22`}`,color:cur.biais===b?neon:"#ffffffbb",fontFamily:MONO}}>{b}</button>)}
          </div>
          {hasBiasInco&&<div style={{marginTop:8,fontSize:10,color:"#f0b429",background:"rgba(240,180,41,0.08)",border:"1px solid rgba(240,180,41,0.2)",borderRadius:6,padding:"6px 10px",fontFamily:MONO}}>⚠️ {t.inconsistent} {form.direction}</div>}
        </div>
      </div>
    );
  };

  if(splash) return <SplashScreen onDone={()=>setSplash(false)} neon={neon}/>;
  if(!user) return <LoginScreen onLogin={handleLogin} lang={lang} setLang={l=>{setLang(l);}} neon={neon}/>;
  if(!onboardDone) return <Onboarding onDone={l=>{setLang(l);setOnboardDone(true);localStorage.setItem("tmt_onboard","1");}}/>;
  if(!setupDone) return <GuidedSetup onDone={handleSetup} lang={lang}/>;

  return (
    <div style={{background:"#07070f",minHeight:"100vh",color:"#ffffff",fontFamily:MONO,maxWidth:480,margin:"0 auto",position:"relative"}}>
      <CSS neon={neon}/>

      {/* BACKGROUND AURORA */}
      <div style={{position:"fixed",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",width:"80vw",height:"80vw",maxWidth:500,maxHeight:500,borderRadius:"50%",background:`radial-gradient(circle,${neon}0d 0%,transparent 70%)`,top:"-20%",left:"-20%",animation:"auA 9s ease-in-out infinite alternate"}}/>
        <div style={{position:"absolute",width:"70vw",height:"70vw",maxWidth:440,maxHeight:440,borderRadius:"50%",background:`radial-gradient(circle,${neon}05 0%,transparent 70%)`,bottom:"5%",right:"-15%",animation:"auB 12s ease-in-out infinite alternate"}}/>
        <div style={{position:"absolute",width:"60vw",height:"60vw",maxWidth:380,maxHeight:380,borderRadius:"50%",background:`radial-gradient(circle,#bf00ff07 0%,transparent 70%)`,top:"40%",left:"30%",animation:"auC 15s ease-in-out infinite alternate"}}/>
      </div>

      {/* STICKY HEADER */}
      <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(7,7,15,0.88)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${neon}0d`,padding:"12px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <Logo neon={neon} size="sm"/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {view==="history"&&<button onClick={()=>setShowExport(true)} className="btn" style={{background:`${neon}0d`,border:`1px solid ${neon}26`,color:neon,borderRadius:6,padding:"5px 10px",fontSize:10,fontFamily:MONO}}>↓</button>}
          {view==="history"&&<button onClick={()=>setShowImport(true)} className="btn" style={{background:`${neon}0d`,border:`1px solid ${neon}26`,color:neon,borderRadius:6,padding:"5px 10px",fontSize:10,fontFamily:MONO}}>↑</button>}
          {view==="dashboard"&&<button onClick={()=>setShowInsights(true)} className="btn" style={{background:`${neon}0d`,border:`1px solid ${neon}26`,color:neon,borderRadius:6,padding:"5px 10px",fontSize:10,fontFamily:MONO}}>◈</button>}
          {saved&&<span className="glow" style={{fontSize:10,color:neon,fontFamily:MONO}}>{editId?t.tradeUpdated:t.tradeSaved}</span>}
        </div>
      </div>

      {/* PHASE BAR */}
      {(view==="dashboard"||view==="history")&&<div style={{position:"relative",zIndex:10}}><PhaseBar/></div>}

      {/* CONTENT */}
      <div style={{position:"relative",zIndex:1,paddingBottom:80}}>

        {/* ════════ DASHBOARD ════════ */}
        {view==="dashboard"&&(
          <div className="view-in" style={{padding:"0 20px 20px"}}>

            {/* Streak */}
            {trades.length>=2&&<div style={{marginTop:12}}><StreakBadge trades={trades} neon={neon} lang={lang}/></div>}

            {/* DRAWDOWN WARNING */}
            {inDrawdown&&(
              <div style={{background:"rgba(255,77,77,0.08)",border:"1px solid rgba(255,77,77,0.25)",borderRadius:10,padding:"10px 14px",marginBottom:10,marginTop:10,display:"flex",gap:10,alignItems:"center",boxShadow:"0 4px 20px rgba(255,77,77,0.1)"}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div><div style={{fontSize:12,fontWeight:700,color:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-0.3}}>Drawdown {Math.abs(totalPnl).toFixed(1)}%</div><div style={{fontSize:10,color:"#ff4d4d88",fontFamily:MONO}}>Limite: {objDrawdownNum}%</div></div>
              </div>
            )}

            {/* KPI PRINCIPAL — WIN RATE + P&L */}
            {phaseTrades.length>0?(
              <div style={{display:"flex",gap:10,marginTop:10,marginBottom:12}}>

                {/* Win Rate Card */}
                <div className="glass-card-neon" style={{flex:1,padding:"16px 14px 14px",borderRadius:16,minWidth:0}}>
                  <div style={{fontSize:8,color:`${neon}66`,letterSpacing:2.5,marginBottom:4,fontFamily:MONO,textTransform:"uppercase"}}>{t.winRate}</div>
                  <div style={{fontSize:38,fontWeight:900,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-3,lineHeight:1,textShadow:`0 0 30px ${neon}99`}}>
                    {wr!=null?`${wr}`:"—"}
                    <span style={{fontSize:18,color:`${neon}88`,fontFamily:MONO,letterSpacing:0}}>%</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}>
                    <div style={{fontSize:10,color:"#ffffffaa",fontFamily:MONO}}>{phaseTrades.length} {t.trades}</div>
                    {conformPct!==null&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:10,background:`${neon}12`,color:neon,border:`1px solid ${neon}22`,fontFamily:MONO}}>{conformPct}%</span>}
                  </div>
                </div>

                {/* P&L Card */}
                <div className="glass-card-neon" style={{flex:1,padding:"16px 14px 14px",borderRadius:16,minWidth:0,borderTopColor:`${totalPnl>=0?neon:"#ff4d4d"}33 !important`}}>
                  <div style={{fontSize:8,color:`${totalPnl>=0?neon:"#ff4d4d"}88`,letterSpacing:2.5,marginBottom:4,fontFamily:MONO,textTransform:"uppercase"}}>{t.totalPnl}</div>
                  <div style={{fontSize:38,fontWeight:900,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-3,lineHeight:1,textShadow:`0 0 30px ${totalPnl>=0?neon:"#ff4d4d"}99`}}>
                    {totalPnl>=0?"+":"-"}
                    <span>{Math.abs(totalPnl)%1===0?Math.abs(totalPnl).toFixed(0):Math.abs(totalPnl).toFixed(1)}</span>
                    <span style={{fontSize:18,color:`${totalPnl>=0?neon:"#ff4d4d"}88`,fontFamily:MONO,letterSpacing:0}}>%</span>
                  </div>
                  {objPnlPct!==null&&(
                    <div style={{marginTop:8}}>
                      <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{width:`${objPnlPct}%`,height:"100%",background:neon,borderRadius:2,transition:"width 0.5s",boxShadow:`0 0 8px ${neon}44`}}/>
                      </div>
                      <div style={{fontSize:8,color:`${neon}44`,marginTop:3,fontFamily:MONO}}>{objPnlPct}% {lang==="fr"?"vers objectif":"to target"}</div>
                    </div>
                  )}
                  {objPnlPct===null&&<div style={{fontSize:10,color:"#ffffffaa",fontFamily:MONO,marginTop:6}}>{phaseTrades.filter(x=>x.result==="LOSS").length} {lang==="fr"?"pertes":"losses"}</div>}
                </div>
              </div>
            ):(
              <div className="glass-card" style={{padding:28,textAlign:"center",marginTop:12,marginBottom:12}}>
                <div style={{fontSize:32,marginBottom:12}}>◈</div>
                <div style={{fontSize:16,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,marginBottom:8}}>{t.journalEmpty}</div>
                <div style={{fontSize:12,color:"#ffffffaa",fontFamily:MONO,marginBottom:20}}>{t.journalEmptyDesc}</div>
                <button onClick={()=>{setForm(emptyForm(config.defaultAsset,config.defaultTF));setView("log");}} className="btn btn-neon-solid" style={{borderRadius:10,padding:"12px 24px",fontSize:12,fontWeight:700,fontFamily:MONO}}>{t.firstTrade}</button>
              </div>
            )}

            {/* DISCIPLINE CARD */}
            {disc!==null&&(
              <div className="glass-card" style={{padding:16,marginBottom:12,border:`1px solid ${discColor}20`,borderTop:`1px solid ${discColor}30`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:9,color:discColor+"aa",letterSpacing:2.5,marginBottom:6,fontFamily:MONO}}>{t.disciplineLabel}</div>
                    <div style={{fontSize:48,fontWeight:900,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-4,lineHeight:1,textShadow:`0 0 30px ${discColor}88`}}>
                      {disc}
                      <span style={{fontSize:20,color:discColor+"88",fontFamily:MONO,letterSpacing:0}}>/10</span>
                    </div>
                    <div style={{fontSize:10,color:discColor,marginTop:4,fontFamily:MONO}}>{disc>=8?t.disciplineExcellent:disc>=6?t.disciplineGood:disc>=4?t.disciplineWork:t.disciplinePoor}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:120}}>
                    {[{l:t.conformiteLabel,v:conformPct??0,c:neon},{l:t.sansRevengeLabel,v:100-revengePct,c:revengePct===0?neon:"#f0b429"}].map(({l,v,c})=>(
                      <div key={l}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:8,color:"#ffffffaa",fontFamily:MONO}}>{l}</span>
                          <span style={{fontSize:9,fontWeight:700,color:c,fontFamily:MONO}}>{v}%</span>
                        </div>
                        <div style={{height:3,background:"#ffffff0d",borderRadius:2}}>
                          <div style={{width:`${v}%`,height:"100%",background:c,borderRadius:2,boxShadow:`0 0 6px ${c}55`}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PHASE INFO */}
            {phaseIdx>0&&curPhase.startDate&&(
              <div className="inner-card" style={{padding:"8px 12px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:10,color:neon,fontFamily:MONO,fontWeight:700}}>{curPhase.label}</div>
                <div style={{fontSize:9,color:"#ffffffaa",fontFamily:MONO}}>{t.phaseSince} {curPhase.startDate}</div>
              </div>
            )}

            {/* STATS RAPIDES */}
            {phaseTrades.length>0&&(
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <Stat label={t.trades.toUpperCase()} value={phaseTrades.length} color="#38bdf8"/>
                {lastTrade&&<Stat label={t.lastTrade.toUpperCase()} value={<span style={{color:rc(lastTrade.result,neon)}}>{lastTrade.result}</span>} color={rc(lastTrade.result,neon)}/>}
              </div>
            )}

            {/* ADVANCED STATS */}
            {phaseTrades.length>=3&&<AdvancedStats trades={phaseTrades} neon={neon} lang={lang}/>}

            {/* PERFORMANCE CHART */}
            {phaseTrades.length>=2&&<PerformanceChart trades={phaseTrades} neon={neon} lang={lang}/>}

            {/* CONFORMITY BAR */}
            {phaseTrades.length>=3&&<ConformityBar trades={phaseTrades} threshold={config.threshold||6} maxItems={config.items?.length||7} neon={neon} lang={lang}/>}

            {/* CALENDAR */}
            {config.calendarOn!==false&&(
              <div style={{marginBottom:12}}>
                <button onClick={()=>setShowCalendar(x=>!x)} className="btn" style={{width:"100%",background:"transparent",border:`1px solid ${neon}18`,color:`${neon}55`,borderRadius:8,padding:"8px 0",fontSize:10,fontFamily:MONO}}>{showCalendar?t.hideBtn:t.showBtn} {t.calendarToggle}</button>
                {showCalendar&&<div style={{marginTop:8}}><TradingCalendar trades={phaseTrades} neon={neon} lang={lang}/></div>}
              </div>
            )}

            {/* NO TRADE */}
            <NoTradeButton onSave={handleNoTrade} alreadyDone={!!todayNoTrade} lang={lang} neon={neon}/>

            {/* REVIEW PROMPT */}
            {reviewAsked&&!reviewSubmitted&&(
              <div className="glass-card" style={{padding:16,marginBottom:12,border:`1px solid ${neon}26`}}>
                <div style={{fontSize:13,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.5,marginBottom:4}}>
                  {lang==="fr"?"🌟 Tu as posé 10 trades !":"🌟 You've logged 10 trades!"}
                </div>
                <div style={{fontSize:11,color:"#ffffffaa",fontFamily:MONO,marginBottom:12}}>
                  {lang==="fr"?"Tu aides TrackMyTrade en partageant ton expérience.":"Help TrackMyTrade by sharing your experience."}
                </div>
                <div style={{display:"flex",gap:8,marginBottom:10,justifyContent:"center"}}>
                  {[1,2,3,4,5].map(s=>(
                    <button key={s} onClick={()=>setReviewRating(s)} style={{background:"transparent",border:"none",fontSize:26,cursor:"pointer",color:s<=reviewRating?"#f0b429":"#ffffff22"}}>★</button>
                  ))}
                </div>
                {reviewRating>0&&(
                  <>
                    <textarea value={reviewText} onChange={e=>setReviewText(e.target.value)} placeholder={lang==="fr"?"Un commentaire (optionnel)…":"A comment (optional)…"}
                      style={{...inSt,height:60,resize:"none",fontSize:12}} rows={2}/>
                    <button onClick={async()=>{
                      if(!db)return;try{await setDoc(doc(db,"reviews",`${user._uid}_${Date.now()}`),{uid:user._uid,rating:reviewRating,text:reviewText,date:tod,lang});setReviewSubmitted(true);setReviewAsked(false);}catch(e){}
                    }} className="btn btn-neon-solid" style={{width:"100%",borderRadius:10,padding:"11px 0",fontSize:12,fontWeight:700,fontFamily:MONO,marginTop:4}}>
                      {lang==="fr"?"Envoyer ✓":"Send ✓"}
                    </button>
                  </>
                )}
                <button onClick={()=>{setReviewAsked(false);setReviewSubmitted(true);}} style={{width:"100%",background:"transparent",border:"none",color:"#ffffff22",fontSize:10,cursor:"pointer",fontFamily:MONO,marginTop:8}}>{lang==="fr"?"Plus tard":"Later"}</button>
              </div>
            )}
          </div>
        )}

        {/* ════════ LOG TRADE ════════ */}
        {view==="log"&&form&&(
          <div className="view-in" style={{padding:"12px 20px 20px"}}>
            {editId&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontSize:12,color:neon,fontFamily:MONO}}>{t.modifyTrade}</div>
                <button onClick={()=>{setForm(emptyForm(config.defaultAsset,config.defaultTF));setEditId(null);setView("dashboard");}} className="btn" style={{background:"transparent",border:`1px solid rgba(255,77,77,0.2)`,color:"#ff4d4d88",borderRadius:6,padding:"4px 10px",fontSize:10,fontFamily:MONO}}>{t.cancelEdit}</button>
              </div>
            )}

            {/* DATE + ASSET + DIRECTION */}
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{...inSt,flex:1,marginBottom:0}}/>
              <input type="time" value={form.time||""} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder={t.entryTime} style={{...inSt,flex:0.8,marginBottom:0}}/>
            </div>

            {/* ASSET */}
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
              {(config.customAssets||PRESET_ASSETS).map(a=>(
                <button key={a} onClick={()=>setForm(f=>({...f,asset:a}))} className="btn" style={{fontSize:11,padding:"7px 12px",borderRadius:8,fontFamily:MONO,fontWeight:700,background:form.asset===a?`${neon}26`:"transparent",border:`1px solid ${form.asset===a?neon:`${neon}18`}`,color:form.asset===a?neon:"#ffffffbb"}}>{a}</button>
              ))}
            </div>

            {/* DIRECTION */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {["BUY","SELL"].map(d=>(
                <button key={d} onClick={()=>setForm(f=>({...f,direction:d}))} className="btn" style={{flex:1,padding:"12px 0",borderRadius:10,fontSize:14,fontWeight:900,fontFamily:MONO,transition:"all 0.2s",background:form.direction===d?(d==="BUY"?`${neon}22`:"rgba(255,77,77,0.15)"):"transparent",border:`2px solid ${form.direction===d?(d==="BUY"?neon:"#ff4d4d"):"rgba(255,255,255,0.06)"}`,color:form.direction===d?(d==="BUY"?neon:"#ff4d4d"):"#ffffffaa"}}>{d}</button>
              ))}
            </div>

            {/* CHECK-IN */}
            <CheckInSection/>

            {/* CHECKLIST */}
            <div className="glass-card" style={{padding:14,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,fontFamily:MONO}}>{t.checklistSetup}</div>
                <div style={{fontSize:11,fontWeight:700,color:formConform?neon:"#ff4d4d",fontFamily:MONO}}>
                  {(form.checklist||[]).length}/{config.items?.length||7} {formConform?t.conform:`-${((config.threshold||6)-(form.checklist||[]).length)} ${t.missing}`}
                </div>
              </div>
              {(config.items||[]).map((item,i)=>{
                const checked=(form.checklist||[]).includes(i);
                const isElim=(config.eliminatoires||[]).includes(i);
                return(
                  <label key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${neon}08`,cursor:"pointer"}}>
                    <input type="checkbox" checked={checked} onChange={()=>setForm(f=>{const cl=f.checklist||[];return{...f,checklist:cl.includes(i)?cl.filter(x=>x!==i):[...cl,i]};})}/>
                    <span style={{fontSize:13,color:checked?neon:"#ffffffaa",fontFamily:MONO,flex:1}}>{item}</span>
                    {isElim&&<span style={{fontSize:8,color:"#ff4d4d",background:"rgba(255,77,77,0.1)",borderRadius:4,padding:"2px 5px",fontFamily:MONO}}>⚡</span>}
                  </label>
                );
              })}
            </div>

            {/* RÉSULTAT */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {["WIN","LOSS","BE"].map(r=>(
                <button key={r} onClick={()=>setForm(f=>({...f,result:r}))} className="btn" style={{flex:1,padding:"12px 0",borderRadius:10,fontSize:13,fontWeight:900,fontFamily:MONO,background:form.result===r?`${rc(r,neon)}22`:"transparent",border:`2px solid ${form.result===r?rc(r,neon):"rgba(255,255,255,0.06)"}`,color:form.result===r?rc(r,neon):"#ffffffaa"}}>{r}</button>
              ))}
            </div>

            {/* POST-SL DIRECTION */}
            {form.result==="LOSS"&&(
              <div className="glass-card" style={{padding:12,marginBottom:12}}>
                <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.slDirectionLabel}</div>
                <div style={{display:"flex",gap:8}}>
                  {[["with",t.slWith],["against",t.slAgainst]].map(([v,label])=>(
                    <button key={v} onClick={()=>setForm(f=>({...f,slDirection:f.slDirection===v?"":v}))} className="btn" style={{flex:1,padding:"9px 0",borderRadius:8,fontSize:11,fontFamily:MONO,fontWeight:600,background:form.slDirection===v?(v==="with"?`${neon}18`:"rgba(255,77,77,0.12)"):"transparent",border:`1px solid ${form.slDirection===v?(v==="with"?neon:"#ff4d4d"):"rgba(255,255,255,0.08)"}`,color:form.slDirection===v?(v==="with"?neon:"#ff4d4d"):"#ffffffaa"}}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* P&L */}
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.pnl}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {PNL_PRESETS.map(p=>(
                <button key={p} onClick={()=>setForm(f=>({...f,pnlPreset:p,pnlManual:""}))} className="btn" style={{fontSize:11,padding:"7px 12px",borderRadius:8,fontFamily:MONO,fontWeight:700,background:form.pnlPreset===p?`${parseFloat(p)>=0?neon:"#ff4d4d"}26`:"transparent",border:`1px solid ${form.pnlPreset===p?(parseFloat(p)>=0?neon:"#ff4d4d"):"rgba(255,255,255,0.08)"}`,color:form.pnlPreset===p?(parseFloat(p)>=0?neon:"#ff4d4d"):"#ffffffaa"}}>{p}%</button>
              ))}
              <button onClick={()=>setForm(f=>({...f,pnlPreset:"",pnlManual:f.pnlManual||""}))} className="btn" style={{fontSize:11,padding:"7px 12px",borderRadius:8,fontFamily:MONO,background:form.pnlPreset===""&&form.pnlManual!==""?"rgba(255,255,255,0.08)":"transparent",border:"1px solid "+(form.pnlPreset===""&&form.pnlManual!==""?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.06)"),color:"#ffffffaa"}}>{t.manualPnl}</button>
            </div>
            {(form.pnlPreset===""||form.pnlPreset===undefined)&&<input type="number" value={form.pnlManual||""} onChange={e=>setForm(f=>({...f,pnlManual:e.target.value,pnlPreset:""}))} placeholder="+1.5" style={inSt}/>}

            {/* REJET */}
            <div style={{fontSize:9,color:"#ffffff44",letterSpacing:2,marginBottom:8,fontFamily:MONO}}>{t.rejectQuality} {t.optional}</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} onClick={()=>setForm(f=>({...f,rejetScore:f.rejetScore===n?0:n}))} className="btn" style={{flex:1,padding:"8px 0",borderRadius:6,fontSize:10,fontFamily:MONO,fontWeight:700,background:form.rejetScore===n?`${n>=8?neon:n>=5?"#f0b429":"#ff4d4d"}26`:"transparent",border:`1px solid ${form.rejetScore===n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"rgba(255,255,255,0.05)"}`,color:form.rejetScore===n?(n>=8?neon:n>=5?"#f0b429":"#ff4d4d"):"#ffffffaa"}}>{n}</button>
              ))}
            </div>

            {/* NOTES */}
            <textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder={t.notesPlaceholder} style={{...inSt,height:68,resize:"none"}} rows={3}/>

            {/* SCREENSHOT */}
            <input type="file" id="sc" accept="image/*" onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setForm(fr=>({...fr,screenshot:ev.target.result}));r.readAsDataURL(f);}} style={{display:"none"}}/>
            <label htmlFor="sc" style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"transparent",border:`1px dashed ${neon}22`,borderRadius:8,cursor:"pointer",marginBottom:14,color:`${neon}66`,fontSize:12,fontFamily:MONO}}>
              <span>◷</span>{form.screenshot?t.screenshotAdded:t.addScreenshot}
            </label>

            {/* SAVE BUTTON */}
            <button onClick={saveTrade} className={`btn${formConform?" btn-neon-solid":""}`}
              style={{
                width:"100%",borderRadius:12,padding:"16px 0",fontSize:14,fontWeight:900,fontFamily:MONO,letterSpacing:1,
                ...(formConform?{}:{background:"rgba(255,77,77,0.08)",border:"1px solid rgba(255,77,77,0.2)",color:"#ff4d4d"})
              }}>
              {editId?t.updateBtn:(formConform?t.saveConform:t.saveNonConform)}
            </button>
          </div>
        )}

        {/* ════════ HISTORY ════════ */}
        {view==="history"&&(
          <div className="view-in" style={{padding:"0 20px 20px"}}>
            {/* Filter pills */}
            <div style={{display:"flex",gap:6,marginTop:12,marginBottom:14}}>
              {filterTypes.map(f=>(
                <button key={f} onClick={()=>setFilter(f)} className="btn" style={{flex:1,padding:"9px 0",borderRadius:8,fontSize:10,fontWeight:700,fontFamily:MONO,background:filter===f?`${neon}26`:"transparent",border:`1px solid ${filter===f?neon:`${neon}18`}`,color:filter===f?neon:"#ffffffaa"}}>
                  {f==="all"?t.allLabel:f}
                </button>
              ))}
            </div>

            {filtered.length===0&&(
              <div style={{textAlign:"center",padding:"40px 0",color:"#ffffff44",fontFamily:MONO}}>{t.noTrades}</div>
            )}

            {/* Trade rows */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filtered.map(trade=>{
                const pnlN=parseFloat(trade.pnlPct)||0;
                return(
                  <div key={trade.id} className="glass-card row" style={{padding:14,borderLeft:`3px solid ${rc(trade.result,neon)}`}} onClick={()=>setDetail(trade)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#ffffff",fontFamily:DISPLAY,letterSpacing:-0.3}}>{trade.asset}</span>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:trade.direction==="BUY"?`${neon}14`:"rgba(255,77,77,0.1)",color:trade.direction==="BUY"?neon:"#ff4d4d",fontFamily:MONO,fontWeight:700}}>{trade.direction}</span>
                          {trade.isRevenge&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:"rgba(255,77,77,0.08)",color:"#ff4d4d88",fontFamily:MONO}}>⚡</span>}
                          {trade.conforming&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:`${neon}08`,color:`${neon}55`,fontFamily:MONO}}>✓</span>}
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:10,color:"#ffffff44",fontFamily:MONO}}>{trade.date}{trade.time?" · "+trade.time:""}</span>
                          {trade.setupScore>0&&<span style={{fontSize:9,color:`${neon}44`,fontFamily:MONO}}>{trade.setupScore}/{trade.checklistMax||config.items?.length||7}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:16,fontWeight:800,color:rc(trade.result,neon),fontFamily:DISPLAY,letterSpacing:-0.5,marginBottom:2}}>{trade.result}</div>
                        {trade.pnlPct!==""&&pnlN!==0&&<div style={{fontSize:13,color:pnlN>=0?neon:"#ff4d4d",fontFamily:DISPLAY,letterSpacing:-0.5,fontWeight:700}}>{fmtPct(pnlN)}</div>}
                      </div>
                    </div>
                    {trade.notes&&<div style={{fontSize:10,color:"#ffffff44",marginTop:6,fontStyle:"italic",fontFamily:MONO,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>"{trade.notes.slice(0,60)}{trade.notes.length>60?"…":""}"</div>}
                    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:10}}>
                      <button onClick={e=>{e.stopPropagation();setShareTarget(trade);setShowShare(true);}} className="btn" style={{background:`${neon}08`,border:`1px solid ${neon}20`,color:`${neon}66`,borderRadius:6,padding:"4px 8px",fontSize:10,display:"flex",alignItems:"center",gap:4}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                      <button onClick={e=>{e.stopPropagation();startEdit(trade);}} className="btn" style={{background:`${neon}08`,border:`1px solid ${neon}20`,color:`${neon}66`,borderRadius:6,padding:"4px 8px",fontSize:10}}>✏</button>
                      <button onClick={e=>{e.stopPropagation();if(window.confirm(t.deleteConfirm))deleteTrade(trade.id);}} className="btn" style={{background:"rgba(255,77,77,0.06)",border:"1px solid rgba(255,77,77,0.15)",color:"#ff4d4d55",borderRadius:6,padding:"4px 8px",fontSize:10}}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════ SETTINGS ════════ */}
        {view==="settings"&&(
          <div className="view-in">
            <SettingsView config={config} onSave={handleSaveConfig} onLogout={handleLogout} onReset={()=>setShowReset(true)} onNewPhase={handleNewPhase} lang={lang} onLangChange={async(l)=>{setLang(l);if(user?._uid)await saveUserData(user._uid,{lang:l});}} neon={neon} phases={phases} onObjectifChange={setObjectif} onImport={handleImport}/>
          </div>
        )}
      </div>

      {/* ════════ BOTTOM NAV ════════ */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,zIndex:50,background:"rgba(7,7,15,0.9)",backdropFilter:"blur(16px)",borderTop:`1px solid ${neon}10`,padding:"10px 0 20px",display:"flex",justifyContent:"space-around",alignItems:"center"}}>
        {[
          {id:"dashboard",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,label:t.stats},
          {id:"log",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,label:t.addTrade,main:true},
          {id:"history",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,label:t.history},
          {id:"settings",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,label:t.settings},
        ].map(({id,icon,label,main})=>(
          <button key={id} onClick={()=>{if(id==="log"){setForm(emptyForm(config.defaultAsset,config.defaultTF));setEditId(null);}setView(id);}} className="btn"
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:main&&view===id?`${neon}1a`:main?"transparent":view===id?`${neon}12`:"transparent",border:main?`1px solid ${view===id?neon:`${neon}33`}`:"none",borderRadius:main?12:8,padding:main?"10px 18px":"6px 14px",color:view===id?neon:(main?`${neon}66`:"#ffffff66"),flex:main?undefined:1,transition:"all 0.2s"}}>
            {icon}
            <span style={{fontSize:8,letterSpacing:1,fontFamily:MONO,fontWeight:700}}>{label}</span>
          </button>
        ))}
      </div>

      {/* ════════ MODALS ════════ */}
      {notif&&<NotifCard notif={notif} onClose={()=>setNotif(null)}/>}
      {showWeekly&&<WeeklyRecapModal trades={trades} lang={lang} neon={neon} onClose={()=>setShowWeekly(false)} onShareWeek={()=>{setShareTarget(null);setShowShare(true);}}/>}
      {detail&&<TradeDetailModal trade={detail} config={config} onClose={()=>setDetail(null)} onEdit={(tr)=>{startEdit(tr);setDetail(null);}} onShare={(tr)=>{setShareTarget(tr);setShowShare(true);setDetail(null);}} lang={lang} neon={neon}/>}
      {showInsights&&<StatsInsightsModal trades={phaseTrades} lang={lang} neon={neon} onClose={()=>setShowInsights(false)}/>}
      {showShare&&<ShareModal trade={shareTarget} trades={trades} lang={lang} neon={neon} config={config} onClose={()=>{setShowShare(false);setShareTarget(null);}}/>}
      {showExport&&<ExportModal trades={phaseTrades} onClose={()=>setShowExport(false)} lang={lang} neon={neon}/>}
      {showImport&&<ImportCSVModal onImport={handleImport} onClose={()=>setShowImport(false)} lang={lang} neon={neon} config={config}/>}
      {showReset&&<ResetModal trades={trades} onReset={handleReset} onClose={()=>setShowReset(false)} lang={lang} neon={neon}/>}
      {showNewPhase&&<NewPhaseModal onConfirm={handleNewPhase} onClose={()=>setShowNewPhase(false)} lang={lang} neon={neon} phases={phases} config={config}/>}
      {banner&&<InAppBanner notifs={[banner]} onDismiss={()=>setBanner(null)} neon={neon}/>}
    </div>
  );
}