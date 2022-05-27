import Tradier from './client.js';
import TradierMock from './mock.js';

const { TRADIER_MOCK_MODE } = process.env;

const TradierClass = TRADIER_MOCK_MODE === 'true' ? TradierMock : Tradier
export default new TradierClass();