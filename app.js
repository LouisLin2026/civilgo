/* ===== CivilGo V5 Alpha — app.js =====
   Data source: courses.json / questions.json / essays.json (produced by tools/build_loader.js).
   No hardcoded course count: everything auto-scans COURSES.days. */
const App = (() => {
  const KEY='civilgo_state_v1';
  const XP_DAY=50, XP_CORRECT=10, XP_BONUS=30, XP_VOICE=15;
  const RATES=[0.75,1,1.25,1.5,2];

  let COURSES=null, QUESTIONS=[], ESSAYS=[], state=null;
  let DAYS=[], DAY_IDS=[], PHASES=[], SUBJECTS=[], SEARCH_IDX=[];
  const el=id=>document.getElementById(id);
  const app=()=>el('app');

  // ---------- State ----------
  function load(){
    try{ state=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ state={}; }
    state.done=state.done||{}; state.xp=state.xp||0; state.streak=state.streak||0;
    state.lastStudy=state.lastStudy||null; state.answered=state.answered||{}; state.wrong=state.wrong||[];
    state.reviewed=state.reviewed||{}; state.rate=state.rate||1; ensureDaily();
  }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){} }
  function today(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function ensureDaily(){ if(!state.daily||state.daily.date!==today())
    state.daily={date:today(),podcast:false,quiz:0,voice:false,essay:false,bonus:false}; }
  function bumpStreak(){ const t=today(); if(state.lastStudy===t) return;
    const y=new Date(); y.setDate(y.getDate()-1); const ys=y.getFullYear()+'-'+(y.getMonth()+1)+'-'+y.getDate();
    state.streak=(state.lastStudy===ys)?state.streak+1:1; state.lastStudy=t; }
  function addXP(n){ state.xp+=n; }
  function level(){ return Math.floor(state.xp/500)+1; }
  function doneCount(){ return DAY_IDS.filter(d=>state.done[d]).length; }
  function checkDailyComplete(){ const d=state.daily;
    if(d.podcast&&d.quiz>=10&&d.voice&&d.essay&&!d.bonus){ d.bonus=true; addXP(XP_BONUS); save(); toast('今日任務全達成 ‧ +'+XP_BONUS+' XP 🎖️'); } }

  // ---------- Boot ----------
  async function fetchJSON(p){ const r=await fetch(p,{cache:'no-store'}); if(!r.ok) throw new Error(p); return r.json(); }
  async function boot(){
    load(); app().innerHTML=loading();
    try{
      const [c,q,es]=await Promise.all([fetchJSON('./courses.json'),fetchJSON('./questions.json'),fetchJSON('./essays.json')]);
      COURSES=c; QUESTIONS=q.questions||[]; ESSAYS=es.essays||[];
    }catch(e){
      app().innerHTML=`<div class="view"><div class="empty">課程資料載入失敗。<br>請確認 courses.json、questions.json、essays.json 與 index.html 同層，並以網址（http/https）開啟。</div></div>`; return;
    }
    DAYS=(COURSES.days||[]).slice().sort((a,b)=>a.day-b.day);
    DAY_IDS=DAYS.map(d=>d.day);
    PHASES=COURSES.meta.phases||[];
    SUBJECTS=COURSES.meta.subjects||[...new Set(DAYS.map(d=>d.subject))];
    buildSearchIndex();
    initTTS(); window.addEventListener('hashchange',route); route();
  }
  function buildSearchIndex(){
    SEARCH_IDX=DAYS.map(d=>{
      const parts=[d.title,d.subject,...(d.must_memorize||[]),...(d.mnemonics||[]),
        ...(d.top_exam_points||[]),...(d.common_traps||[]),
        ...(d.podcast.basics||[]),...(d.podcast.quickfire||[]).flatMap(x=>[x.q,x.a])];
      return {day:d.day,title:d.title,subject:d.subject,importance:d.importance,
        priority:d.review_priority,hay:parts.join(' ').toLowerCase(),
        hits:(d.top_exam_points||[]).concat(d.must_memorize||[]).slice(0,3)};
    });
  }

  // ---------- Routing ----------
  function route(){ stopSpeak();
    const h=location.hash.replace(/^#\/?/,''); const [seg,arg]=h.split('/');
    if(seg==='dashboard') return renderDashboard();
    if(seg==='search')    return renderSearch();
    if(seg==='podcast')   return renderPodcast();
    if(seg==='review')    return renderReview();
    if(seg==='day')       return renderDay(parseInt(arg,10)||currentDay());
    if(seg==='quiz')      return quizActive?quizQuestion():renderQuizSetup();
    if(seg==='me')        return renderMe();
    return renderHome();
  }
  const go=h=>{ location.hash=h; };
  function currentDay(){ for(const d of DAY_IDS){ if(!state.done[d]) return d; } return DAY_IDS[DAY_IDS.length-1]||1; }
  function dayObj(n){ return DAYS.find(d=>d.day===n); }
  function adjDay(n,dir){ const i=DAY_IDS.indexOf(n); const j=i+dir; return (j>=0&&j<DAY_IDS.length)?DAY_IDS[j]:null; }
  function modeObj(k){ return COURSES.meta.modes.find(m=>m.key===k); }
  function segMeta(k){ return COURSES.meta.segments.find(s=>s.key===k)||{label:'',icon:'•'}; }

  // ---------- Shared UI ----------
  function nav(active){ const it=(h,ic,t,k)=>`<a href="#/${h}" class="${active===k?'on':''}"><span class="ni">${ic}</span>${t}</a>`;
    return `<div class="nav">${it('','🏠','首頁','home')}${it('dashboard','🗂️','課表','dash')}${it('podcast','🎧','播客','pod')}${it('quiz','✍️','題庫','quiz')}${it('me','🎖️','我的','me')}</div>`; }
  function brand(){ return `<div class="brand"><div class="logo"><span class="mark">Civil<b>Go</b></span><span class="track">115 普考・一般民政</span></div>
    <div style="display:flex;gap:8px"><button class="ico" onclick="App.go('search')" aria-label="搜尋">🔍</button>
    <button class="ico" onclick="App.toggleTheme()" aria-label="深淺色">◐</button></div></div>`; }
  function topbar(d,h2,back){ return `<div class="topbar"><button class="back" onclick="App.go('${back||'dashboard'}')" aria-label="返回">‹</button>
    <div class="tt"><div class="d">${d}</div><h2>${esc(h2)}</h2></div><button class="ico" onclick="App.go('search')">🔍</button></div>`; }
  function stars(n){ let s=''; for(let i=1;i<=5;i++) s+=`<span class="${i<=n?'':'off'}">★</span>`;
    return `<span class="stars">${s}<span class="lab">${COURSES.meta.stars[n]||''}</span></span>`; }
  function prBadge(p){ const m={A:'必背',B:'高頻',C:'補充'}; return `<span class="pr-badge pr-${p||'C'}">${p||'C'}·${m[p]||'補充'}</span>`; }

  // ---------- Home ----------
  function ring(pct){ const r=42,c=2*Math.PI*r,off=c*(1-pct/100);
    return `<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C7402B"/><stop offset="1" stop-color="#C9A24A"/></linearGradient></defs></svg>`; }
  function phaseBar(ph){ const ds=DAYS.filter(d=>d.phase===ph.id),done=ds.filter(d=>state.done[d.day]).length,pct=ds.length?Math.round(done/ds.length*100):0;
    return `<div class="phase"><div class="pr"><span class="pn">第${ph.id}階段　${ph.name}<span class="wt"> ${ph.weight||''}</span></span><span class="pc">${done}/${ds.length}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`; }

  function renderHome(){
    const total=DAYS.length,done=doneCount(),pct=total?Math.round(done/total*100):0,cur=dayObj(currentDay());
    const dy=state.daily, subj=cur.subject;
    const mustAll=QUESTIONS.filter(q=>q.must);
    const todayMust=mustAll.filter(q=>q.subject===subj).length;
    const task=(ok,ic,t,s,act)=>`<button class="task ${ok?'done':''}" onclick="${act}"><span class="ck">✓</span><span class="tx"><b>${ic} ${t}</b><span>${s}</span></span><span class="go">${ok?'已完成':'前往 ›'}</span></button>`;
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero"><div class="eyebrow">金榜進度</div><h1>一般民政 Duolingo × Podcast × AI 家教</h1>
        <div class="sub">已完成 ${done} / ${total} 天（自動掃描 ${COURSES.meta.day_range}）</div>
        <div class="ring-wrap"><div class="ring">${ring(pct)}<div class="num"><b>${pct}%</b><span>完課率</span></div></div>
          <div class="hero-stats"><div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
            <div class="stat"><div class="v">Lv.${level()}</div><div class="k">${state.xp} XP</div></div>
            <div class="stat"><div class="v">${done}<small>/${total}</small></div><div class="k">完成天數</div></div>
            <div class="stat"><div class="v">${Object.keys(state.answered).length}</div><div class="k">已答題</div></div></div></div></div>

      <div class="sec-head"><h2>今日任務</h2><span class="eb">${[dy.podcast,dy.quiz>=10,dy.voice,dy.essay].filter(Boolean).length}/4</span></div>
      <div class="today"><div class="row"><div><div class="daytag">DAY ${cur.day}・${subj}</div><h3>${esc(cur.title)}</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${stars(cur.importance)} ${prBadge(cur.review_priority)}</div></div><div class="daynum">${cur.day}</div></div>
        <div class="tasks">
          ${task(dy.podcast,'🎧','Podcast 課程','完整版聽完',"App.go('day/"+cur.day+"')")}
          ${task(dy.quiz>=10,'📝','選擇題 10–20 題','今日 '+Math.min(dy.quiz,20)+' 題',"App.launchQuiz({subject:'"+subj+"'})")}
          ${task(dy.voice,'🔊','語音複習','聽今日快問快答',"App.voiceReview("+cur.day+")")}
          ${task(dy.essay,'✒️','申論演練 1 題','當日課程申論',"App.go('day/"+cur.day+"')")}
        </div></div>

      <div class="sec-head"><h2>必考專區</h2><span class="eb">importance≥5</span></div>
      <div class="must-grid">
        <button class="must-card" onclick="App.launchQuiz({must:true,subject:'${subj}'})"><span class="ic">🎯</span><span class="t">今日必考題</span><span class="d">${subj} ‧ ${todayMust} 題</span></button>
        <button class="must-card" onclick="App.go('review')"><span class="ic">🔁</span><span class="t">智慧複習</span><span class="d">依重要度／優先級</span></button>
        <button class="must-card wide" onclick="App.launchQuiz({must:true})"><div><div class="t">⭐ 必考題總整理</div><div class="d">四科必考精選</div></div><div class="n">${mustAll.length}</div></button>
      </div>

      <div class="sec-head"><h2>學習工具</h2></div>
      <div class="tiles">
        <button class="tile" onclick="App.go('podcast')"><span class="ic">🎧</span><span class="t">Podcast 播放列表</span><span class="d">倍速・自動下一課</span></button>
        <button class="tile" onclick="App.carFromDay(${cur.day})"><span class="ic">🚗</span><span class="t">車用模式 Pro</span><span class="d">大字・上/下一課</span></button>
        <button class="tile" onclick="App.go('dashboard')"><span class="ic">🗂️</span><span class="t">課程儀表板</span><span class="d">重要度・複習優先級</span></button>
        <button class="tile" onclick="App.go('search')"><span class="ic">🔍</span><span class="t">全域搜尋</span><span class="d">考點・口訣・必背</span></button>
      </div>

      <div class="sec-head"><h2>四階段進度</h2></div>
      ${PHASES.map(phaseBar).join('')}
      <div class="note">CivilGo ${COURSES.meta.version}・單檔 PWA・離線可用</div>
    </div>${nav('home')}`;
  }

  // ---------- A. Course Dashboard ----------
  let dashFilter=0;
  function renderDashboard(){
    const cur=currentDay();
    const list=DAYS.filter(d=>!dashFilter||d.phase===dashFilter);
    const chip=(p,t)=>`<button class="chip ${dashFilter===p?'on':''}" onclick="App.setDash(${p})">${t}</button>`;
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>課程儀表板</h2><span class="eb">完成 ${doneCount()}/${DAYS.length}</span></div>
      <div class="filter">${chip(0,'全部')}${PHASES.map(p=>chip(p.id,p.name.replace('概要','').replace('與總複習',''))).join('')}</div>
      <div class="dash-head"><span>Day</span><span>主題</span><span>重要</span><span>複習</span></div>
      <div class="dlist">${list.map(d=>{
        const done=!!state.done[d.day],isT=d.day===cur&&!done;
        let st=''; for(let i=1;i<=5;i++) st+=`<span style="color:${i<=d.importance?'var(--gold)':'var(--line)'}">★</span>`;
        return `<a class="drow ${done?'done':''} ${isT?'today-row':''}" href="#/day/${d.day}">
          <span class="dn">${done?'<span class=seal-mini>閱</span>':'D'+d.day}</span>
          <span class="dtitle">${esc(d.title)}<small>${d.subject}${isT?' · 今日':''}</small></span>
          <span class="dstar">${st}</span><span class="dpr">${prBadge(d.review_priority)}</span></a>`;
      }).join('')}</div>
      <div class="note">資料自動掃描自 ContentPack（目前 ${COURSES.meta.day_range}，Day56+ 補入後自動出現）</div>
    </div>${nav('dash')}`;
  }
  function setDash(p){ dashFilter=p; renderDashboard(); }

  // ---------- B. Global Search ----------
  let searchQ='';
  function searchRows(v){ const q=(v||'').trim().toLowerCase(); const res=q?SEARCH_IDX.filter(x=>x.hay.includes(q)).slice(0,40):[];
    if(!q) return `<div class="empty">輸入關鍵字搜尋全部 ${DAYS.length} 課的主題、必背、口訣與必考考點。</div>`;
    if(!res.length) return `<div class="empty">找不到「${esc(v)}」。試試更短的關鍵字。</div>`;
    return res.map(x=>`<a class="srow" href="#/day/${x.day}"><div class="sr-top"><b>D${x.day}・${esc(x.title)}</b><span class="sr-sub">${x.subject}</span></div>
      <div class="sr-hit">${(x.hits||[]).map(h=>`<span>${esc(h)}</span>`).join('')}</div></a>`).join(''); }
  function renderSearch(){
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>全域搜尋</h2><span class="eb">主題・必背・口訣・考點</span></div>
      <input class="search-in" id="sIn" placeholder="關鍵字，如：釋字498、委辦、官僚…" value="${esc(searchQ)}" oninput="App.onSearch(this.value)" />
      <div class="srows" id="srows">${searchRows(searchQ)}</div></div>${nav('')}`;
    const i=el('sIn'); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length,i.value.length); }catch(e){} }
  }
  function onSearch(v){ searchQ=v; const box=el('srows'); if(box) box.innerHTML=searchRows(v); }

  // ---------- Day / lesson ----------
  let curMode='full', curPlayDay=null;
  function chipBox(t,arr){ return `<div class="cbox"><div class="cbt">${t}</div><div class="cbw">${arr.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`; }
  function renderDay(n){
    const d=dayObj(n); if(!d) return go('dashboard');
    const segs=COURSES.meta.segments, pc=d.podcast;
    const segHTML=segs.map(s=>{ const v=pc[s.key]; let body='';
      if(s.key==='quickfire'){ body=(v||[]).map(x=>`<div class="qa"><div class="q">Q：${esc(x.q)}</div><div class="a">A：${esc(x.a)}</div></div>`).join('')||'<p class="muted">—</p>'; }
      else { body=(v||[]).map(p=>`<p>${esc(p)}</p>`).join('')||'<p class="muted">—</p>'; }
      return `<div class="seg" data-seg="${s.key}"><div class="sh"><span>${s.icon}</span><span class="lab">${s.label}</span><span class="min">${s.minutes} 分</span></div>${body}</div>`;
    }).join('');
    const extras=[];
    if((d.must_memorize||[]).length) extras.push(chipBox('🧠 必背',d.must_memorize));
    if((d.mnemonics||[]).length) extras.push(chipBox('🪄 口訣',d.mnemonics));
    if((d.common_traps||[]).length) extras.push(chipBox('⚠️ 常見陷阱',d.common_traps));
    if((d.top_exam_points||[]).length) extras.push(chipBox('🎯 必考考點',d.top_exam_points));
    const modeHTML=COURSES.meta.modes.map(m=>`<button class="mode ${curMode===m.key?'on':''}" onclick="App.setMode('${m.key}',${n})"><span class="mi">${m.icon}</span><span class="ml"><b>${m.label}</b><span>${m.target}</span></span></button>`).join('');
    const done=!!state.done[n];
    const dayEss=ESSAYS.filter(e=>e.day===n);
    const essayHTML=dayEss.length?dayEss.map(e=>`<div class="essay"><div class="lab">本日申論（100% 取自當日課程）</div><h4>${esc(e.question)}</h4>
        ${(e.key_points||[]).length?`<div class="kp">關鍵字：</div><ul>${e.key_points.map(k=>`<li>${esc(k)}</li>`).join('')}</ul>`:''}</div>`).join('')
      :`<div class="essay"><div class="lab">本日申論</div><h4 class="muted">本日尚無申論題</h4></div>`;
    app().innerHTML=`${topbar('DAY '+d.day+'・'+d.subject,d.title)}
      <div class="view"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:2px 2px 12px">${stars(d.importance)} ${prBadge(d.review_priority)}</div>
      ${d.trend?`<div class="trendbox"><b>近五年趨勢　</b>${esc(d.trend)}</div>`:''}
      <div class="modes">${modeHTML}</div>
      <div class="player"><div class="now" id="nowSeg">準備就緒</div>
        <div class="nowtext" id="nowText">已選「${modeObj(curMode).label}」。點播放開始語音講解。</div>
        <div class="controls"><button class="cbtn" onclick="App.carFromDay(${n})" title="車用">🚗</button>
          <button class="cbtn main" id="playBtn" onclick="App.togglePlay(${n})">▶</button>
          <button class="cbtn" onclick="App.stopSpeak()" title="停止">■</button></div></div>
      <div class="segs">${segHTML}</div>
      ${extras.length?`<div class="extras">${extras.join('')}</div>`:''}
      ${essayHTML}
      <button class="btn ${done?'btn-gold':'btn-primary'}" onclick="App.markDone(${n})">${done?'✓ 已完成今日':'蓋上朱印・完成 +'+XP_DAY+' XP'}</button>
      <button class="btn btn-ghost" onclick="App.launchQuiz({day:${n},subject:'${d.subject}'})">本課練習題 ›</button>
      <div style="height:8px"></div></div>${nav('dash')}`;
    if(dayEss.length&&!state.daily.essay){ state.daily.essay=true; save(); checkDailyComplete(); }
  }
  function setMode(k,n){ curMode=k; stopSpeak(); renderDay(n); }
  function markDone(n){ const first=!state.done[n]; state.done[n]=true;
    if(first){ addXP(XP_DAY); bumpStreak(); state.daily.podcast=true; state.reviewed[n]=today(); save(); checkDailyComplete(); toast('朱印已蓋 ‧ +'+XP_DAY+' XP'); } else save();
    renderDay(n); }

  // ---------- TTS core ----------
  let voices=[],zhVoice=null,speaking=false,queue=[],qIdx=0,carMode=false,pauseTimer=null,reviewMode=false,podMode=false,autoNext=true;
  function initTTS(){ if(!('speechSynthesis' in window)) return;
    const pick=()=>{ voices=speechSynthesis.getVoices(); zhVoice=voices.find(v=>/zh[-_]?TW/i.test(v.lang))||voices.find(v=>/zh|cmn/i.test(v.lang))||null; };
    pick(); speechSynthesis.onvoiceschanged=pick; }
  function buildQueue(n,modeKey){ const d=dayObj(n),pc=d.podcast,m=modeObj(modeKey),out=[];
    m.segs.forEach(key=>{ const v=pc[key];
      if(key==='quickfire'){ (v||[]).forEach(x=>{ out.push({key,text:'問題。'+strip(x.q),pauseAfter:!!m.qa_pause}); out.push({key,text:'答案。'+strip(x.a)}); }); }
      else { (v||[]).forEach(p=>out.push({key,text:strip(p)})); }
    }); return out; }
  function speakNext(){ if(qIdx>=queue.length){ finishPlay(); return; }
    const item=queue[qIdx]; highlight(item.key,item.text);
    if(!('speechSynthesis' in window)){ qIdx++; pauseTimer=setTimeout(speakNext,200); return; }
    const u=new SpeechSynthesisUtterance(item.text); u.lang='zh-TW'; if(zhVoice) u.voice=zhVoice; u.rate=state.rate||1;
    u.onend=()=>{ qIdx++; const gap=(carMode&&item.pauseAfter)?5000:120; pauseTimer=setTimeout(speakNext,gap); };
    u.onerror=()=>{ qIdx++; pauseTimer=setTimeout(speakNext,120); };
    speechSynthesis.speak(u); }
  function startPlay(n,modeKey){ if(!('speechSynthesis' in window)){ toast('此瀏覽器不支援語音朗讀'); return; }
    stopSpeak(); curPlayDay=n; curMode=modeKey||curMode; queue=buildQueue(n,curMode); qIdx=0; speaking=true;
    setMedia(n); const b=el('playBtn'); if(b) b.textContent='⏸'; const pp=el('podPP'); if(pp) pp.textContent='⏸'; const cp=el('carPP'); if(cp) cp.textContent='⏸'; speakNext(); }
  function togglePlay(n){ if(speaking) stopSpeak(); else startPlay(n,curMode); }
  function stopSpeak(){ if('speechSynthesis' in window) speechSynthesis.cancel(); clearTimeout(pauseTimer); speaking=false;
    const b=el('playBtn'); if(b) b.textContent='▶'; const pp=el('podPP'); if(pp) pp.textContent='▶'; const cp=el('carPP'); if(cp) cp.textContent='▶';
    document.querySelectorAll('.seg.active').forEach(s=>s.classList.remove('active')); }
  function finishPlay(){ speaking=false; const b=el('playBtn'); if(b) b.textContent='▶';
    const ns=el('nowSeg'),nt=el('nowText'); if(ns) ns.textContent='播放完畢'; if(nt) nt.textContent='本段結束。';
    if(reviewMode){ if(!state.daily.voice){ state.daily.voice=true; addXP(XP_VOICE); save(); checkDailyComplete(); toast('語音複習完成 ‧ +'+XP_VOICE+' XP'); } reviewMode=false; return; }
    if(curPlayDay&&!state.daily.podcast){ state.daily.podcast=true; save(); checkDailyComplete(); }
    if((podMode||carMode)&&autoNext){ const nx=adjDay(curPlayDay,1); if(nx){ curPlayDay=nx; if(carMode) updateCar('下一課',dayObj(nx).title); else if(el('podNow')) renderPodcast(); startPlay(nx,curMode); } }
  }
  function highlight(key,text){ const ns=el('nowSeg'),nt=el('nowText'),sm=segMeta(key);
    if(ns) ns.textContent=sm.label; if(nt) nt.textContent=text;
    document.querySelectorAll('.seg').forEach(s=>s.classList.toggle('active',s.dataset.seg===key));
    if(carMode) updateCar(sm.label,text); if(podMode){ const pn=el('podSeg'); if(pn) pn.textContent=sm.label+'：'+text.slice(0,40); } }

  // ---------- MediaSession (background controls) ----------
  function setMedia(n){ if(!('mediaSession' in navigator)) return; const d=dayObj(n);
    try{ navigator.mediaSession.metadata=new MediaMetadata({title:d.title,artist:'CivilGo・'+d.subject,album:'DAY '+d.day,
      artwork:[{src:'./icon-512.png',sizes:'512x512',type:'image/png'}]});
      navigator.mediaSession.setActionHandler('play',()=>startPlay(curPlayDay,curMode));
      navigator.mediaSession.setActionHandler('pause',()=>stopSpeak());
      navigator.mediaSession.setActionHandler('nexttrack',()=>{ const x=adjDay(curPlayDay,1); if(x) startPlay(x,curMode); });
      navigator.mediaSession.setActionHandler('previoustrack',()=>{ const x=adjDay(curPlayDay,-1); if(x) startPlay(x,curMode); });
    }catch(e){}
  }

  // ---------- D. Podcast Mode ----------
  function renderPodcast(){ podMode=true; carMode=false; reviewMode=false;
    const start=curPlayDay||currentDay();
    const upcoming=DAY_IDS.slice(Math.max(0,DAY_IDS.indexOf(start))).slice(0,20).map(dayObj);
    const cur=dayObj(start);
    const rateBtns=RATES.map(r=>`<button class="rate ${state.rate===r?'on':''}" onclick="App.setRate(${r})">${r}×</button>`).join('');
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>Podcast 播放列表</h2><span class="eb">背景播放・倍速</span></div>
      <div class="podnow" id="podNow"><div class="pn-day">DAY ${cur.day}・${cur.subject}</div><h3>${esc(cur.title)}</h3>
        <div class="pn-seg" id="podSeg">就緒</div>
        <div class="pn-modes">${COURSES.meta.modes.map(m=>`<button class="chip ${curMode===m.key?'on':''}" onclick="App.setPodMode('${m.key}')">${m.icon} ${m.label}</button>`).join('')}</div>
        <div class="controls"><button class="cbtn" onclick="App.podPrev()" title="上一課">⏮</button>
          <button class="cbtn main" id="podPP" onclick="App.podToggle()">▶</button>
          <button class="cbtn" onclick="App.podNext()" title="下一課">⏭</button></div>
        <div class="pn-rates">速度 ${rateBtns}</div>
        <label class="auto"><input type="checkbox" ${autoNext?'checked':''} onchange="App.toggleAuto(this.checked)"> 自動播放下一課</label></div>
      <div class="sec-head"><h2>待播清單</h2></div>
      <div class="dlist">${upcoming.map(d=>`<a class="ditem ${d.day===start?'today-row':''}" onclick="App.podPlay(${d.day});return false;" href="#">
        <div class="dn">D${d.day}</div><div class="meta"><div class="tt">${esc(d.title)}</div><div class="ss"><span>${d.subject}</span>${state.done[d.day]?'<span>✓ 已聽</span>':''}</div></div>
        <div class="seal ${state.done[d.day]?'stamped':'empty'}">${state.done[d.day]?'閱':'▶'}</div></a>`).join('')}</div>
      <div style="height:8px"></div></div>${nav('pod')}`;
  }
  function setPodMode(k){ curMode=k; if(speaking) startPlay(curPlayDay||currentDay(),k); else renderPodcast(); }
  function setRate(r){ state.rate=r; save(); if(speaking){ startPlay(curPlayDay,curMode); } else renderPodcast(); }
  function toggleAuto(v){ autoNext=v; }
  function podToggle(){ const d=curPlayDay||currentDay(); if(speaking) stopSpeak(); else { startPlay(d,curMode); } }
  function podPlay(n){ curPlayDay=n; startPlay(n,curMode); renderPodcast(); const pp=el('podPP'); if(pp) pp.textContent='⏸'; }
  function podNext(){ const x=adjDay(curPlayDay||currentDay(),1); if(x) podPlay(x); }
  function podPrev(){ const x=adjDay(curPlayDay||currentDay(),-1); if(x) podPlay(x); }

  // ---------- C. Car Mode Pro ----------
  function carFromDay(n){ curMode='car_qa'; if(location.hash.indexOf('day/'+n)<0&&location.hash.indexOf('podcast')<0) location.hash='day/'+n;
    setTimeout(()=>openCar(n),60); }
  function openCar(n){ podMode=false; carMode=true; curPlayDay=n; const d=dayObj(n);
    const ov=document.createElement('div'); ov.className='car'; ov.id='carOv';
    ov.innerHTML=`<button class="ex" onclick="App.closeCar()">✕</button><div class="badge">車用模式 PRO</div>
      <div class="seg-name" id="carSeg">DAY ${d.day}・${esc(d.subject)}</div>
      <div class="big" id="carBig">${esc(d.title)}<br><span style="font-size:.6em;color:#7C8BA3">點 ▶ 開始</span></div>
      <div class="cc"><button onclick="App.carLessonPrev()" title="上一課">⏮</button>
        <button class="pp" id="carPP" onclick="App.carToggle()">▶</button>
        <button onclick="App.carLessonNext()" title="下一課">⏭</button></div>
      <div class="hint">行車請專心 ‧ 問題後停 5 秒 ‧ 自動播下一課</div>`;
    document.body.appendChild(ov); }
  function updateCar(seg,text){ const s=el('carSeg'),b=el('carBig'); if(s) s.textContent=seg||''; if(b) b.innerHTML=esc(text||''); }
  function carToggle(){ const pp=el('carPP'); if(speaking){ stopSpeak(); if(pp) pp.textContent='▶'; } else { startPlay(curPlayDay,'car_qa'); if(pp) pp.textContent='⏸'; } }
  function carLessonNext(){ const x=adjDay(curPlayDay,1); if(x){ curPlayDay=x; startPlay(x,'car_qa'); } }
  function carLessonPrev(){ const x=adjDay(curPlayDay,-1); if(x){ curPlayDay=x; startPlay(x,'car_qa'); } }
  function closeCar(){ carMode=false; stopSpeak(); const ov=el('carOv'); if(ov) ov.remove(); }

  // ---------- F. Review Mode ----------
  function renderReview(){
    const ranked=DAYS.slice().sort((a,b)=> (b.importance-a.importance) || (a.review_priority||'C').localeCompare(b.review_priority||'C') );
    const must=ranked.filter(d=>d.importance>=5);
    const wrongN=state.wrong.length;
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>智慧複習</h2><span class="eb">依重要度・優先級</span></div>
      <div class="today"><div class="row"><div><div class="daytag">建議優先複習</div><h3>必背高頻 ${must.length} 課</h3><div class="subj">importance 5 ‧ priority A 優先</div></div><div class="daynum">🔁</div></div>
        <button class="btn btn-primary" onclick="App.launchQuiz({must:true})">必考題快速複習</button>
        ${wrongN?`<button class="btn btn-ghost" onclick="App.reviewWrong()">複習錯題（${wrongN}）</button>`:''}</div>
      <div class="sec-head"><h2>建議複習清單</h2></div>
      <div class="dlist">${ranked.slice(0,30).map(d=>{ let st=''; for(let i=1;i<=5;i++) st+=`<span style="color:${i<=d.importance?'var(--gold)':'var(--line)'}">★</span>`;
        const last=state.reviewed[d.day]; return `<a class="drow" href="#/day/${d.day}"><span class="dn">D${d.day}</span>
        <span class="dtitle">${esc(d.title)}<small>${d.subject}${last?' · 上次 '+last:' · 未複習'}</small></span>
        <span class="dstar">${st}</span><span class="dpr">${prBadge(d.review_priority)}</span></a>`; }).join('')}</div>
      <div style="height:8px"></div></div>${nav('')}`;
  }

  // ---------- G/H. Quiz ----------
  let quizSet=[],quizI=0,quizAnswered=false,quizActive=false,quizCfg={},setupLevel=0,setupSubject=null,setupMust=false;
  function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function buildPool(cfg){ let p=QUESTIONS;
    if(cfg.must) p=p.filter(q=>q.must); if(cfg.level) p=p.filter(q=>q.level===cfg.level);
    if(cfg.subject) p=p.filter(q=>q.subject===cfg.subject); if(cfg.subjects) p=p.filter(q=>cfg.subjects.includes(q.subject));
    if(cfg.day){ const dq=p.filter(q=>q.day===cfg.day); if(dq.length) p=dq; } return p; }
  function renderQuizSetup(){ quizActive=false;
    const lchip=(v,t)=>`<button class="chip ${setupLevel===v?'on':''}" onclick="App.setupSet('level',${v})">${t}</button>`;
    const schip=(v,t)=>`<button class="chip ${setupSubject===v?'on':''}" onclick="App.setupSet('subject',${v?"'"+v+"'":'null'})">${t}</button>`;
    const cfg={level:setupLevel||undefined,subject:setupSubject||undefined,must:setupMust||undefined}; const count=buildPool(cfg).length;
    app().innerHTML=`<div class="view">${brand()}
      <div class="sec-head"><h2>分級題庫</h2><span class="eb">符合 ${count} / 共 ${QUESTIONS.length} 題</span></div>
      <div class="setup-lab">難度</div><div class="filter">${lchip(0,'全部')}${lchip(1,'L1 課內')}${lchip(2,'L2 跨章')}${lchip(3,'L3 歷屆')}${lchip(4,'L4 進階')}</div>
      <div class="setup-lab">科目</div><div class="filter">${schip(null,'全部')}${SUBJECTS.map(s=>schip(s,s)).join('')}</div>
      <div class="setup-lab">範圍</div><div class="filter"><button class="chip ${setupMust?'on':''}" onclick="App.setupToggleMust()">⭐ 僅必考</button></div>
      <button class="btn btn-primary" ${count?'':'disabled'} onclick="App.launchQuiz({level:${setupLevel||0}||undefined,subject:${setupSubject?"'"+setupSubject+"'":'undefined'},must:${setupMust}||undefined})">${count?'開始作答（'+Math.min(count,20)+' 題）':'此條件暫無題目'}</button>
      <div class="note">目前題庫 ${QUESTIONS.length} 題（架構目標 2000）。Day56+ 題目補入後自動納入。</div></div>${nav('quiz')}`;
  }
  function setupSet(k,v){ if(k==='level') setupLevel=v; if(k==='subject') setupSubject=v; renderQuizSetup(); }
  function setupToggleMust(){ setupMust=!setupMust; renderQuizSetup(); }
  function launchQuiz(cfg){ cfg=cfg||{}; quizCfg=cfg; const pool=buildPool(cfg);
    if(!pool.length){ toast('此條件暫無題目'); if(location.hash!=='#/quiz') go('quiz'); else renderQuizSetup(); return; }
    quizSet=shuffle(pool).slice(0,20); quizI=0; quizAnswered=false; quizActive=true;
    if(location.hash!=='#/quiz') location.hash='quiz'; quizQuestion(); }
  function quizTitle(){ const c=quizCfg; let t=[]; if(c.must) t.push('必考'); if(c.level) t.push('L'+c.level); if(c.subject) t.push(c.subject); if(c.day) t.push('D'+c.day+' 課內'); return t.length?t.join('・'):'綜合練習'; }
  function quizQuestion(){ if(!quizActive) return renderQuizSetup(); if(quizI>=quizSet.length) return quizResult();
    const q=quizSet[quizI];
    app().innerHTML=`${topbar('題庫・'+quizTitle(),'第 '+(quizI+1)+' 題','quiz')}
      <div class="view"><div class="qcard"><div class="qprog"><span>${quizI+1} / ${quizSet.length}</span><span>${esc(q.subject)}${q.chapter?'・'+esc(q.chapter):''}${q.must?' ⭐':''}</span></div>
        <div class="qtext">${esc(q.question)}</div>
        <div class="opts">${q.options.map((o,i)=>`<button class="opt" data-i="${i}" onclick="App.answer(${i})"><span class="k">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <div id="after"></div></div></div>${nav('quiz')}`;
  }
  function answer(i){ if(quizAnswered) return; quizAnswered=true; const q=quizSet[quizI],correct=q.answer,right=i===correct;
    document.querySelectorAll('.opt').forEach(b=>{ const bi=+b.dataset.i; b.disabled=true; if(bi===correct) b.classList.add('correct'); if(bi===i&&!right) b.classList.add('wrong'); });
    state.answered[q.id]=right; state.daily.quiz=(state.daily.quiz||0)+1;
    if(right){ addXP(XP_CORRECT); state.wrong=state.wrong.filter(x=>x!==q.id); } else if(!state.wrong.includes(q.id)) state.wrong.push(q.id);
    bumpStreak(); save(); checkDailyComplete();
    el('after').innerHTML=`<div class="expl"><b>${right?'答對 +'+XP_CORRECT+' XP':'答錯了'}</b>　正解：${'ABCD'[correct]}<br>${esc(q.explanation)}</div>
      <button class="btn btn-primary" onclick="App.nextQ()">${quizI+1<quizSet.length?'下一題 ›':'看結果 ›'}</button>`; }
  function nextQ(){ quizI++; quizAnswered=false; quizQuestion(); }
  function quizResult(){ quizActive=false; const ids=quizSet.map(q=>q.id),got=ids.filter(id=>state.answered[id]).length;
    app().innerHTML=`<div class="view">${brand()}<div class="hero" style="text-align:center"><div class="eyebrow">本回合 ‧ ${quizTitle()}</div>
        <h1 style="margin-top:10px">${got} / ${quizSet.length} 答對</h1><div class="sub">正確率 ${Math.round(got/quizSet.length*100)}%</div></div>
      <button class="btn btn-primary" onclick="App.relaunch()">再來一回</button><button class="btn btn-ghost" onclick="App.go('quiz')">調整條件</button>
      <button class="btn btn-ghost" onclick="App.go('')">回首頁</button></div>${nav('quiz')}`; }
  function relaunch(){ launchQuiz(quizCfg); }
  function reviewWrong(){ const ids=state.wrong.slice(); const pool=QUESTIONS.filter(q=>ids.includes(q.id)); if(!pool.length){ toast('沒有錯題'); return; }
    quizCfg={label:'錯題'}; quizSet=shuffle(pool).slice(0,20); quizI=0; quizAnswered=false; quizActive=true; location.hash='quiz'; setTimeout(quizQuestion,30); }

  // ---------- E. Me / Progress ----------
  function renderMe(){ const done=doneCount(),accAll=Object.values(state.answered);
    const acc=accAll.length?Math.round(accAll.filter(Boolean).length/accAll.length*100):0;
    const bySubj=SUBJECTS.map(s=>{ const list=QUESTIONS.filter(q=>q.subject===s).map(q=>q.id); const ans=list.filter(id=>id in state.answered),right=ans.filter(id=>state.answered[id]).length;
      return {s,total:list.length,ans:ans.length,acc:ans.length?Math.round(right/ans.length*100):0}; });
    app().innerHTML=`<div class="view">${brand()}
      <div class="hero"><div class="eyebrow">我的學習</div><h1>Lv.${level()}　${state.xp} XP</h1><div class="sub">距下一級 ${500-(state.xp%500)} XP</div>
        <div class="ring-wrap"><div class="hero-stats" style="grid-template-columns:1fr 1fr 1fr">
          <div class="stat"><div class="v">${state.streak}<small> 天</small></div><div class="k">連續學習</div></div>
          <div class="stat"><div class="v">${done}<small>/${DAYS.length}</small></div><div class="k">完成天數</div></div>
          <div class="stat"><div class="v">${acc}%</div><div class="k">正確率</div></div></div></div></div>
      <div class="sec-head"><h2>各科表現</h2><span class="eb">已答 ${accAll.length}</span></div>
      ${bySubj.map(b=>`<div class="phase"><div class="pr"><span class="pn">${b.s}</span><span class="pc">${b.ans}/${b.total}・正確 ${b.acc}%</span></div><div class="bar"><i style="width:${b.acc}%"></i></div></div>`).join('')}
      <button class="btn btn-ghost" onclick="App.go('review')">前往智慧複習</button>
      <button class="btn btn-ghost" onclick="App.reset()">重設所有進度</button><div style="height:8px"></div></div>${nav('me')}`; }
  function reset(){ if(confirm('確定清除所有進度與 XP？')){ localStorage.removeItem(KEY); load(); go(''); toast('已重設'); } }

  // ---------- Voice review ----------
  function voiceReview(n){ const d=dayObj(n); if(!d) return; const out=[];
    (d.podcast.quickfire||[]).forEach(x=>{ out.push({key:'quickfire',text:'問題。'+strip(x.q),pauseAfter:true}); out.push({key:'quickfire',text:'答案。'+strip(x.a)}); });
    if(!out.length){ toast('本日無快問快答'); return; } stopSpeak(); reviewMode=true; queue=out; qIdx=0; speaking=true; speakNext(); }

  // ---------- Utils ----------
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function strip(s){ return String(s).replace(/[（）()]/g,'，'); }
  function toggleTheme(){ const cur=document.documentElement.getAttribute('data-theme');
    const next=cur==='dark'?'light':cur==='light'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    document.documentElement.setAttribute('data-theme',next); try{ localStorage.setItem('civilgo_theme',next); }catch(e){} }
  function loading(){ return `<div class="view" style="display:grid;place-items:center;min-height:60vh"><div class="empty">課程載入中…</div></div>`; }
  function toast(m){ const t=document.createElement('div'); t.className='toast'; t.textContent=m; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }
  (function(){ try{ const t=localStorage.getItem('civilgo_theme'); if(t) document.documentElement.setAttribute('data-theme',t); }catch(e){} })();

  return { boot,go,toggleTheme,reset,
    setDash,onSearch,setMode,togglePlay,stopSpeak,markDone,voiceReview,
    carFromDay,carToggle,carLessonNext,carLessonPrev,closeCar,
    renderPodcast,setPodMode,setRate,toggleAuto,podToggle,podPlay,podNext,podPrev,
    launchQuiz,setupSet,setupToggleMust,answer,nextQ,relaunch,reviewWrong };
})();
document.addEventListener('DOMContentLoaded', App.boot);
