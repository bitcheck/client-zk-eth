export const defaultRPC = "mainnet.infura.io/ws/v3/";
export const infuraId = "3446259cb0e74d68b614f9a10328a368";
export const netId = 2000;

export const addressConfig = {
  net_2000: {
    // Localhost ganache
    USDTAddress: "0x459DcF5F0b3CAD48D28A465ffcDd844C2c2D630a",
    ERC20ShakerAddress: "0xcC543cb62e5EBEb5460E72B1749c8A2173836537",
    ETHShakerAddress: "0x6D1Af6e1654820d1550e991A03F49409888297D7",
  },
  net_4: {
    // Rinkeby
    USDTAddress: "0x79C6B89D0C939e6D1C45Aa384C321bf668752624",
    ERC20ShakerAddress: "0x38A58Ee8A0e4361a90789a1DBdDBFA8Fcf91ACCA",
    ETHShakerAddress: "0x2794669bd766AB95fD6F2Ed9A4c534b12c809041",
  }
}

export const decimals = 6; // USDT Decimals is 6
export const merkleTreeHeight=20;

export const depositAmounts = [500, 1000, 2000, 5000, 10000, 20000, 50000, 120000, 200000, 500000];
export const coins = [100, 300, 800, 3000, 4000, 8000, 30000, 130000, 300000, 400000]; //找零的钱币面值
