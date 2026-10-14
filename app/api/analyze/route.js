export const runtime="nodejs";
export const dynamic="force-dynamic";
const DATASET="nvidia/Nemotron-Personas-Korea";
const FIELDS=["uuid","age","sex","province","district","occupation","marital_status","family_type","housing_type","persona","professional_persona","family_persona","travel_persona","hobbies_and_interests"];
const KEYWORDS=[["전기차",["전기차","EV","배터리","충전"]],["반려동물",["반려동물","펫","강아지","고양이"]],["가족",["자녀","아이","가족","육아","동승"]],["여행",["여행","장거리","주행","레저"]],["직업",["배달","운전","출퇴근","업무"]],["디지털",["사이버","해킹","앱","온라인"]]];
function hash(s){return [...s].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,17)}
function clean(x){return Object.fromEntries(FIELDS.filter(k=>x[k]!==undefined&&x[k]!==null).map(k=>[k,typeof x[k]==="string"?x[k].slice(0,500):x[k]]))}
function relevance(p,q){const text=[p.persona,p.professional_persona,p.family_persona,p.travel_persona,p.hobbies_and_interests,p.occupation].join(" ").toLowerCase();const terms=KEYWORDS.filter(([_,words])=>words.some(w=>q.toLowerCase().includes(w.toLowerCase()))).flatMap(([_,words])=>words);return terms.reduce((n,w)=>n+(text.includes(w.toLowerCase())?1:0),0)}
async function getPersonas(q){
 const seed=hash(q),offsets=Array.from({length:6},(_,i)=>(seed+i*15485863)%999900);
 const pages=await Promise.allSettled(offsets.map(async offset=>{const url=new URL("https://datasets-server.huggingface.co/rows");for(const [k,v] of Object.entries({dataset:DATASET,config:"default",split:"train",offset:String(offset),length:"20"}))url.searchParams.set(k,v);const r=await fetch(url,{signal:AbortSignal.timeout(18000),next:{revalidate:3600}});if(!r.ok)throw Error("Hugging Face HTTP "+r.status);const j=await r.json();return (j.rows||[]).map(v=>clean(v.row||{})).filter(p=>p.uuid)}));
 const successful=pages.filter(x=>x.status==="fulfilled").flatMap(x=>x.value);if(!successful.length)throw Error("공개 페르소나 데이터 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
 const unique=[...new Map(successful.map(x=>[x.uuid,x])).values()];const ranked=unique.map((p,i)=>({...p,_score:relevance(p,q),_order:i})).sort((a,b)=>b._score-a._score||a._order-b._order);
 return {sample:unique,selected:ranked.slice(0,12).map(({_score,_order,...p})=>({...p,matchScore:_score})),retrieved:unique.length,failedPages:pages.length-pages.filter(x=>x.status==="fulfilled").length};
}
function group(rows,key){const counts={};for(const p of rows){const v=String(p[key]||"미상");counts[v]=(counts[v]||0)+1}return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,count])=>({name,count}))}
export async function POST(req){try{
 const body=await req.json(),question=String(body.question||"").trim().slice(0,1200);if(!question)return Response.json({error:"질문을 입력해주세요."},{status:400});
 const {sample,selected,retrieved,failedPages}=await getPersonas(question);
 const relevant=selected.filter(x=>x.matchScore>0),matched=relevant.length;
 const segments=selected.slice(0,5).map(p=>({segment:`${p.age}세 · ${p.province||"지역 미상"} · ${p.occupation||"직업 미상"}`,reaction:p.matchScore>0?"질문 관련 단서 있음":"관련 단서 확인 안 됨",reason:[p.persona,p.hobbies_and_interests,p.family_persona].filter(Boolean).join(" / ").slice(0,290),consideration:"보험 상품에 대한 실제 선호·가입 의향은 데이터에 없으므로 별도 조사 필요",uuid:p.uuid,matchScore:p.matchScore}));
 return Response.json({question,title:"한국인 합성 페르소나 탐색 결과",answer:`NVIDIA 공개 데이터에서 ${retrieved}개 레코드를 조회하고 질문과 텍스트가 관련된 페르소나를 우선 표시했습니다. 선별한 12개 중 ${matched}개에서 질문 키워드와 겹치는 생활 맥락이 확인됐습니다. 이는 상품 가입 의향이나 수요 예측이 아닙니다.`,segments,takeaway:"관련 페르소나의 생활 맥락을 기반으로 고객 인터뷰·설문 가설을 설계하세요. 실제 가입률·시장 규모는 이 데이터로 산출할 수 없습니다.",limitations:["현재는 공개 데이터 API를 이용한 부분 표본 탐색입니다. 전체 100만 건 DB 검색은 아직 연결되지 않았습니다.","키워드 일치는 실제 구매 의향이나 상품 반응을 의미하지 않습니다.",...(failedPages?[`데이터 요청 ${failedPages}건이 실패해 성공한 응답만 사용했습니다.`]:[])],personas:selected,stats:{retrieved,matched,age:group(sample.map(p=>({...p,age:Math.floor(Number(p.age||0)/10)*10+"대"})),"age"),province:group(sample,"province"),occupation:group(sample,"occupation")},source:"NVIDIA Nemotron-Personas-Korea (Hugging Face 공개 Dataset Viewer API)",model:"미사용 · 실제 데이터 검색",mode:"DATA_EXPLORATION",disclaimer:"합성 페르소나 텍스트 탐색 결과이며, 보험 가입 의향·가입률·실제 시장 반응을 추정하지 않습니다."});
 }catch(e){return Response.json({error:"데이터 탐색 실패",detail:e.message},{status:500})}}
