import {parseNote} from "./zksnark.js";
import {decimals} from "../config.js";
const { GasPriceOracle } = require('gas-price-oracle');

export const loadWithdrawArray = async (noteArray, shaker, lib) => {
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
        const { timestamp } = await lib.eth.getBlock(withdrawEvent.blockHash)
        const withdrawalDate = new Date(timestamp * 1000)
        re.push({
          amount: long2Short(amount, decimals),
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

export const getNoteDetailsArray = async (noteKeyArray, noteArray, shaker, lib) => {
  let currencyArray = [];
  let amountArray = [];
  let netIdArray = [];
  let depositArray = [];
  const withdrawals = await loadWithdrawArray(noteArray, shaker, lib);
  try {
    for(let i = 0; i < noteArray.length; i++) {
      const { currency, amount, netId, deposit } = parseNote(noteArray[i]);
      depositArray.push(deposit);
      currencyArray.push(currency);
      amountArray.push(amount);
      netIdArray.push(netId);
    }
    console.log("1111")
    // Load deposit data
    const events = await shaker.getPastEvents('Deposit', {
      fromBlock: 0,
      toBlock: 'latest',
    })

    if( events.length === 0) return [];
    console.log("2222", events)

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
        const receipt = await lib.eth.getTransactionReceipt(txHash)
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
    console.log("4444", re)
    return re;
  } catch(e) {
    console.error('loadDepositData', e)
    return [];
  }
}

export const getNoteDetails = async (noteKey, note, shaker, lib) => {
  const { currency, amount, netId, deposit } = parseNote(note)
  const depositInfo = await loadDepositData({ deposit }, shaker, lib);
  if(depositInfo === null) return null;
  const depositDate = new Date(depositInfo.timestamp * 1000)
  const withdrawData = await loadWithdrawalData({ deposit }, shaker, lib);
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
export async function loadDepositData({ deposit }, shaker, lib, account) {
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
    const receipt = await lib.eth.getTransactionReceipt(txHash)

    return { timestamp, txHash, isSpent, from: receipt.from, commitment: deposit.commitmentHex, orderStatus, recipient, effectiveTime }
  } catch (e) {
    console.error('loadDepositData', e)
    return null;
  }
}

export async function loadWithdrawalData({ deposit }, shaker, lib) {
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
      totalWithdraw += long2Short(amount, decimals);
      const fee = withdrawEvent.returnValues.fee
      const { timestamp } = await lib.eth.getBlock(withdrawEvent.blockHash)
      const withdrawalDate = new Date(timestamp * 1000)
      withdrawArray.push({
        amount: long2Short(amount, decimals),
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

export const long2Short = (num, decimals) => {
  return num / Math.pow(10, decimals);
}

export const toWeiString = num => num + "0".repeat(decimals);

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