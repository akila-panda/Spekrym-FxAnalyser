"""Render real EUR/USD candles with the market-context detectors overlaid, so the
inputs can be visually confirmed against a human read of the chart.

Writes a self-contained HTML file (candles via canvas + overlay lines/boxes for
PDH/PDL, PWH/PWL, sessions, premium/discount, active FVGs, liquidity pools).

Run: python -m research.context_chart [PAIR] [N_DISPLAY]
"""
import asyncio
import json
import sys

from ta_engine.loader import load_candles
from market_context.context import build_context

PAIR = sys.argv[1] if len(sys.argv) > 1 else "EUR_USD"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 160
OUT = "research/context_chart.html"


async def main():
    df = await load_candles(PAIR, "H1", limit=500)
    d1 = await load_candles(PAIR, "D1", limit=200)
    h4 = await load_candles(PAIR, "H4", limit=400)
    ctx = build_context(PAIR, {"D1": d1, "H4": h4, "H1": df})

    total = len(df)
    start = max(0, total - N)
    view = df.iloc[start:].reset_index(drop=True)
    candles = [{"o": float(r.o), "h": float(r.h), "l": float(r.l), "c": float(r.c),
                "t": str(r.ts)} for r in view.itertuples()]

    # show all still-active FVGs; those formed before the view are clamped to the left edge
    fvgs = [{"type": f["type"], "top": f["top"], "bottom": f["bottom"],
             "x": max(0, f["index"] - start)} for f in ctx["fvg_active"]]

    lv = ctx["levels"]
    payload = {
        "pair": PAIR, "as_of": ctx["as_of"], "price": ctx["price"],
        "mtf_trends": ctx["mtf_trends"], "mtf_aligned": ctx["mtf_aligned"],
        "candles": candles,
        "levels": lv,
        "premium_discount": ctx["premium_discount"],
        "liquidity": ctx["liquidity"],
        "fvgs": fvgs,
        "displacement": ctx["displacement"],
    }

    html = _HTML.replace("__DATA__", json.dumps(payload))
    with open(OUT, "w") as fh:
        fh.write(html)
    print(f"wrote {OUT}  ({len(candles)} candles, {len(fvgs)} active FVGs shown)")


