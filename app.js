/* ===== CivilGo 公職衝刺系統 — app.js (Phase 1) ===== */
const App = (() => {
  const KEY = 'civilgo_state_v1';
  const XP_DAY = 50, XP_CORRECT = 10;
  const PHASE_NAMES = {1:'行政學概要',2:'政治學概要',3:'地方自治概要',4:'公共管理概要'};
  const SUBJ_BY_PHASE = {1:'行政學',2:'政治學',3:'地方自治',4:'公共管理'}; // 對應題庫 subject

  let COURSES = null, QUESTIONS = [], state = null;
  const el = id => document.getElementById(id);
  const app = () => el('app');

  // ---------- State ----------
  function load(){
    try{ state = JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ state = {}; }
    state.done   = state.done   || {};
    state.xp     = state.xp     || 0;
    state.streak = state.streak || 0;
    state.lastStudy = state.lastStudy || null;
    state.answered  = state.answered  || {};
    state.wrong     = state.wrong     || [];
  }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  function today(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function bumpStreak(){
    const t=today();
    if(state.lastStudy===t) return;
    const y=new Date(); y.setDate(y.getDate()-1);
    const ys=y.getFullYear()+'-'+(y.getMonth()+1)+'-'+y.getDate();
    state.streak = (state.lastStudy===ys) ? state.streak+1 : 1;
    state.lastStudy = t;
  }
  function addXP(n){ state.xp += n; }
  function level(){ return Math.floor(state.xp/500)+1; }
  function doneCount(){ return Object.keys(state.done).filter(k=>state.done[k]).length; }

  // ---------- Data ----------
  async function fetchJSON(p){ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) throw new Error(p); return r.json(); }
  async function boot(){
    load();
    app().innerHTML = loading();
    try{
      const [c,q] = await Promise.all([ fetchJSON('./courses.json'), fetchJSON('./questions.json') ]);
      COURSES=c; QUESTIONS=q.questions||[];
    }catch(e){
      app().innerHTML = `<div class="view"><div class="empty">課程資料載入失敗。<br>請確認 courses.json 與 questions.json 已與 index.html 放在同一層，並透過網址（http/https）開啟。</div></div>`;
      return;
    }
    initTTS();
    window.addEventListener('hashchange', route);
    route();
  }

  // ---------- Routing ----------
  function route(){
    stopSpeak();
    const h = location.hash.replace(/^#\/?/,'');
    const [seg,arg] = h.split('/');
    if(seg==='schedule') return renderSchedule();
    if(seg==='day')      return renderDay(parseInt(arg,10)||currentDay());
    if(seg==='quiz')     return renderQuiz(arg);
    if(seg==='me')       return renderMe();
    return renderHome();
  }
  const go = h => { location.hash = h; };
  function currentDay(){
    for(let i=1;i<=90;i++){ if(!state.done[i]) return i; }
    return 90;
  }
  function dayObj(n){ return COURSES.days.find(d=>d.day===n); }

  // ---------- Shared chrome ----------
  function nav(active){
    const item=(h,ic,t,k)=>`<a href="#/${h}" class="${active===k?'on':''}"><span class="ni">${ic}</span>${t}</a>`;
    return `<div class="nav">
      ${item('','🏠','首頁','home')}
      ${item('schedule','🗓️','課表','sched')}
      ${item('quiz','✍️','題庫','quiz')}
      ${item('me','🎖️','我的','me')}
    </div>`;
  }
  function brand(){
    return `<div class="brand"><div class="logo">
      <span class="mark">Civil<b>Go</b></span>
      <span class="track">115 普考・一般民政</span>
    </div>
    <button class="icon-btn" onclick="App.toggleTheme()" aria-label="切換深淺色">◐</button></div>`;
  }

  // ---------- Home ----------
  function ring(pct){
    const r=42, c=2*Math.PI*r, off=c*(1-pct/100);
    return `<svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="url(#g)" stroke-width="8"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#C7402B"/><stop offset="1" stop-color="#C9A24A"/>
      </linearGradient></defs></svg>`;
  }
  function phaseBar(p){
    const ds=COURSES.days.filter(d=>d.phase===p);
    const done=ds.filter(d=>state.done[d.day]).length;
    const pct=Math.round(done/ds.length*100);
    return `<div class="phase"><div class="pr">
      <span class="pn">第${p}階段　${PHASE_NAMES[p]}</span>
      <span class="pc">${done}/${ds.length}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  function renderHome(){
    const done=doneCount(), pct=Math.round(done/90*100);
    const cur=dayObj(currentDay());
    app().innerHTML = `<div class="view">
      ${brand()}
      <div class="hero">
        <div class="eyebrow">金榜進度</div>
        <h1>每天 30 分鐘，用通勤考上一般民政</h1>
        <div class="sub">已完成 ${done} 天 / 共 90 天</div>
        <div class="ring-wrap">
          <div class="ring">${ring(pct)}<div class="num"><b>${pct}%</b><span>完課率</span></div></div>
          <div class="hero-stats">
            <div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
            <div class="stat"><div class="v">Lv.${level()}</div><div class="k">${state.xp} XP</div></div>
            <div class="stat"><div class="v">${done}<small>/90</small></div><div class="k">完成天數</div></div>
            <div class="stat"><div class="v">${Object.keys(state.answered).length}</div><div class="k">已答題數</div></div>
          </div>
        </div>
      </div>

      <div class="sec-head"><h2>今日任務</h2><span class="eb">AI 教練建議</span></div>
      <div class="today">
        <div class="row">
          <div><div class="daytag">DAY ${cur.day}・${cur.subject}</div>
            <h3>${cur.title}</h3>
            <div class="subj">Podcast 課程 ‧ 約 15 分鐘</div></div>
          <div class="daynum">${cur.day}</div>
        </div>
        <button class="btn btn-primary" onclick="App.go('day/${cur.day}')">▶ 開始今日課程</button>
        <button class="btn btn-ghost" onclick="App.go('quiz')">✍️ 直接練 20 題</button>
      </div>

      <div class="sec-head"><h2>學習工具</h2></div>
      <div class="tiles">
        <button class="tile" onclick="App.go('day/${cur.day}')"><span class="ic">🎧</span>
          <span class="t">Podcast 模式</span><span class="d">六段式講解＋語音朗讀</span></button>
        <button class="tile" onclick="App.carFromDay(${cur.day})"><span class="ic">🚗</span>
          <span class="t">車用模式</span><span class="d">純語音，問答停 5 秒</span></button>
        <button class="tile" onclick="App.go('quiz')"><span class="ic">📝</span>
          <span class="t">2000 題題庫</span><span class="d">即時對答案＋解析</span></button>
        <button class="tile" onclick="App.go('schedule')"><span class="ic">🗓️</span>
          <span class="t">90 天課表</span><span class="d">完成即蓋上朱印</span></button>
      </div>

      <div class="sec-head"><h2>四階段進度</h2></div>
      ${[1,2,3,4].map(phaseBar).join('')}
      <div class="note">CivilGo ${COURSES.meta.version}・單檔 PWA・離線可用</div>
    </div>${nav('home')}`;
  }

  // ---------- Schedule ----------
  let schedFilter = 0; // 0=all, else phase
  function renderSchedule(){
    const cur=currentDay();
    const days = COURSES.days.filter(d=> !schedFilter || d.phase===schedFilter);
    const chip=(p,t)=>`<button class="chip ${schedFilter===p?'on':''}" onclick="App.setFilter(${p})">${t}</button>`;
    app().innerHTML = `<div class="view">
      ${brand()}
      <div class="sec-head"><h2>90 天課表</h2><span class="eb">完成 ${doneCount()}/90</span></div>
      <div class="filter">
        ${chip(0,'全部')}${chip(1,'行政學')}${chip(2,'政治學')}${chip(3,'地方自治')}${chip(4,'公共管理')}
      </div>
      <div class="dlist">
        ${days.map(d=>{
          const done=!!state.done[d.day], isToday=d.day===cur && !done;
          const seal = done ? `<div class="seal stamped">閱</div>`
                            : `<div class="seal empty">${d.day}</div>`;
          return `<a class="ditem ${done?'done':''} ${isToday?'today-row':''}" href="#/day/${d.day}">
            <div class="dn">D${d.day}</div>
            <div class="meta"><div class="tt">${d.title}</div>
              <div class="ss">第${d.phase}階段・${d.subject}${isToday?'　·　今日':''}</div></div>
            ${seal}</a>`;
        }).join('')}
      </div>
    </div>${nav('sched')}`;
  }
  function setFilter(p){ schedFilter=p; renderSchedule(); }

  // ---------- Day / Podcast ----------
  function segIcon(k){return {intro:'🎬',core:'💡',exam_points:'🎯',past_questions:'📜',quickfire:'⚡',summary:'✅'}[k]||'•';}
  function renderDay(n){
    const d=dayObj(n); if(!d) return go('');
    const pc=d.podcast, segs=COURSES.meta.podcast_segments;
    const segHTML = segs.map(s=>{
      const v=pc[s.key]; let body='';
      if(s.key==='exam_points'){ body=`<ul>${v.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`; }
      else if(s.key==='past_questions'||s.key==='quickfire'){
        body=v.map(x=>`<div class="qa"><div class="q">Q：${esc(x.q)}</div><div class="a">A：${esc(x.a)}</div></div>`).join('');
      } else { body=`<p${isPH(v)?' class="placeholder-tag"':''}>${esc(v)}</p>`; }
      return `<div class="seg" data-seg="${s.key}"><div class="sh">
        <span>${segIcon(s.key)}</span><span class="lab">${s.label}</span><span class="min">${s.minutes} 分</span></div>${body}</div>`;
    }).join('');
    const done=!!state.done[n];
    app().innerHTML = `<div class="view">
      <div class="lp-top">
        <button class="back" onclick="App.go('schedule')">‹</button>
        <div class="lp-title"><div class="d">DAY ${d.day}・第${d.phase}階段 ${d.subject}</div><h2>${d.title}</h2></div>
      </div>
      <div class="player">
        <div class="now" id="nowSeg">準備就緒</div>
        <div class="nowtext" id="nowText">點下方播放鍵，依六段式語音講解。也可開啟車用模式純聽。</div>
        <div class="controls">
          <button class="cbtn" onclick="App.carFromDay(${n})" title="車用模式">🚗</button>
          <button class="cbtn main" id="playBtn" onclick="App.togglePlay(${n})">▶</button>
          <button class="cbtn" onclick="App.stopSpeak()" title="停止">■</button>
        </div>
      </div>
      <div class="segs">${segHTML}</div>
      <button class="btn ${done?'btn-gold':'btn-primary'}" id="doneBtn" onclick="App.markDone(${n})">
        ${done?'✓ 已完成（再點可保留）':'蓋上朱印・完成今日 +'+XP_DAY+' XP'}</button>
      <button class="btn btn-ghost" onclick="App.go('quiz/'+'${encodeURIComponent(SUBJ_BY_PHASE[d.phase])}')">練這科的題目 ›</button>
      <div style="height:8px"></div>
    </div>${nav('sched')}`;
  }

  function markDone(n){
    const first=!state.done[n];
    state.done[n]=true;
    if(first){ addXP(XP_DAY); bumpStreak(); save(); toast(`朱印已蓋 ‧ +${XP_DAY} XP`); }
    else save();
    renderDay(n);
  }

  // ---------- TTS ----------
  let voices=[], zhVoice=null, speaking=false, queue=[], qIdx=0, carMode=false, curPlayDay=null, pauseTimer=null;
  function initTTS(){
    if(!('speechSynthesis' in window)) return;
    const pick=()=>{ voices=speechSynthesis.getVoices();
      zhVoice = voices.find(v=>/zh[-_]?TW/i.test(v.lang)) || voices.find(v=>/zh|cmn/i.test(v.lang)) || null; };
    pick(); speechSynthesis.onvoiceschanged=pick;
  }
  function buildQueue(n){
    const d=dayObj(n), pc=d.podcast, out=[];
    const seg=(key,text,pauseAfter)=>out.push({key,text,pauseAfter:!!pauseAfter});
    seg('intro', strip(pc.intro));
    seg('core', strip(pc.core));
    pc.exam_points.forEach((x,i)=>seg('exam_points',`重點${i+1}。${strip(x)}`));
    pc.past_questions.forEach(x=>{ seg('past_questions','歷屆考題。'+strip(x.q), true); seg('past_questions','答案。'+strip(x.a)); });
    pc.quickfire.forEach(x=>{ seg('quickfire','快問。'+strip(x.q), true); seg('quickfire','快答。'+strip(x.a)); });
    seg('summary', strip(pc.summary));
    return out;
  }
  function speakNext(){
    if(qIdx>=queue.length){ finishPlay(); return; }
    const item=queue[qIdx];
    highlight(item.key, item.text);
    const u=new SpeechSynthesisUtterance(item.text);
    u.lang='zh-TW'; if(zhVoice) u.voice=zhVoice; u.rate=1.0; u.pitch=1.0;
    u.onend=()=>{
      qIdx++;
      const gap = (carMode && item.pauseAfter) ? 5000 : 120;
      pauseTimer=setTimeout(speakNext, gap);
    };
    u.onerror=()=>{ qIdx++; pauseTimer=setTimeout(speakNext,120); };
    speechSynthesis.speak(u);
  }
  function startPlay(n){
    if(!('speechSynthesis' in window)){ toast('此瀏覽器不支援語音朗讀'); return; }
    stopSpeak(); curPlayDay=n; queue=buildQueue(n); qIdx=0; speaking=true;
    const b=el('playBtn'); if(b) b.textContent='⏸';
    speakNext();
  }
  function togglePlay(n){ if(speaking) stopSpeak(); else startPlay(n); }
  function stopSpeak(){
    if('speechSynthesis' in window) speechSynthesis.cancel();
    clearTimeout(pauseTimer); speaking=false;
    const b=el('playBtn'); if(b) b.textContent='▶';
    document.querySelectorAll('.seg.active').forEach(s=>s.classList.remove('active'));
  }
  function finishPlay(){
    speaking=false; const b=el('playBtn'); if(b) b.textContent='▶';
    const ns=el('nowSeg'), nt=el('nowText'); if(ns) ns.textContent='播放完畢';
    if(nt) nt.textContent='可以蓋上朱印完成今日，或開啟車用模式再聽一次。';
    if(carMode) updateCar('完成','本日課程播放完畢 ‧ 記得蓋章','');
  }
  function highlight(key,text){
    const ns=el('nowSeg'), nt=el('nowText');
    const label=(COURSES.meta.podcast_segments.find(s=>s.key===key)||{}).label||'';
    if(ns) ns.textContent=label; if(nt) nt.textContent=text;
    document.querySelectorAll('.seg').forEach(s=>s.classList.toggle('active', s.dataset.seg===key));
    if(carMode) updateCar(label, text, key);
  }

  // ---------- Car mode ----------
  function carFromDay(n){
    if(location.hash.indexOf('day/'+n)<0) location.hash='day/'+n;
    setTimeout(()=>openCar(n),60);
  }
  function openCar(n){
    carMode=true;
    const ov=document.createElement('div'); ov.className='car'; ov.id='carOv';
    ov.innerHTML=`<button class="ex" onclick="App.closeCar()">✕</button>
      <div class="badge">車用模式 ‧ CAR MODE</div>
      <div class="seg-name" id="carSeg">準備播放</div>
      <div class="big" id="carBig">第 ${n} 天課程<br>點 ▶ 開始</div>
      <div class="cc">
        <button onclick="App.carPrev()" title="上一段">⏮</button>
        <button class="pp" id="carPP" onclick="App.carToggle(${n})">▶</button>
        <button onclick="App.carNext()" title="下一段">⏭</button>
      </div>
      <div class="hint">行車請專心 ‧ 問題後會停 5 秒讓你作答</div>`;
    document.body.appendChild(ov);
  }
  function updateCar(seg,text,key){
    const s=el('carSeg'), b=el('carBig'); if(s) s.textContent=seg||''; if(b) b.textContent=text||'';
  }
  function carToggle(n){ const pp=el('carPP');
    if(speaking){ stopSpeak(); if(pp) pp.textContent='▶'; }
    else { startPlay(n); if(pp) pp.textContent='⏸'; } }
  function carNext(){ if(qIdx<queue.length-1){ clearTimeout(pauseTimer); speechSynthesis.cancel(); qIdx++; speakNext(); } }
  function carPrev(){ if(qIdx>0){ clearTimeout(pauseTimer); speechSynthesis.cancel(); qIdx=Math.max(0,qIdx-1); speakNext(); } }
  function closeCar(){ carMode=false; stopSpeak(); const ov=el('carOv'); if(ov) ov.remove(); }

  // ---------- Quiz ----------
  let quizSet=[], quizI=0, quizAnswered=false, quizSubject=null;
  const SUBJECTS=['行政學','政治學','地方自治','公共管理'];
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function renderQuiz(subjArg){
    quizSubject = subjArg ? decodeURIComponent(subjArg) : null;
    let pool = QUESTIONS;
    if(quizSubject) pool = pool.filter(q=>q.subject===quizSubject);
    if(!pool.length){ app().innerHTML=`<div class="view">${brand()}<div class="empty">此科目尚無題目。<br>可在 data/questions.json 依範例格式新增。</div></div>${nav('quiz')}`; return; }
    quizSet = shuffle(pool).slice(0,20); quizI=0; quizAnswered=false;
    quizQuestion();
  }
  function quizQuestion(){
    if(quizI>=quizSet.length) return quizResult();
    const q=quizSet[quizI];
    app().innerHTML=`<div class="view">
      <div class="lp-top"><button class="back" onclick="App.go('')">‹</button>
      <div class="lp-title"><div class="d">題庫練習${quizSubject?'・'+quizSubject:''}</div><h2>第 ${quizI+1} 題</h2></div></div>
      <div class="qcard">
        <div class="qprog"><span>${quizI+1} / ${quizSet.length}</span><span>${q.subject}・${q.chapter}</span></div>
        <div class="qtext">${esc(q.question)}</div>
        <div class="opts" id="opts">
          ${q.options.map((o,i)=>`<button class="opt" data-i="${i}" onclick="App.answer(${i})">
            <span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}
        </div>
        <div id="after"></div>
      </div>
    </div>${nav('quiz')}`;
  }
  function answer(i){
    if(quizAnswered) return; quizAnswered=true;
    const q=quizSet[quizI], correct=q.answer, right=i===correct;
    document.querySelectorAll('.opt').forEach(b=>{ const bi=+b.dataset.i; b.disabled=true;
      if(bi===correct) b.classList.add('correct');
      if(bi===i && !right) b.classList.add('wrong'); });
    state.answered[q.id]=right;
    if(right){ addXP(XP_CORRECT); state.wrong=state.wrong.filter(x=>x!==q.id); }
    else if(!state.wrong.includes(q.id)) state.wrong.push(q.id);
    bumpStreak(); save();
    el('after').innerHTML=`<div class="expl"><b>${right?'答對 +'+XP_CORRECT+' XP':'答錯了'}</b>　正解：${'ABCD'[correct]}<br>${esc(q.explanation)}</div>
      <button class="btn btn-primary" onclick="App.nextQ()">${quizI+1<quizSet.length?'下一題 ›':'看結果 ›'}</button>`;
  }
  function nextQ(){ quizI++; quizAnswered=false; quizQuestion(); }
  function quizResult(){
    const ids=quizSet.map(q=>q.id), got=ids.filter(id=>state.answered[id]).length;
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero" style="text-align:center">
        <div class="eyebrow">本回合結束</div>
        <h1 style="margin-top:10px">${got} / ${quizSet.length} 題答對</h1>
        <div class="sub">正確率 ${Math.round(got/quizSet.length*100)}%　·　錯題已自動收錄</div>
      </div>
      <button class="btn btn-primary" onclick="App.go('quiz'+'${quizSubject?'/'+encodeURIComponent(quizSubject):''}')">再來一回合</button>
      <button class="btn btn-ghost" onclick="App.go('')">回首頁</button>
    </div>${nav('quiz')}`;
  }

  // ---------- Me ----------
  function renderMe(){
    const done=doneCount();
    const accAll=Object.values(state.answered);
    const acc = accAll.length ? Math.round(accAll.filter(Boolean).length/accAll.length*100) : 0;
    const bySubj = SUBJECTS.map(s=>{
      const list=QUESTIONS.filter(q=>q.subject===s).map(q=>q.id);
      const ans=list.filter(id=>id in state.answered);
      const right=ans.filter(id=>state.answered[id]).length;
      return {s, total:list.length, ans:ans.length, acc: ans.length?Math.round(right/ans.length*100):0};
    });
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero">
        <div class="eyebrow">我的學習</div>
        <h1>Lv.${level()}　${state.xp} XP</h1>
        <div class="sub">距下一級還差 ${500-(state.xp%500)} XP</div>
        <div class="ring-wrap"><div class="hero-stats" style="grid-template-columns:1fr 1fr 1fr">
          <div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
          <div class="stat"><div class="v">${done}<small>/90</small></div><div class="k">完成天數</div></div>
          <div class="stat"><div class="v">${acc}%</div><div class="k">總正確率</div></div>
        </div></div>
      </div>
      <div class="sec-head"><h2>各科表現</h2><span class="eb">已答 ${accAll.length} 題</span></div>
      ${bySubj.map(b=>`<div class="phase"><div class="pr">
        <span class="pn">${b.s}</span><span class="pc">${b.ans}/${b.total} 題・正確 ${b.acc}%</span></div>
        <div class="bar"><i style="width:${b.acc}%"></i></div></div>`).join('')}
      <div class="sec-head"><h2>錯題庫</h2><span class="eb">Phase 2 深化</span></div>
      <div class="today"><div class="row"><div>
        <div class="daytag">待複習</div><h3>${state.wrong.length} 題錯題</h3>
        <div class="subj">間隔複習將於 Phase 2 排程</div></div><div class="daynum">${state.wrong.length}</div></div>
        <button class="btn ${state.wrong.length?'btn-primary':'btn-ghost'}" ${state.wrong.length?'':'disabled'} onclick="App.go('quiz')">繼續練題</button>
      </div>
      <button class="btn btn-ghost" style="margin-top:14px" onclick="App.reset()">重設所有進度</button>
      <div style="height:8px"></div>
    </div>${nav('me')}`;
  }
  function reset(){ if(confirm('確定要清除所有進度、XP 與紀錄嗎？')){ localStorage.removeItem(KEY); load(); go(''); toast('已重設'); } }

  // ---------- Utils ----------
  function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function isPH(s){ return typeof s==='string' && s.indexOf('待補')>=0; }
  function strip(s){ return String(s).replace(/〔[^〕]*〕/g,'（此段待補充內容）').replace(/[（）()]/g,'，'); }
  function toggleTheme(){
    const cur=document.documentElement.getAttribute('data-theme');
    const next = cur==='dark' ? 'light' : cur==='light' ? 'dark' : (matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    document.documentElement.setAttribute('data-theme',next);
    try{ localStorage.setItem('civilgo_theme',next); }catch(e){}
  }
  function loading(){ return `<div class="view" style="display:grid;place-items:center;min-height:60vh"><div class="empty">課程載入中…</div></div>`; }
  function toast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }

  // theme on boot
  (function(){ try{ const t=localStorage.getItem('civilgo_theme'); if(t) document.documentElement.setAttribute('data-theme',t); }catch(e){} })();

  return { boot, go, setFilter, togglePlay, stopSpeak, markDone, answer, nextQ,
           carFromDay, carToggle, carNext, carPrev, closeCar, toggleTheme, reset };
})();
document.addEventListener('DOMContentLoaded', App.boot);
