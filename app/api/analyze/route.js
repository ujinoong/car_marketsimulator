import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "openai/gpt-5.6-sol";
const metricCatalog = {
  total_stock:{label:"전체 자동차 보유",unit:"대",source:"OBSERVED"},
  passenger_private:{label:"승용 자가용 보유",unit:"대",source:"OBSERVED"},
  passenger_total:{label:"승용 전체 보유",unit:"대",source:"OBSERVED"},
  ev_stock:{label:"EV 승용·비사업용",unit:"대",source:"OBSERVED"},
  ev_mom:{label:"EV 전월 대비",unit:"%",source:"DERIVED"},
  ev_share:{label:"EV 참고 비중",unit:"%",source:"DERIVED"},
  new_total:{label:"당월 신규등록",unit:"대",source:"OBSERVED"},
  new_passenger:{label:"당월 승용 신규등록",unit:"대",source:"OBSERVED"},
  age_population:{label:"해당 연령 개인 자동차 보유",unit:"대",source:"OBSERVED"},
  male_age:{label:"해당 연령 남성 보유",unit:"대",source:"OBSERVED"},
  female_age:{label:"해당 연령 여성 보유",unit:"대",source:"OBSERVED"},
  ev_top_regions:{label:"EV 상위 지역",unit:"대",source:"OBSERVED"},
  stock_trend:{label:"월별 자동차 보유 추이",unit:"대",source:"OBSERVED"},
  new_trend:{label:"월별 신규등록 추이",unit:"대",source:"OBSERVED"}
};

const schema={type:"object",additionalProperties:false,properties:{
  title:{type:"string"},goal:{type:"string"},subject:{type:"string"},
  ageGroup:{type:["string","null"],enum:["10대이하","20대","30대","40대","50대","60대","70대","80대","90대이상",null]},
  metrics:{type:"array",minItems:2,maxItems:6,items:{type:"string",enum:Object.keys(metricCatalog)}},
  internalFields:{type:"array",minItems:2,maxItems:6,items:{type:"string"}},
  internalTargetDefinition:{type:"string"},externalTargetDefinition:{type:"string"}
},required:["title","goal","subject","ageGroup","metrics","internalFields","internalTargetDefinition","externalTargetDefinition"]};

function market(){return JSON.parse(fs.readFileSync(path.join(process.cwd(),"public","market.json"),"utf8"))}
function outputText(r){if(r.output_text)return r.output_text;return (r.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||"").join("")}
async function ask(input,schemaDef,name){
 const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
 if(!token)throw new Error("AI Gateway authentication is not available");
 const res=await fetch("https://ai-gateway.vercel.sh/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,input,text:{format:{type:"json_schema",name,strict:true,schema:schemaDef}}})});
 if(!res.ok)throw new Error(`AI Gateway ${res.status}: ${await res.text()}`);
 return JSON.parse(outputText(await res.json()));
}
function execute(plan,d){
 const m=d.months[d.latest], age=plan.ageGroup;
 const ageMale=age?(d.ageSex202608.male[age]||0):0, ageFemale=age?(d.ageSex202608.female[age]||0):0;
 const months=Object.keys(d.months).sort();
 const values={
  total_stock:{...metricCatalog.total_stock,value:m.totalStock},passenger_private:{...metricCatalog.passenger_private,value:m.passengerPrivate},passenger_total:{...metricCatalog.passenger_total,value:m.passengerTotal},
  ev_stock:{...metricCatalog.ev_stock,value:m.evPassengerPrivate},ev_mom:{...metricCatalog.ev_mom,value:d.evMoM},ev_share:{...metricCatalog.ev_share,value:d.evSharePassengerPrivate},
  new_total:{...metricCatalog.new_total,value:m.newTotal},new_passenger:{...metricCatalog.new_passenger,value:m.newPassenger},
  age_population:{...metricCatalog.age_population,value:ageMale+ageFemale,label:age?`${age} 개인 자동차 보유`:metricCatalog.age_population.label},male_age:{...metricCatalog.male_age,value:ageMale,label:age?`${age} 남성 보유`:metricCatalog.male_age.label},female_age:{...metricCatalog.female_age,value:ageFemale,label:age?`${age} 여성 보유`:metricCatalog.female_age.label},
  ev_top_regions:{...metricCatalog.ev_top_regions,value:[...(m.evRegions||[])].sort((a,b)=>b.value-a.value).slice(0,5)},
  stock_trend:{...metricCatalog.stock_trend,value:months.map(x=>({month:x,value:d.months[x].totalStock}))},new_trend:{...metricCatalog.new_trend,value:months.map(x=>({month:x,value:d.months[x].newTotal}))}
 };
 return plan.metrics.map(k=>({id:k,...values[k]})).filter(x=>x.value!==undefined&&!(Array.isArray(x.value)&&x.value.length===0));
}
const explainSchema={type:"object",additionalProperties:false,properties:{answer:{type:"string"},externalSummary:{type:"string"},internalSummary:{type:"string"},comparison:{type:"string"},insights:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},limitations:{type:"array",minItems:1,maxItems:3,items:{type:"string"}}},required:["answer","externalSummary","internalSummary","comparison","insights","limitations"]};

export async function POST(req){
 try{
  const {question}=await req.json(); if(!question?.trim())return Response.json({error:"질문을 입력해주세요."},{status:400});
  const d=market();
  const plannerPrompt=`당신은 자동차보험 시장 분석 Planner다. 사용자의 질문을 미리 정의된 intent로 분류하지 말고 분석 목적과 필요한 지표를 자유롭게 구조화하라. 단, 실제 계산 가능한 외부 데이터 지표는 아래 metric id 중에서만 선택한다. 질문에 연령대가 명시되면 ageGroup을 설정한다. 내부 데이터는 아직 연결 전이므로 숫자를 만들지 말고, 향후 어떤 내부 필드가 필요할지만 설계한다.\n\n사용자 질문: ${question}\n\n사용 가능한 외부 지표:\n${Object.entries(metricCatalog).map(([k,v])=>`${k}: ${v.label}`).join("\n")}\n\n현재 외부 데이터 기간: ${d.sourceNote}`;
  const plan=await ask(plannerPrompt,schema,"analysis_plan");
  const metrics=execute(plan,d);
  const evidence=metrics.map(x=>({id:x.id,label:x.label,value:x.value,unit:x.unit,source:x.source}));
  const explainPrompt=`당신은 자동차보험 부사장에게 보고하는 AI 시장분석가다. 아래 질문, 분석계획, 실제 계산된 외부 데이터만 사용해 한국어로 간결하게 답하라. 숫자를 새로 만들거나 가입확률을 발명하지 마라. INTERNAL은 아직 데이터 미연결이므로 숫자/반응률을 절대 만들지 말고, 어떤 데이터를 연결하면 무엇을 비교할 수 있는지만 설명한다. OBSERVED/DERIVED와 미연결 INTERNAL을 분명히 구분한다.\n질문: ${question}\n계획: ${JSON.stringify(plan)}\n계산된 외부 근거: ${JSON.stringify(evidence)}`;
  const explanation=await ask(explainPrompt,explainSchema,"market_explanation");
  return Response.json({question,plan,metrics,explanation,dataPeriod:"2026.01–08",sourceNote:d.sourceNote,mode:"AI_FREE_QUERY"});
 }catch(e){console.error(e);return Response.json({error:"AI 분석 중 오류가 발생했습니다.",detail:e.message},{status:500})}
}
