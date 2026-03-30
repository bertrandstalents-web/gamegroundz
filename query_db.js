const db = require('./database');
db.get('SELECT id, name, has_processing_fee, processing_fee_amount FROM facilities WHERE id = 10', (err, row) => {
  if (err) console.error(err);
  else console.log(row);
  process.exit();
});
