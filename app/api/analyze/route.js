import {analyzeInternal} from "../../../lib/internal-portfolio.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const DATASET="nvidia/Nemotron-Personas-Korea";
const FIELDS=["uuid","age","sex","province","district","occupation","marital_status","family_type","housing_type","persona","professional_persona","family_persona","travel_persona","hobbies_and_interests"];
const TOPICS=[
 ["자율주행",["자율주행","레벨3","레벨 3","ADAS","운전자 보조"],["운전","출퇴근","기술","자동차","안전","책임","사고","통근","데이터"]],
 ["전기차",["전기차","배터리","충전","EV"],["자동차","친환경","출퇴근","충전","기술","에너지","환경"]],
 ["가족",["자녀","가족","어린이","동승","반려동물","펫"],["가족","자녀","육아","반려동물","여행","돌봄"]],
 ["운행",["장거리","고주행","운전","업무","택배","배달","여행"],["출퇴근","운전","장거리","여행","업무","배송","이동"]],
 ["보안",["사이버","해킹","보안","개인정보"],["디지털","앱","보안","기술","데이터","개인정보"]]
];
function hash(s){return [...s].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,17)}
function clean(x){return Object.fromEntries(FIELDS.filter(k=>x[k]!==undefined&&x[k]!==null).map(k=>[k,typeof x[k]==="string"?x[k].slice(0,350):x[k]]))}
function relevance(p,q){
 const t=[p.persona,p.professional_persona,p.family_persona,p.travel_persona,p.hobbies_and_interests,p.occupation].join(" ").toLowerCase();
 const query=q.toLowerCase();
 const terms=[...new Set(TOPICS.filter(([,triggers])=>triggers.some(w=>query.includes(w.toLowerCase()))).flatMap(([, ,related])=>related))];
 const literal=query.match(/[가-힣a-zA-Z]{2,}/g)||[];
 return terms.reduce((n,w)=>n+(t.includes(w.toLowerCase())?2:0),0)+literal.slice(0,10).reduce((n,w)=>n+(t.includes(w.toLowerCase())?3:0),0);
}
function ageBand(p){const n=Number(p.age);return n>=10&&n<100?Math.floor(n/10)*10+"대":"미상"}
function distribution(rows,key,max=5){const m=new Map();for(const p of rows){const v=key==="age"?ageBand(p):String(p[key]||"미상");if(v!=="미상")m.set(v,(m.get(v)||0)+1)}return [...m].sort((a,b)=>b[1]-a[1]).slice(0,max).map(([name,count])=>({name,count}))}
function diversify(rows,limit){
 const chosen=[],seen=new Set(),groups=new Map();
 for(const p of rows){
  const k=ageBand(p)+"|"+String(p.province||"미상")+"|"+String(p.occupation||"미상").slice(0,15);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(p);
 }
 for(const group of groups.values()){const p=group[0];if(p&&!seen.has(p.uuid)){chosen.push(p);seen.add(p.uuid)}if(chosen.length>=limit)break}
 for(const p of rows){if(chosen.length>=limit)break;if(!seen.has(p.uuid)){chosen.push(p);seen.add(p.uuid)}}
 return chosen;
}
async function getPersonas(q){
 // Deterministic dispersed sampling. This is NOT full dataset search.
 const seed=hash(q),offsets=Array.from({length:12},(_,i)=>(seed+i*7919+Math.imul(i+1,15485863))%999000);
 const pages=await Promise.allSettled(offsets.map(async offset=>{
  const url=new URL("https://datasets-server.huggingface.co/rows");
  for(const [k,v] of Object.entries({dataset:DATASET,config:"default",split:"train",offset:String(offset),length:"40"}))url.searchParams.set(k,v);
  const r=await fetch(url,{signal:AbortSignal.timeout(14000),next:{revalidate:3600}});
  if(!r.ok)throw Error("Hugging Face HTTP "+r.status);
  const j=await r.json();return (j.rows||[]).map(v=>clean(v.row||{})).filter(p=>p.uuid);
 }));
 const unique=[...new Map(pages.filter(x=>x.status==="fulfilled").flatMap(x=>x.value).map(p=>[p.uuid,p])).values()];
 const ranked=unique.map(p=>({...p,matchScore:relevance(p,q)})).sort((a,b)=>b.matchScore-a.matchScore);
 const matched=ranked.filter(p=>p.matchScore>0);
 const selected=diversify(matched.length>=8?matched:ranked,8);
 return {sample:unique,selected,retrieved:unique.length,matchedCount:matched.length,failedPages:pages.filter(x=>x.status==="rejected").length,
  cohortStats:{sample_size:unique.length,relevant_sample_size:matched.length,age:distribution(matched,"age"),region:distribution(matched,"province"),occupation:distribution(matched,"occupation")}};
}
function queryTerms(question){
 const q=question.toLowerCase();
 const groups=TOPICS.filter(([,triggers])=>triggers.some(w=>q.includes(w.toLowerCase())));
 const related=groups.flatMap(([, ,words])=>words);
 const literal=(question.match(/[가-힣]{2,}|[A-Za-z]{3,}/g)||[]).filter(w=>!/^(고객|보험|특약|상품|시장|관련|추천|대상|분석|어떤|대비|신규|핵심)$/.test(w));
 return [...new Set([...literal.slice(0,3),...related])].filter(x=>x.length>=2).slice(0,8);
}
async function getCachedPersonas(q){
 try{
  const {readFile}=await import("node:fs/promises");
  const {join}=await import("node:path");
  const data=JSON.parse(await readFile(join(process.cwd(),"data","nemotron_persona_cache.json"),"utf8"));
  const all=Array.isArray(data.records)?data.records:[];
  if(!all.length)return null;
  const ranked=all.map(p=>({...p,matchScore:relevance(p,q)})).sort((a,b)=>b.matchScore-a.matchScore);
  const matched=ranked.filter(p=>p.matchScore>0);
  const selected=diversify(matched.length>=8?matched:ranked,8);
  return {sample:all,selected,retrieved:all.length,matchedCount:matched.length,failedPages:0,sourceMode:"STATIC_CACHE",
   cohortStats:{sample_size:all.length,relevant_sample_size:matched.length,age:distribution(matched,"age"),region:distribution(matched,"province"),occupation:distribution(matched,"occupation")}};
 }catch{return null}
}
async function getIndexedPersonas(q){
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return null;
 const response=await fetch(url.replace(/\\/$/,"")+"/rest/v1/rpc/search_nemotron_personas",{
  method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({keywords:queryTerms(q),result_limit:120}),signal:AbortSignal.timeout(12000),cache:"no-store"
 });
 if(!response.ok)throw Error("Indexed search HTTP "+response.status);
 const records=await response.json();
 if(!Array.isArray(records))throw Error("Invalid indexed search response");
 const ranked=records.map(p=>({...p,uuid:p.source_uuid,persona:p.persona_text,family_persona:p.family_text,professional_persona:p.lifestyle_text,matchScore:p.match_score||0}));
 return {sample:ranked,selected:diversify(ranked,8),retrieved:ranked.length,matchedCount:ranked.length,failedPages:0,
  sourceMode:"SUPABASE_INDEX",cohortStats:{sample_size:ranked.length,relevant_sample_size:ranked.length,age:distribution(ranked,"age"),region:distribution(ranked,"province"),occupation:distribution(ranked,"occupation")}};
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
const SYSTEM=`한국 자동차보험 신상품 시장전략가. 개별 인물이 아니라 상품 기회를 검토할 수 있는 넓은 고객군 3~5개를 한국어 JSON으로 제시. 최우선: 30대·40대·50~60대 등 넓은 연령대 + 생활·운전 습관 + 보장 니즈로 고객군을 정의. 예: "40대, 출퇴근 운행이 잦고 신기술 수용도가 높은 고객군". 직업명(개발자·교사·택배기사 등), 회사명, 세부 거주지, 정확한 나이, 개별 인물의 서사는 고객군 제목과 타겟 설명에 사용 금지. 직업 필드는 "직업 무관·출퇴근 중심 생활", "업무상 이동이 잦은 생활패턴" 등 행동 특성으로 작성. 지역 필드는 "전국", "도심 생활권", "지역 무관"처럼 광범위하게 작성하며 근거 없이 지역 집중도를 주장하지 말 것. 차량 필드도 차종이나 보유가 확인되지 않으면 "전기차 관심·이용 가능성 검증 필요"처럼 가설로 표현. 특정 연령대 우선순위도 근거 없으면 검증 가설로 표시. 외부 합성 페르소나는 실제 보험 가입 의향·차량 보유·대표 표본을 뜻하지 않음. 가상 고객 수는 제공된 수치만 사용하고 실제 회사 데이터로 주장 금지. 자율주행 레벨2와 레벨3 구별. 창의적인 보장 아이디어와 검증 실험 제안. 형식: {"title":"","answer":"","segments":[{"segment":"","target_age":"","target_region":"","target_occupation":"","target_vehicle":"","target_basis":"","reaction":"","reason":"","consideration":"","opportunity":"","experiment":"","evidence":""}],"takeaway":"","limitations":["합성 데이터 기반 가설"]}. JSON만 반환.`;
function parseJSON(s){const t=String(s||"").replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("LLM 응답을 JSON으로 변환하지 못했습니다.")}}
async function infer(question,personas,external,internalDemo,cohortStats){
 const provider=process.env.LLM_PROVIDER||"groq";
 const config=provider==="nvidia"?{key:process.env.NVIDIA_API_KEY,url:"https://integrate.api.nvidia.com/v1/chat/completions",models:[process.env.LLM_MODEL||"nvidia/nemotron-3-super-120b-a12b"]}:{key:process.env.GROQ_API_KEY,url:"https://api.groq.com/openai/v1/chat/completions",models:["openai/gpt-oss-20b","openai/gpt-oss-120b"]};
 if(!config.key)return {missing:true,provider,model:config.models[0]};
 const errors=[];
 for(const model of [...new Set(config.models)]){
  const response=await fetch(config.url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+config.key},body:JSON.stringify({model,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({question,sample_profile:cohortStats,personas:personas.slice(0,8).map(p=>({age_band:Math.floor(Number(p.age||0)/10)*10+"대",persona:String(p.persona||"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님|은|는|이|가|의|\(|,))/g,"[개인]").slice(0,100),family_persona:String(p.family_persona||"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님|은|는|이|가|의|\(|,))/g,"[개인]").slice(0,70),hobbies_and_interests:String(p.hobbies_and_interests||"").slice(0,70)})),external_evidence:external.sources.slice(0,3).map((x,i)=>({id:"S"+(i+1),title:x.title,url:x.url,excerpt:x.excerpt.slice(0,170)})),internal_demo:{customer_count:internalDemo.customer_count,query_status:internalDemo.query_status,matched_conditions:internalDemo.matched_conditions,query_note:internalDemo.query_note,opportunities:internalDemo.opportunities.slice(0,3).map(x=>({label:x.label,count:x.count}))},instructions:"직업명이나 특정 지역으로 고객을 좁히지 말고 넓은 연령대·생활 습관·운전 행동·보장 니즈 중심으로 묶어라. 외부 합성 페르소나의 생활 니즈 기반 군집과 내부 가상 고객 집계의 고객군을 연결하여 비교하라. 내부 숫자는 데모 수치라고 반드시 명시하고, 직접 대응되는 내부 군집이 없으면 없다고 설명하라. 외부 군집과 내부 집계의 비율은 비교하지 말라."})}],temperature:0.5,max_completion_tokens:2300,stream:false,...(provider==="groq"&&model!=="openai/gpt-oss-20b"?{response_format:{type:"json_object"}}:{})}),signal:AbortSignal.timeout(45000),cache:"no-store"});
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
 const age="연령대 검증 필요 (표본만으로 우선순위 판단 불가)";
 const region="지역별 검증 필요 (표본만으로 우선순위 판단 불가)";
 const occupations="직업 무관·생활 및 운전 패턴 중심";
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
 const [personasResult,external]=await Promise.allSettled([(async()=>{try{const indexed=await getIndexedPersonas(question);if(indexed?.retrieved)return indexed}catch(e){console.warn("Nemotron index unavailable:",e.message)}return await getCachedPersonas(question)||getPersonas(question)})(),getExternalEvidence(question)]);
 const personaData=personasResult.status==="fulfilled"?personasResult.value:{sample:[],selected:[],retrieved:0,failedPages:6};
 const externalData=external.status==="fulfilled"?external.value:{status:"UNAVAILABLE",sources:[]};
 const {sample,selected,retrieved,failedPages}=personaData;
 const cohortStats=personaData.cohortStats||{sample_size:0,relevant_sample_size:0,age:[],region:[],occupation:[]};
 let inference;
 try{inference=await infer(question,selected,externalData,internalDemo,cohortStats)}catch(err){inference={data:fallbackAnalysis(question,selected,externalData,internalDemo),model:"RULE_BASED_FALLBACK",provider:"local",fallback:true}}
 const stats={retrieved,matched:cohortStats.relevant_sample_size,age:group(sample.map(p=>({...p,age:Math.floor(Number(p.age||0)/10)*10+"대"})),"age"),province:group(sample,"province"),occupation:group(sample,"occupation")};
 const indexed=personaData.sourceMode==="SUPABASE_INDEX";
 const cached=personaData.sourceMode==="STATIC_CACHE";
 const base={question,stats,cohortStats,searchMode:indexed?"INDEXED_SEARCH":cached?"CACHED_SAMPLE":"SAMPLED_API",externalResearch:externalData,internal:internalDemo,source:indexed?"NVIDIA Nemotron-Personas-Korea (Supabase indexed search)":cached?"NVIDIA Nemotron-Personas-Korea (precomputed sample cache)":"NVIDIA Nemotron-Personas-Korea (Hugging Face sample)",limitations:[indexed?"Supabase에 적재된 레코드에서 키워드 기반으로 검색한 상위 결과이며, 전체 적재 완료 여부와 의미 검색 정확도는 별도 확인이 필요합니다.":cached?"사전에 수집한 네모트론 합성 페르소나 일부를 검색합니다. 전체 100만 명을 검색하거나 대표 표본으로 추론하는 방식은 아닙니다.":"현재 네모트론 전체 데이터베이스가 아닌 공개 API에서 일부 레코드를 추출해 사용합니다.","합성 페르소나에 실제 차량 보유·보험 가입 의향 데이터가 없으며, 전국 대표성을 주장할 수 없습니다.",...(failedPages?["일부 데이터 요청에 실패했습니다."]:[]),...(externalData.status!=="CONNECTED"?["실시간 외부 검색 근거가 연결되지 않았거나 조회에 실패했습니다."]:[])],disclaimer:"LLM이 생성한 시장 반응 가설입니다. 실제 시장조사, 가입률 또는 검증된 수요 예측이 아닙니다."};
 if(inference.missing){inference={data:fallbackAnalysis(question,selected,externalData,internalDemo),model:"RULE_BASED_FALLBACK",provider:"local",fallback:true}}
 return Response.json({...base,...inference.data,segments:inference.data.segments.map(({uuid,matchScore,...segment})=>({...segment,segment:String(segment.segment||"").replace(/\([^)]{2,18}\)/g,"").replace(/[가-힣]{2,4}(?=\s*(?:씨|님))/g,"").trim()})),mode:inference.fallback?"LIMITED_FALLBACK":"AI_SIMULATED",model:inference.model,provider:inference.provider});
 }catch(e){return Response.json({error:"시장 반응 분석 실패",detail:e.message},{status:500})}}
