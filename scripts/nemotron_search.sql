-- Run after an initial import, then after each large expansion if necessary.
-- Trigram index supports Korean substring search. It is not semantic/vector search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS nemotron_search_trgm_idx
 ON public.nemotron_personas USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nemotron_province_idx ON public.nemotron_personas(province);
CREATE INDEX IF NOT EXISTS nemotron_age_idx ON public.nemotron_personas(age);
CREATE OR REPLACE FUNCTION public.search_nemotron_personas(
 keywords text[], result_limit integer DEFAULT 100
)
RETURNS TABLE(source_uuid text,age integer,province text,district text,
 occupation text,persona_text text,family_text text,lifestyle_text text,match_score integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conditions text; scoring text; terms text[];
BEGIN
 SELECT array_agg(DISTINCT lower(trim(t))) INTO terms
 FROM unnest(keywords[1:8]) t WHERE length(trim(t)) BETWEEN 2 AND 40;
 IF terms IS NULL OR cardinality(terms)=0 THEN RETURN; END IF;
 SELECT string_agg(format('p.search_text ILIKE %L', '%'||replace(replace(t,'%','\\%'),'_','\\_')||'%'),' OR '),
        string_agg(format('(CASE WHEN p.search_text ILIKE %L THEN 1 ELSE 0 END)', '%'||replace(replace(t,'%','\\%'),'_','\\_')||'%'),' + ')
 INTO conditions,scoring FROM unnest(terms) t;
 RETURN QUERY EXECUTE format(
 'SELECT p.source_uuid,p.age,p.province,p.district,p.occupation,p.persona_text,p.family_text,p.lifestyle_text,(%s)::integer AS match_score
 FROM public.nemotron_personas p WHERE %s ORDER BY match_score DESC,p.id LIMIT %s',
 scoring,conditions,least(greatest(result_limit,1),150));
END $$;
REVOKE ALL ON FUNCTION public.search_nemotron_personas(text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_nemotron_personas(text[],integer) TO service_role;
