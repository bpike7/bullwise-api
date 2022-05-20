const { createDb, migrate } = require('postgres-migrations');

const { PGPORT, PGHOST, PGUSER, PGPASSWORD, PGDATABASE } = process.env;

async function init() {
  const config = {
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    host: PGHOST,
    port: parseInt(PGPORT)
  };

  await createDb(PGDATABASE, {
    ...config,
    defaultDatabase: 'postgres'
  });
  await migrate(config, 'migrations/sqls');
}

init();