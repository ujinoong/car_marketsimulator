import internalDemo from "../../../data/synthetic_internal_summary.json";
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
const SYSTEM=`너는 자동차보험 신상품 전략 분석가다. 핵심 과업은 개별 인물 추천이 아니라 유사한 소비자를 묶은 시장 세그먼트(군집) 3~5개를 정의하고 우선순위를 제안하는 것이다. 개인의 나이·지역·직업을 나열해 한 명처럼 표현하거나 특정 페르소나 ID를 추천하지 않는다. 군집명은 행동·생활 니즈 중심으로 명명한다(예: 배터리 수리비 부담에 민감한 전기차 이용 가정군). 높은 관심·조건부 관심·낮은 관심 군집을 구분하되 통계적으로 검증된 군집이나 시장 점유율이라고 주장하지 않는다. 제공된 데이터는 소규모 편의 표본이므로 군집별 인구 비율이나 규모를 계산하지 않는다. 입력된 NVIDIA 한국인 합성 페르소나 레코드를 참고하여 질문 속 보험 상품에 대한 소비자 반응 가설을 추론한다. 페르소나에 없는 차량 소유, 보험 가입, 운행거리 등의 사실을 단정하지 말고 조건부 가정으로 명시한다. 특정 인구통계 특성만으로 보험 위험을 평가하지 않는다. 응답은 한국어 JSON 객체만: {"title":"제목","answer":"핵심 결론 2문장","segments":[{"segment":"소비자 군집명(개인이 아닌 집단)","reaction":"높은 관심|조건부 관심|낮은 관심","reason":"페르소나에 근거한 추론 이유와 필요한 가정","consideration":"상품 설계 및 검증 조건"}],"takeaway":"임원용 실행 시사점","limitations":["검증되지 않은 추론임"]}. 세그먼트 3~5개. 각 세그먼트는 복수 소비자가 공유할 수 있는 니즈와 조건으로 정의하고 단일 개인 소개를 금지한다. 실제 가입률, 시장 규모, 확률 수치를 창작하지 않는다.`;
function parseJSON(s){const t=String(s||"").replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("LLM 응답을 JSON으로 변환하지 못했습니다.")}}
async function infer(question,personas){
 const provider=process.env.LLM_PROVIDER||"groq";
 const config=provider==="nvidia"?{key:process.env.NVIDIA_API_KEY,url:"https://integrate.api.nvidia.com/v1/chat/completions",models:[process.env.LLM_MODEL||"nvidia/nemotron-3-super-120b-a12b"]}:{key:process.env.GROQ_API_KEY,url:"https://api.groq.com/openai/v1/chat/completions",models:[process.env.LLM_MODEL,"openai/gpt-oss-20b","llama-3.1-8b-instant"].filter(Boolean)};
 if(!config.key)return {missing:true,provider,model:config.models[0]};
 const errors=[];
 for(const model of [...new Set(config.models)]){
  const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.key},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({question,personas,internal_demo:{customer_count:internalDemo.customer_count,dimensions:internalDemo.dimensions,opportunities:internalDemo.opportunities},instructions:"외부 합성 페르소나의 생활 니즈 기반 군집과 내부 가상 고객 집계의 고객군을 연결하여 비교하라. 내부 숫자는 데모 수치라고 반드시 명시하고, 직접 대응되는 내부 군집이 없으면 없다고 설명하라. 외부 군집과 내부 집계의 비율은 비교하지 말라."})}],temperature:0.2,max_tokens:2500,stream:false}),signal:AbortSignal.timeout(45000),cache:"no-store"});
  if(!response.ok){
   const body=await response.text();errors.push(model+" HTTP "+response.status+": "+body.slice(0,180));
   if(provider==="groq"&&(response.status===404||response.status===400))continue;
   throw Error("LLM "+provider+" "+errors[errors.length-1]);
  }
  const payload=await response.json();
  const data=parseJSON(payload.choices?.[0]?.message?.content);
  if(!Array.isArray(data.segments)||!data.segments.length||!data.answer)throw Error("LLM 응답에 필요한 분석 필드가 없습니다.");
  return {data,provider,model};
 }
 throw Error("사용 가능한 LLM 모델을 찾지 못했습니다: "+errors.join(" | ").slice(0,500));
}
export async function POST(req){try{
 const body=await req.json(),question=String(body.question||"").trim().slice(0,1200);if(!question)return Response.json({error:"질문을 입력해주세요."},{status:400});
 const {sample,selected,retrieved,failedPages}=await getPersonas(question);
 const inference=await infer(question,selected);
 const stats={retrieved,matched:selected.filter(x=>x.matchScore>0).length,age:group(sample.map(p=>({...p,age:Math.floor(Number(p.age||0)/10)*10+"대"})),"age"),province:group(sample,"province"),occupation:group(sample,"occupation")};
 const base={question,stats,internal:internalDemo,source:"NVIDIA Nemotron-Personas-Korea (Hugging Face)",limitations:["현재 전체 데이터베이스가 아닌 공개 API에서 일부 레코드를 추출해 사용합니다.","합성 페르소나에 실제 차량 보유·보험 가입 의향 데이터가 없으며, 전국 대표성을 주장할 수 없습니다.",...(failedPages?["일부 데이터 요청에 실패했습니다."]:[])],disclaimer:"LLM이 생성한 시장 반응 가설입니다. 실제 시장조사, 가입률 또는 검증된 수요 예측이 아닙니다."};
 if(inference.missing)return Response.json({...base,error:"LLM_API_KEY_REQUIRED",detail:inference.provider==="groq"?"Vercel에 GROQ_API_KEY를 등록하면 시장 반응 AI 추론이 활성화됩니다.":"Vercel에 NVIDIA_API_KEY를 등록해야 합니다.",mode:"CONFIG_REQUIRED",model:inference.model},{status:503});
 return Response.json({...base,...inference.data,segments:inference.data.segments.map(({uuid,matchScore,...segment})=>segment),mode:"AI_SIMULATED",model:inference.model,provider:inference.provider});
 }catch(e){return Response.json({error:"시장 반응 분석 실패",detail:e.message},{status:500})}}
