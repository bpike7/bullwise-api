import Tradier from './client.js';
import { getQuoteBySymbol } from '../../interface.js';

export default class TradierMock extends Tradier {
  constructor() {
    super();
  }

  async createOrder(params) {
    await sleep();
    params.price = getQuoteBySymbol(params.symbol).price_now;
    params.id = Math.floor(100000000 + Math.random() * 900000000);
    const messages = [
      { ...params, status: 'pending' },
      { ...params, status: 'open' }
    ];
    if (!params.stop) messages.push({ ...params, status: 'filled' });
    this.asyncSendMockMessages(messages, params.stop ? 100 : 500);
    return { id: params.id };
  }

  async cancelOrder({ tradier_id }) {
    return { id: tradier_id };
  }

  async createAccountStream() { }

  async asyncSendMockMessages(orderMessages, delay) {
    for (const om of orderMessages) {
      await sleep(delay);
      this.handleOrderMessage({
        id: 1107075,
        event: 'order',
        status: om.status,
        type: om.type,
        price: om.price,
        avg_fill_price: om.price,
        exec_quantity: om.quantity,
        last_fill_quantity: om.quantity,
        remaining_quantity: 0,
        transaction_date: new Date(),
        create_date: new Date(),
        account: '6YA',
        tag: om.tag
      });
    }
  }
}

async function sleep(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}