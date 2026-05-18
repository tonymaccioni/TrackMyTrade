import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  
  // Paramètres du trade
  const asset = searchParams.get('asset') || '';
  const direction = searchParams.get('direction') || '';
  const result = searchParams.get('result') || '';
  const pnl = searchParams.get('pnl') || '';
  const score = searchParams.get('score') || '';
  const maxScore = searchParams.get('maxScore') || '7';
  const rejet = searchParams.get('rejet') || '';
  const date = searchParams.get('date') || '';
  const conforming = searchParams.get('conforming') === '1';
  const neon = searchParams.get('neon') || '#00ff9d';
  const type = searchParams.get('type') || 'trade'; // trade ou week
  
  // Stats semaine
  const wr = searchParams.get('wr') || '';
  const wpnl = searchParams.get('wpnl') || '';
  const trades = searchParams.get('trades') || '';
  const disc = searchParams.get('disc') || '';
  
  const resColor = result === 'WIN' ? neon : result === 'LOSS' ? '#ff4d4d' : '#f0b429';

  return new ImageResponse(
    type === 'trade' ? (
      <div style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        background: '#0a140a',
        fontFamily: 'monospace',
        padding: '0',
      }}>
        {/* Barre top */}
        <div style={{height: 6, background: neon, width: '100%', display: 'flex'}}/>
        
        {/* Header */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 28px 14px', borderBottom:`1px solid ${neon}22`}}>
          <div style={{display:'flex', flexDirection:'column'}}>
            <span style={{fontSize:22, fontWeight:700, color:neon}}>◈ RÉCAP TRADE</span>
            <span style={{fontSize:13, color:`${neon}55`, marginTop:4}}>TRACKMYTRADE</span>
          </div>
          <span style={{fontSize:13, color:`${neon}44`}}>{date}</span>
        </div>

        {/* Asset + résultat */}
        <div style={{display:'flex', margin:'20px 28px 0', background:`${resColor}14`, border:`1px solid ${resColor}35`, borderRadius:14, padding:'18px 22px', borderLeft:`6px solid ${resColor}`}}>
          <div style={{display:'flex', flexDirection:'column', flex:1}}>
            <span style={{fontSize:32, fontWeight:700, color:'#e8f5e8'}}>{asset} · {direction}</span>
          </div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
            <span style={{fontSize:36, fontWeight:800, color:resColor}}>{result}</span>
            <span style={{fontSize:24, fontWeight:700, color:parseFloat(pnl)>=0?neon:'#ff4d4d'}}>{parseFloat(pnl)>=0?'+':''}{pnl}%</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'flex', gap:16, margin:'16px 28px 0'}}>
          <div style={{display:'flex', flexDirection:'column', flex:1, background:'#0d1a0d', border:`1px solid ${neon}18`, borderRadius:12, padding:'14px 18px'}}>
            <span style={{fontSize:12, color:'#3a5a3a', letterSpacing:2, marginBottom:10}}>SETUP SCORE</span>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:54, height:54, borderRadius:'50%', border:`3px solid ${neon}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 14px ${neon}44`}}>
                <span style={{fontSize:16, fontWeight:700, color:neon}}>{score}/{maxScore}</span>
              </div>
              <span style={{fontSize:15, fontWeight:700, color:conforming?neon:'#ff4d4d'}}>{conforming?'✓ conforme':'✗ non-conforme'}</span>
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', flex:1, background:'#0d1a0d', border:`1px solid ${neon}18`, borderRadius:12, padding:'14px 18px'}}>
            <span style={{fontSize:12, color:'#3a5a3a', letterSpacing:2, marginBottom:6}}>REJET /10</span>
            <span style={{fontSize:52, fontWeight:800, color:parseInt(rejet)>=8?neon:parseInt(rejet)>=5?'#f0b429':'#ff4d4d'}}>{rejet||'—'}</span>
          </div>
        </div>

        {/* Watermark */}
        <div style={{display:'flex', justifyContent:'center', marginTop:'auto', padding:'20px 0 16px'}}>
          <span style={{fontSize:14, color:`${neon}25`, letterSpacing:3}}>trackmytrade.app</span>
        </div>
      </div>
    ) : (
      <div style={{display:'flex', flexDirection:'column', width:'100%', height:'100%', background:'#0a140a', fontFamily:'monospace', padding:0}}>
        <div style={{height:6, background:neon, width:'100%', display:'flex'}}/>
        <div style={{display:'flex', flexDirection:'column', padding:'20px 28px 14px', borderBottom:`1px solid ${neon}22`}}>
          <span style={{fontSize:22, fontWeight:700, color:neon}}>◈ RÉSUMÉ SEMAINE</span>
          <span style={{fontSize:13, color:`${neon}55`, marginTop:4}}>TRACKMYTRADE</span>
        </div>
        <div style={{display:'flex', gap:16, margin:'20px 28px 0'}}>
          {[['WIN RATE', wr+'%', parseInt(wr)>=50?neon:'#ff4d4d'], ['P&L', (parseFloat(wpnl)>=0?'+':'')+parseFloat(wpnl).toFixed(1)+'%', parseFloat(wpnl)>=0?neon:'#ff4d4d'], ['TRADES', trades, neon]].map(([l,v,c]) => (
            <div key={l} style={{display:'flex', flexDirection:'column', flex:1, background:`${c}0d`, border:`1px solid ${c}25`, borderRadius:12, padding:'14px 0', alignItems:'center'}}>
              <span style={{fontSize:11, color:`${neon}44`, letterSpacing:1, marginBottom:6}}>{l}</span>
              <span style={{fontSize:32, fontWeight:800, color:c}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex', flexDirection:'column', margin:'16px 28px 0', background:`#0d1a0d`, border:`1px solid ${neon}18`, borderRadius:12, padding:'14px 18px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <span style={{fontSize:13, color:`${neon}44`, letterSpacing:2}}>DISCIPLINE</span>
            <span style={{fontSize:36, fontWeight:800, color:neon}}>{disc}<span style={{fontSize:16, color:`${neon}33`}}>/10</span></span>
          </div>
        </div>
        <div style={{display:'flex', justifyContent:'center', marginTop:'auto', padding:'20px 0 16px'}}>
          <span style={{fontSize:14, color:`${neon}25`, letterSpacing:3}}>trackmytrade.app</span>
        </div>
      </div>
    ),
    { width: 480, height: 640 }
  );
}
