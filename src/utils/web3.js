import {parseNote} from "./zksnark.js";
import {decimals, addressConfig, erc20ShakerVersion} from "../config.js";
import {eraseNoteString} from "./localstorage.js";
const { GasPriceOracle } = require('gas-price-oracle');

export const connect = async(web3) => {
  const netId = await web3.eth.net.getId();
  if(netId === 1 || netId === 4) {
    const ERC20ShakerAddress = addressConfig["net_"+netId].ERC20ShakerAddress;
    const erc20Json = require('../contracts/abi/ERC20.json');
    const erc20ShakerJson = erc20ShakerVersion === 'V1' ? require('../contracts/abi/ERC20Shaker.json') : require('../contracts/abi/ERC20Shaker' + erc20ShakerVersion + '.json');
    const shaker = new web3.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress);
    const erc20 = new web3.eth.Contract(erc20Json, addressConfig["net_"+netId].USDTAddress);
    return {
      netId,
      shaker,
      erc20,
      ERC20ShakerAddress
    }
  } else {
    return false;
  }
}
/**
 * Get withdrawal data from contract
 * @param {*} noteArray 
 * @param {*} shaker 
 * @param {*} web3 
 */
export const loadWithdrawArray = async (noteArray, shaker, web3) => {
  let currencyArray = [];
  let amountArray = [];
  let netIdArray = [];
  let depositArray = [];
  try {
    for(let i = 0; i < noteArray.length; i++) {
      const { currency, amount, netId, deposit } = parseNote(noteArray[i]);
      depositArray.push(deposit);
      currencyArray.push(currency);
      amountArray.push(amount);
      netIdArray.push(netId);
    }
    const events = await shaker.getPastEvents('Withdrawal', {
      fromBlock: 0,
      toBlock: 'latest',
    })

    if( events.length === 0) return [];
    let re = [];
    for(let i = 0; i < events.length; i++) {
      for(let j = 0; j < depositArray.length; j++) {
        if(events[i].returnValues.nullifierHash !== depositArray[j].nullifierHex) continue;

        var withdrawEvent = events[i];
        const amount = withdrawEvent.returnValues.amount;
        const fee = withdrawEvent.returnValues.fee
        const { timestamp } = await web3.eth.getBlock(withdrawEvent.blockHash)
        const withdrawalDate = new Date(timestamp * 1000)
        re.push({
          amount: fromWeiString(amount, decimals),
          fee,
          txHash: withdrawEvent.transactionHash,
          to: withdrawEvent.returnValues.to,
          nullifier: withdrawEvent.returnValues.nullifierHash,
          time: withdrawalDate.toLocaleDateString() + " " + withdrawalDate.toLocaleTimeString(), 
        })
      }
    }
    return re;
  } catch(e) {
    console.error('loadDepositData', e)
    return [];
  }
}

/**
 * Delete all the note key in localstorage which can not be found on chain.
 * Has bugs, while the deposit is under confirmation, and refresh the list page, the localstorage will be deleted because can not find this new records on chain.
 */
export const cleanLocalStorage = (eventsContract, notekeysLocal, depositArray) => {
  let deleteNotekeyArray = [];
  for(let i = 0; i < depositArray.length; i++) {
    let has = false;
    for(let j = 0; j < eventsContract.length; j++) {
      if(depositArray[i].commitmentHex === eventsContract[j].returnValues.commitment) {
        has = true;
        break;
      }
    }
    if(!has) deleteNotekeyArray.push(notekeysLocal[i])
  }
  // console.log("AAAAAA", deleteNotekeyArray);
  for(let i = 0; i < deleteNotekeyArray.length; i++) eraseNoteString(deleteNotekeyArray[i]);
}

/**
 * Get All notes details from contract with lowest download from blockchain
 * @param {*} noteKeyArray 
 * @param {*} noteArray 
 * @param {*} shaker 
 * @param {*} web3 
 */
