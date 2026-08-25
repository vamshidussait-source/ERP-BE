// Register a custom type parser for Postgres 'date' (OID 1082) so the
// pg driver returns the raw "YYYY-MM-DD" string instead of converting
// it to a JavaScript Date object (which then serializes as a full ISO
// datetime like "2026-08-01T00:00:00.000Z").
//
// pg ships no TypeScript declarations, so we use require() here.
// The pg `types` object is a singleton — calling setTypeParser once
// affects every connection TypeORM (or any other consumer) opens.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pgTypes = require('pg').types as {
  setTypeParser: (oid: number, parser: (value: string) => string) => void;
};
pgTypes.setTypeParser(1082, (val: string) => val);
