export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      ADD COLUMN IF NOT EXISTS workflow JSONB DEFAULT '[]'::jsonb;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      DROP COLUMN IF EXISTS workflow;
  `);
};
