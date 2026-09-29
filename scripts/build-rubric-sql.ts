// Generates supabase/seed_rubric.sql from rubric.json: one rubric_versions row and
// one rubric_criteria row per criterion per role.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { rubric, ROLES } from "../src/lib/rubric";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

const rows: string[] = [];
for (const role of ROLES) {
  rubric.criteria.forEach((c, i) => {
    rows.push(
      `(${q(rubric.version)}, ${q(role)}, ${q(c.id)}, ${i + 1}, ${q(c.name)}, ${q(c.definition)}, ${c.weights[role]}, ${j(c.anchors[role])}, ${q(c.spm_ownership)}, ${q(c.insufficient_evidence)}, ${j(c.hire_evidence)})`,
    );
  });
}

const sql = `-- Generated from rubric.json by scripts/build-rubric-sql.ts. Do not edit by hand.
insert into public.rubric_versions (version, rubric) values (${q(rubric.version)}, ${j(rubric)})
on conflict (version) do update set rubric = excluded.rubric;

insert into public.rubric_criteria
  (rubric_version, role, criterion_id, position, name, definition, weight, anchors, spm_ownership, insufficient_evidence, hire_evidence)
values
${rows.join(",\n")}
on conflict (rubric_version, role, criterion_id) do update set
  name = excluded.name, definition = excluded.definition, weight = excluded.weight, anchors = excluded.anchors,
  spm_ownership = excluded.spm_ownership, insufficient_evidence = excluded.insufficient_evidence, hire_evidence = excluded.hire_evidence;

-- Weights must total 100 per role.
do $$ begin
  if exists (select 1 from public.rubric_criteria where rubric_version = ${q(rubric.version)} group by role having sum(weight) <> 100) then
    raise exception 'rubric weights do not total 100';
  end if;
end $$;
`;
writeFileSync(path.resolve(__dirname, "..", "supabase", "seed_rubric.sql"), sql);
console.log(`wrote supabase/seed_rubric.sql (${rows.length} criteria rows)`);
