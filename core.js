export const STORAGE_KEY='criminal-case-memory.v1';
export const normalize=s=>String(s??'').normalize('NFKC').replace(/[\s.,·ㆍ，。:;!?()[\]{}「」『』“”‘’'"\-]/g,'').toLowerCase();
export const dayKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function freshState(){return {schema:1,cards:{},active:null,learning:null,testSession:null,flowUpdatedAt:0,totalReviewed:0,settings:{unit:'전체'},updatedAt:0,resetAt:0};}
export function validState(s){
  const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x),safe=k=>!['__proto__','constructor','prototype'].includes(k);
  if(s?.clozeSession&&(!object(s.clozeSession)||!Array.isArray(s.clozeSession.ids)||!s.clozeSession.ids.every(id=>typeof id==='string')||!Number.isInteger(s.clozeSession.index)||s.clozeSession.index<0||typeof s.clozeSession.unit!=='string'))return false;
  if(object(s?.cards)&&Object.values(s.cards).some(p=>p?.cloze&&(!object(p.cloze)||Object.entries(p.cloze).some(([id,a])=>!safe(id)||!object(a)||typeof a.signature!=='string'||!Array.isArray(a.answers)||!a.answers.every(v=>typeof v==='string')||typeof a.checked!=='boolean'||!Number.isFinite(a.updatedAt)))))return false;
  return !!s&&s.schema===1&&object(s.cards)&&Object.entries(s.cards).every(([k,v])=>safe(k)&&object(v)&&(!v.reviews||Array.isArray(v.reviews)&&v.reviews.every(r=>r&&[0,1,2].includes(r.rating)&&Number.isFinite(r.at)))&&(v.draft===undefined||typeof v.draft==='string')&&(v.quiz===undefined||object(v.quiz)&&Object.entries(v.quiz).every(([qid,q])=>safe(qid)&&object(q)&&typeof q.signature==='string'&&typeof q.checked==='boolean'&&Number.isFinite(q.updatedAt))))&&(!s.active||typeof s.active.id==='string')&&(!s.learning||object(s.learning)&&typeof s.learning.unit==='string'&&typeof s.learning.id==='string'&&['reading','ready'].includes(s.learning.phase))&&(!s.testSession||object(s.testSession)&&typeof s.testSession.id==='string'&&typeof s.testSession.unit==='string'&&Array.isArray(s.testSession.ids)&&s.testSession.ids.every(id=>typeof id==='string')&&Array.isArray(s.testSession.doneIds)&&s.testSession.doneIds.every(id=>typeof id==='string'));
}
export function getProgress(s,id){return s.cards[id]||{reviews:[],draft:'',weak:{},blindDays:[],dueAt:0,updatedAt:0};}
export const clozeSignature=q=>JSON.stringify([q.text,q.blanks,q.source]);
export function clozePages(q,maxChars=240,maxBlanks=3){
  const pages=[];let start=0;
  while(start<q.text.length){
    let end=Math.min(start+maxChars,q.text.length);
    if(end<q.text.length){
      const chunk=q.text.slice(start,end),boundaries=[...chunk.matchAll(/[.!?。]\s+(?=[가-힣▲①②③])|[,;]\s+/g)].map(m=>start+m.index+m[0].length).filter(n=>n>start+maxChars*0.5);
      end=boundaries.at(-1)||Math.max(q.text.lastIndexOf(' ',end),start+1);
    }
    const inside=q.blanks.filter(b=>b.start>=start&&b.start<end);
    if(inside.length>maxBlanks)end=inside[maxBlanks].start;
    const date=[...q.text.matchAll(/\d{4}\.\s*\d{1,2}\.(?:\s*\d{1,2}\.)?(?:경)?/g)].find(m=>m.index>start&&m.index<end&&m.index+m[0].length>end);if(date)end=date.index;
    const crossing=q.blanks.find(b=>b.start<end&&b.end>end);if(crossing)end=crossing.start>start?crossing.start:crossing.end;
    if(end<=start)end=Math.min(start+maxChars,q.text.length);
    const blanks=q.blanks.map((b,index)=>({...b,originalIndex:index})).filter(b=>b.start>=start&&b.end<=end).map(b=>({...b,start:b.start-start,end:b.end-start}));
    if(blanks.length)pages.push({text:q.text.slice(start,end),blanks,start,end,key:`${start}:${end}`,part:pages.length});
    start=end;
  }
  return pages;
}
export function clozeProgress(s,q){const p=getProgress(s,q.cardId).cloze?.[q.id];return p?.signature===clozeSignature(q)?p:null;}
export const clozePageChecked=(p,page)=>!!p?.checked||!!p?.parts?.[page.key]||!!(page?.blanks.length&&page.blanks.every(b=>typeof p?.result?.[b.originalIndex]==='boolean'));
export function checkClozePage(s,q,page,now=Date.now()){
  if(clozePageChecked(clozeProgress(s,q),page))return clozeProgress(s,q);
  const p=getProgress(s,q.cardId),old=clozeProgress(s,q)||{},answers=old.answers||q.blanks.map(()=>''),result=[...(old.result||[])];
  for(const b of page.blanks)result[b.originalIndex]=normalize(answers[b.originalIndex])===normalize(b.answer);
  p.cloze={...(p.cloze||{}),[q.id]:{...old,signature:clozeSignature(q),answers,result,parts:{...(old.parts||{}),[page.key]:true},checked:false,updatedAt:now}};p.updatedAt=now;s.cards[q.cardId]=p;
  if(q.blanks.every((_,i)=>typeof result[i]==='boolean'))return checkCloze(s,q,now);
  markHelp(s,q.cardId,now);return p.cloze[q.id];
}
export function saveClozeDraft(s,q,answers,now=Date.now()){
  const p=getProgress(s,q.cardId),previous=clozeProgress(s,q);if(previous?.checked)return;
  p.cloze={...(p.cloze||{}),[q.id]:{...previous,signature:clozeSignature(q),answers:answers.map(String),checked:false,updatedAt:now}};p.updatedAt=now;s.cards[q.cardId]=p;
}
export function checkCloze(s,q,now=Date.now()){
  if(clozeProgress(s,q)?.checked)return clozeProgress(s,q);
  const old=clozeProgress(s,q),answers=old?.answers||q.blanks.map(()=>'');
  const result=q.blanks.map((b,i)=>normalize(answers[i])===normalize(b.answer));
  const p=getProgress(s,q.cardId),attempt={id:`${now}-${Math.random().toString(36).slice(2)}`,at:now,correct:result.every(Boolean)};
  p.cloze={...(p.cloze||{}),[q.id]:{signature:clozeSignature(q),answers,result,checked:true,checkedAt:now,attempts:[...(old?.attempts||[]),attempt].slice(-80),updatedAt:now}};p.updatedAt=now;s.cards[q.cardId]=p;markHelp(s,q.cardId,now);return p.cloze[q.id];
}
export function retryCloze(s,q,now=Date.now()){const p=getProgress(s,q.cardId),old=clozeProgress(s,q);p.cloze={...(p.cloze||{}),[q.id]:{signature:clozeSignature(q),answers:q.blanks.map(()=>''),checked:false,attempts:old?.attempts||[],updatedAt:now}};p.updatedAt=now;s.cards[q.cardId]=p;}
export function unitProgress(s,cards,unit){const pool=cards.filter(c=>c.status==='ready'&&c.unit===unit),read=pool.filter(c=>{const p=getProgress(s,c.id);return p.readAt>0||p.reviews?.length;});return {cards:pool,total:pool.length,read:read.length,complete:pool.length>0&&read.length===pool.length,firstUnread:pool.find(c=>!read.includes(c))||null};}
export function markRead(s,id,now=Date.now()){markHelp(s,id,now);s.cards[id].readAt=now;}
export function newTestSession(s,cards,unit,now=Date.now()){const ids=cards.filter(c=>c.status==='ready'&&c.unit===unit).map(c=>c.id);s.testSession={id:`${now}-${Math.random().toString(36).slice(2)}`,unit,ids,doneIds:[],startedAt:now};return s.testSession;}
export function finishSessionCard(s,id){const session=s.testSession;if(session?.ids?.includes(id)&&!session.doneIds.includes(id))session.doneIds.push(id);}
export function quizSignature(q){return JSON.stringify([q.type,q.prompt,q.options||[],q.correct,q.explanation]);}
export function quizProgress(s,id,q){const p=getProgress(s,id).quiz?.[q.id];return p?.signature===quizSignature(q)?p:null;}
export function chooseQuiz(s,id,q,selection,now=Date.now()){
  if(q.type==='ox'?typeof selection!=='boolean':!Number.isInteger(selection)||selection<0||selection>=q.options.length)throw Error('답을 선택해 주세요.');
  if(quizProgress(s,id,q)?.checked)return false;
  const p=getProgress(s,id);p.quiz={...(p.quiz||{}),[q.id]:{signature:quizSignature(q),selection,checked:false,updatedAt:now}};p.updatedAt=now;s.cards[id]=p;return true;
}
export function checkQuiz(s,id,q,now=Date.now()){const p=getProgress(s,id),a=quizProgress(s,id,q);if(!a||!Object.hasOwn(a,'selection'))throw Error('O / X 또는 보기를 먼저 선택하세요.');if(a.checked)return a;a.checked=true;a.correct=a.selection===q.correct;a.checkedAt=now;a.updatedAt=now;markHelp(s,id,now);p.quiz[q.id]=a;return a;}
export function resetQuiz(s,id,q,now=Date.now()){const p=getProgress(s,id);p.quiz={...(p.quiz||{}),[q.id]:{signature:quizSignature(q),checked:false,updatedAt:now}};p.updatedAt=now;s.cards[id]=p;}
export function coverage(card,answer){const text=normalize(answer);const found=card.keywords.map(k=>{const accepted=[k.label,...(k.accept||[])];return {...k,found:accepted.some(t=>normalize(t)&&text.includes(normalize(t)))};});return {found,hit:found.filter(k=>k.found).length,total:found.length};}
export function begin(s,id,now=Date.now()){const prefilled=!!getProgress(s,id).draft?.trim();s.active={id,prefilled,helped:prefilled,checked:null,viewed:false,startedAt:now};return s.active;}
export function markHelp(s,id,now=Date.now()){const p=getProgress(s,id);p.exposedAt=now;p.updatedAt=now;s.cards[id]=p;if(s.active?.id===id)s.active.helped=true;}
export function checkAttempt(s,card,answer,now=Date.now(),forceHelp=false){const p=getProgress(s,card.id);if(!s.active||s.active.id!==card.id)begin(s,card.id,now);const a=s.active;const assisted=forceHelp||a.helped||a.viewed||!!(p.exposedAt&&now-p.exposedAt<10*60*1000)||!answer.trim();const c=coverage(card,answer);a.checked={id:`${now}-${Math.random().toString(36).slice(2)}`,answer,assisted,at:now,hit:c.hit,total:c.total};a.viewed=true;p.exposedAt=now;p.updatedAt=now;s.cards[card.id]=p;return a.checked;}
const assessmentKey=(id,a)=>a.id||`legacy-${id}-${a.at}`;
export function record(s,card,rating,now=Date.now()){
  if(![0,1,2].includes(rating)||s.active?.id!==card.id||!s.active.checked)throw Error('확인한 답안이 없습니다.');
  const p=getProgress(s,card.id),a=s.active.checked,assessmentId=assessmentKey(card.id,a),measured=coverage(card,a.answer);
  if(p.reviews?.some(r=>r.assessmentId===assessmentId))throw Error('이미 평가한 답안입니다. 새 답안을 확인해 주세요.');
  const rev={id:`${now}-${Math.random().toString(36).slice(2)}`,assessmentId,at:now,rating,assisted:a.assisted,hit:a.hit,total:a.total};
  p.reviews=[...(p.reviews||[]),rev].slice(-80);p.weak={...(p.weak||{})};
  for(const k of measured.found)if(!k.found)p.weak[k.label]=(p.weak[k.label]||0)+1;
  const days=new Set(p.blindDays||[]);if(rating===2&&!a.assisted)days.add(dayKey(a.at));p.blindDays=[...days].sort();
  s.totalReviewed=(s.totalReviewed||0)+1;
  if(rating<2||a.assisted){p.dueAt=now+(rating===0?10:30)*60000;p.quickDueAfter=s.totalReviewed+3;}
  else{const interval=[1,3,7,14,30][Math.min(days.size-1,4)];p.dueAt=now+interval*86400000;delete p.quickDueAfter;}
  p.lastAnswer=a.answer;p.draft='';p.lastRating=rating;p.updatedAt=now;s.cards[card.id]=p;s.active=null;return rev;
}
export function nextCard(s,cards,{unit='전체',mode='smart',exclude=null,now=Date.now()}={}){
  let pool=cards.filter(c=>c.status==='ready'&&(unit==='전체'||c.unit===unit));
  if(pool.length>1&&exclude)pool=pool.filter(c=>c.id!==exclude);
  const newC=pool.filter(c=>!getProgress(s,c.id).reviews?.length);
  const due=pool.filter(c=>{const p=getProgress(s,c.id);return p.reviews?.length&&(p.dueAt<=now||p.quickDueAfter&&p.quickDueAfter<=s.totalReviewed);});
  const weak=pool.filter(c=>{const p=getProgress(s,c.id);return p.reviews?.some(r=>r.rating<2);});
  if(mode==='new')return newC[0]||null;
  if(mode==='due')return due.sort((a,b)=>getProgress(s,a.id).dueAt-getProgress(s,b.id).dueAt)[0]||null;
  if(mode==='weak')return weak.sort((a,b)=>getProgress(s,a.id).updatedAt-getProgress(s,b.id).updatedAt)[0]||null;
  return due.sort((a,b)=>getProgress(s,a.id).dueAt-getProgress(s,b.id).dueAt)[0]||newC[0]||pool.sort((a,b)=>getProgress(s,a.id).updatedAt-getProgress(s,b.id).updatedAt)[0]||null;
}
export function mergeStates(a,b){
  if(!validState(a)||!validState(b))throw Error('지원하지 않는 기록 형식입니다.');
  const out=freshState(),latestState=(b.updatedAt||0)>=(a.updatedAt||0)?b:a;out.settings={...a.settings,...b.settings};out.active=latestState.active??null;out.learning=latestState.learning??null;out.testSession=latestState.testSession??null;out.resetAt=Math.max(a.resetAt||0,b.resetAt||0);
  const latestFlow=(b.flowUpdatedAt||0)>=(a.flowUpdatedAt||0)?b:a;out.learning=latestFlow.learning??null;out.testSession=latestFlow.testSession??null;out.flowUpdatedAt=Math.max(a.flowUpdatedAt||0,b.flowUpdatedAt||0);
  out.clozeSession=latestFlow.clozeSession??null;
  if(a.testSession?.id&&a.testSession.id===b.testSession?.id)out.testSession={...out.testSession,doneIds:[...new Set([...(a.testSession.doneIds||[]),...(b.testSession.doneIds||[])])]};
  for(const id of new Set([...Object.keys(a.cards),...Object.keys(b.cards)])){
    const x=getProgress(a,id),y=getProgress(b,id),latest=(y.updatedAt||0)>=(x.updatedAt||0)?y:x;
    const reviews=[...new Map([...(x.reviews||[]),...(y.reviews||[])].map(r=>[r.assessmentId||r.id,r])).values()].sort((p,q)=>p.at-q.at).slice(-80);
    const quiz=Object.fromEntries([...new Set([...Object.keys(x.quiz||{}),...Object.keys(y.quiz||{})])].map(k=>[k,(y.quiz?.[k]?.updatedAt||0)>=(x.quiz?.[k]?.updatedAt||0)?y.quiz?.[k]:x.quiz?.[k]]));
    out.cards[id]={...latest,reviews,quiz,exposedAt:Math.max(x.exposedAt||0,y.exposedAt||0),readAt:Math.max(x.readAt||0,y.readAt||0),blindDays:[...new Set([...(x.blindDays||[]),...(y.blindDays||[])])].sort(),weak:Object.fromEntries([...new Set([...Object.keys(x.weak||{}),...Object.keys(y.weak||{})])].map(k=>[k,Math.max(x.weak?.[k]||0,y.weak?.[k]||0)]))};
    out.cards[id].cloze=Object.fromEntries([...new Set([...Object.keys(x.cloze||{}),...Object.keys(y.cloze||{})])].map(k=>[k,(y.cloze?.[k]?.updatedAt||0)>=(x.cloze?.[k]?.updatedAt||0)?y.cloze?.[k]:x.cloze?.[k]]));
  }
  if(out.active?.checked&&getProgress(out,out.active.id).reviews?.some(r=>r.assessmentId===assessmentKey(out.active.id,out.active.checked)))out.active=null;
  if(out.active&&Number.isFinite(out.active.startedAt)&&getProgress(out,out.active.id).exposedAt>=out.active.startedAt)out.active.helped=true;
  out.totalReviewed=Math.max(a.totalReviewed||0,b.totalReviewed||0,Object.values(out.cards).reduce((n,p)=>n+(p.reviews?.length||0),0));out.updatedAt=Math.max(a.updatedAt||0,b.updatedAt||0);return out;
}
