import {analyzeInternal} from "../../../lib/internal-portfolio.js";
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
async function getExternalEvidence(question){
 if(!process.env.TAVILY_API_KEY)return {status:"NOT_CONFIGURED",sources:[]};
 const autonomous=/자율주행|ADAS|운전자.?보조|레벨.?[2345]/i.test(question);
 const queries=autonomous?[
  "한국 자율주행 자동차보험 레벨3 사고 책임 보상 운전자 전환 최신 제도",
  "automated driving level 2 level 3 insurance liability handover cyber security consumer research"
 ]:[question+" 자동차보험 국내 규제 시장 소비자 조사",question+" insurance risk coverage consumer research"];
 const out=await Promise.allSettled(queries.map(async query=>{
  const r=await fetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_key:process.env.TAVILY_API_KEY,query,search_depth:"advanced",max_results:4,include_answer:false,include_raw_content:false}),signal:AbortSignal.timeout(12000),cache:"no-store"});
  if(!r.ok)throw Error("External search HTTP "+r.status);
  const j=await r.json();return (j.results||[]).map(x=>({title:String(x.title||"").slice(0,140),url:String(x.url||""),date:x.published_date||null,excerpt:String(x.content||"").slice(0,550)}));
 }));
 const sources=[...new Map(out.filter(x=>x.status==="fulfilled").flatMap(x=>x.value).filter(x=>/^https:\/\//.test(x.url)).map(x=>[x.url,x])).values()].slice(0,6);
 return {status:sources.length?"CONNECTED":"UNAVAILABLE",sources};
}
function group(rows,key){const counts={};for(const p of rows){const v=String(p[key]||"미상");counts[v]=(counts[v]||0)+1}return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,count])=>({name,count}))}
const SYSTEM=`한국 자동차보험 신상품 전략가. 질문에 맞는 행동·상황별 고객군 정확히 3개를 한국어 JSON으로 반환. 각 군집은 연령대, 지역, 직업·생활, 차량·운전 특성을 명시. 관찰되지 않은 지역·연령은 추정이라고 표기. 특정 개인 이름 금지. 가상 고객 수는 제공된 수치만 사용하고 실제 회사 데이터나 수요로 주장 금지. 자율주행은 레벨2와 레벨3를 구별. 창의적인 보장 아이디어와 검증 실험 제안. 형식: {"title":"","answer":"","segments":[{"segment":"","target_age":"","target_region":"","target_occupation":"","target_vehicle":"","target_basis":"","reaction":"","reason":"","consideration":"","opportunity":"","experiment":"","evidence":""}],"takeaway":"","limitations":["합성 데이터 기반 가설"]}. JSON만 반환.`;
function parseJSON(s){const t=String(s||"").replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("LLM 응답을 JSON으로 변환하지 못했습니다.")}}
async function infer(question,personas,external,internalDemo){
 const provider=process.env.LLM_PROVIDER||"groq";
 const config=provider==="nvidia"?{key:process.env.NVIDIA_API_KEY,url:"https://integrate.api.nvidia.com/v1/chat/completions",models:[process.env.LLM_MODEL||"nvidia/nemotron-3-super-120b-a12b"]}:{key:process.env.GROQ_API_KEY,url:"https://api.groq.com/openai/v1/chat/completions",models:["openai/gpt-oss-20b","openai/gpt-oss-120b"]};
 if(!config.key)return {missing:true,provider,model:config.models[0]};
 const errors=[];
 for(const model of [...new Set(config.models)]){
  const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.key},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({question,personas:personas.slice(0,5).map(p=>({province:p.province,district:p.district,age_band:Math.floor(Number(p.age||0)/10)*10+"대",occupation_category:p.occupation,persona:String(p.persona||"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님|은|는|이|가|의|\(|,))/g,"[개인]").slice(0,100),family_persona:String(p.family_persona||"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님|은|는|이|가|의|\(|,))/g,"[개인]").slice(0,70),hobbies_and_interests:String(p.hobbies_and_interests||"").slice(0,70)})),external_evidence:external.sources.slice(0,3).map((x,i)=>({id:"S"+(i+1),title:x.title,url:x.url,excerpt:x.excerpt.slice(0,170)})),internal_demo:{customer_count:internalDemo.customer_count,query_status:internalDemo.query_status,matched_conditions:internalDemo.matched_conditions,query_note:internalDemo.query_note,opportunities:internalDemo.opportunities.slice(0,3).map(x=>({label:x.label,count:x.count}))},instructions:"외부 합성 페르소나의 생활 니즈 기반 군집과 내부 가상 고객 집계의 고객군을 연결하여 비교하라. 내부 숫자는 데모 수치라고 반드시 명시하고, 직접 대응되는 내부 군집이 없으면 없다고 설명하라. 외부 군집과 내부 집계의 비율은 비교하지 말라."})}],temperature:0.5,max_completion_tokens:1700,stream:false,...(provider==="groq"&&model!=="openai/gpt-oss-20b"?{response_format:{type:"json_object"}}:{})}),signal:AbortSignal.timeout(45000),cache:"no-store"});
  if(!response.ok){
   const body=await response.text();errors.push(model+" HTTP "+response.status+": "+body.slice(0,180));
   if(provider==="groq"&&(response.status===404||response.status===400||response.status===413||response.status===429))continue;
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
function fallbackAnalysis(question,personas,external,internalDemo){
 const q=question.toLowerCase();
 const topic=/자율주행|adas|운전자.?보조|레벨.?3/i.test(q)?"자율주행 운전 책임":/배터리|전기차|충전|ev/i.test(q)?"전기차 배터리·충전":/사이버|해킹|보안/i.test(q)?"차량 사이버보안":/장거리|고주행|여행/i.test(q)?"장거리 운행":/반려동물|펫/i.test(q)?"반려동물 동승":"자동차보험 신담보";
 const observed=personas.filter(p=>p.age&&p.province);
 const age=observed.length?Math.floor(Number(observed[0].age)/10)*10+"대 (표본 사례, 대표성 없음)":"연령대 추가 검증 필요";
 const region=observed.length?String(observed[0].province)+" (표본 사례, 우선순위 미검증)":"지역별 추가 검증 필요";
 const occupations=[...new Set(personas.map(p=>p.occupation).filter(Boolean))].slice(0,2).join("·")||"직업별 추가 검증 필요";
 const profiles=[
  {segment:topic+" 위험 노출군",target_vehicle:"관련 기능·차량 보유 여부 확인 필요",reason:"관련 위험에 노출될 가능성이 있는 고객을 우선 검증",opportunity:topic+" 관련 사고·분쟁 지원 특약",experiment:"관련 사고 경험과 가입 의향을 별도로 조사"},
  {segment:"갱신 시점 보장 재점검군",target_vehicle:"자동차보험 갱신 예정 차량",reason:"갱신 접점에서 기존 보장과 신담보 차이를 설명할 수 있음",opportunity:"갱신 시 위험 진단·선택형 특약",experiment:"갱신 고객 대상 보장 설명 A/B 테스트"},
  {segment:"업무·장거리 운행군",target_vehicle:"업무·장거리 운행 차량",reason:"운행 시간과 상황에 따라 보장 공백 가능성을 검토",opportunity:"운행 상황별 사고 지원·서비스 특약",experiment:"주행 목적별 보장 수요 인터뷰"}
 ];
 return {title:topic+" 신상품 기회 분석",answer:"AI 서비스 사용량 제한으로 외부 고객군은 검증 전 가설로 제시합니다. 내부 고객 수는 가상 고객 원자료에서 별도로 집계했습니다.",segments:profiles.map((p,i)=>({...p,target_age:age,target_region:region,target_occupation:occupations,target_basis:"합성 페르소나 일부 사례와 AI 가설. 지역·연령의 우선순위는 검증되지 않음",reaction:"검증 필요",consideration:"실제 차량 보유·가입 의향 자료 없음",evidence:"NVIDIA 합성 페르소나 일부 사례이며 대표 표본이 아님"})),takeaway:"내부 가상 고객군을 후보로 삼고 실제 수요 조사로 우선순위를 검증하세요.",limitations:["AI 서비스 일시 제한에 따른 기본 분석 모드","시장 수요·가입률을 예측한 결과가 아님"]};
}
export async function POST(req){try{
 const body=await req.json(),question=String(body.question||"").trim().slice(0,1200);if(!question)return Response.json({error:"질문을 입력해주세요."},{status:400});
 const internalDemo=analyzeInternal(question);
 const [personasResult,external]=await Promise.allSettled([getPersonas(question),getExternalEvidence(question)]);
 const personaData=personasResult.status==="fulfilled"?personasResult.value:{sample:[],selected:[],retrieved:0,failedPages:6};
 const externalData=external.status==="fulfilled"?external.value:{status:"UNAVAILABLE",sources:[]};
 const {sample,selected,retrieved,failedPages}=personaData;
 let inference;
 try{inference=await infer(question,selected,externalData,internalDemo)}catch(err){inference={data:fallbackAnalysis(question,selected,externalData,internalDemo),model:"RULE_BASED_FALLBACK",provider:"local",fallback:true}}
 const stats={retrieved,matched:selected.filter(x=>x.matchScore>0).length,age:group(sample.map(p=>({...p,age:Math.floor(Number(p.age||0)/10)*10+"대"})),"age"),province:group(sample,"province"),occupation:group(sample,"occupation")};
 const base={question,stats,externalResearch:externalData,internal:internalDemo,source:"NVIDIA Nemotron-Personas-Korea (Hugging Face)",limitations:["현재 네모트론 전체 데이터베이스가 아닌 공개 API에서 일부 레코드를 추출해 사용합니다.","합성 페르소나에 실제 차량 보유·보험 가입 의향 데이터가 없으며, 전국 대표성을 주장할 수 없습니다.",...(failedPages?["일부 데이터 요청에 실패했습니다."]:[]),...(externalData.status!=="CONNECTED"?["실시간 외부 검색 근거가 연결되지 않았거나 조회에 실패했습니다."]:[])],disclaimer:"LLM이 생성한 시장 반응 가설입니다. 실제 시장조사, 가입률 또는 검증된 수요 예측이 아닙니다."};
 if(inference.missing)return Response.json({...base,error:"LLM_API_KEY_REQUIRED",detail:inference.provider==="groq"?"Vercel에 GROQ_API_KEY를 등록하면 시장 반응 AI 추론이 활성화됩니다.":"Vercel에 NVIDIA_API_KEY를 등록해야 합니다.",mode:"CONFIG_REQUIRED",model:inference.model},{status:503});
 return Response.json({...base,...inference.data,segments:inference.data.segments.map(({uuid,matchScore,...segment})=>({...segment,segment:String(segment.segment||"").replace(/\([^)]{2,18}\)/g,"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님))/g,"").trim()})),mode:inference.fallback?"LIMITED_FALLBACK":"AI_SIMULATED",model:inference.model,provider:inference.provider});
 }catch(e){return Response.json({error:"시장 반응 분석 실패",detail:e.message},{status:500})}}
