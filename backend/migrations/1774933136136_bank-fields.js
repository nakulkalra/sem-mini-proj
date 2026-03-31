exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      ADD COLUMN IF NOT EXISTS token VARCHAR(20) DEFAULT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      DROP COLUMN IF EXISTS token;
  `);
};
