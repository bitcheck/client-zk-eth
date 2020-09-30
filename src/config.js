export const defaultRPC = "mainnet.infura.io/ws/v3/";
export const infuraId = "3446259cb0e74d68b614f9a10328a368";

/**
 * Version Controller
 */
// If simple version, no effectiveTime, no to order cheque, no endorsement etc.
export const simpleVersion = true; 
// If use relayer to withdraw
export const callRelayer = false;
// V1 smart contract using merkle tree for each deposit, takes high gas. V2 will rollup several deposits and insert them into merkle tree once, then the gas charge will be deduce averagely. V2 will operate the deposit and withdraw on server and do rollup for each 10 deposits/withdraw.
export const erc20ShakerVersion = 'V1'; // ######
// First symbol of note, don't use '-' character inside the logo
export const notePrefix = 'cashnova'; //
export const appName = 'CashNova';

export const addressConfig = {
  net_1: {
    USDTAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    ERC20ShakerAddress: erc20ShakerVersion === 'V1' ? 
      "0xF9F88807690117b31491E34A4863c01303394a34" : 
      "",
    ETHShakerAddress: "0x6D1Af6e1654820d1550e991A03F49409888297D7",
  },
  net_2000: {
    // Localhost ganache
    USDTAddress: "0x459DcF5F0b3CAD48D28A465ffcDd844C2c2D630a",
    ERC20ShakerAddress: erc20ShakerVersion === 'V1' ? 
      "0xF9F88807690117b31491E34A4863c01303394a34" : 
      "",
    ETHShakerAddress: "0x6D1Af6e1654820d1550e991A03F49409888297D7",
  },
  net_4: {
    // Rinkeby
    USDTAddress: "0x79C6B89D0C939e6D1C45Aa384C321bf668752624",
    ERC20ShakerAddress: erc20ShakerVersion === 'V1' ? 
      "0x56ad85B2BF15CFBC9AD8580E07Cf4A0b1c339B56" :
      "0x6f210F2234454FBF245D86F072603aF914A76A34", //######
    ERC20ShakerAddressV2: "0x6f210F2234454FBF245D86F072603aF914A76A34",
    ETHShakerAddress: "0x2794669bd766AB95fD6F2Ed9A4c534b12c809041",
  }
}

export const decimals = 6; // USDT Decimals is 6
export const merkleTreeHeight=20;

export const depositAmounts = [500, 1000, 2000, 5000, 10000, 20000, 50000, 120000, 200000, 500000];
export const coins = [100, 300, 800, 3000, 4000, 8000, 30000, 130000, 300000, 400000]; //找零的钱币面值

export const relayerURLs = [
  'http://127.0.0.1:8010'
]