_HTML = r"""<!doctype html><html><head><meta charset=utf-8>
<title>Market Context - visual check</title>
<style>
 body{margin:0;background:#0e1116;color:#c9d1d9;font:13px system-ui}
 #hdr{padding:8px 12px}#leg{padding:0 12px 8px;color:#8b949e}
 .k{display:inline-block;margin-right:14px}
 canvas{display:block;width:100%;height:70vh}
</style></head><body>
<div id=hdr></div><div id=leg></div><canvas id=c></canvas>
<script>
const D=__DATA__;
const cv=document.getElementById('c');const dpr=devicePixelRatio||1;
function size(){cv.width=cv.clientWidth*dpr;cv.height=cv.clientHeight*dpr;draw();}
addEventListener('resize',size);
const cs=D.candles;let lo=1e9,hi=-1e9;
for(const k of cs){lo=Math.min(lo,k.l);hi=Math.max(hi,k.h);}
function collect(v){if(v!=null&&isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}}
const L=D.levels||{};if(L.prior_day){collect(L.prior_day.pdh);collect(L.prior_day.pdl);}
if(L.prior_week){collect(L.prior_week.pwh);collect(L.prior_week.pwl);}
const PD=D.premium_discount||{};collect(PD.range_high);collect(PD.range_low);
for(const p of (D.liquidity.buy_side||[]))collect(p.level);
for(const p of (D.liquidity.sell_side||[]))collect(p.level);
const pad=(hi-lo)*0.08;lo-=pad;hi+=pad;
const ML=60,MR=90,MT=10,MB=20;
function X(i){const w=cv.width-ML-MR;return ML+ (cs.length<2?0:i/(cs.length-1)*w);}
function Y(p){const h=cv.height-MT-MB;return MT+(hi-p)/(hi-lo)*h;}
let g;
function line(p,color,dash,label){const y=Y(p);g.save();g.strokeStyle=color;
 g.setLineDash(dash||[]);g.beginPath();g.moveTo(ML,y);g.lineTo(cv.width-MR,y);g.stroke();
 g.setLineDash([]);g.fillStyle=color;g.font=(11*dpr)+'px system-ui';
 g.fillText(label+' '+p.toFixed(5),cv.width-MR+4,y+4*dpr);g.restore();}
function draw(){g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
 const bw=Math.max(2*dpr,(cv.width-ML-MR)/cs.length*0.6);
 for(const f of D.fvgs){const x0=X(f.x);const yT=Y(f.top),yB=Y(f.bottom);
   g.fillStyle=f.type==='bullish'?'rgba(63,185,80,.18)':'rgba(248,81,73,.18)';
   g.fillRect(x0,Math.min(yT,yB),cv.width-MR-x0,Math.abs(yB-yT));}
 for(let i=0;i<cs.length;i++){const k=cs[i];const x=X(i);const up=k.c>=k.o;
   g.strokeStyle=up?'#3fb950':'#f85149';g.fillStyle=up?'#3fb950':'#f85149';
   g.beginPath();g.moveTo(x,Y(k.h));g.lineTo(x,Y(k.l));g.stroke();
   const y1=Y(k.o),y2=Y(k.c);g.fillRect(x-bw/2,Math.min(y1,y2),bw,Math.max(2,Math.abs(y2-y1)));}
 if(L.prior_day){line(L.prior_day.pdh,'#f0883e',[6,4],'PDH');line(L.prior_day.pdl,'#f0883e',[6,4],'PDL');}
 if(L.prior_week){line(L.prior_week.pwh,'#a371f7',[2,3],'PWH');line(L.prior_week.pwl,'#a371f7',[2,3],'PWL');}
 if(L.sessions)for(const s in L.sessions){const v=L.sessions[s];
   line(v.high,'#6e7681',[1,4],s+'H');line(v.low,'#6e7681',[1,4],s+'L');}
 if(PD.range_high){line(PD.range_high,'#58a6ff',[],'RH');line(PD.range_low,'#58a6ff',[],'RL');
   line(PD.equilibrium,'#1f6feb',[4,4],'EQ');}
 for(const p of (D.liquidity.buy_side||[]))line(p.level,p.swept?'#8b949e':'#f85149',[3,3],p.swept?'BSLx':'BSL');
 for(const p of (D.liquidity.sell_side||[]))line(p.level,p.swept?'#8b949e':'#3fb950',[3,3],p.swept?'SSLx':'SSL');
}
document.getElementById('hdr').innerHTML='<b>'+D.pair+'</b> @ '+D.price+' &nbsp; as_of '+D.as_of+
 ' &nbsp; MTF '+JSON.stringify(D.mtf_trends)+(D.mtf_aligned?' (ALIGNED)':'')+
 ' &nbsp; P/D: '+(D.premium_discount?D.premium_discount.zone:'?')+
 ' &nbsp; displacement: '+D.displacement.is_displacement+' ('+D.displacement.direction+')';
document.getElementById('leg').innerHTML=
 '<span class=k style=color:#f0883e>PDH/PDL</span>'+
 '<span class=k style=color:#a371f7>PWH/PWL</span>'+
 '<span class=k style=color:#6e7681>sessions</span>'+
 '<span class=k style=color:#58a6ff>range</span><span class=k style=color:#1f6feb>equilibrium</span>'+
 '<span class=k style=color:#f85149>BSL / bearish FVG</span><span class=k style=color:#3fb950>SSL / bullish FVG</span>'+
 '<span class=k>(x = swept)</span>';
size();
</script></body></html>"""


if __name__ == "__main__":
    asyncio.run(main())
