#!/usr/bin/env node
/* Simulador de balanceamento: corre o jogo verdadeiro (index.html) sem desenhar, com um bot a jogar.
   Uso:  NODE_PATH=$(npm root -g) node sim.js [--mapas valenca,moncao] [--dif 0,1,2] [--herois padeira]
           [--estr base,misto,portas] [--n 20] [--par 2] [--detalhe] [--porta] [--curto] [--patch "TYPES.cal.cost=60"] [--csv jogos.csv] [--html index.html]
           [--def '{"nome":{"hero":"caca","mix":{"bes":2,"cal":1}}}']   (estratégias à experiência, por cima do bot-base)
         node sim.js --teste     (confirma que a mesma semente dá sempre a mesma partida)
         node sim.js --geo       (bandeiras de cada mapa e o que cada uma alcança)
   Precisa de playwright (ou playwright-core com o Chrome/Edge do sistema). */
const path=require('path'),fs=require('fs'),os=require('os');
let pw;try{pw=require('playwright');}catch(_){pw=require('playwright-core');}

/* ---- estratégias do bot ----
   mix: proporção de torres; br: especialização por tipo (sem valor = à sorte)
   place: 'cov' (onde passa mais estrada a 125, igual para todos os tipos, como o bot do duelo), 'alc' (estrada dentro do alcance
          de cada tipo) ou 'papel' (alc + azeite junto às portas, peso gateW, + trabuco e besteiros recuados, peso backW)
   bal: reparte as torres pelas estradas (a dos nadadores só pesa a sério a partir da vaga post, antes de o postigo rebentar)
   upg: 'barato' (a melhoria mais barata) ou 'dano' (a torre que mais dano fez por ouro gasto); upP: tipo a melhorar primeiro
   res: quantas bandeiras, das que têm mais estrada ao alcance do azeite, ficam guardadas para ele (0 = nenhuma)
   base/wide: quantas torres quer antes de melhorar (base+vaga*wide)
   hero: 'casa' (fica na praça, como o bot do duelo) ou 'caca' (vai pôr-se à frente do inimigo mais adiantado)
   Testado e sem ganho (retirado): fugir das bandeiras ao alcance dos archeiros, melhorar primeiro as torres mais recuadas ou as que
   nunca caíram, heroína parada à frente das portas, reparar portas mais cedo, muralhas na vaga 6, chamar vagas cedo, mais torres (wide 1 e 1,5). */
const BASE={mix:{arq:3,bes:2.5,tra:2,cal:1.6},place:'cov',upg:'barato',base:3,wide:0.6,br:{},hero:'casa',gateW:1,backW:1,bal:false,post:8};
const BOM={hero:'caca',bal:true,upg:'dano',place:'alc'};
const ESTR={
  base:{},// o bot do duelo, sem mandar tropas
  misto:BOM,// o melhor que encontrei com os quatro tipos de torre
  portas:{...BOM,place:'papel'},// azeite às portas, trabucos e besteiros atrás
  'so-arq':{...BOM,mix:{arq:1}},'so-bes':{...BOM,mix:{bes:1}},'so-tra':{...BOM,mix:{tra:1}},'so-cal':{...BOM,mix:{cal:1}},
};

