exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE queue (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      service VARCHAR(50),
      status VARCHAR(20) DEFAULT 'waiting',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS queue;`);
};
