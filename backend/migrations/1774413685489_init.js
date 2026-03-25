/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS queue (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      service VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  pgm.sql(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='queue' AND column_name='status'
      ) THEN 
        ALTER TABLE queue ADD COLUMN status VARCHAR(20) DEFAULT 'waiting';
      END IF; 
    END $$;
  `);

  // Update existing rows that have no status
  pgm.sql(`UPDATE queue SET status = 'waiting' WHERE status IS NULL;`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE queue DROP COLUMN IF EXISTS status;`);
};
