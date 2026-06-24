/* ===== CivilGo 公職衝刺系統 — app.js V4.0 ===== */
const App = (() => {
  const KEY='civilgo_state_v1';
  const XP_DAY=50, XP_CORRECT=10, XP_BONUS=30, XP_VOICE=15;
  const PHASE_NAMES={1:'行政學概要',2:'政治學概要',3:'地方自治概要',4:'公共管理概要'};
  const SUBJ_BY_PHASE={1:'行政學',2:'政治學',3:'地方自治',4:'公共管理'};
  const SUBJECTS=['行政學','政治學','地方自治','公共管理'];

  let COURSES=null, QUESTIONS=[], ESSAYS=[], state=null;
  const el=id=>document.getElementById(id);
  const app=()=>el('app');

  // ---------- State ----------
  function load(){
    try{ state=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ state={}; }
    state.done=state.done||{}; state.xp=state.xp||0; state.streak=state.streak||0;
    state.lastStudy=state.lastStudy||null; state.answered=state.answered||{}; state.wrong=state.wrong||[];
    ensureDaily();
  }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} }
  function today(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function ensureDaily(){
    if(!state.daily || state.daily.date!==today())
      state.daily={date:today(),podcast:false,quiz:0,voice:false,essay:false,bonus:false};
  }
  function bumpStreak(){
    const t=today(); if(state.lastStudy===t) return;
    const y=new Date(); y.setDate(y.getDate()-1);
    const ys=y.getFullYear()+'-'+(y.getMonth()+1)+'-'+y.getDate();
    state.streak=(state.lastStudy===ys)?state.streak+1:1; state.lastStudy=t;
  }
  function addXP(n){ state.xp+=n; }
  function level(){ return Math.floor(state.xp/500)+1; }
  function doneCount(){ return Object.keys(state.done).filter(k=>state.done[k]).length; }
  function checkDailyComplete(){
    const d=state.daily;
    if(d.podcast && d.quiz>=10 && d.voice && d.essay && !d.bonus){
      d.bonus=true; addXP(XP_BONUS); save(); toast('今日任務全達成 ‧ +'+XP_BONUS+' XP 🎖️');
    }
  }

  // ---------- Boot ----------
  async function fetchJSON(p){ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) throw new Error(p); return r.json(); }
  async function boot(){
    load(); app().innerHTML=loading();
    try{
      const [c,q,es]=await Promise.all([fetchJSON('./courses.json'),fetchJSON('./questions.json'),fetchJSON('./essays.json')]);
      COURSES=c; QUESTIONS=q.questions||[]; ESSAYS=es.essays||[];
    }catch(e){
      app().innerHTML=`<div class="view"><div class="empty">課程資料載入失敗。<br>請確認 courses.json、questions.json、essays.json 與 index.html 放在同一層，並透過網址（http/https）開啟。</div></div>`;
      return;
    }
    initTTS(); window.addEventListener('hashchange',route); route();
  }

  // ---------- Routing ----------
  function route(){
    stopSpeak();
    const h=location.hash.replace(/^#\/?/,''); const [seg,arg]=h.split('/');
    if(seg==='schedule') return renderSchedule();
    if(seg==='day')      return renderDay(parseInt(arg,10)||currentDay());
    if(seg==='quiz')     return quizActive?quizQuestion():renderQuizSetup();
    if(seg==='me')       return renderMe();
    return renderHome();
  }
  const go=h=>{ location.hash=h; };
  function currentDay(){ for(let i=1;i<=90;i++){ if(!state.done[i]) return i; } return 90; }
  function dayObj(n){ return COURSES.days.find(d=>d.day===n); }
  function modeObj(k){ return COURSES.meta.modes.find(m=>m.key===k); }
  function segMeta(k){ return COURSES.meta.segments.find(s=>s.key===k)||{label:'',icon:'•'}; }

  // ---------- Shared ----------
  function nav(active){
    const it=(h,ic,t,k)=>`<a href="#/${h}" class="${active===k?'on':''}"><span class="ni">${ic}</span>${t}</a>`;
    return `<div class="nav">${it('','🏠','首頁','home')}${it('schedule','🗓️','課表','sched')}${it('quiz','✍️','題庫','quiz')}${it('me','🎖️','我的','me')}</div>`;
  }
  function brand(){ return `<div class="brand"><div class="logo">
    <span class="mark">Civil<b>Go</b></span><span class="track">115 普考・一般民政</span></div>
    <button class="ico" onclick="App.toggleTheme()" aria-label="切換深淺色">◐</button></div>`; }
  function topbar(d,h2,toQuiz){ return `<div class="topbar">
    <button class="back" onclick="App.go('${toQuiz||'schedule'}')" aria-label="返回">‹</button>
    <div class="tt"><div class="d">${d}</div><h2>${h2}</h2></div>
    <button class="ico" onclick="App.toggleTheme()">◐</button></div>`; }
  function stars(n){ let s=''; for(let i=1;i<=5;i++) s+=`<span class="${i<=n?'':'off'}">★</span>`;
    return `<span class="stars">${s}<span class="lab">${COURSES.meta.stars[n]||''}</span></span>`; }

  // ---------- Home ----------
  function ring(pct){ const r=42,c=2*Math.PI*r,off=c*(1-pct/100);
    return `<svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C7402B"/><stop offset="1" stop-color="#C9A24A"/></linearGradient></defs></svg>`; }
  function phaseBar(p){ const ds=COURSES.days.filter(d=>d.phase===p),done=ds.filter(d=>state.done[d.day]).length,pct=Math.round(done/ds.length*100);
    return `<div class="phase"><div class="pr"><span class="pn">第${p}階段　${PHASE_NAMES[p]}</span><span class="pc">${done}/${ds.length}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`; }

  function renderHome(){
    const done=doneCount(),pct=Math.round(done/90*100),cur=dayObj(currentDay());
    const dy=state.daily, subjToday=SUBJ_BY_PHASE[cur.phase];
    const mustAll=QUESTIONS.filter(q=>q.must);
    const todayMust=mustAll.filter(q=>q.subject===subjToday).length;
    const weekSubs=[...new Set(Array.from({length:7},(_,i)=>dayObj(Math.min(90,cur.day+i))).map(d=>SUBJ_BY_PHASE[d.phase]))];
    const weekMust=mustAll.filter(q=>weekSubs.includes(q.subject)).length;
    const task=(done,ic,t,s,act)=>`<button class="task ${done?'done':''}" onclick="${act}">
      <span class="ck">✓</span><span class="tx"><b>${ic} ${t}</b><span>${s}</span></span><span class="go">${done?'已完成':'前往 ›'}</span></button>`;
    app().innerHTML=`<div class="view">
      ${brand()}
      <div class="hero"><div class="eyebrow">金榜進度</div>
        <h1>一般民政 Duolingo × Podcast × AI 家教</h1>
        <div class="sub">已完成 ${done} 天 / 共 90 天　·　每日 35–50 分鐘</div>
        <div class="ring-wrap"><div class="ring">${ring(pct)}<div class="num"><b>${pct}%</b><span>完課率</span></div></div>
          <div class="hero-stats">
            <div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
            <div class="stat"><div class="v">Lv.${level()}</div><div class="k">${state.xp} XP</div></div>
            <div class="stat"><div class="v">${done}<small>/90</small></div><div class="k">完成天數</div></div>
            <div class="stat"><div class="v">${Object.keys(state.answered).length}</div><div class="k">已答題數</div></div>
          </div></div></div>

      <div class="sec-head"><h2>今日任務</h2><span class="eb">${[dy.podcast,dy.quiz>=10,dy.voice,dy.essay].filter(Boolean).length}/4 完成</span></div>
      <div class="today">
        <div class="row"><div><div class="daytag">DAY ${cur.day}・${cur.subject}</div>
          <h3>${cur.title}</h3>${stars(cur.importance)}</div><div class="daynum">${cur.day}</div></div>
        <div class="tasks">
          ${task(dy.podcast,'🎧','Podcast 課程','20–25 分鐘（完整版）',"App.go('day/"+cur.day+"')")}
          ${task(dy.quiz>=10,'📝','選擇題 10–20 題','今日進度 '+Math.min(dy.quiz,20)+' 題',"App.launchQuiz({subject:'"+subjToday+"'})")}
          ${task(dy.voice,'🔊','語音複習 5 分鐘','聽完今日快問快答',"App.voiceReview("+cur.day+")")}
          ${task(dy.essay,'✒️','申論演練 1 題','當日課程申論題',"App.go('day/"+cur.day+"')")}
        </div>
      </div>

      <div class="sec-head"><h2>必考專區</h2><span class="eb">依近五年考情</span></div>
      <div class="must-grid">
        <button class="must-card" onclick="App.launchQuiz({must:true,subject:'${subjToday}'})">
          <span class="ic">🎯</span><span class="t">今日必考題</span><span class="d">${subjToday} ‧ ${todayMust} 題</span></button>
        <button class="must-card" onclick="App.launchQuiz({must:true,subjects:${JSON.stringify(weekSubs)}})">
          <span class="ic">📅</span><span class="t">本週必考題</span><span class="d">${weekMust} 題</span></button>
        <button class="must-card wide" onclick="App.launchQuiz({must:true})">
          <div><div class="t">⭐ 必考 100 題總整理</div><div class="d">四科必考精選 ‧ 反覆刷到滾瓜爛熟</div></div>
          <div class="n">${mustAll.length}</div></button>
      </div>

      <div class="sec-head"><h2>學習工具</h2></div>
      <div class="tiles">
        <button class="tile" onclick="App.go('day/${cur.day}')"><span class="ic">🎧</span><span class="t">四種 Podcast</span><span class="d">完整／通勤／睡前／車用問答</span></button>
        <button class="tile" onclick="App.carFromDay(${cur.day})"><span class="ic">🚗</span><span class="t">車用模式</span><span class="d">純語音，問答停 5 秒</span></button>
        <button class="tile" onclick="App.go('quiz')"><span class="ic">📚</span><span class="t">分級題庫</span><span class="d">Level 1–4 自由切換</span></button>
        <button class="tile" onclick="App.go('schedule')"><span class="ic">🗓️</span><span class="t">90 天課表</span><span class="d">完成即蓋朱印</span></button>
      </div>

      <div class="sec-head"><h2>四階段進度</h2></div>
      ${[1,2,3,4].map(phaseBar).join('')}
      <div class="note">CivilGo ${COURSES.meta.version}・單檔 PWA・離線可用</div>
    </div>${nav('home')}`;
  }

  // ---------- Schedule ----------
  let schedFilter=0;
  function renderSchedule(){
    const cur=currentDay();
    const days=COURSES.days.filter(d=>!schedFilter||d.phase===schedFilter);
    const chip=(p,t)=>`<button class="chip ${schedFilter===p?'on':''}" onclick="App.setFilter(${p})">${t}</button>`;
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>90 天課表</h2><span class="eb">完成 ${doneCount()}/90</span></div>
      <div class="filter">${chip(0,'全部')}${chip(1,'行政學')}${chip(2,'政治學')}${chip(3,'地方自治')}${chip(4,'公共管理')}</div>
      <div class="dlist">${days.map(d=>{
        const done=!!state.done[d.day],isToday=d.day===cur&&!done;
        const seal=done?`<div class="seal stamped">閱</div>`:`<div class="seal empty">${d.day}</div>`;
        let st=''; for(let i=1;i<=5;i++) st+=`<span style="color:${i<=d.importance?'var(--gold)':'var(--line)'}">★</span>`;
        return `<a class="ditem ${done?'done':''} ${isToday?'today-row':''}" href="#/day/${d.day}">
          <div class="dn">D${d.day}</div><div class="meta"><div class="tt">${d.title}</div>
          <div class="ss"><span class="stars" style="font-size:11px">${st}</span><span>${d.subject}${isToday?' · 今日':''}</span></div></div>${seal}</a>`;
      }).join('')}</div>
    </div>${nav('sched')}`;
  }
  function setFilter(p){ schedFilter=p; renderSchedule(); }

  // ---------- Day / Podcast ----------
  let curMode='full', curPlayDay=null;
  function renderDay(n){
    const d=dayObj(n); if(!d) return go('');
    const segs=COURSES.meta.segments, pc=d.podcast;
    const segHTML=segs.map(s=>{
      const v=pc[s.key]; let body='';
      if(s.key==='quickfire'){ body=v.map(x=>`<div class="qa"><div class="q">Q：${esc(x.q)}</div><div class="a">A：${esc(x.a)}</div></div>`).join(''); }
      else { body=(v||[]).map(p=>`<p${isPH(p)?' class="placeholder-tag"':''}>${esc(p)}</p>`).join(''); }
      return `<div class="seg" data-seg="${s.key}"><div class="sh"><span>${s.icon}</span><span class="lab">${s.label}</span><span class="min">${s.minutes} 分</span></div>${body}</div>`;
    }).join('');
    const modeHTML=COURSES.meta.modes.map(m=>`<button class="mode ${curMode===m.key?'on':''}" onclick="App.setMode('${m.key}',${n})">
      <span class="mi">${m.icon}</span><span class="ml"><b>${m.label}</b><span>${m.target}</span></span></button>`).join('');
    const done=!!state.done[n];
    const dayEssays=ESSAYS.filter(e=>e.day===n);
    const essayHTML=dayEssays.length? dayEssays.map(e=>`<div class="essay">
        <div class="lab">本日申論（100% 取自當日課程）</div><h4>${esc(e.question)}</h4>
        <div class="kp">作答要點：</div><ul>${e.key_points.map(k=>`<li>${esc(k)}</li>`).join('')}</ul>
        <div class="fw">建議架構：${esc(e.framework)}</div></div>`).join('')
      : `<div class="essay"><div class="lab">本日申論</div><h4 class="placeholder-tag">本日申論題待補（將 100% 取自當日課程）</h4></div>`;
    app().innerHTML=`${topbar('DAY '+d.day+'・第'+d.phase+'階段 '+d.subject, d.title)}
      <div class="view">
      <div style="margin:2px 2px 12px">${stars(d.importance)}</div>
      <div class="trendbox"><b>命題趨勢　</b>${esc(d.trend)}</div>
      <div class="modes">${modeHTML}</div>
      <div class="player"><div class="now" id="nowSeg">準備就緒</div>
        <div class="nowtext" id="nowText">已選「${modeObj(curMode).label}」。點播放鍵開始語音講解，或切換上方模式。</div>
        <div class="controls">
          <button class="cbtn" onclick="App.carFromDay(${n})" title="車用模式">🚗</button>
          <button class="cbtn main" id="playBtn" onclick="App.togglePlay(${n})">▶</button>
          <button class="cbtn" onclick="App.stopSpeak()" title="停止">■</button></div></div>
      <div class="segs">${segHTML}</div>
      ${essayHTML}
      <button class="btn ${done?'btn-gold':'btn-primary'}" id="doneBtn" onclick="App.markDone(${n})">
        ${done?'✓ 已完成今日':'蓋上朱印・完成今日 +'+XP_DAY+' XP'}</button>
      <button class="btn btn-ghost" onclick="App.launchQuiz({level:1,day:${n},subject:'${SUBJ_BY_PHASE[d.phase]}'})">Level 1 課內題 ›</button>
      <div style="height:8px"></div></div>${nav('sched')}`;
    // mark essay viewed (申論演練)
    if(dayEssays.length && !state.daily.essay){ state.daily.essay=true; save(); checkDailyComplete(); }
  }
  function setMode(k,n){ curMode=k; stopSpeak(); renderDay(n); }
  function markDone(n){
    const first=!state.done[n]; state.done[n]=true;
    if(first){ addXP(XP_DAY); bumpStreak(); state.daily.podcast=true; save(); checkDailyComplete(); toast('朱印已蓋 ‧ +'+XP_DAY+' XP'); }
    else save();
    renderDay(n);
  }

  // ---------- TTS ----------
  let voices=[],zhVoice=null,speaking=false,queue=[],qIdx=0,carMode=false,pauseTimer=null,reviewMode=false;
  function initTTS(){ if(!('speechSynthesis' in window)) return;
    const pick=()=>{ voices=speechSynthesis.getVoices();
      zhVoice=voices.find(v=>/zh[-_]?TW/i.test(v.lang))||voices.find(v=>/zh|cmn/i.test(v.lang))||null; };
    pick(); speechSynthesis.onvoiceschanged=pick; }
  function buildQueue(n,modeKey){
    const d=dayObj(n),pc=d.podcast,m=modeObj(modeKey),out=[];
    m.segs.forEach(key=>{
      const v=pc[key];
      if(key==='quickfire'){ v.forEach(x=>{ out.push({key,text:'問題。'+strip(x.q),pauseAfter:!!m.qa_pause}); out.push({key,text:'答案。'+strip(x.a)}); }); }
      else if(key==='past_analysis'){ v.forEach(x=>out.push({key,text:strip(x)})); }
      else { (v||[]).forEach(p=>out.push({key,text:strip(p)})); }
    });
    return out;
  }
  function speakNext(){
    if(qIdx>=queue.length){ finishPlay(); return; }
    const item=queue[qIdx]; highlight(item.key,item.text);
    if(!('speechSynthesis' in window)){ qIdx++; pauseTimer=setTimeout(speakNext,200); return; }
    const u=new SpeechSynthesisUtterance(item.text); u.lang='zh-TW'; if(zhVoice) u.voice=zhVoice; u.rate=1.0;
    u.onend=()=>{ qIdx++; const gap=(carMode&&item.pauseAfter)?5000:120; pauseTimer=setTimeout(speakNext,gap); };
    u.onerror=()=>{ qIdx++; pauseTimer=setTimeout(speakNext,120); };
    speechSynthesis.speak(u);
  }
  function startPlay(n,modeKey){
    if(!('speechSynthesis' in window)){ toast('此瀏覽器不支援語音朗讀'); return; }
    stopSpeak(); curPlayDay=n; queue=buildQueue(n,modeKey||curMode); qIdx=0; speaking=true;
    const b=el('playBtn'); if(b) b.textContent='⏸'; speakNext();
  }
  function togglePlay(n){ if(speaking) stopSpeak(); else startPlay(n,curMode); }
  function stopSpeak(){ if('speechSynthesis' in window) speechSynthesis.cancel();
    clearTimeout(pauseTimer); speaking=false; reviewMode=false;
    const b=el('playBtn'); if(b) b.textContent='▶';
    document.querySelectorAll('.seg.active').forEach(s=>s.classList.remove('active')); }
  function finishPlay(){
    speaking=false; const b=el('playBtn'); if(b) b.textContent='▶';
    const ns=el('nowSeg'),nt=el('nowText'); if(ns) ns.textContent='播放完畢';
    if(nt) nt.textContent='可蓋上朱印完成今日，或切換其他模式再聽。';
    if(carMode) updateCar('完成','本段播放完畢',''); 
    if(reviewMode){ if(!state.daily.voice){ state.daily.voice=true; addXP(XP_VOICE); save(); checkDailyComplete(); toast('語音複習完成 ‧ +'+XP_VOICE+' XP'); } reviewMode=false; }
    else if(curPlayDay && !state.daily.podcast){ state.daily.podcast=true; save(); checkDailyComplete(); }
  }
  function highlight(key,text){
    const ns=el('nowSeg'),nt=el('nowText'),sm=segMeta(key);
    if(ns) ns.textContent=sm.label; if(nt) nt.textContent=text;
    document.querySelectorAll('.seg').forEach(s=>s.classList.toggle('active',s.dataset.seg===key));
    if(carMode) updateCar(sm.label,text,key);
  }

  // ---------- Voice review (語音複習) ----------
  function voiceReview(n){
    const d=dayObj(n),out=[];
    d.podcast.quickfire.forEach(x=>{ out.push({key:'quickfire',text:'問題。'+strip(x.q),pauseAfter:true}); out.push({key:'quickfire',text:'答案。'+strip(x.a)}); });
    if(!out.length){ toast('本日尚無快問快答可複習'); return; }
    if(location.hash.indexOf('day/'+n)<0) location.hash='day/'+n;
    setTimeout(()=>{ stopSpeak(); reviewMode=true; carMode=true; openCarShell(n,'語音複習');
      queue=out; qIdx=0; speaking=true; const pp=el('carPP'); if(pp) pp.textContent='⏸'; speakNext(); },70);
  }

  // ---------- Car mode ----------
  function carFromDay(n){ curMode='car_qa';
    if(location.hash.indexOf('day/'+n)<0) location.hash='day/'+n;
    setTimeout(()=>openCar(n),60); }
  function openCarShell(n,badge){
    carMode=true; const ov=document.createElement('div'); ov.className='car'; ov.id='carOv';
    ov.innerHTML=`<button class="ex" onclick="App.closeCar()">✕</button>
      <div class="badge">${badge||'車用模式 ‧ CAR MODE'}</div>
      <div class="seg-name" id="carSeg">準備播放</div>
      <div class="big" id="carBig">第 ${n} 天<br>點 ▶ 開始</div>
      <div class="cc"><button onclick="App.carPrev()">⏮</button>
        <button class="pp" id="carPP" onclick="App.carToggle(${n})">▶</button>
        <button onclick="App.carNext()">⏭</button></div>
      <div class="hint">行車請專心 ‧ 問題後會停 5 秒讓你作答</div>`;
    document.body.appendChild(ov);
  }
  function openCar(n){ openCarShell(n); }
  function updateCar(seg,text){ const s=el('carSeg'),b=el('carBig'); if(s) s.textContent=seg||''; if(b) b.textContent=text||''; }
  function carToggle(n){ const pp=el('carPP');
    if(speaking){ stopSpeak(); if(pp) pp.textContent='▶'; }
    else { startPlay(n,'car_qa'); if(pp) pp.textContent='⏸'; } }
  function carNext(){ if(qIdx<queue.length-1){ clearTimeout(pauseTimer); if('speechSynthesis' in window) speechSynthesis.cancel(); qIdx++; speakNext(); } }
  function carPrev(){ if(qIdx>0){ clearTimeout(pauseTimer); if('speechSynthesis' in window) speechSynthesis.cancel(); qIdx=Math.max(0,qIdx-1); speakNext(); } }
  function closeCar(){ carMode=false; stopSpeak(); const ov=el('carOv'); if(ov) ov.remove(); }

  // ---------- Quiz ----------
  let quizSet=[],quizI=0,quizAnswered=false,quizActive=false,quizCfg={},setupLevel=0,setupSubject=null,setupMust=false;
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function buildPool(cfg){
    let p=QUESTIONS;
    if(cfg.must) p=p.filter(q=>q.must);
    if(cfg.level) p=p.filter(q=>q.level===cfg.level);
    if(cfg.subject) p=p.filter(q=>q.subject===cfg.subject);
    if(cfg.subjects) p=p.filter(q=>cfg.subjects.includes(q.subject));
    if(cfg.day){ const dq=p.filter(q=>q.day===cfg.day); if(dq.length) p=dq; }
    return p;
  }
  function renderQuizSetup(){
    quizActive=false;
    const lv=COURSES?null:null;
    const lchip=(v,t)=>`<button class="chip ${setupLevel===v?'on':''}" onclick="App.setupSet('level',${v})">${t}</button>`;
    const schip=(v,t)=>`<button class="chip ${setupSubject===v?'on':''}" onclick="App.setupSet('subject',${v?"'"+v+"'":'null'})">${t}</button>`;
    const cfg={level:setupLevel||undefined,subject:setupSubject||undefined,must:setupMust||undefined};
    const count=buildPool(cfg).length;
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>分級題庫</h2><span class="eb">符合條件 ${count} 題</span></div>
      <div class="setup-lab">出題難度（AI 出題規則）</div>
      <div class="filter">${lchip(0,'全部')}${lchip(1,'L1 課內')}${lchip(2,'L2 跨章')}${lchip(3,'L3 歷屆')}${lchip(4,'L4 進階')}</div>
      <div class="setup-lab">科目</div>
      <div class="filter">${schip(null,'全部')}${SUBJECTS.map(s=>schip(s,s)).join('')}</div>
      <div class="setup-lab">範圍</div>
      <div class="filter"><button class="chip ${setupMust?'on':''}" onclick="App.setupToggleMust()">⭐ 僅必考題</button></div>
      <button class="btn btn-primary" ${count?'':'disabled'} onclick="App.launchQuiz({level:${setupLevel||0}||undefined,subject:${setupSubject?"'"+setupSubject+"'":'undefined'},must:${setupMust}||undefined})">
        ${count?'開始作答（'+Math.min(count,20)+' 題）':'此條件暫無題目'}</button>
      <div class="note">Level 2–4 與 AI 家教的「即時生成」需後端 API；本版先以分級題庫供切換練習。</div>
    </div>${nav('quiz')}`;
  }
  function setupSet(k,v){ if(k==='level') setupLevel=v; if(k==='subject') setupSubject=v; renderQuizSetup(); }
  function setupToggleMust(){ setupMust=!setupMust; renderQuizSetup(); }
  function launchQuiz(cfg){
    cfg=cfg||{}; quizCfg=cfg; const pool=buildPool(cfg);
    if(!pool.length){ toast('此條件暫無題目'); if(location.hash!=='#/quiz') go('quiz'); else renderQuizSetup(); return; }
    quizSet=shuffle(pool).slice(0,20); quizI=0; quizAnswered=false; quizActive=true;
    if(location.hash!=='#/quiz') location.hash='quiz'; quizQuestion();
  }
  function quizTitle(){ const c=quizCfg; let t=[]; if(c.must) t.push('必考'); if(c.level) t.push('L'+c.level);
    if(c.subject) t.push(c.subject); if(c.subjects) t.push('本週'); if(c.day) t.push('Day'+c.day+' 課內');
    return t.length?t.join('・'):'綜合練習'; }
  function quizQuestion(){
    if(!quizActive) return renderQuizSetup();
    if(quizI>=quizSet.length) return quizResult();
    const q=quizSet[quizI];
    app().innerHTML=`${topbar('題庫練習・'+quizTitle(),'第 '+(quizI+1)+' 題',quizActive?'quiz':'')}
      <div class="view"><div class="qcard">
        <div class="qprog"><span>${quizI+1} / ${quizSet.length}</span><span>${q.subject}・${q.chapter}${q.must?' ⭐必考':''}</span></div>
        <div class="qtext">${esc(q.question)}</div>
        <div class="opts" id="opts">${q.options.map((o,i)=>`<button class="opt" data-i="${i}" onclick="App.answer(${i})"><span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="after"></div></div></div>${nav('quiz')}`;
  }
  function answer(i){
    if(quizAnswered) return; quizAnswered=true;
    const q=quizSet[quizI],correct=q.answer,right=i===correct;
    document.querySelectorAll('.opt').forEach(b=>{ const bi=+b.dataset.i; b.disabled=true;
      if(bi===correct) b.classList.add('correct'); if(bi===i&&!right) b.classList.add('wrong'); });
    state.answered[q.id]=right; state.daily.quiz=(state.daily.quiz||0)+1;
    if(right){ addXP(XP_CORRECT); state.wrong=state.wrong.filter(x=>x!==q.id); }
    else if(!state.wrong.includes(q.id)) state.wrong.push(q.id);
    bumpStreak(); save(); checkDailyComplete();
    el('after').innerHTML=`<div class="expl"><b>${right?'答對 +'+XP_CORRECT+' XP':'答錯了'}</b>　正解：${'ABCD'[correct]}<br>${esc(q.explanation)}</div>
      <button class="btn btn-primary" onclick="App.nextQ()">${quizI+1<quizSet.length?'下一題 ›':'看結果 ›'}</button>`;
  }
  function nextQ(){ quizI++; quizAnswered=false; quizQuestion(); }
  function quizResult(){
    quizActive=false;
    const ids=quizSet.map(q=>q.id),got=ids.filter(id=>state.answered[id]).length;
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero" style="text-align:center"><div class="eyebrow">本回合結束 ‧ ${quizTitle()}</div>
        <h1 style="margin-top:10px">${got} / ${quizSet.length} 題答對</h1>
        <div class="sub">正確率 ${Math.round(got/quizSet.length*100)}%　·　錯題已自動收錄</div></div>
      <button class="btn btn-primary" onclick="App.relaunch()">再來一回合</button>
      <button class="btn btn-ghost" onclick="App.go('quiz')">調整出題條件</button>
      <button class="btn btn-ghost" onclick="App.go('')">回首頁</button>
    </div>${nav('quiz')}`;
  }
  function relaunch(){ launchQuiz(quizCfg); }

  // ---------- Me ----------
  function renderMe(){
    const done=doneCount(),accAll=Object.values(state.answered);
    const acc=accAll.length?Math.round(accAll.filter(Boolean).length/accAll.length*100):0;
    const bySubj=SUBJECTS.map(s=>{ const list=QUESTIONS.filter(q=>q.subject===s).map(q=>q.id);
      const ans=list.filter(id=>id in state.answered),right=ans.filter(id=>state.answered[id]).length;
      return {s,total:list.length,ans:ans.length,acc:ans.length?Math.round(right/ans.length*100):0}; });
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero"><div class="eyebrow">我的學習</div><h1>Lv.${level()}　${state.xp} XP</h1>
        <div class="sub">距下一級還差 ${500-(state.xp%500)} XP</div>
        <div class="ring-wrap"><div class="hero-stats" style="grid-template-columns:1fr 1fr 1fr">
          <div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
          <div class="stat"><div class="v">${done}<small>/90</small></div><div class="k">完成天數</div></div>
          <div class="stat"><div class="v">${acc}%</div><div class="k">總正確率</div></div></div></div></div>
      <div class="sec-head"><h2>各科表現</h2><span class="eb">已答 ${accAll.length} 題</span></div>
      ${bySubj.map(b=>`<div class="phase"><div class="pr"><span class="pn">${b.s}</span><span class="pc">${b.ans}/${b.total} 題・正確 ${b.acc}%</span></div><div class="bar"><i style="width:${b.acc}%"></i></div></div>`).join('')}
      <div class="sec-head"><h2>錯題庫</h2><span class="eb">Phase 2 間隔複習</span></div>
      <div class="today"><div class="row"><div><div class="daytag">待複習</div><h3>${state.wrong.length} 題錯題</h3>
        <div class="subj">收錄所有答錯題目</div></div><div class="daynum">${state.wrong.length}</div></div>
        <button class="btn ${state.wrong.length?'btn-primary':'btn-ghost'}" ${state.wrong.length?'':'disabled'} onclick="App.reviewWrong()">複習錯題</button></div>
      <button class="btn btn-ghost" style="margin-top:14px" onclick="App.reset()">重設所有進度</button>
      <div style="height:8px"></div></div>${nav('me')}`;
  }
  function reviewWrong(){ const ids=state.wrong.slice();
    const pool=QUESTIONS.filter(q=>ids.includes(q.id)); if(!pool.length){ toast('目前沒有錯題'); return; }
    quizCfg={label:'錯題'}; quizSet=shuffle(pool).slice(0,20); quizI=0; quizAnswered=false; quizActive=true;
    location.hash='quiz'; setTimeout(quizQuestion,30); }
  function reset(){ if(confirm('確定要清除所有進度、XP 與紀錄嗎？')){ localStorage.removeItem(KEY); load(); go(''); toast('已重設'); } }

  // ---------- Utils ----------
  function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function isPH(s){ return typeof s==='string'&&s.indexOf('待補')>=0; }
  function strip(s){ return String(s).replace(/〔[^〕]*〕/g,'（此段內容待補充）').replace(/[（）()]/g,'，'); }
  function toggleTheme(){ const cur=document.documentElement.getAttribute('data-theme');
    const next=cur==='dark'?'light':cur==='light'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    document.documentElement.setAttribute('data-theme',next); try{ localStorage.setItem('civilgo_theme',next); }catch(e){} }
  function loading(){ return `<div class="view" style="display:grid;place-items:center;min-height:60vh"><div class="empty">課程載入中…</div></div>`; }
  function toast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }
  (function(){ try{ const t=localStorage.getItem('civilgo_theme'); if(t) document.documentElement.setAttribute('data-theme',t); }catch(e){} })();

  return { boot,go,setFilter,setMode,togglePlay,stopSpeak,markDone,voiceReview,
    carFromDay,carToggle,carNext,carPrev,closeCar,
    launchQuiz,setupSet,setupToggleMust,answer,nextQ,relaunch,reviewWrong,
    toggleTheme,reset };
})();
document.addEventListener('DOMContentLoaded', App.boot);
