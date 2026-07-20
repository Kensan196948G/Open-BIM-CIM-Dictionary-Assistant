/**
 * Seed a Neon branch with fixtures/concepts.sample.json — the same synthetic,
 * public dataset the in-memory repository serves. Safe for dev/preview
 * branches; contains no personal or licensed-restricted data.
 *
 * Usage:
 *   DATABASE_URL=<neon connection string> pnpm --filter @obcda/api exec tsx scripts/seed.ts
 *
 * The connection string is read from the environment and never printed.
 * Re-running against an already-seeded database is a no-op (guarded by the
 * concepts row count); all statements run in a single transaction.
 */
/* eslint-disable no-console -- CLI script: stdout is its user interface */

import { createHash } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { foldLabelText } from "@obcda/domain";

import { dictionaryFixture } from "../src/fixtures";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const sql = neon(databaseUrl);

/** content_hash is NOT NULL in the schema but not part of the fixture — derive a stable synthetic hash. */
function syntheticContentHash(sourceId: string, versionLabel: string): string {
  return createHash("sha256").update(`${sourceId}:${versionLabel}`).digest("hex");
}

async function main(): Promise<void> {
  const countRows = await sql`SELECT count(*)::int AS count FROM concepts`;
  const existing = Number(countRows[0]?.["count"] ?? 0);
  if (existing > 0) {
    console.log(`Already seeded (${existing} concepts) — nothing to do.`);
    return;
  }

  const { sources, concepts } = dictionaryFixture;
  const conceptIdByKey = new Map(
    concepts.map((concept) => [concept.canonicalKey, concept.id]),
  );
  const resolveTargetId = (targetKey: string): string => {
    const id = conceptIdByKey.get(targetKey);
    if (!id) throw new Error(`Unresolvable relation target: ${targetKey}`);
    return id;
  };

  // Layer-ordered, not per-concept: FK checks are immediate (not deferred),
  // so every concept row must exist before any relation references it.
  const statements = [
    // Serialize concurrent seed runs for the whole transaction — combined
    // with the NOT EXISTS guards below this makes double-execution safe even
    // though term_labels has no unique constraint.
    sql`SELECT pg_advisory_xact_lock(727442001)`,
    ...sources.map(
      (source) => sql`
        INSERT INTO sources (id, code, name_ja, publisher, base_url, source_type, license_status)
        VALUES (${source.id}, ${source.code}, ${source.nameJa}, ${source.publisher},
                ${source.baseUrl}, ${source.sourceType}, ${source.licenseStatus})
        ON CONFLICT DO NOTHING
      `,
    ),
    ...sources.flatMap((source) =>
      source.versions.map(
        (version) => sql`
          INSERT INTO source_versions (id, source_id, version_label, retrieved_at, content_hash, status)
          VALUES (${version.id}, ${source.id}, ${version.versionLabel}, ${version.retrievedAt},
                  ${syntheticContentHash(source.id, version.versionLabel)}, 'published')
          ON CONFLICT DO NOTHING
        `,
      ),
    ),
    ...concepts.map(
      (concept) => sql`
        INSERT INTO concepts (id, canonical_key, concept_type, standard_family, external_uri)
        VALUES (${concept.id}, ${concept.canonicalKey}, ${concept.conceptType},
                ${concept.standardFamily}, ${concept.externalUri})
        ON CONFLICT DO NOTHING
      `,
    ),
    ...concepts.map(
      (concept) => sql`
        INSERT INTO concept_versions (
          concept_id, source_version_id, official_name, official_definition,
          summary_ja, technical_note_ja, common_misunderstanding, status
        )
        VALUES (${concept.id}, ${concept.sourceVersionId}, ${concept.name},
                ${concept.officialDefinition}, ${concept.summaryJa},
                ${concept.technicalNoteJa}, ${concept.commonMisunderstanding}, ${concept.status})
        ON CONFLICT DO NOTHING
      `,
    ),
    // normalized_label stores the folded search-key layer (normalize.ts §4.4);
    // the trigram index is its only consumer — the display form stays in `label`.
    // source_version_id ties each label to its provenance so current-version
    // label filtering (neon.ts) stays faithful. NOT EXISTS substitutes for the
    // missing unique constraint to keep re-runs duplicate-free.
    ...concepts.flatMap((concept) =>
      concept.labels.map(
        (label) => sql`
          INSERT INTO term_labels (concept_id, language, label, normalized_label, label_type, source_version_id)
          SELECT ${concept.id}, ${label.language}, ${label.label},
                 ${foldLabelText(label.label)}, ${label.labelType}, ${concept.sourceVersionId}
          WHERE NOT EXISTS (
            SELECT 1 FROM term_labels
            WHERE concept_id = ${concept.id}
              AND language = ${label.language}
              AND label = ${label.label}
              AND label_type = ${label.labelType}
          )
        `,
      ),
    ),
    ...concepts.flatMap((concept) =>
      concept.relations.map(
        (relation) => sql`
          INSERT INTO concept_relations (source_concept_id, target_concept_id, relation_type, source_version_id)
          VALUES (${concept.id}, ${resolveTargetId(relation.targetKey)},
                  ${relation.relationType}, ${concept.sourceVersionId})
          ON CONFLICT DO NOTHING
        `,
      ),
    ),
  ];

  await sql.transaction(statements);

  console.log(
    `Seeded ${sources.length} sources and ${concepts.length} concepts (labels + relations included).`,
  );
}

main().catch((error: unknown) => {
  // Print only the message — driver errors must never leak the connection string.
  console.error(
    "Seed failed:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exit(1);
});
