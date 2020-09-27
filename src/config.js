export const defaultRPC = "mainnet.infura.io/ws/v3/";
export const infuraId = "3446259cb0e74d68b614f9a10328a368";
export const netId = 4;

export const addressConfig = {
  net_2000: {
    // Localhost ganache
    USDTAddress: "0x459DcF5F0b3CAD48D28A465ffcDd844C2c2D630a",
    ERC20ShakerAddress: "0xF9F88807690117b31491E34A4863c01303394a34",
    ETHShakerAddress: "0x6D1Af6e1654820d1550e991A03F49409888297D7",
  },
  net_4: {
    // Rinkeby
    USDTAddress: "0x79C6B89D0C939e6D1C45Aa384C321bf668752624",
    ERC20ShakerAddress: "0xDDDD28f8AE6E91BcfD5e93e10339bEa37faC568C",
    ETHShakerAddress: "0x2794669bd766AB95fD6F2Ed9A4c534b12c809041",
  }
}

export const decimals = 6; // USDT Decimals is 6
export const merkleTreeHeight=20;

export const depositAmounts = [500, 1000, 2000, 5000, 10000, 20000, 50000, 120000, 200000, 500000];
export const coins = [100, 300, 800, 3000, 4000, 8000, 30000, 130000, 300000, 400000]; //找零的钱币面值

export const callRelayer = true; // If use relayer to withdraw
export const relayerURLs = [
  'http://127.0.0.1:8010'
]
