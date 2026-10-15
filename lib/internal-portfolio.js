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
 const add=(id,label,tests,reason)=>{
   if(segments.some(x=>x.id===id))return;
   const combined=[...primary,...tests],c=matched(combined);
   segments.push({id,label,count:c,definition:[...new Set([...base,...active.flatMap(r=>r.tests),...tests].map(([k,v])=>k+"="+v.join("/")))].join(" · "),reason,share_of_demo:Math.round(c/total*10000)/100});
 };
 if(autoQuestion){
   add("renewal","갱신 시점 제안 가능군",[["auto_renewal_due",["1"]]],"기존 조건에 갱신 예정 조건 추가");
   add("coverage","보장 공백 추정군",[["auto_coverage_gap",["1"]]],"가상 보장 공백 지표 교차");
   add("high_mileage","고주행 노출군",[["auto_annual_mileage_band",["2만km 이상"]]],"주행거리 대체지표 교차");
   add("long_auto","장기·자동차 교차 보유군",[["holds_long",["1"]]],"교차 보유 고객 추출");
 }else{
   add("long_auto","장기·자동차 교차 보유군",[["holds_long",["1"]],["holds_auto",["1"]]],"상품 교차 보유");
   add("new","신규 고객군",[["customer_status",["신규"]]],"신규 여부");
   add("existing","기존 고객군",[["customer_status",["기존"]]],"기존 여부");
 }
 const opportunities=[{id:"primary",label:active.length?active.map(x=>x.label).join(" + "):autoQuestion?"자동차보험 전체 보유군":"전체 가상 고객군",count,definition:primary.length?primary.map(([k,v])=>k+"="+v.join("/")).join(" · "):"전체 고객"} ,...segments.sort((a,b)=>b.count-a.count).slice(0,3)];
 return {...summary,query_status:active.length?"MATCHED_RULES":"BROAD_BASELINE",query_note:active.length?"질문에서 인식된 속성의 교차 조건으로 10만 명 원자료를 재집계했습니다.":"질문에서 세부 속성을 식별하지 못해 광범위한 기준 집계만 제공했습니다.",matched_conditions:active.map(x=>x.label),opportunities,matched_count:count,matched_share:Math.round(count/total*10000)/100,customer_count:total,computed_from:"100000_SYNTHETIC_ROWS",not_actual_company_data:true};
}
