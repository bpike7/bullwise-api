import { collectWatchlistData } from "../interface";
import trading from '../trading.js';

trading.createMarketStream();
collectWatchlistData()
  .then(() => {
    console.log('Iniitial data collected')
  })
  .catch(console.log);
