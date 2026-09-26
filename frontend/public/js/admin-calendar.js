// ============================================================
// 공지/휴관 캘린더 (calendar_events)
// CrossFit Grove 관리자 - admin-schedule.js에서 분리된 스크립트
// ============================================================

let adminCalYear=new Date().getFullYear(), adminCalMonth=new Date().getMonth()+1, adminCalEvents=[], editingCalEventId=null;
const CAL_COLORS = {'휴관일':'#c62828','오픈짐':'#1565c0','이벤트':'#e65100'};
function initAdminCalendar(){adminCalYear=new Date().getFullYear();adminCalMonth=new Date().getMonth()+1;renderAdminCalendar();}
function changeCalendarMonth(delta){adminCalMonth+=delta;if(adminCalMonth>12){adminCalMonth=1;adminCalYear++;}if(adminCalMonth<1){adminCalMonth=12;adminCalYear--;}renderAdminCalendar();}
async function renderAdminCalendar(){
  document.getElementById('calendar-month-label').textContent=`${adminCalYear}년 ${adminCalMonth}월`;
  adminCalEvents=await adminFetch(`${API}/calendar/events/${adminCalYear}/${adminCalMonth}`).then(r=>r.json()).catch(()=>[]);
  const byDate={};adminCalEvents.forEach(e=>{if(!byDate[e.event_date])byDate[e.event_date]=[];byDate[e.event_date].push(e);});
  const today=todayKST(),firstDay=new Date(adminCalYear,adminCalMonth-1,1).getDay(),daysInMonth=new Date(adminCalYear,adminCalMonth,0).getDate();
  let html=['일','월','화','수','목','금','토'].map((d,i)=>`<div style="text-align:center;font-size:11px;font-weight:600;padding:4px 0;background:#f9f9f9;border-radius:4px;color:${i===0?'#c62828':i===6?'#1565c0':'#555'}">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++)html+=`<div style="min-height:70px;background:#fafafa;border-radius:4px;border:1px solid #f0f0f0"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${adminCalYear}-${String(adminCalMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(adminCalYear,adminCalMonth-1,d).getDay(),isToday=ds===today;
    const evH=(byDate[ds]||[]).map(e=>`<div onclick="event.stopPropagation();openCalEventModal(${e.id},'${ds}')" style="background:${e.color};color:#fff;border-radius:3px;padding:2px 5px;font-size:10px;cursor:pointer;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div>`).join('');
    html+=`<div style="min-height:70px;padding:4px;border:1px solid ${isToday?'#1a1a1a':'#f0f0f0'};border-radius:4px;background:${isToday?'#f0f8f0':'#fff'};cursor:pointer" onclick="openCalEventModal(null,'${ds}')"><div style="font-size:11px;color:${dow===0?'#c62828':dow===6?'#1565c0':'#333'};margin-bottom:3px">${d}</div>${evH}</div>`;
  }
  document.getElementById('admin-cal-grid').innerHTML=html;
}
function updateCalEvColor(){document.getElementById('cal-ev-color').value=CAL_COLORS[document.getElementById('cal-ev-type').value]||'#e65100';}
function openCalEventModal(eventId,dateStr){
  editingCalEventId=eventId;
  if(eventId){const ev=adminCalEvents.find(e=>e.id===eventId);if(!ev)return;document.getElementById('cal-event-modal-title').textContent='일정 수정';document.getElementById('cal-ev-submit-btn').textContent='수정 완료';document.getElementById('cal-ev-title').value=ev.title;document.getElementById('cal-ev-date').value=ev.event_date;document.getElementById('cal-ev-type').value=ev.type;document.getElementById('cal-ev-memo').value=ev.memo||'';document.getElementById('cal-ev-color').value=ev.color;document.getElementById('cal-ev-delete-btn').style.display='block';}
  else{document.getElementById('cal-event-modal-title').textContent='일정 추가';document.getElementById('cal-ev-submit-btn').textContent='추가 완료';document.getElementById('cal-ev-title').value='';document.getElementById('cal-ev-date').value=dateStr||'';document.getElementById('cal-ev-type').value='이벤트';document.getElementById('cal-ev-memo').value='';document.getElementById('cal-ev-color').value='#e65100';document.getElementById('cal-ev-delete-btn').style.display='none';}
  document.getElementById('cal-event-modal').classList.add('open');
}
async function submitCalEvent(){const title=document.getElementById('cal-ev-title').value.trim(),event_date=document.getElementById('cal-ev-date').value,type=document.getElementById('cal-ev-type').value,color=CAL_COLORS[type]||'#e65100',memo=document.getElementById('cal-ev-memo').value.trim();if(!title||!event_date)return alert('제목과 날짜는 필수입니다');if(editingCalEventId){await adminFetch(`${API}/calendar/events/${editingCalEventId}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_date,title,type,color,memo})});}else{await adminFetch(`${API}/calendar/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_date,title,type,color,memo})});}closeModal('cal-event-modal');renderAdminCalendar();}
async function deleteCalEvent(){if(!editingCalEventId||!confirm('삭제하시겠습니까?'))return;await adminFetch(`${API}/calendar/events/${editingCalEventId}`,{method:'DELETE'});closeModal('cal-event-modal');renderAdminCalendar();}
