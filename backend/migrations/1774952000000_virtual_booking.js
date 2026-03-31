exports.up = (pgm) => {
  pgm.addColumns('queue', {
    is_virtual: { type: 'boolean', default: false },
    called_at: { type: 'timestamp' },
    checked_in: { type: 'boolean', default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('queue', ['is_virtual', 'called_at', 'checked_in']);
};
