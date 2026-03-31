exports.up = (pgm) => {
  pgm.createTable('counters', {
    id: 'id',
    name: { type: 'varchar(100)', notNull: true },
    type: { type: 'varchar(50)', notNull: true, default: 'standard' },
    services: { type: 'text[]', notNull: true },
    is_offline: { type: 'boolean', notNull: true, default: false },
    time_saved: { type: 'integer', notNull: true, default: 0 }
  });

  // Seed default counters to match existing codebase logic
  pgm.sql(`
    INSERT INTO counters (name, type, services, is_offline) VALUES
    ('Cashier 1', 'standard', ARRAY['Cash Deposit','Cash Withdrawal'], false),
    ('Cashier 2', 'standard', ARRAY['Cash Deposit','Cash Withdrawal'], false),
    ('Account Desk', 'standard', ARRAY['Account Services','Loan Inquiry'], false),
    ('Priority Desk', 'vip', ARRAY['Cash Deposit','Cash Withdrawal','Account Services','Loan Inquiry','Priority Service'], false)
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('counters');
};
