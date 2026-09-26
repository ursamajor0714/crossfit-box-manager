// ───────── 데이터 ─────────
const CATS = {
  '바벨/역도': { color:'#c026d3', wt:'바벨', groups:{
    'Clean':['Clean','Power Clean','Squat Clean','Hang Clean','Hang Power Clean'],
    'Snatch':['Snatch','Power Snatch','Squat Snatch','Hang Snatch','Hang Power Snatch'],
    'Jerk':['Push Jerk','Split Jerk','Clean & Jerk'],
    'Squat':['Front Squat','Back Squat','Overhead Squat'],
    'Press':['Shoulder Press','Push Press'],
    'Pull':['Deadlift','Sumo Deadlift High Pull','Bent Over Row','Good Morning'],
    '기타':['Thruster','Bench Press'],
  }},
  '체조': { color:'#0891b2', wt:null, groups:{
    'Pull-up':['Pull-up','Strict Pull-up','Chest to Bar'],
    'Muscle-up':['Bar Muscle-up','Ring Muscle-up'],
    'Core':['Toes to Bar','Knees to Elbow','Sit-up','GHD Sit-up','Back Extension'],
    'Handstand':['Handstand Push-up','Strict HSPU','Handstand Walk','Wall Walk'],
    'Bodyweight':['Push-up','Ring Dip','Air Squat','Pistol','Lunge','Walking Lunge'],
    'Burpee':['Burpee','Burpee Box Jump Over','Burpee Pull-up'],
    '기타':['Rope Climb','Plank'],
  }},
  '유산소/모노': { color:'#ea580c', wt:null, groups:{
    'Run':['Run','Shuttle Run'],
    'Machine':['Row','Echo Bike','Assault Bike','Ski Erg','BikeErg'],
    'Jump Rope':['Double Under','Single Under'],
  }},
  '케틀벨/덤벨': { color:'#16a34a', wt:'kbdb', groups:{
    'KB':['KB Swing','American KB Swing','Russian KB Swing','KB Snatch','KB Clean','KB Deadlift','Goblet Squat','Turkish Get-up'],
    'DB':['DB Snatch','DB Clean','DB Thruster','DB Push Press','DB Box Step-up','DB Walking Lunge','Devils Press'],
  }},
  '기타': { color:'#64748b', wt:'box', groups:{
    'Ball/Box':['Wall Ball','Box Jump','Box Jump Over','Box Step-up'],
    'Carry/Sled':['Sled Push','Sled Pull','Farmer Carry'],
    'Odd Object':['Sandbag Clean','Sandbag Carry','D-Ball Over Shoulder'],
  }},
};
const CUSTOM_MOVES = {};
const NUMS = ['5','9','10','12','15','18','20','21','25','30','40','50','100'];
const FORMATS = ['For Time','AMRAP','EMOM','RFT','Chipper','Tabata'];
const UNITS = ['min','sec','m','cal','rounds','reps','-','x','+','( )','Buy-in:','Buy-out:','21-15-9','Rounds For Time','rest','each'];
const WEIGHTS = {
  '바벨 (남/여)': ['95/65lb','135/95lb','155/105lb','185/125lb','225/155lb'],
  '케틀벨 (남/여)': ['24/16kg','32/24kg'],
  '덤벨 (남/여)': ['50/35lb','2x50/2x35lb'],
  '박스 (남/여)': ['24/20in','30/24in'],
  '월볼 (남/여)': ['20/14lb'],
};
// 동작 카테고리 wt키 → 연동 무게 그룹들
const LINKED_WT = {
  '바벨': ['바벨 (남/여)'],
  'kbdb': ['케틀벨 (남/여)','덤벨 (남/여)'],
  'box': ['박스 (남/여)','월볼 (남/여)'],
};
const COLOR = {num:'#475569',fmt:'#0d0d0d',unit:'#94a3b8',wt:'#b45309'};

let lines = [];   // [{id, toks:[{type,val,color}]}]
let lineId = 0;
let dragData = null;     // 팔레트에서 끄는 새 칩
let dragTok = null;      // 보드 안 토큰 이동 {lineId, idx}

// 줄 안 토큰 정렬: 숫자/단위/포맷(앞) → 텍스트 → 동작 → 무게(뒤)
const TYPE_ORDER = { num:0, unit:0, fmt:0, text:1, move:2, wt:3 };
function sortLineToks(l){
  l.toks = l.toks.map((t,i)=>({t,i})).sort((a,b)=>{
    const d=(TYPE_ORDER[a.t.type]??1)-(TYPE_ORDER[b.t.type]??1);
    return d!==0?d:a.i-b.i; // 동순위는 넣은 순서 유지(안정 정렬)
  }).map(x=>x.t);
}

