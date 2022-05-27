import sql from './modules/db.js';
import { hasAllKeyValuePairs } from './modules/helpers.js';


export default new class {
  constructor() { }

  async get(params = {}) {
    if (!(params instanceof Object)) throw Error('params must be an object');
    return sql.unsafe(`
    select * from positions 
    ${Object.keys(params).length === 0 ? '' :
        Object.entries(params).map(([key, value], i) => `
      ${i === 0 ? 'where' : 'and'} 
      ${key} 
      ${Array.isArray(value) ?
            `in (${value.map(v => `'${v}'`).join(', ')})` :
            value === 'IS NULL' ? 'IS NULL' : `= '${value}'`
          }
    `).join('')}`
    );
  }

  async insert(p) {
    const required = ['contract_symbol', 'state', 'quantity', 'price_avg'];
    if (!hasAllKeyValuePairs(p, required)) throw Error(`Failed to insert order - Missing required parameters: ${required.join(', ')} - ${JSON.stringify(p)}`);
    const [{ id }] = await sql`
      insert into positions
      (
        tradier_id,
        state,
        contract_symbol,
        quantity,
        price_avg
      ) VALUES
      (
        ${null}, 
        ${p.state}, 
        ${p.contract_symbol},
        ${p.quantity},
        ${p.price_avg}
      ) returning id
    `;
    return id;
  }

  async update({ id, ...params }) {
    if (!id) throw Error('id required for update reference');
    return sql.unsafe(`
    update positions set
    ${Object.keys(params).length === 0 ? '' :
        Object.entries(params).map(([key, value], i) => `
      ${key} = '${value}'${i < Object.keys(params).length - 1 ? ',' : ''}
    `).join('')}
    where id = ${id}`
    );
  }
}
