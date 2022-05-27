import { v4 as v4uuid } from 'uuid';
import sql from './modules/db.js';
import { hasAllKeyValuePairs } from './modules/helpers.js';


export default new class {
  constructor() { }

  async get(params = {}) {
    if (!(params instanceof Object)) throw Error('params must be an object');
    return sql.unsafe(`
      select * from orders 
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
    const required = ['contract_symbol', 'state', 'quantity', 'type', 'side'];
    if (!hasAllKeyValuePairs(p, required)) throw Error(`Failed to insert order - Missing required parameters: ${required.join(', ')} - ${JSON.stringify(p)}`);
    const [{ uuid }] = await sql`
      insert into orders 
      (
        uuid, 
        contract_symbol,
        position_id,
        state, 
        quantity, 
        price, 
        type, 
        side
      ) VALUES
      (
        ${v4uuid()}, 
        ${p.contract_symbol}, 
        ${p.position_id},
        ${p.state}, 
        ${p.quantity}, 
        ${p.price},
        ${p.type}, 
        ${p.side}
      )
      returning uuid
    `;
    return uuid;
  }

  async update({ id, uuid, ...params }) {
    if (!uuid && !id) throw Error('id, uuid, tradier_id required for update reference');
    const refKey = id ? 'id' : 'uuid';
    const refValue = refKey === 'id' ? id : uuid;
    return sql.unsafe(`
      update orders set
      ${Object.keys(params).length === 0 ? '' :
        Object.entries(params).map(([key, value], i) => `
        ${key} = '${value}'${i < Object.keys(params).length - 1 ? ',' : ''}
      `).join('')}
      where ${refKey} = '${refValue}'`
    );
  }
}