// ───────── 초기화 ─────────
function init(){
  for(let i=0;i<15;i++) lines.push({id:++lineId,toks:[]});
  renderMovePalette(); renderNumChips(); renderUnitChips(); renderWtGroups(); renderFmtChips();
  document.getElementById('custom-cat').innerHTML = Object.keys(CATS).map(c=>`<option>${c}</option>`).join('');
  renderBoard(); render();
}
function esc(s){ return String(s).replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

// ───────── 팔레트 ─────────
function chipHtml(type,val,color){
  const style = color?`style="background:${color}"`:'';
  return `<span class="chip ${type}" ${style} draggable="true" ondragstart="onChipDrag(event,'${type}','${esc(val)}','${color||''}')" onclick="onChipClick('${type}','${esc(val)}','${color||''}')">${val}</span>`;
}
function renderNumChips(){ document.getElementById('num-chips').innerHTML = NUMS.map(n=>chipHtml('num',n)).join(''); }
function renderFmtChips(){ document.getElementById('fmt-chips').innerHTML = FORMATS.map(f=>chipHtml('fmt',f)).join(''); }
function renderUnitChips(){ document.getElementById('unit-chips').innerHTML = UNITS.map(u=>chipHtml('unit',u)).join(''); }
function renderWtGroups(){
  document.getElementById('wt-groups').innerHTML = Object.keys(WEIGHTS).map(g=>`
    <div style="margin-bottom:8px"><div style="font-size:11px;font-weight:700;color:#888;margin-bottom:4px">${g}</div>
    <div class="chips">${WEIGHTS[g].map(w=>chipHtml('wt',w)).join('')}</div></div>`).join('');
}
function renderMovePalette(){
  const q=(document.getElementById('move-search').value||'').toLowerCase();
  document.getElementById('move-palette').innerHTML = Object.keys(CATS).map((cat,ci)=>{
    const c=CATS[cat]; const allG={...c.groups};
    if(CUSTOM_MOVES[cat]&&CUSTOM_MOVES[cat].length) allG['내 동작']=CUSTOM_MOVES[cat];
    const gh=Object.keys(allG).map(g=>{
      const items=allG[g].filter(m=>m.toLowerCase().includes(q));
      if(!items.length) return '';
      const og=q?'open':'';
      return `<div class="grp-block ${og}"><div class="grp-head" onclick="this.parentElement.classList.toggle('open')">${g}<span class="arrow">▶</span></div>
        <div class="grp-body"><div class="chips">${items.map(m=>moveChip(m,c.color,c.wt)).join('')}</div></div></div>`;
    }).join('');
    if(!gh.trim()) return '';
    const oc=q?'open':'';
    return `<div class="cat-block ${oc}"><div class="cat-head" style="background:${c.color}14;color:${c.color}" onclick="this.parentElement.classList.toggle('open')">
      <span style="width:9px;height:9px;border-radius:50%;background:${c.color};display:inline-block"></span>${cat}<span class="arrow">▶</span></div>
      <div class="cat-body">${gh}</div></div>`;
  }).join('');
}
function moveChip(name,color,wtKey){
  return `<span class="chip" style="background:${color}" draggable="true" ondragstart="onChipDrag(event,'move','${esc(name)}','${color}')" onclick="onMoveClick('${esc(name)}','${color}','${wtKey||''}')">${name}</span>`;
}

// 동작 클릭 → 새 줄(다음 빈 줄)로 + 연동 무게 표시
function onMoveClick(name,color,wtKey){
  placeOnNextLine('move',name,color);
  showLinkedWeights(wtKey);
}
function showLinkedWeights(wtKey){
  const box=document.getElementById('linked-wt');
  const groups=LINKED_WT[wtKey];
  if(!groups){ box.style.display='none'; return; }
  box.style.display='block';
  box.innerHTML = `<div class="lw-title">이 동작에 자주 쓰는 무게/높이</div>` +
    groups.map(g=>`<div style="margin-bottom:6px"><div style="font-size:10px;color:#b45309;margin-bottom:3px">${g}</div>
      <div class="chips">${WEIGHTS[g].map(w=>chipHtml('wt',w)).join('')}</div></div>`).join('');
}

// ───────── 칩 클릭/드래그 ─────────
// 포맷/동작 = 한 줄씩(다음 줄로). 숫자/무게/단위 = 마지막으로 쓴 줄에 끼워넣기
function onChipClick(type,val,color){
  if(type==='fmt'){ placeOnNextLine(type,val,color); }
  else { addToCurrentLine(type,val,color); }
}
function onChipDrag(e,type,val,color){ dragData={type,val,color}; dragTok=null; e.dataTransfer.setData('text/plain',val); }

// 가장 위의 빈 줄에 넣기 (없으면 새 줄 추가). 반환: 사용한 줄 index
function placeOnNextLine(type,val,color){
  let idx = lines.findIndex(l=>l.toks.length===0);
  if(idx===-1){ lines.push({id:++lineId,toks:[]}); idx=lines.length-1; }
  lines[idx].toks.push({type,val,color:color||''});
  sortLineToks(lines[idx]);
  lastUsedLineId = lines[idx].id;
  renderBoard(); render();
}
// 마지막으로 쓴 줄(없으면 마지막 비어있지 않은 줄, 그것도 없으면 첫 줄)에 추가 + 정렬
let lastUsedLineId = null;
function addToCurrentLine(type,val,color){
  let l = lines.find(x=>x.id===lastUsedLineId);
  if(!l){
    // 마지막으로 내용 있는 줄
    for(let i=lines.length-1;i>=0;i--){ if(lines[i].toks.length){ l=lines[i]; break; } }
  }
  if(!l) l = lines[0] || (lines.push({id:++lineId,toks:[]}), lines[lines.length-1]);
  l.toks.push({type,val,color:color||''});
  sortLineToks(l);
  lastUsedLineId = l.id;
  renderBoard(); render();
}

// ───────── 보드 드롭 (y좌표로 줄 자동 정렬) ─────────
function onBoardOver(e){ e.preventDefault(); document.getElementById('board').classList.add('drag-over'); }
function onBoardLeave(e){ if(e.target.id==='board') document.getElementById('board').classList.remove('drag-over'); }

function onBoardDrop(e){
  e.preventDefault();
  document.getElementById('board').classList.remove('drag-over');
  const y=e.clientY;
  const lineEls=[...document.querySelectorAll('.wb-line')];
  if(!lineEls.length){
    if(dragData){ lines.push({id:++lineId,toks:[mkTok(dragData)]}); dragData=null; renderBoard(); render(); }
    return;
  }
  // 가장 가까운 줄
  let bestIdx=0,bestDist=Infinity;
  lineEls.forEach((el,idx)=>{const r=el.getBoundingClientRect();const c=r.top+r.height/2;const d=Math.abs(y-c);if(d<bestDist){bestDist=d;bestIdx=idx;}});
  const targetId=parseInt(lineEls[bestIdx].dataset.id);
  dropIntoLine(targetId);
}

function mkTok(d){ return {type:d.type,val:d.val,color:d.color||''}; }

// 토큰 이동 또는 새 칩을 특정 줄에 넣기
function dropIntoLine(lineId){
  const l=getLine(lineId); if(!l) return;
  if(dragTok){ // 보드 안 토큰 이동
    const src=getLine(dragTok.lineId);
    if(src){
      const [moved]=src.toks.splice(dragTok.idx,1);
      if(moved) l.toks.push(moved);
    }
    dragTok=null;
  } else if(dragData){
    l.toks.push(mkTok(dragData));
    dragData=null;
  } else return;
  sortLineToks(l);
  lastUsedLineId=l.id;
  renderBoard(); render();
}

// 줄 위에 직접 드롭(그 줄에 합류 / 토큰 이동)
function onLineDrop(e,id){
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.wb-line.drag-over').forEach(el=>el.classList.remove('drag-over'));
  document.getElementById('board').classList.remove('drag-over');
  dropIntoLine(id);
}
// 줄 사이 gap에 드롭(새 줄 생성 / 토큰을 새 줄로 이동)
function onGapDrop(e,idx){
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.gap.drag-over').forEach(el=>el.classList.remove('drag-over'));
  document.getElementById('board').classList.remove('drag-over');
  let tok=null;
  if(dragTok){
    const src=getLine(dragTok.lineId);
    if(src){ [tok]=src.toks.splice(dragTok.idx,1); }
    dragTok=null;
  } else if(dragData){ tok=mkTok(dragData); dragData=null; }
  if(!tok) return;
  const newLine={id:++lineId,toks:[tok]};
  lines.splice(idx,0,newLine);
  lastUsedLineId=newLine.id;
  renderBoard(); render();
}

// ───────── 줄/토큰 ─────────
function getLine(id){ return lines.find(l=>l.id===id); }
function addLine(){ lines.push({id:++lineId,toks:[]}); renderBoard(); }
function clearBoard(){ if(confirm('전체를 지울까요?')){ lines=[]; for(let i=0;i<15;i++) lines.push({id:++lineId,toks:[]}); lastUsedLineId=null; renderBoard(); render(); } }
function delLine(id){ lines=lines.filter(l=>l.id!==id); renderBoard(); render(); }
function delTok(id,i){ const l=getLine(id); l.toks.splice(i,1); renderBoard(); render(); }
function mvTok(id,i,d){ const l=getLine(id),j=i+d; if(j<0||j>=l.toks.length)return;[l.toks[i],l.toks[j]]=[l.toks[j],l.toks[i]]; renderBoard(); render(); }

function renderBoard(){
  const board=document.getElementById('board');
  if(!lines.length){ board.innerHTML='<div class="board-empty">우측 칩을 끌어다 놓으세요</div>'; return; }
  let html='';
  // 맨 위 gap
  html+=`<div class="gap" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="onGapDrop(event,0)"></div>`;
  lines.forEach((l,idx)=>{
    const toks=l.toks.map((t,i)=>tokHtml(l.id,i,t)).join('');
    html+=`<div class="wb-line" data-id="${l.id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="onLineDrop(event,${l.id})" onclick="focusType(event,${l.id})">
      <span class="wb-line-handle">⠿</span>
      ${toks}
      <span class="type-textbox" contenteditable="true" data-line="${l.id}" onblur="commitType(${l.id},this)" onkeydown="typeKey(event,${l.id},this)"></span>
      <button class="wb-line-del" onclick="event.stopPropagation();delLine(${l.id})">✕</button>
    </div>`;
    html+=`<div class="gap" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="onGapDrop(event,${idx+1})"></div>`;
  });
  board.innerHTML=html;
}
function tokHtml(id,i,t){
  const ds=`draggable="true" ondragstart="onTokDrag(event,${id},${i})"`;
  if(t.type==='text'){
    return `<span class="tok tv" ${ds} ondblclick="editText(${id},${i})">${t.val}<span class="x" onclick="event.stopPropagation();delTok(${id},${i})">✕</span></span>`;
  }
  const bg=t.color||COLOR[t.type]||'#475569';
  return `<span class="tok" style="background:${bg}" ${ds}>${t.val}<span class="x" onclick="event.stopPropagation();delTok(${id},${i})">✕</span></span>`;
}
function onTokDrag(e,lineId,idx){ dragTok={lineId,idx}; dragData=null; e.dataTransfer.setData('text/plain',''); e.stopPropagation(); }

// 직접 타이핑
function focusType(e,id){
  if(e.target.classList.contains('tok')||e.target.classList.contains('x')||e.target.classList.contains('type-textbox')) return;
  const sp=document.querySelector(`.type-textbox[data-line="${id}"]`); if(sp) sp.focus();
}
function commitType(id,el){ const v=el.textContent.trim(); if(v){ const l=getLine(id); l.toks.push({type:'text',val:v,color:''}); el.textContent=''; renderBoard(); render(); } }
function typeKey(e,id,el){ if(e.key==='Enter'){ e.preventDefault(); commitType(id,el);} }
function editText(id,i){ const l=getLine(id),cur=l.toks[i].val,nv=prompt('수정:',cur); if(nv!==null){ l.toks[i].val=nv.trim()||cur; renderBoard(); render(); } }

// ───────── 커스텀 ─────────
function addCustomMove(){
  const name=document.getElementById('custom-move').value.trim(), cat=document.getElementById('custom-cat').value;
  if(!name) return;
  if(!CUSTOM_MOVES[cat]) CUSTOM_MOVES[cat]=[];
  if(!CUSTOM_MOVES[cat].includes(name)) CUSTOM_MOVES[cat].push(name);
  document.getElementById('custom-move').value=''; renderMovePalette();
}
function addCustomNum(){ const v=document.getElementById('custom-num').value.trim(); if(!v)return; if(!NUMS.includes(v))NUMS.push(v); renderNumChips(); document.getElementById('custom-num').value=''; }
function addCustomWt(){ const v=document.getElementById('custom-wt').value.trim(); if(!v)return; if(!WEIGHTS['내 무게'])WEIGHTS['내 무게']=[]; WEIGHTS['내 무게'].push(v); renderWtGroups(); document.getElementById('custom-wt').value=''; }

// ───────── 출력 ─────────
function buildText(){ return lines.map(l=>l.toks.map(t=>t.val).join(' ').trim()).filter(s=>s!=='').join('\n'); }
function render(){ document.getElementById('output').textContent=buildText()||'(칩을 끌어와 구성하세요)'; }
function copyOut(){ const t=buildText(); navigator.clipboard.writeText(t).then(()=>alert('복사되었습니다!'),()=>alert('복사 실패 — 직접 선택해 복사하세요')); }

init();