/* ---- lado da página: esta função é colada dentro do script do jogo (que é uma função fechada), para lhe chegar às variáveis ---- */
function PAGE(){
  // Math.random com semente (mulberry32): a mesma semente dá a mesma partida
  let sd=1;Math.random=()=>{sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  // sem som, sem desenho, sem janelas, sem gravar nada
  sfx=say=saveGame=clearSave=drawBG=renderPanel=coinFly=loop=hud=draw=offerCards=unlock=submitScore=defeatFx=()=>{};
  endGame=win=>{S.over=true;S.win=!!win;};
  document.documentElement.style.display='none';// nada para pintar: o processo gráfico do browser fica parado
  let nGate=0,leakT={},leakP=[],brokeS={};const bg=breakGate,hh=hitHeart,bt=breakTower;breakGate=i=>{nGate++;bg(i);};
  // quem chegou à praça (tipo e estrada) e em que bandeira caiu cada torre
  hitHeart=n=>{const e=S.enemies.find(e=>e.dead&&!e.seen&&e.d>=PATHS[e.p].len);if(e){e.seen=1;leakT[e.t]=(leakT[e.t]||0)+n;leakP[e.p]=(leakP[e.p]||0)+n;}hh(n);};
  breakTower=t=>{brokeS[t.si]=(brokeS[t.si]||0)+1;bt(t);};
  // onde morre quem vem por cada estrada (sem contar as lendas): fração do caminho, se chegou à primeira porta e quem o matou
  let dth=[];const kl=kill;kill=(e,src)=>{if(!e.dead&&!e.f.boss){const o=dth[e.p]||(dth[e.p]={n:0,pr:0,gate:0,by:{},gt:{},nt:{}}),g=LV.pathGates[e.p][0];o.n++;o.pr+=e.d/PATHS[e.p].len;if(g&&e.d>=g.d-40){o.gate++;o.gt[e.t]=(o.gt[e.t]||0)+1;}o.nt[e.t]=(o.nt[e.t]||0)+1;
    const k=src&&TYPES[src.k]?src.k:src===S.hero?'heroína':'outro';o.by[k]=(o.by[k]||0)+1;}kl(e,src);};
  // por vaga e por tipo (sem as lendas): [quantos nasceram, quantos chegaram à primeira porta da sua estrada], mortos ou não
  let gw=[];const mf=mkFoe;mkFoe=(t,p,d)=>{const e=mf(t,p,d);e.w=S.wave;if(!e.f.boss){const o=gw[e.w]||(gw[e.w]={});(o[t]||(o[t]=[0,0]))[0]++;}return e;};
  const KS=Object.keys(TYPES),hyp=Math.hypot;

  // por mapa: o que cada bandeira alcança com cada tipo de torre
  function scout(){
    const pts=[],stalls=[];
    PATHS.forEach((P,p)=>{for(let d=P.seg[0].L;d<P.len;d+=8){const q=posAt(P,d);pts.push({x:q.x,y:q.y,p,f:d/P.len});}});
    // onde os inimigos ficam parados a arrombar: mesmo à frente de cada porta
    LV.pathGates.forEach((gs,p)=>gs.forEach(q=>{const a=posAt(PATHS[p],q.d-14);stalls.push({x:a.x,y:a.y,i:q.i});}));
    const near=(s,A,r)=>A.filter(q=>hyp(q.x-s.x,q.y-s.y)<=r),perPath=A=>PATHS.map((P,p)=>A.filter(q=>q.p===p).length);
    const info=SLOTS.map(s=>{const c=near(s,pts,125),o={kind:s.kind,x:Math.round(s.x),y:Math.round(s.y),cov:c.length,P:perPath(c)};
      // quão recuada está: a que altura do caminho fica a estrada mais próxima (0 = desembarque, 1 = praça)
      let bd=1e9;for(const q of pts){const d=hyp(q.x-s.x,q.y-s.y);if(d<bd){bd=d;o.depth=q.f;}}
      for(const k of KS){const R=TYPES[k].range[1],c=near(s,pts,R);o[k]={cov:c.length,P:perPath(c),stall:near(s,stalls,R).length};}
      return o;});
    return info;
  }

  function mkBot(st){
    const info=scout(),h=S.hero,prog=e=>e.d/PATHS[e.p].len;
    let D=[];// estrada já coberta pelas torres de pé, por caminho
    // res: as bandeiras com mais estrada ao alcance do azeite ficam guardadas para ele (e o azeite só vai para essas)
    const resv=st.res?SLOTS.map((s,i)=>i).sort((a,b)=>info[b].cal.cov-info[a].cal.cov).slice(0,st.res):[];
    const score=(i,k)=>{const I=info[i],c=st.place==='cov'?I.P:I[k].P;
      // bal: cada caminho vale menos quanto mais coberto já está; o dos nadadores só pesa a sério perto da vaga 10, quando o postigo rebenta
      let v=c.reduce((a,n,p)=>a+(st.bal?n*(p===2&&S.wave<st.post?0.3:1)/(30+D[p]):n),0);
      if(st.place==='papel')v*=k==='cal'?1+st.gateW*I[k].stall:k==='arq'?1:1+st.backW*I.depth;
      return v;};
    function build(){
      const free=SLOTS.map((s,i)=>i).filter(i=>!SLOTS[i].tower);if(!free.length)return null;
      const cnt={};D=PATHS.map(()=>0);S.towers.forEach(t=>{cnt[t.k]=(cnt[t.k]||0)+1;if(!t.broken)(st.place==='cov'?info[t.si]:info[t.si][t.k]).P.forEach((n,p)=>D[p]+=n);});
      // o tipo mais em falta face à proporção pedida, no melhor lugar livre para ele
      const ks=Object.keys(st.mix).sort((a,b)=>((cnt[a]||0)+1)/st.mix[a]-((cnt[b]||0)+1)/st.mix[b]);
      for(const k of ks){const f=free.filter(i=>!resv.length||(k==='cal')===resv.includes(i));if(!f.length)continue;
        const i=f.reduce((a,b)=>score(b,k)>score(a,k)?b:a);if(score(i,k)>0)return{c:TYPES[k].cost,go:()=>doAct({a:'build',i,k},1)};}
      return null;
    }
    function upgrade(){
      let ups=S.towers.filter(t=>t.lv<5&&!t.broken);if(!ups.length)return null;
      if(ups.some(t=>t.k===st.upP))ups=ups.filter(t=>t.k===st.upP);
      const cost=t=>TYPES[t.k].up[t.lv-1],key=st.upg==='dano'?t=>-(t.dmgDone||0)/t.spent:cost;
      const t=ups.reduce((a,b)=>key(b)<key(a)?b:a),b=st.br[t.k]!=null?st.br[t.k]:Math.random()<0.5?0:1;
      return{c:cost(t),go:()=>doAct(t.lv===2?{a:'br',i:t.si,b}:{a:'up',i:t.si},1)};
    }
    // quando já não há torres para comprar: obras na praça e treino da heroína
    function sink(){
      for(const k of ['muralha','fosso','cisterna']){const w=WORKS.find(x=>x.k===k);if(!S.works[k]&&(k!=='cisterna'||S.built.has('cal')))return{c:workCost(w),go:()=>doAct({a:'work',k},1)};}
      if(h.lv<HERO_MAX)return{c:trainCost(h),go:()=>doAct({a:'heroBuy',b:'train'},1)};
      if((h.gift||0)<5)return{c:giftCost(h),go:()=>doAct({a:'heroBuy',b:'gift'},1)};
      return null;
    }
    function hero(land){
      if(h.dead||st.hero==='casa'||h.tx!=null)return;
      if(land.some(e=>hyp(e.x-h.x,e.y-h.y)<34))return;// já tem com quem se entreter
      if(!land.length)return;const e=land.reduce((a,b)=>prog(a)>prog(b)?a:b),q=posAt(PATHS[e.p],e.d+18);
      if(hyp(q.x-h.x,q.y-h.y)>12)doAct({a:'hero',x:q.x,y:q.y},1);
    }
    return function think(){
      if(S.over)return;
      if(heroPend(h)>0)doAct({a:'heroUp',b:Math.random()<0.5?0:1},1);
      const land=S.enemies.filter(e=>!e.dead&&!e.ride&&!e.under&&!inRiver(e.x,e.y));
      if(S.wave>=1){// poderes: como o bot do duelo
        if(S.cd.bell<=0)doAct({a:'abil',k:'bell'},1);
        if(S.cd.rain<=0&&land.length>=4){const e=land.reduce((a,b)=>prog(a)>prog(b)?a:b);doAct({a:'abil',k:'rain',x:Math.round(e.x),y:Math.round(e.y)},1);}
        if(S.cd.gate<=0&&(S.gates.some(G=>!G.broken&&G.hp<G.max*0.3)||land.filter(e=>prog(e)>0.8).length>=3))doAct({a:'abil',k:'gate'},1);
        if(S.cd.hero<=0&&!h.dead&&land.filter(e=>hyp(e.x-h.x,e.y-h.y)<75).length>=3)doAct({a:'heroSp'},1);
      }
      hero(land);
      for(let n=0;n<8;n++){// gasta enquanto houver ouro para o plano seguinte
        const ruin=S.towers.find(t=>t.broken&&!(t.fixT>0)),want=st.base+Math.floor(S.wave*st.wide);
        const recon=S.lives<=S.startLives*0.4?{c:workCost(WORKS.find(w=>w.k==='recon')),go:()=>doAct({a:'work',k:'recon'},1)}:null;
        const plan=ruin?{c:fixCost(ruin),go:()=>doAct({a:'fix',i:ruin.si},1)}:(S.towers.length<want&&build())||upgrade()||build()||recon||sink();
        if(!plan||S.gold<plan.c)return;
        const g=S.gold;plan.go();if(S.gold===g)return;
      }
    };
  }

  window.SIM={
    patch(js){eval(js);},// eval de propósito: é o --patch de quem corre o simulador, numa página local sem rede
    geo(lvl,sug){loadLevel(lvl);const slots=scout(),out={slots,gates:LV.gates.map(g=>({x:Math.round(g.x),y:Math.round(g.y),post:!!g.post})),paths:PATHS.map(P=>Math.round(P.len)),sug:[]};
      if(sug==null)return out;
      // sítios livres onde cabia uma bandeira (mesmas regras do loadLevel) e que mais estrada `sug` apanham com arqueiros
      const R=TYPES.arq.range[1],pts=[];PATHS.forEach((P,p)=>{for(let d=P.seg[0].L;d<P.len;d+=8){const q=posAt(P,d);pts.push({x:q.x,y:q.y,p});}});
      const c=[];for(let x=40;x<=560;x+=8)for(let y=250;y<=840;y+=8){const ins=inPoly(x,y,LV.wall);
        if(SLOTS.some(s=>hyp(s.x-x,s.y-y)<36)||LV.marks.some(m=>hyp(m.x-x,m.y-y)<34))continue;
        if(ins?dPath(x,y)<30:(dPath(x,y)<32||dPoly(x,y,LV.wall)<(LV.style==='medieval'?26:16)||nearWater(x,y,18)||(LV.southRiver&&y>785)))continue;
        const P=PATHS.map((_,p)=>pts.filter(q=>q.p===p&&hyp(q.x-x,q.y-y)<=R).length);if(P[sug])c.push({x,y,ins:ins?1:0,P});}
      c.sort((a,b)=>b.P[sug]-a.P[sug]||b.P.reduce((s,n)=>s+n,0)-a.P.reduce((s,n)=>s+n,0));
      for(const q of c){if(out.sug.length>=10)break;if(!out.sug.some(o=>hyp(o.x-q.x,o.y-q.y)<50))out.sug.push(q);}
      return out;},
    run(c){
      sd=c.seed|0;nGate=0;leakT={};leakP=[];brokeS={};dth=[];gw=[];newGame(c.lvl,c.di,c.hero);S.bot=true;S.started=true;// S.bot: as bênçãos escolhem-se sozinhas
      const think=mkBot(c.st),lives=[S.lives],idle=[],top=SLOTS.map(()=>0),end=c.ondas||0;if(end)S.infinite=true;// --ondas: modo infinito até essa vaga
      // ouro que custa pôr todas as bandeiras no nível 5 com esta mistura (sem reparações)
      const full=k=>TYPES[k].cost+TYPES[k].up.reduce((a,b)=>a+b,0),mx=Object.keys(c.st.mix),need=SLOTS.length*mx.reduce((a,k)=>a+c.st.mix[k]*full(k),0)/mx.reduce((a,k)=>a+c.st.mix[k],0);
      let maxW=0,goldW=0;
      think();startWave(false);
      for(let n=1,w=1;!S.over&&S.t<12000&&!(end&&S.wave>end);n++){update(0.02);
        for(const e of S.enemies)if(!e.gs&&!e.dead&&!e.ride&&!e.f.boss&&e.w!=null){const q=LV.pathGates[e.p][0];if(q&&e.d>=q.d-40){e.gs=1;gw[e.w][e.t][1]++;}}
        if(n%25===0){think();
          // nível mais alto a que cada bandeira já chegou: as quedas não contam
          if(!maxW){S.towers.forEach(t=>{if(t.lv>top[t.si])top[t.si]=t.lv;});if(top.every(v=>v>=5))maxW=S.wave;}
          if(!goldW&&S.diff.gold+S.stats.gold>=need)goldW=S.wave;}
        if(S.wave>w){w=S.wave;lives.push(S.lives);idle.push(Math.round(S.gold));}}
      lives.push(S.lives);if(end&&!S.over){S.win=true;S.wave=end;}
      const dmg={},cnt={},spent={};let broke=0;
      S.towers.forEach(t=>{dmg[t.k]=(dmg[t.k]||0)+(t.dmgDone||0);cnt[t.k]=(cnt[t.k]||0)+1;spent[t.k]=(spent[t.k]||0)+t.spent;broke+=t.deaths||0;});
      return{lvl:c.lvl,di:c.di,hero:c.hero,estr:c.name,seed:c.seed,win:S.win?1:0,wave:S.wave,spent,maxW,goldW,need:Math.round(need),lvPct:top.reduce((a,b)=>a+b,0)/(5*top.length),lives:S.lives,t:Math.round(S.t),kills:S.stats.kills,
        earned:S.stats.gold,gold:Math.round(S.gold),dmg,cnt,broke,gates:nGate,heroLv:S.hero.lv,heroK:S.hero.kills,leakT,leakP,brokeS,dth,gw,
        // vidas perdidas em cada vaga e ouro parado no início de cada vaga
        leak:lives.slice(1).map((v,i)=>Math.max(0,lives[i]-v)),idle,timeout:!S.over&&!end};
    }};
}

/* ---- lado do Node ---- */
const A={};for(let i=2;i<process.argv.length;i++){const k=process.argv[i].replace(/^--/,''),v=process.argv[i+1];if(v==null||v.startsWith('--'))A[k]=true;else{A[k]=v;i++;}}
const list=(v,d)=>v?String(v).split(','):d;
const HTML=path.resolve(A.html||path.join(__dirname,'index.html'));

// cópia temporária do jogo com o simulador lá dentro
const TMP=path.join(os.tmpdir(),'cerco-sim-'+process.pid+'.html');
function inject(){const h=fs.readFileSync(HTML,'utf8'),i=h.lastIndexOf('})();');if(i<0)throw new Error('não encontrei o fim do script do jogo');
  fs.writeFileSync(TMP,h.slice(0,i)+';('+PAGE+')();\n'+h.slice(i));}
process.on('exit',()=>{try{fs.unlinkSync(TMP);}catch(_){}});
async function open(){
  if(!fs.existsSync(TMP))inject();
  let br,err;for(const o of [{},{channel:'chrome'},{channel:'msedge'}]){try{br=await pw.chromium.launch({...o,args:['--disable-gpu']});break;}catch(e){err=e;}}
  if(!br)throw err;
  const page=await br.newPage();
  await page.route(/fonts|jsdelivr|unpkg/,r=>r.abort());
  page.on('pageerror',e=>{console.error('pageerror:',e.message);process.exitCode=1;});
  await page.goto('file:///'+TMP.replace(/\\/g,'/'));
  if(typeof A.patch==='string')await page.evaluate(js=>SIM.patch(js),A.patch);
  return{br,page};
}
// corre os jogos em vários browsers ao mesmo tempo (cada um é um processo)
async function runAll(jobs,par){
  const out=[];let next=0,done=0;
  await Promise.all(Array.from({length:Math.min(par,jobs.length)},async()=>{
    const {br,page}=await open();
    while(next<jobs.length){const j=jobs[next++];out.push(await page.evaluate(c=>SIM.run(c),j));
      if(++done%20===0||done===jobs.length)process.stderr.write(`\r${done}/${jobs.length} jogos`);}
    await br.close();}));
  process.stderr.write('\n');return out;
}
const avg=(a,f)=>a.reduce((s,x)=>s+f(x),0)/(a.length||1),pad=(s,n)=>String(s).padEnd(n),num=(v,d=1)=>v.toFixed(d).padStart(6);
// uma linha por estratégia: vitórias% e vaga média em cada mapa, ordenado pela vaga média geral
function resumo(R){
  const DN=['Turista','Castelhano','Paco'],maps=[...new Set(R.map(r=>r.lvl))],G=new Map();
  R.forEach(r=>{const k=[r.di,r.hero,r.estr].join('|');if(!G.has(k))G.set(k,[]);G.get(k).push(r);});
  console.log('\n'+pad('dif',11)+pad('herói',9)+pad('estratégia',14)+maps.map(m=>pad(m,11)).join('')+'TODOS  (vitórias% / vaga média)');
  const cell=g=>pad(g.length?Math.round(avg(g,r=>r.win)*100)+'/'+avg(g,r=>r.wave).toFixed(1):'—',11);
  [...G].sort((a,b)=>a[0].split('|')[0]-b[0].split('|')[0]||avg(b[1],r=>r.wave+r.win)-avg(a[1],r=>r.wave+r.win)).forEach(([k,g])=>{const [di,hero,estr]=k.split('|');
    console.log(pad(DN[di],11)+pad(hero,9)+pad(estr,14)+maps.map(m=>cell(g.filter(r=>r.lvl===m))).join('')+cell(g));});
}
function report(R){
  const DN=['Turista','Castelhano','Paco'],G=new Map();
  R.forEach(r=>{const k=[r.lvl,r.di,r.hero,r.estr].join('|');if(!G.has(k))G.set(k,[]);G.get(k).push(r);});
  console.log(pad('mapa',9)+pad('dif',11)+pad('herói',9)+pad('estratégia',12)+'  n  vit%  vaga  vidas  torres↓ portas↓  dano% arq/bes/tra/cal   pior vaga');
  for(const [k,g] of G){const [lvl,di,hero,estr]=k.split('|'),tot=avg(g,r=>Object.values(r.dmg).reduce((a,b)=>a+b,0))||1;
    const sh=['arq','bes','tra','cal'].map(t=>Math.round(avg(g,r=>r.dmg[t]||0)/tot*100)).join('/');
    // vaga onde se perdem mais vidas, em média
    const lk=[];g.forEach(r=>r.leak.forEach((v,i)=>lk[i]=(lk[i]||0)+v/g.length));const wi=lk.indexOf(Math.max(...lk));
    console.log(pad(lvl,9)+pad(DN[di],11)+pad(hero,9)+pad(estr,12)+String(g.length).padStart(3)+num(avg(g,r=>r.win)*100,0)+num(avg(g,r=>r.wave))+num(avg(g,r=>r.lives))
      +num(avg(g,r=>r.broke))+'  '+num(avg(g,r=>r.gates))+'       '+pad(sh,17)+(lk[wi]>0?`  ${wi+1} (−${lk[wi].toFixed(1)})`:'  —'));
    if(A.porta){// por vaga: que parte dos inimigos chega à primeira porta (mortos lá ou não) e de que tipos, em média por partida que lá chegou
      const W=[],T={};g.forEach(r=>r.gw.forEach((o,w)=>{if(!o)return;const x=W[w]||(W[w]={n:0,o:{}});x.n++;
        Object.entries(o).forEach(([t,[n,a]])=>{for(const y of [x.o[t]||(x.o[t]=[0,0]),T[t]||(T[t]=[0,0])]){y[0]+=n;y[1]+=a;}});}));
      const ln=(tt,o,k)=>{const E=Object.entries(o),n=E.reduce((s,x)=>s+x[1][0],0),a=E.reduce((s,x)=>s+x[1][1],0);
        console.log('     '+pad(tt,8)+String(Math.round(a/(n||1)*100)).padStart(3)+'% chegam à porta ('+(a/k).toFixed(1)+' de '+(n/k).toFixed(1)+'): '
          +E.filter(x=>x[1][1]).sort((x,y)=>y[1][1]-x[1][1]).map(([t,[n,a]])=>t+' '+(a/k).toFixed(1)+' ('+Math.round(a/n*100)+'%)').join(', '));};
      W.forEach((x,w)=>ln('vaga '+w+':',x.o,x.n));ln('total:',T,g.length);}
    if(A.detalhe){// médias por partida: vidas perdidas por tipo de inimigo e por estrada, torres caídas por bandeira, torres no fim, ouro parado
      const sum=f=>{const o={};g.forEach(r=>Object.entries(f(r)).forEach(([k,v])=>o[k]=(o[k]||0)+(v||0)/g.length));
        return Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+' '+v.toFixed(1)).join(', ');};
      console.log('     passam: '+sum(r=>r.leakT)+' | estrada: '+sum(r=>r.leakP)+'\n     caem (bandeira): '+sum(r=>r.brokeS)+'\n     torres no fim: '+sum(r=>r.cnt)
        +' | ouro ganho '+avg(g,r=>r.earned).toFixed(0)+', parado no fim '+avg(g,r=>r.gold).toFixed(0)+' | heroína nível '+avg(g,r=>r.heroLv).toFixed(1)+', '+avg(g,r=>r.heroK).toFixed(0)+' abates');
      // quando fica tudo no nível 5 (as quedas não contam) e quando o ouro ganho já chegava para isso; dano por ouro investido em cada tipo
      const mw=g.filter(r=>r.maxW),gw=g.filter(r=>r.goldW);
      console.log('     tudo no nível 5: '+(mw.length?`vaga ${avg(mw,r=>r.maxW).toFixed(1)} (${mw.length} de ${g.length} partidas)`:'nunca')+', níveis atingidos '+(avg(g,r=>r.lvPct)*100).toFixed(0)+'%'
        +' | ouro para isso ('+g[0].need+'): '+(gw.length?`vaga ${avg(gw,r=>r.goldW).toFixed(1)} (${gw.length} de ${g.length})`:'nunca')
        +' | dano por ouro: '+['arq','bes','tra','cal'].filter(k=>g.some(r=>r.spent[k])).map(k=>k+' '+(avg(g,r=>r.dmg[k]||0)/(avg(g,r=>r.spent[k]||0)||1)).toFixed(0)).join(', '));
      // por estrada (sem as lendas): quantos morrem, a que altura do caminho, quantos chegam à primeira porta e quem os mata
      for(let p=0;p<3;p++){const D=g.map(r=>r.dth[p]).filter(Boolean),n=D.reduce((a,o)=>a+o.n,0);if(!n)continue;const by={};D.forEach(o=>Object.entries(o.by).forEach(([k,v])=>by[k]=(by[k]||0)+v));
        console.log('     estrada '+p+': '+(n/g.length).toFixed(0)+' abates, morrem a '+(D.reduce((a,o)=>a+o.pr,0)/n*100).toFixed(0)+'% do caminho, '+(D.reduce((a,o)=>a+o.gate,0)/n*100).toFixed(0)+'% chegam à porta | quem mata: '
          +Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+Math.round(v/n*100)+'%').join(', '));
        // quem chega à porta: por tipo, quantos por partida e que parte dos desse tipo
        const gt={},nt={};D.forEach(o=>{Object.entries(o.gt).forEach(([k,v])=>gt[k]=(gt[k]||0)+v);Object.entries(o.nt).forEach(([k,v])=>nt[k]=(nt[k]||0)+v);});
        if(Object.keys(gt).length)console.log('       chegam à porta: '+Object.entries(gt).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(v/g.length).toFixed(1)+' ('+Math.round(v/nt[k]*100)+'%)').join(', '));}}}
}
(async()=>{
  if(A.geo){const {br,page}=await open();
    for(const m of list(A.mapas,['valenca','moncao','ancora','cerveira','melgaco'])){const g=await page.evaluate(([m,s])=>SIM.geo(m,s),[m,A.sugere==null?null:+A.sugere]);
      console.log(`\n${m}: ${g.slots.length} bandeiras, portas ${JSON.stringify(g.gates)}, estradas ${g.paths}`);
      // por tipo: estrada ao alcance em cada caminho (0+1+2) / portas ao alcance
      g.slots.forEach((s,i)=>console.log(pad(i,3)+pad(s.kind,4)+pad(s.x+','+s.y,9)+' fundo '+s.depth.toFixed(2)+'  '
        +['arq','bes','tra','cal'].map(k=>`${k} ${pad(s[k].P.join('+'),9)}/${s[k].stall}`).join('  ')));
      console.log('estrada ao alcance, somando as bandeiras: '+['arq','bes','tra','cal'].map(k=>k+' '+g.paths.map((_,p)=>g.slots.reduce((a,s)=>a+s[k].P[p],0)).join('+')).join('  '));
      if(g.sug.length)console.log(`sítios livres que mais apanham a estrada ${A.sugere} (arqueiros):\n`+g.sug.map(q=>`  ${q.x},${q.y}${q.ins?' (dentro)':''}  ${q.P.join('+')}`).join('\n'));}
    return br.close();}
  if(A.teste){// a mesma semente tem de dar exatamente a mesma partida, e a partida tem de acabar
    const {br,page}=await open(),c={lvl:'valenca',di:1,hero:'padeira',seed:7,name:'base',st:{...BASE}};
    const a=await page.evaluate(c=>SIM.run(c),c),b=await page.evaluate(c=>SIM.run(c),c);await br.close();
    require('assert').deepStrictEqual(a,b);require('assert').ok(!a.timeout&&a.wave>=1&&a.kills>0);
    return console.log('ok: partida repetível, vaga',a.wave,a.win?'(vitória)':'(derrota)',a.kills,'abates');}
  if(typeof A.def==='string')Object.assign(ESTR,JSON.parse(A.def[0]==='{'?A.def:fs.readFileSync(A.def,'utf8')));// estratégias à experiência: JSON ou ficheiro
  const jobs=[];
  for(const lvl of list(A.mapas,['valenca','moncao','ancora','cerveira','melgaco']))for(const di of list(A.dif,[1]))for(const hero of list(A.herois,['padeira']))
    for(const name of list(A.estr,Object.keys(ESTR))){if(!ESTR[name])throw new Error('estratégia desconhecida: '+name);
      for(let s=1;s<=(+A.n||10);s++)jobs.push({lvl,di:+di,hero,name,seed:s,ondas:+A.ondas||0,st:{...BASE,...ESTR[name]}});}
  // prioridade baixa (os browsers herdam-na) e só 2 em paralelo, para não prender a máquina; --par sobe isto
  try{os.setPriority(os.constants.priority.PRIORITY_LOW);}catch(_){}
  const t0=Date.now(),R=await runAll(jobs,+A.par||2);
  if(!A.curto)report(R);resumo(R);console.log(`${R.length} jogos em ${((Date.now()-t0)/1000).toFixed(0)} s`+(R.some(r=>r.timeout)?' (ATENÇÃO: houve partidas que não acabaram)':''));
  if(typeof A.csv==='string'){const c=['lvl','di','hero','estr','seed','win','wave','lives','t','kills','earned','gold','broke','gates','heroLv','heroK'];
    fs.writeFileSync(A.csv,[c.concat('dmg_arq','dmg_bes','dmg_tra','dmg_cal','leak').join(',')].concat(R.map(r=>c.map(k=>r[k]).concat(['arq','bes','tra','cal'].map(k=>Math.round(r.dmg[k]||0)),r.leak.join(' ')).join(','))).join('\n'));
    console.log('CSV em',A.csv);}
})().catch(e=>{console.error(e);process.exit(1);});
