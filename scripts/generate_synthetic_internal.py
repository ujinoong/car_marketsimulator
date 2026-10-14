#!/usr/bin/env python3
"""Deterministic fictional auto-policy portfolio. No company data or internal schema."""
import csv, json, random, collections, argparse
from pathlib import Path

def generate(n=100000, out="synthetic_auto_customers.csv", summary="synthetic_internal_summary.json"):
    rng=random.Random(20261014)
    regions=["서울","경기","인천","부산","대구","대전","광주","울산","세종","강원","충북","충남","전북","전남","경북","경남","제주"]
    weights=[19,26,6,7,5,3,3,2,1,3,3,4,3,3,4,7,1]
    fields=["customer_id","policy_id","close_month","start_date","end_date","age_band","region","customer_type","vehicle_type","fuel_type","vehicle_age","vehicle_value_band","vehicle_use","driver_scope","coverage_package","own_damage_coverage","renewal_status","claims_count_3y","annual_premium_krw","endorsement_count"]
    counts=collections.Counter()
    Path(out).parent.mkdir(parents=True,exist_ok=True)
    with open(out,"w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for i in range(n):
            age=rng.choices(["20대","30대","40대","50대","60대 이상"],[12,25,29,22,12])[0]
            fuel=rng.choices(["전기","하이브리드","가솔린","디젤","LPG"],[14,19,42,20,5])[0]
            vage=rng.choices([0,1,2,3,4,5,6,7,8,9,10],[8,10,11,12,12,11,10,8,7,6,5])[0]
            vehicle=rng.choices(["승용","SUV","승합","화물"],[52,36,5,7])[0]
            value=rng.choices(["2천만원 미만","2천~4천만원","4천~6천만원","6천만원 이상"],[24,44,22,10])[0]
            use=rng.choices(["일상·출퇴근","장거리·레저","업무·상용"],[70,20,10])[0]
            coverage=rng.choices(["기본형","표준형","확장형"],[23,54,23])[0]
            renewal=rng.choices(["갱신 예정","갱신 완료","신규"],[31,50,19])[0]
            month=rng.randint(1,12)
            start=f"2026-{month:02d}-{rng.randint(1,28):02d}"
            row=dict(customer_id=f"DEMO-C{i+1:06d}",policy_id=f"DEMO-P{i+1:06d}",close_month=f"2026{month:02d}",start_date=start,end_date=f"2027-{month:02d}-{int(start[-2:]):02d}",age_band=age,region=rng.choices(regions,weights)[0],customer_type=rng.choices(["개인","법인"],[94,6])[0],vehicle_type=vehicle,fuel_type=fuel,vehicle_age=vage,vehicle_value_band=value,vehicle_use=use,driver_scope=rng.choices(["본인","부부","가족","누구나"],[41,30,23,6])[0],coverage_package=coverage,own_damage_coverage=rng.choices(["Y","N"],[83,17])[0],renewal_status=renewal,claims_count_3y=rng.choices([0,1,2,3],[68,24,7,1])[0],annual_premium_krw=rng.randrange(350000,1550001,10000),endorsement_count=rng.choices([0,1,2,3],[71,22,6,1])[0])
            w.writerow(row)
            counts["total"]+=1
            for key in ("fuel_type","vehicle_type","age_band","vehicle_use","coverage_package","renewal_status","region"):
                counts[key+":"+str(row[key])]+=1
            if fuel=="전기" and value in ("4천~6천만원","6천만원 이상"):counts["ev_high_value"]+=1
            if fuel=="전기" and renewal=="갱신 예정":counts["ev_renewal_due"]+=1
            if use=="장거리·레저" and coverage=="기본형":counts["long_trip_basic_coverage"]+=1
            if row["own_damage_coverage"]=="N":counts["no_own_damage"]+=1
    summary_data={"data_status":"SYNTHETIC_DEMO","dataset":"Fictional auto-insurance customer snapshot","generated_at":"2026-10-14","customer_count":n,"unit":"one fictional customer and one policy per row","not_actual_company_data":True,"sampling_note":"Illustrative artificial distributions only; not representative of any insurer or Korean market.","dimensions":{},"opportunities":[{"id":"ev_high_value","label":"고가 전기차 이용군","count":counts["ev_high_value"],"definition":"전기차 + 차량가액 4천만원 이상"},{"id":"ev_renewal_due","label":"갱신 예정 전기차 이용군","count":counts["ev_renewal_due"],"definition":"전기차 + 갱신 예정"},{"id":"long_trip_basic_coverage","label":"장거리 운행·기본담보군","count":counts["long_trip_basic_coverage"],"definition":"장거리·레저 + 기본형"},{"id":"no_own_damage","label":"자차담보 미가입군","count":counts["no_own_damage"],"definition":"자차담보 N"}]}
    for key in ("fuel_type","vehicle_type","age_band","vehicle_use","coverage_package","renewal_status","region"):
        summary_data["dimensions"][key]=[{"label":k.split(":",1)[1],"count":v} for k,v in counts.items() if k.startswith(key+":")]
    with open(summary,"w",encoding="utf-8") as f:json.dump(summary_data,f,ensure_ascii=False,indent=2)
    print("Generated",n,"fictional customers in",out)
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--count",type=int,default=100000);p.add_argument("--out",default="synthetic_auto_customers.csv");p.add_argument("--summary",default="synthetic_internal_summary.json");a=p.parse_args();generate(a.count,a.out,a.summary)
