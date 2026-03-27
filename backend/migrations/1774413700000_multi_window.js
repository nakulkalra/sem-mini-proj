exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      ADD COLUMN IF NOT EXISTS window_id    INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS priority     VARCHAR(10) DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS order_time   INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS wait_time    INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS served_at    TIMESTAMP DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMP DEFAULT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE queue
      DROP COLUMN IF EXISTS window_id,
      DROP COLUMN IF EXISTS priority,
      DROP COLUMN IF EXISTS order_time,
      DROP COLUMN IF EXISTS wait_time,
      DROP COLUMN IF EXISTS served_at,
      DROP COLUMN IF EXISTS abandoned_at;
  `);
};
