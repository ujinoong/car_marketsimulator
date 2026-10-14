export const runtime="nodejs";
export const dynamic="force-dynamic";
const DATASET="nvidia/Nemotron-Personas-Korea";
const MODEL=process.env.NVIDIA_MODEL||"nvidia/nemotron-3-super-120b-a12b";
const SYSTEM=`당신은 자동차보험 신상품 가상시장 조사 분석가입니다. 제공된 NVIDIA Nemotron-Personas-Korea의 실제 합성 페르소나 레코드만 근거로 소비자 반응을 시뮬레이션하세요. 페르소나는 실제 고객이 아니며 실제 보험 구매행동, 차량 보유, 보험 가입 이력, 구매확률이 없습니다. 질문에 맞는 5~12개 가상 페르소나의 반응을 추론하되, 사실과 추론을 구분하고 과도한 확신을 피하세요. 실제 가입률, 전체 시장점유율, 전국 대표성, 고객 수, 통계적 신뢰구간을 만들어내지 마세요. 인구통계학적 특성만으로 개인의 보험 위험이나 구매 가능성을 단정하지 마세요. 한국어로 답하고 아래 JSON 객체만 출력하세요: {"title":"간결한 제목","answer":"2~3문장 핵심 결론","segments":[{"segment":"구체적 페르소나 유형","reaction":"높은 관심|조건부 관심|낮은 관심","reason":"질문과 페르소나 맥락에 근거한 추론","consideration":"반응을 바꿀 수 있는 상품 조건"}],"takeaway":"임원 관점의 검증할 가설","limitations":["합성 페르소나에 대한 LLM 가설이며 실제 구매확률이 아님"]}. 3~5개 세그먼트를 제시하세요.`;
function clean(row){const x=row?.row||{};const fields=["uuid","age","sex","province","district","occupation","marital_status","family_type","housing_type","persona","professional_persona","family_persona","travel_persona","hobbies_and_interests"];return Object.fromEntries(fields.filter(k=>x[k]!==undefined).map(k=>[k,typeof x[k]==="string"?x[k].slice(0,350):x[k]]));}
async function getPersonas(question){
 const seed=[...question].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,17);
 const offsets=[0,1,2].map((_,i)=>(seed+i*12973)%990000);
 const pages=await Promise.all(offsets.map(async offset=>{const u=new URL("https://datasets-server.huggingface.co/rows");u.searchParams.set("dataset",DATASET);u.searchParams.set("config","default");u.searchParams.set("split","train");u.searchParams.set("offset",String(offset));u.searchParams.set("length","4");const r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:{"Accept":"application/json"},cache:"no-store"});if(!r.ok)throw Error("Hugging Face 페르소나 조회 실패 ("+r.status+")");const j=await r.json();return (j.rows||[]).map(clean)}));
 return pages.flat().filter(x=>x.uuid);
}
function extractJSON(s){const t=s.replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();try{return JSON.parse(t)}catch{const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw Error("모델 응답을 JSON으로 해석할 수 없습니다.")}}
export async function POST(req){try{
 const body=await req.json(),question=String(body.question||"").trim().slice(0,1200);
 if(!question)return Response.json({error:"질문을 입력해주세요."},{status:400});
 const personas=await getPersonas(question);
 if(!personas.length)throw Error("페르소나 데이터를 불러오지 못했습니다.");
 const key=process.env.NVIDIA_API_KEY;
 if(!key)return Response.json({error:"NVIDIA_API_KEY 설정 필요",detail:"Hugging Face 페르소나 조회는 준비되었으나 LLM 추론을 위해 Vercel 환경변수 NVIDIA_API_KEY가 필요합니다.",personasLoaded:personas.length},{status:503});
 const response=await fetch("https://integrate.api.nvidia.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({question,personas})}],temperature:0.3,max_tokens:1800,stream:false}),signal:AbortSignal.timeout(55000),cache:"no-store"});
 if(!response.ok){const e=await response.text();throw Error("NVIDIA LLM 응답 오류 ("+response.status+"): "+e.slice(0,180))}
 const payload=await response.json(),result=extractJSON(payload.choices?.[0]?.message?.content||"");
 return Response.json({question,...result,personas:personas.map(({uuid,age,sex,province,district,occupation,persona})=>({uuid,age,sex,province,district,occupation,persona})),source:"NVIDIA Nemotron-Personas-Korea (Hugging Face)",model:MODEL,mode:"AI_SIMULATED",disclaimer:"합성 페르소나 기반 LLM 가설입니다. 실제 시장조사·가입확률·고객 반응이 아닙니다."});
 }catch(e){return Response.json({error:"시뮬레이션 실패",detail:e.message},{status:500})}}
