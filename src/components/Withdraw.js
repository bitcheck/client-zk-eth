import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {ERC20ShakerAddress} from "../config.js";
import {getNoteDetails, toWeiString} from "../utils/web3.js";
import {parseNote, generateProof} from "../utils/zksnark.js";

//shaker-usdt-10-2000-0x8b9670272e4dc2cef109ddb89f663385b944306716013be07a7603f0318e38c6f02553f36e3893c66b93cdad8c0807303a94638e354cd51dc11a8fe41f61

export default function Withdraw(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositTime, setDepositTime] = useState("-");
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState("USDT");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new lib.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)

  const requestAuth = async web3Context => {
    try {
      await web3Context.requestAuth();
    } catch (e) {
      console.error(e);
    }
  };

  const getUrl = () => {
    const url = window.location.href;
    // console.log(url);
    const index1 = url.indexOf("//");
    const http = url.substring(0, index1 + 2);
    const body = url.substring(index1 + 2, url.length);
    const index2 = body.indexOf("/");
    const body2 = body.substring(0, index2);
    return http + body2;
  }

  useEffect(()=>{
    if(accounts && accounts.length > 0) {
      console.log(accounts[0]);
      // initProvingKey();
      setWithdrawAddress(accounts[0]);
      console.log("Withdraw");
    }
  },[accounts])

  const requestAccess = useCallback(() => requestAuth(web3Context), []);

  const withdraw = async () => {
    // console.log(withdrawAmount, withdrawAddress, currency);
    setRunning(true);
    if(!inputValidate()) return;

    // Send to smart contract
    const { deposit } = parseNote(note) //从NOTE中解析金额/币种/网络/证明
    const url = getUrl();
    const proving_key = await (await fetch(`${url}/circuits/withdraw_proving_key.bin`)).arrayBuffer();
    // console.log("proving_key", proving_key); //######

    const { proof, args } = await generateProof({ 
      deposit, 
      recipient: withdrawAddress, 
      fee: 0,
      refund: toWeiString(parseInt(withdrawAmount))
    }, shaker, proving_key);

    console.log('Submitting withdraw transaction', toWeiString(withdrawAmount));
    const gas = await shaker.methods.withdraw(proof, ...args).estimateGas( { from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);
    try {
      await shaker.methods.withdraw(proof, ...args).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      await onNoteChange();
      setRunning(false);
    } catch (err) {
      setRunning(false);
    }
  }

  /**
   * Check integer
   */
  const intValidate = (n) => {
    const noteRegex = /^[1-9]+[0-9]*$/g;
    const match = noteRegex.exec(n);
    return match;
  }

  const inputValidate = () => {
    if(parseInt(withdrawAmount) === 0 || withdrawAddress === "") {
      toast.success("Please input right data");
      return false;
    }
    if( withdrawAmount > balance ) {
      toast.success("Withdraw amount can be more than current balance: " + balance + " " + currency);
      return false;
    }
    if( !intValidate(withdrawAmount) ) {
      toast.success("Withdraw amount must be interger.");
      return false;
    }
    return true;
  }
  useEffect(() => {
    onNoteChange();
  }, [note]);

  const onNoteChange = async () => {
    if(note.substring(0, 11) !== "shaker-usdt") return;
    try {
      setLoading(true);
      const noteDetails = await getNoteDetails(0, note, shaker, lib);
      // console.log(noteDetails);
      // setNote(note);
      setDepositAmount(noteDetails.amount);
      setBalance(noteDetails.amount - noteDetails.totalWithdraw);
      setDepositTime(noteDetails.time);
      setCurrency(noteDetails.currency.toUpperCase());
      setLoading(false);
    } catch (e) {
      toast.success("Note is wrong, can not get data");
      setDepositAmount(0);
      setBalance(0);
      setDepositTime('-');
      setLoading(false);
    }
  }

  return(
    <div>
      <div className="deposit-background">
        <ToastContainer autoClose={3000}/>
        {accounts && accounts.length > 0 ? 
        <div>
        <div className="title-bar">
          Withdraw
        </div>
        <div className="font1">Enter your recipient:</div>
        <textarea className="recipient-input" onChange={(e) => setNote(e.target.value)}></textarea>
        <div className="recipient-line">
          <div className="key">Deposit Amount</div>
          <div className="value">{loading ? <FontAwesomeIcon icon={faSpinner} spin/> : depositAmount} {currency}</div>
        </div>
        <div className="recipient-line">
          <div className="key">Current Balance</div>
          <div className="value">{loading ? <FontAwesomeIcon icon={faSpinner} spin/> : balance} {currency}</div>
        </div>
        <div className="recipient-line">
          <div className="key">Deposit Time</div>
          <div className="value">{loading ? <FontAwesomeIcon icon={faSpinner} spin/> : depositTime}</div>
        </div>
        <div className="separate-line"></div>
        <div className="font1">Withdraw amount ({currency}):</div>
        <input className="withdraw-input" onChange={(e) => setWithdrawAmount(e.target.value)}/>
        <div className="font1">Withdraw address:</div>
        <input className="withdraw-input withdraw-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}/>
        {balance > 0 && withdrawAmount <= balance && !loading && withdrawAmount > 0 && intValidate(withdrawAmount) ?
        running ? 
        <div className="button-deposit unavailable">
          <FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Withdraw
        </div> :
        <div className="button-deposit" onClick={withdraw}>
          Withdraw
        </div>
        :
        <div className="button-deposit unavailable">
          Withdraw
        </div>
        }
        </div>
        :
        <div>
          <div className="connect-wallet">You have not connected to Wallet</div>
          <div className="button-deposit" onClick={requestAccess}>Connect to wallet</div>
        </div>
        }
      </div>
    </div>
  )
}