export const getNoteDetailsArray = async (noteKeyArray, noteArray, shaker, web3) => {
  let currencyArray = [];
  let amountArray = [];
  let netIdArray = [];
  let depositArray = [];
  const withdrawals = await loadWithdrawArray(noteArray, shaker, web3);
  // console.log('####', withdrawals);
  try {
    for(let i = 0; i < noteArray.length; i++) {
      const { currency, amount, netId, deposit } = parseNote(noteArray[i]);
      depositArray.push(deposit);
      currencyArray.push(currency);
      amountArray.push(amount);
      netIdArray.push(netId);
    }
    // console.log("1111")
    // Load deposit data
    const events = await shaker.getPastEvents('Deposit', {
      fromBlock: 0,
      toBlock: 'latest',
    })

    if( events.length === 0) return [];
    // console.log("2222", events)

    // Clean the useless note keys in localStorage
    // cleanLocalStorage(events, noteKeyArray, depositArray);

    let re = [];
    for(let i = 0; i < events.length; i++) {
      let noteData, depositEvent;
      for(let j = 0; j < depositArray.length; j++) {
        if(events[i].returnValues.commitment !== depositArray[j].commitmentHex) continue;
        noteData = {
          note: noteArray[j], 
          noteKey: noteKeyArray[j], 
          currency: currencyArray[j], 
          amount: amountArray[j], 
          netId: netIdArray[j] 
        };
        depositEvent = events[i];

        let totalWithdraw = 0;
        let withdrawArray = [];
        for(let k = 0; k < withdrawals.length; k++) {
          if(withdrawals[k].nullifier === depositArray[j].nullifierHex) {
            totalWithdraw += withdrawals[k].amount;
            withdrawArray.push(withdrawals[k]);
          }
        }
        // console.log("3333", depositEvent)
        const { timestamp, orderStatus, recipient, effectiveTime, commitment } = depositEvent.returnValues
        const txHash = depositEvent.transactionHash
        // const isSpent = await shaker.methods.isSpent(deposit.nullifierHex).call({ from: account, gas: 1e6}) //没必要，去掉
        const receipt = await web3.eth.getTransactionReceipt(txHash)
        const depositDate = new Date(timestamp * 1000)
        // console.log(depositDate, noteData, timestamp, orderStatus, recipient, effectiveTime, commitment);
        re.push({
          noteKey: noteData.noteKey,
          note: noteData.note,
          currency: noteData.currency,
          amount: noteData.amount,
          netId: noteData.netId,
          commitment,
          txHash,
          from: receipt.from,
          time: depositDate.toLocaleDateString() + " " + depositDate.toLocaleTimeString(),
          timestamp,
          orderStatus, 
          recipient,
          effectiveTime,
          withdrawArray,
          totalWithdraw,
        })
      }
    }
    // console.log("4444", re)
    return re;
  } catch(e) {
    console.error('loadDepositData', e)
    return [];
  }
}

export const getNoteDetails = async (noteKey, note, shaker, web3) => {
  const { currency, amount, netId, deposit } = parseNote(note)
  const depositInfo = await loadDepositData({ deposit }, shaker, web3);
  if(depositInfo === null) return null;
  const depositDate = new Date(depositInfo.timestamp * 1000)
  const withdrawData = await loadWithdrawalData({ deposit }, shaker, web3);
  return({
    noteKey,
    currency, 
    amount,
    netId,
    commitment: depositInfo.commitment,
    txHash: depositInfo.txHash,
    from: depositInfo.from, 
    isSpent: depositInfo.isSpent,
    time: depositDate.toLocaleDateString() + " " + depositDate.toLocaleTimeString(),
    timestamp: depositInfo.timestamp,
    withdrawArray: withdrawData === undefined ? [] : withdrawData.withdrawArray,
    totalWithdraw: withdrawData === undefined ? 0 : withdrawData.totalWithdraw,
    orderStatus: depositInfo.orderStatus, 
    recipient: depositInfo.recipient,
    effectiveTime: depositInfo.effectiveTime,
    note: note
  })
}
export async function loadDepositData({ deposit }, shaker, web3, account) {
  try {
    const eventWhenHappened = await shaker.getPastEvents('Deposit', {
      filter: {
        commitment: deposit.commitmentHex
      },
      fromBlock: 0,
      toBlock: 'latest'
    })
    if (eventWhenHappened.length === 0) {
      // throw new Error('There is no related deposit, the note is invalid');
      return null;
    }

    const { timestamp, orderStatus, recipient, effectiveTime } = eventWhenHappened[0].returnValues
    const txHash = eventWhenHappened[0].transactionHash
    const isSpent = await shaker.methods.isSpent(deposit.nullifierHex).call({ from: account, gas: 1e6})
    const receipt = await web3.eth.getTransactionReceipt(txHash)

    return { timestamp, txHash, isSpent, from: receipt.from, commitment: deposit.commitmentHex, orderStatus, recipient, effectiveTime }
  } catch (e) {
    console.error('loadDepositData', e)
    return null;
  }
}

