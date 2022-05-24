import { collectData } from "../interface";
import trading from '../trading.js';

console.log('Cacheing initial data . . .');
trading.createAccountStream();

collectData()
  .then(() => {
    console.log('Setup complete!');
  })
  .catch(console.log);
