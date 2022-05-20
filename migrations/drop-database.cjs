const postgres = require('postgres');

const sql = postgres();

async function run() {
  try {
    await sql`drop schema public cascade;`;
    await sql`create schema public;`;
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

run();