export async function loadWithdrawalData({ deposit }, shaker, web3) {
  try {
    const events = await await shaker.getPastEvents('Withdrawal', {
      fromBlock: 0,
      toBlock: 'latest'
    })
    
    const withdrawEvents = events.filter((event) => {
      return event.returnValues.nullifierHash === deposit.nullifierHex
    })
    let withdrawArray = [];
    let totalWithdraw = 0;
    // console.log(withdrawEvents);
    for(var i = 0; i < withdrawEvents.length; i++) {
      var withdrawEvent = withdrawEvents[i];
      const amount = withdrawEvent.returnValues.amount;
      totalWithdraw += fromWeiString(amount, decimals);
      const fee = withdrawEvent.returnValues.fee
      const { timestamp } = await web3.eth.getBlock(withdrawEvent.blockHash)
      const withdrawalDate = new Date(timestamp * 1000)
      withdrawArray.push({
        amount: fromWeiString(amount, decimals),
        fee,
        txHash: withdrawEvent.transactionHash,
        to: withdrawEvent.returnValues.to,
        nullifier: withdrawEvent.returnValues.nullifierHash,
        time: withdrawalDate.toLocaleDateString() + " " + withdrawalDate.toLocaleTimeString(), 
      })
    }
    return {totalWithdraw, withdrawArray};
  }  catch (e) {
    console.error('loadWithdrawalData', e)
  }
}

export function formatAmount(n, decimals = 2) {
　　let num = Number(n);
　　let re = /\d{1,3}(?=(\d{3})+$)/g;
　　let n1 = num.toFixed(decimals).replace(/^(\d+)((\.\d+)?)$/, function (s, s1, s2) {
　　　　return s1.replace(re, "$&,") + s2;
　　});
　　return n1;
}

export function formatAccount(acc) {
  return acc.substring(0, 8) + "..." + acc.substring(acc.length - 6, acc.length);
}

export async function getGasPrice() {
  try {
    const defaultRpc = 'https://mainnet.infura.io/v3/3446259cb0e74d68b614f9a10328a368'
    const oracle = new GasPriceOracle({ defaultRpc });
     
    return await oracle.fetchGasPricesOnChain();  
  } catch (err) {
    return 100; // Default if network error
  }
}

export const getERC20Symbol = async(contract) => {
  return await contract.methods.symbol().call();
}

export function fromWeiString(numStr, decimal) {
  numStr = numStr.toString();
	const pointPos = numStr.length - decimal;
	let re;
	if(pointPos > 0) re = numStr.substring(0, pointPos) + "." + numStr.substring(pointPos + 1, numStr.length);
	else re = "0." + "0".repeat(-pointPos) + numStr;
	return parseFloat(re)
}

export function toWeiString(numStr, decimal) {
	numStr = numStr.toString();
	let zheng = numStr.substring(0, numStr.indexOf('.'));
	if(numStr.indexOf('.') > 0) zheng = parseInt(zheng) === 0 ? "" : zheng;
	else zheng = numStr;
	let xiao, xiaoLength;
	if(numStr.indexOf('.') > 0) {
		xiao = numStr.substr(numStr.indexOf('.') + 1, numStr.length - zheng.length - 1)
	} else {
		xiao = "";
	}
	
	if(xiao.length > decimal) {
		xiaoLength = decimal;
		xiao = xiao.substring(0, decimal);
	} else {
		xiaoLength = xiao.length;
	}
	const xiaoNew = xiao + ("0").repeat(decimal - xiaoLength)
	return zheng + xiaoNew;
}

export const getNoteShortStrings = (noteStrings) => {
  let re = [];
  for(let i = 0; i < noteStrings.length; i++) {
    re.push(noteStrings[i].substring(0, 40) + '...');
  }
  return re;
}

export const getNoteShortString = (noteString) => {
  return noteString.substring(0, 40) + '...';
}

export const checkAddressIsContract = async (address, web3) => {
  if(validateAddress(address, web3)) {
    const code = await web3.eth.getCode(address);
    if(code === '0x') return 2;  // Smart contract
    else return 1; // Normal address
  } else return 0; // Invalid address
}
export const validateAddress = (address, web3) => {
  return web3.utils.isAddress(address);
}