import Big from "big.js";


export function parseOptionSymbol(optionSymbol) {
  if (!optionSymbol) throw Error('option symbol parsing requires string');
  const strikeIndex = optionSymbol.length - 8;
  const initial = optionSymbol.substring(0, strikeIndex);
  const expiration = initial.substring(initial.length - 7, initial.length - 1);
  const symbol = initial.split(expiration)[0];
  const fullStrike = optionSymbol.substring(strikeIndex, optionSymbol.length);
  return {
    symbol,
    strike: Big(fullStrike / 1000).toNumber(),
    expiration,
    option_type: initial[initial.length - 1] === 'P' ? 'put' : 'call'
  }
}
