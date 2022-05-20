import { collectData } from "../interface";
import trading from '../trading.js';

trading.createAccountStream();

collectData()
  .then(() => {
    console.log('Iniitial data collected')
  })
  .catch(console.log);
