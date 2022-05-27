import { collectData } from "../interface";
import tradier from '../providers/tradier/index.js';

console.log('Cacheing initial data . . .');
tradier.createAccountStream();

collectData()
  .then(() => {
    console.log('Setup complete!');
  })
  .catch(console.log);
