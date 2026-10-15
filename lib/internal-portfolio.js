import portfolio from "../data/synthetic_portfolio_compact.json";
import summary from "../data/synthetic_portfolio_summary.json";

const RULES=[
 {id:"ev",pattern:/전기차|배터리|충전|EV\b/i,label:"전기차 보유",tests:[["auto_fuel_type",["전기"]]]},
 {id:"hybrid",pattern:/하이브리드/i,label:"하이브리드 보유",tests:[["auto_fuel_type",["하이브리드"]]]},
 {id:"adas",pattern:/자율주행|ADAS|운전자.?보조|첨단.?안전/i,label:"첨단 운전자 보조기능 관심 추정",tests:[["auto_adas_proxy",["높음(대체지표)"]]]},
 {id:"cyber",pattern:/사이버|해킹|개인정보|데이터.?유출|보안/i,label:"차량 디지털 위험 대체지표",tests:[["auto_adas_proxy",["높음(대체지표)","중간(대체지표)"]]]},
 {id:"mileage",pattern:/장거리|고주행|주행거리|여행|레저/i,label:"장거리·고주행",tests:[["auto_annual_mileage_band",["2만km 이상"]]]},
 {id:"family",pattern:/가족|자녀|아이|동승|어린이|반려동물|펫/i,label:"가족 운전자 범위",tests:[["auto_driver_scope",["가족","부부"]]]},
 {id:"business",pattern:/업무|배달|택배|영업|상용/i,label:"업무·상용 운행",tests:[["auto_use",["업무·상용"]]]},
 {id:"premium",pattern:/고가|수입차|고급차|수리비/i,label:"고가 차량",tests:[["auto_vehicle_value_band",["6천만원 이상"]]]},
 {id:"renew",pattern:/갱신|만기|재가입/i,label:"갱신 예정",tests:[["auto_renewal_due",["1"]]]},
 {id:"claims",pattern:/사고|보상|손해|과실/i,label:"사고 경험",tests:[["auto_claims_3y",["1","2","3"]]]},
 {id:"gap",pattern:/보장.?공백|미가입|보장.?부족|특약|신담보/i,label:"가상 보장 공백",tests:[["auto_coverage_gap",["1"]]]},
 {id:"long",pattern:/장기보험|건강보험|운전자보험|장기.?보유/i,label:"장기보험 보유",tests:[["holds_long",["1"]]]},
 {id:"auto",pattern:/자동차보험|자동차.?보유|차량.?보유/i,label:"자동차보험 보유",tests:[["holds_auto",["1"]]]},
 {id:"general",pattern:/일반보험|재물보험/i,label:"일반보험 보유",tests:[["holds_general",["1"]]]},
 {id:"new",pattern:/신규.?고객|신규.?가입/i,label:"신규 고객",tests:[["customer_status",["신규"]]]},
 {id:"existing",pattern:/기존.?고객|기존.?가입/i,label:"기존 고객",tests:[["customer_status",["기존"]]]},
 {id:"older",pattern:/고령|시니어|노년|60대|70대/i,label:"60대 이상",tests:[["age_band",["60대","70대 이상"]]]},
 {id:"young",pattern:/청년|20대|30대/i,label:"20~30대",tests:[["age_band",["20대 이하","30대"]]]}
];
const AUTO=["ev","hybrid","adas","cyber","mileage","family","business","premium","renew","claims","gap","auto"];
function matches(row,tests,positions,codebookSets){return tests.every(([key,allowed])=>{const i=positions[key];if(i===undefined)return false;const values=codebookSets[key];return allowed.some(v=>values[row[i]]===v)})}
export function analyzeInternal(question){
 if(!portfolio.rows?.length)return {...summary,query_status:"PENDING_GENERATION",query_note:"10만 명 데이터 생성 대기 중",matched_conditions:[]};
 const chosen=RULES.filter(r=>r.pattern.test(question));
 const autoQuestion=chosen.some(r=>AUTO.includes(r.id))||/자동차|차량|운전|특약|보험/i.test(question);
 const base=autoQuestion?[["holds_auto",["1"]]]:[];
 const active=chosen.filter(r=>r.id!=="auto");
 const positions=Object.fromEntries(portfolio.fields.map((k,i)=>[k,i]));
 const total=portfolio.rows.length,books=portfolio.codebooks;
 const matched=(tests)=>portfolio.rows.reduce((n,row)=>n+(matches(row,tests,positions,books)?1:0),0);
 const primary=[...base,...active.flatMap(r=>r.tests)];
 const count=matched(primary);
 const segments=[];
 const describe=(tests)=>{
   const counts={age_band:new Map(),gender:new Map(),customer_status:new Map(),auto_fuel_type:new Map()};
   let n=0;
   for(const row of portfolio.rows){
     if(!matches(row,tests,positions,books))continue;
     n++;
     for(const [field,map] of Object.entries(counts)){
       const value=books[field]?.[row[positions[field]]];
       if(value && value!=="미상")map.set(value,(map.get(value)||0)+1);
     }
   }
   const top=(field)=>{const entries=[...counts[field]].sort((a,b)=>b[1]-a[1]);if(!entries.length||!n)return null;const [label,c]=entries[0];return {label,count:c,percent:Math.round(c/n*100)}};
   return {count:n,age:top("age_band"),gender:top("gender"),status:top("customer_status"),fuel:top("auto_fuel_type")};
 };
 const primaryProfile=describe(primary);
 const candidates=autoQuestion?[
   {id:"renewal",label:"갱신 예정 고객",tests:[["auto_renewal_due",["1"]]],insight:"갱신 접점에서 새로운 보장 제안을 검토할 수 있는 고객군"},
   {id:"coverage",label:"보장 공백 추정 고객",tests:[["auto_coverage_gap",["1"]]],insight:"가상 보장 공백 지표를 기준으로 보장 필요성을 검증할 고객군"},
   {id:"high_mileage",label:"고주행 고객",tests:[["auto_annual_mileage_band",["2만km 이상"]]],insight:"주행 노출이 상대적으로 높은 고객군"},
   {id:"long_auto",label:"장기·자동차 동시 보유 고객",tests:[["holds_long",["1"]]],insight:"복수 상품 보유 관계를 활용한 교차 제안 후보"},
   {id:"premium",label:"고가 차량 보유 고객",tests:[["auto_vehicle_value_band",["6천만원 이상"]]],insight:"고액 수리·보상 부담에 관한 추가 검증 후보"},
   {id:"business",label:"업무용 차량 운행 고객",tests:[["auto_use",["업무·상용"]]],insight:"업무 운행 상황에 특화된 서비스 검증 후보"},
   {id:"ev",label:"전기차 보유 고객",tests:[["auto_fuel_type",["전기"]]],insight:"전기차 운행 특성을 반영한 특약 검증 후보"}
 ]:[
   {id:"long_auto",label:"장기·자동차 동시 보유 고객",tests:[["holds_long",["1"]],["holds_auto",["1"]]],insight:"복수 상품 보유 고객 대상 연계 제안 후보"},
   {id:"new",label:"신규 가입 고객",tests:[["customer_status",["신규"]]],insight:"가입 초기 보장 니즈 검증 후보"},
   {id:"existing",label:"기존 가입 고객",tests:[["customer_status",["기존"]]],insight:"기존 고객 대상 보장 재점검 후보"}
 ];
 const primaryKeys=new Set(primary.map(([k])=>k));
 for(const candidate of candidates){
   if(candidate.tests.every(([k,values])=>primary.some(([pk,pv])=>pk===k&&values.every(v=>pv.includes(v)))))continue;
   const tests=[...primary,...candidate.tests];
   const p=describe(tests);
   if(!p.count||p.count===count)continue;
   segments.push({...candidate,...p,share_of_target:count?Math.round(p.count/count*1000)/10:0});
 }
 segments.sort((a,b)=>b.count-a.count);
 const format=(x)=>x?x.label+" "+x.percent+"%":"정보 부족";
 const makeOpportunity=(id,label,profile,insight,extra={})=>({
   id,label,count:profile.count,insight,
   age_summary:format(profile.age),gender_summary:format(profile.gender),
   customer_summary:format(profile.status),fuel_summary:format(profile.fuel),
   share_of_target:extra.share_of_target??100,
   cohort_note:"해당 고객군 내 구성비이며 실제 회사 고객의 분포가 아닙니다."
 });
 const opportunities=[
   makeOpportunity("primary",active.length?active.map(x=>x.label).join(" · "):autoQuestion?"자동차보험 보유 고객":"전체 고객",primaryProfile,
     active.length?"질문에 관련된 차량·운행·보유 특성을 바탕으로 선별한 핵심 검토 대상":"질문에 특정 조건이 없어 넓은 고객군을 기준으로 확인한 결과"),
   ...segments.slice(0,3).map(x=>makeOpportunity(x.id,x.label,x,x.insight,{share_of_target:x.share_of_target}))
 ];
 return {...summary,query_status:active.length?"MATCHED_RULES":"BROAD_BASELINE",query_note:active.length?"질문에서 인식된 속성의 교차 조건으로 10만 명 원자료를 재집계했습니다.":"질문에서 세부 속성을 식별하지 못해 광범위한 기준 집계만 제공했습니다.",matched_conditions:active.map(x=>x.label),opportunities,matched_count:count,matched_share:Math.round(count/total*10000)/100,customer_count:total,computed_from:"100000_SYNTHETIC_ROWS",not_actual_company_data:true};
}
