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
const SYSTEM=`너는 자동차보험사의 미래상품 전략가이자 소비자 행동 연구자다. 핵심 임무는 평범한 타겟 추천이 아니라 예상 밖의 미충족 니즈와 신상품 기회를 발견하는 것이다. 먼저 질문 속 상품을 사람들이 실제로 겪는 문제, 금전적 손실, 시간 손실, 심리적 불안, 보증 공백, 생활 변화의 관점에서 재해석하라. 그다음 3~4개의 행동·상황 중심 고객 군집을 만들고, 각 군집마다 독창적인 보장 또는 서비스 아이디어를 제시하라. 연령·직업만으로 고객군을 정의하거나 '기술에 관심 많은 소비자' 같은 상투적 군집을 만들지 않는다. 적어도 하나는 직관에 반하는 틈새시장, 하나는 기존 보험이 놓치는 서비스 니즈, 하나는 가입을 거부할 이유를 다룬다. 단순히 전기차 보유자, 수리비 걱정 고객 같은 당연한 답을 반복하지 않는다. 각 아이디어에 반증 가능한 실험 질문과 구체적인 타겟 조건을 붙인다. NVIDIA 합성 페르소나에 실제로 기록된 관찰과 AI가 상상한 가설을 명확히 구분하라. 입력된 페르소나가 특정 가설을 뒷받침하지 못하면 '데이터 직접 근거 없음'을 적어라. 내부 데이터는 가상 10만 명 데모 집계이고 실제 보험사 데이터가 아니다. 내부 집계에서 직접 셀 수 있는 타겟만 수치화하며 없는 교차 집계는 창작하지 않는다. 가입률·시장 규모·통계적 군집 비율을 만들어내지 않는다. 외부와 내부 수치를 동일 모집단인 것처럼 비교하지 않는다. 한국어 JSON 객체만 출력하라: {"title":"놀라운 발견을 담은 제목","answer":"핵심 시장 기회 두 문장","segments":[{"segment":"행동/상황 중심의 구체적 고객 군집","reaction":"높은 관심|조건부 관심|낮은 관심","reason":"왜 기존 상품에서 놓쳤는지, 어떤 가정인지","consideration":"타겟팅 조건 및 상품 설계의 걸림돌","opportunity":"새로운 보장·서비스 아이디어","experiment":"반증 가능한 검증 실험 또는 고객 인터뷰 질문","evidence":"합성 페르소나에서 직접 확인한 생활 맥락 또는 데이터 직접 근거 없음"}],"takeaway":"어떤 군집을 어떤 상품으로 먼저 검증할지 명확한 실행 제안","limitations":["합성 데이터와 AI 추론의 한계"]}. 세그먼트는 정확히 3개. 각 텍스트 필드는 1~2문장, 전체 JSON은 간결하게 작성하라. JSON 외의 설명이나 마크다운을 쓰지 마라. 상상력은 높이되 사실 주장에는 엄격하라.`;
function parseJSON(s){const t=String(s||"").replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("LLM 응답을 JSON으로 변환하지 못했습니다.")}}
async function infer(question,personas){
 const provider=process.env.LLM_PROVIDER||"groq";
 const config=provider==="nvidia"?{key:process.env.NVIDIA_API_KEY,url:"https://integrate.api.nvidia.com/v1/chat/completions",models:[process.env.LLM_MODEL||"nvidia/nemotron-3-super-120b-a12b"]}:{key:process.env.GROQ_API_KEY,url:"https://api.groq.com/openai/v1/chat/completions",models:["openai/gpt-oss-20b","llama-3.1-8b-instant"]};
 if(!config.key)return {missing:true,provider,model:config.models[0]};
 const errors=[];
 for(const model of [...new Set(config.models)]){
  const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.key},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({question,personas:personas.slice(0,7).map(p=>({age:p.age,occupation:p.occupation,persona:String(p.persona||"").slice(0,180),family_persona:String(p.family_persona||"").slice(0,130),hobbies_and_interests:String(p.hobbies_and_interests||"").slice(0,130)})),internal_demo:{customer_count:internalDemo.customer_count,opportunities:internalDemo.opportunities},instructions:"외부 합성 페르소나의 생활 니즈 기반 군집과 내부 가상 고객 집계의 고객군을 연결하여 비교하라. 내부 숫자는 데모 수치라고 반드시 명시하고, 직접 대응되는 내부 군집이 없으면 없다고 설명하라. 외부 군집과 내부 집계의 비율은 비교하지 말라."})}],temperature:0.7,max_tokens:2800,stream:false,...(provider==="groq"&&model!=="openai/gpt-oss-20b"?{response_format:{type:"json_object"}}:{})}),signal:AbortSignal.timeout(45000),cache:"no-store"});
  if(!response.ok){
   const body=await response.text();errors.push(model+" HTTP "+response.status+": "+body.slice(0,180));
   if(provider==="groq"&&(response.status===404||response.status===400))continue;
   throw Error("LLM "+provider+" "+errors[errors.length-1]);
  }
  const payload=await response.json();
  let data;
  try {
   if(payload.choices?.[0]?.finish_reason==="length")throw Error("응답 길이 제한으로 JSON이 잘렸습니다.");
   data=parseJSON(payload.choices?.[0]?.message?.content);
   if(!Array.isArray(data.segments)||!data.segments.length||!data.answer)throw Error("LLM 응답에 필요한 분석 필드가 없습니다.");
  }catch(err){errors.push(model+": "+err.message);if(provider==="groq")continue;throw err;}
  return {data,provider,model};
 }
 throw Error("AI 응답 형식이 올바르지 않아 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요. ("+errors.join(" | ").slice(0,200)+")");
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
