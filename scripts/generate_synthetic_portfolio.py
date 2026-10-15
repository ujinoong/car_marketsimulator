#!/usr/bin/env python3
"""Fictional multi-line customer portfolio for a public demo.

Uses GENERALIZED product-holding concepts, not proprietary dashboard counts.
Each row is one fictional customer; product ownership may overlap.
"""
import argparse, collections, csv, json, random
from pathlib import Path

PRODUCTS=("장기","자동차","일반")
LONG_CATEGORIES=("건강","운전자","실손","상해","자녀","재물")
def generate(n=100000, out="synthetic_customer_portfolio.csv", summary="synthetic_portfolio_summary.json", compact=None):
    rng=random.Random(20261015)
    Path(out).parent.mkdir(parents=True,exist_ok=True)
    fields=["customer_id","age_band","gender","customer_status","holds_long","holds_auto","holds_general",
            "long_policy_count","long_monthly_premium_band","long_primary_category","auto_vehicle_type",
            "auto_fuel_type","auto_vehicle_value_band","auto_use","auto_driver_scope","auto_renewal_due",
            "auto_claims_3y","auto_adas_proxy","auto_coverage_gap","auto_annual_mileage_band"]
    counts=collections.Counter()
    packed=[]
    codebooks={k:[] for k in fields if k!="customer_id"}
    lookup={k:{} for k in codebooks}
    with open(out,"w",newline="",encoding="utf-8-sig") as f:
        writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader()
        for i in range(n):
            age=rng.choices(["20대 이하","30대","40대","50대","60대","70대 이상"],[9,17,22,24,19,9])[0]
            gender=rng.choices(["남성","여성","미상"],[48,49,3])[0]
            status=rng.choices(["신규","기존"],[27,73])[0]
            # Overlapping insurance ownership, intentionally NOT calibrated to actual insurer ratios.
            holds_long=rng.random()<.71
            holds_auto=rng.random()<(0.51 if holds_long else 0.38)
            holds_general=rng.random()<.09
            if not (holds_long or holds_auto or holds_general):holds_long=True
            long_n=rng.choices([1,2,3,4,5],[54,25,12,6,3])[0] if holds_long else 0
            long_premium=rng.choices(["5만원 미만","5만~10만원","10만~20만원","20만~30만원","30만원 이상"],[39,24,19,11,7])[0] if holds_long else ""
            category=rng.choices(LONG_CATEGORIES,[27,22,19,15,10,7])[0] if holds_long else ""
            fuel=rng.choices(["전기","하이브리드","가솔린","디젤","기타"],[14,21,43,18,4])[0] if holds_auto else ""
            value=rng.choices(["2천만원 미만","2천~4천만원","4천~6천만원","6천만원 이상"],[25,44,22,9])[0] if holds_auto else ""
            use=rng.choices(["일상·출퇴근","장거리·레저","업무·상용"],[65,24,11])[0] if holds_auto else ""
            adas=rng.choices(["높음(대체지표)","중간(대체지표)","낮음(대체지표)"],[24,46,30])[0] if holds_auto else ""
            row=dict(customer_id=f"DEMO-C{i+1:06d}",age_band=age,gender=gender,customer_status=status,
                holds_long=int(holds_long),holds_auto=int(holds_auto),holds_general=int(holds_general),
                long_policy_count=long_n,long_monthly_premium_band=long_premium,long_primary_category=category,
                auto_vehicle_type=rng.choices(["승용","SUV","승합","화물"],[53,35,5,7])[0] if holds_auto else "",
                auto_fuel_type=fuel,auto_vehicle_value_band=value,auto_use=use,
                auto_driver_scope=rng.choices(["본인","부부","가족","누구나"],[41,30,24,5])[0] if holds_auto else "",
                auto_renewal_due=int(holds_auto and rng.random()<.30),
                auto_claims_3y=rng.choices([0,1,2,3],[69,23,7,1])[0] if holds_auto else "",
                auto_adas_proxy=adas,
                auto_coverage_gap=int(holds_auto and rng.random()<.26),
                auto_annual_mileage_band=rng.choices(["1만km 미만","1만~2만km","2만km 이상"],[42,43,15])[0] if holds_auto else "")
            writer.writerow(row)
            if compact:
                codes=[]
                for k in codebooks:
                    v=str(row[k])
                    if v not in lookup[k]:
                        lookup[k][v]=len(codebooks[k]);codebooks[k].append(v)
                    codes.append(lookup[k][v])
                packed.append(codes)
            counts["total"]+=1
            for k in ["age_band","gender","customer_status","long_monthly_premium_band","long_primary_category","auto_fuel_type","auto_adas_proxy"]:
                if row[k]!="":counts[k+":"+str(row[k])]+=1
            for k in PRODUCTS:
                if row[{"장기":"holds_long","자동차":"holds_auto","일반":"holds_general"}[k]]:counts["hold:"+k]+=1
            combination="+".join(k for k in PRODUCTS if row[{"장기":"holds_long","자동차":"holds_auto","일반":"holds_general"}[k]])
            counts["combo:"+combination]+=1
            if holds_long and holds_auto:counts["cross_sell_long_auto"]+=1
            if holds_auto and row["auto_adas_proxy"]=="높음(대체지표)" and row["auto_coverage_gap"]:counts["adas_gap"]+=1
            if holds_auto and row["auto_renewal_due"] and row["auto_coverage_gap"]:counts["renewal_gap"]+=1
            if holds_auto and row["auto_annual_mileage_band"]=="2만km 이상" and row["auto_coverage_gap"]:counts["high_mileage_gap"]+=1
    summary_data={"data_status":"SYNTHETIC_DEMO","dataset":"Fictional multi-line insurance customer portfolio",
        "generated_at":"2026-10-15","customer_count":n,"unit":"one fictional customer per row, overlapping product holdings",
        "not_actual_company_data":True,"sampling_note":"All counts and distributions are fictional and are NOT calibrated to any internal dashboard or real insurer.",
        "dimensions":{},"ownership_combinations":[],
        "opportunities":[
            {"id":"cross_sell_long_auto","label":"장기·자동차 동시 보유군","count":counts["cross_sell_long_auto"],"definition":"장기보험과 자동차보험 동시 보유"},
            {"id":"adas_gap","label":"첨단운전자보조 추정·보장 공백군","count":counts["adas_gap"],"definition":"자동차 보유 + ADAS 대체지표 높음 + 보장 공백(가상)"},
            {"id":"renewal_gap","label":"갱신 예정·보장 공백군","count":counts["renewal_gap"],"definition":"자동차 갱신 예정 + 보장 공백(가상)"},
            {"id":"high_mileage_gap","label":"고주행·보장 공백군","count":counts["high_mileage_gap"],"definition":"연간 주행 2만km 이상 + 보장 공백(가상)"}]}
    for key in ["age_band","gender","customer_status","long_monthly_premium_band","long_primary_category","auto_fuel_type","auto_adas_proxy"]:
        summary_data["dimensions"][key]=[{"label":k.split(":",1)[1],"count":v} for k,v in counts.items() if k.startswith(key+":")]
    summary_data["dimensions"]["product_ownership"]=[{"label":p,"count":counts["hold:"+p]} for p in PRODUCTS]
    summary_data["ownership_combinations"]=[{"label":k.split(":",1)[1],"count":v} for k,v in counts.items() if k.startswith("combo:")]
    Path(summary).parent.mkdir(parents=True,exist_ok=True)
    Path(summary).write_text(json.dumps(summary_data,ensure_ascii=False,indent=2),encoding="utf-8")
    if compact:
        Path(compact).parent.mkdir(parents=True,exist_ok=True)
        Path(compact).write_text(json.dumps({"status":"SYNTHETIC_DEMO","count":n,"fields":list(codebooks),"codebooks":codebooks,"rows":packed},ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"Generated {n} fictional multi-line customers; NO actual company statistics.")
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--count",type=int,default=100000)
    p.add_argument("--out",default="synthetic_customer_portfolio.csv")
    p.add_argument("--summary",default="synthetic_portfolio_summary.json")
    p.add_argument("--compact",default=None)
    a=p.parse_args();generate(a.count,a.out,a.summary,a.compact)
