import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFrown } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {ERC20ShakerAddress} from "../config.js";
import {getNoteDetails, toWeiString, formatAmount} from "../utils/web3.js";
import {parseNote, generateProof} from "../utils/zksnark.js";

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
  const [hiddenNote, setHiddenNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [supportWebAssembly, setSupportWebAssembly] = useState(true);

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new lib.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)
  let suportWebAssembly = false;

  const checkWebAssemblySupport = () => {
    try {
      new WebAssembly.Memory({initial: 5000});
      console.log("====AAA====");
    } catch (e) {
      console.log("====BBB====");
      setSupportWebAssembly(false);
    }
  }

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

  useEffect(() => {
    checkWebAssemblySupport();
  },[suportWebAssembly])

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
    if(!inputValidate()) return;

    setRunning(true);
    // Send to smart contract
    const { deposit } = parseNote(note) //从NOTE中解析金额/币种/网络/证明
    const url = getUrl();
    const proving_key = await (await fetch(`${url}/circuits/withdraw_proving_key.bin`)).arrayBuffer();
    // console.log("proving_key", proving_key); //######

    const { proof, args } = await generateProof({ 
      deposit, 
      recipient: withdrawAddress, 
      fee: 0,
      refund: toWeiString(parseInt(withdrawAmount)),
    }, 
      shaker, 
      proving_key,       
      accounts[0]
    );

    // console.log('Submitting withdraw transaction', toWeiString(withdrawAmount));
    const gas = await shaker.methods.withdraw(proof, ...args).estimateGas( { from: accounts[0], gas: 10e6});
    // console.log("Estimate GAS", gas);
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
    if( note.substring(0, note.length) === ".".repeat(note.length)) {
      toast.success("Recipient is wrong, DON'T input the recipient manully, just paste it.");
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
      const noteDetails = await getNoteDetails(0, note, shaker, lib, accounts[0]);
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

  function handleInput(text){
      const stars = text.length;
      setNote(text);
      setHiddenNote(generateStars(stars));
  }

  function generateStars(n){
      var stars = '';
      for (var i=0; i<n;i++){
          stars += '.';
      }
      return stars;
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
        {supportWebAssembly ?
        <div>
          <div className="font1">Paste your recipient:</div>
          <textarea className="recipient-input" onChange={(e) => handleInput(e.target.value)} value={hiddenNote}></textarea>
          {/* <textarea className="hidden" onChange={(e) => handleInputHidden(e.target.value)} value={note}></textarea> */}
          <div className="recipient-line">
            <div className="key">Deposit Amount</div>
            <div className="value">{loading ? <FontAwesomeIcon icon={faSpinner} spin/> : formatAmount(depositAmount, 0)} {currency}</div>
          </div>
          <div className="recipient-line">
            <div className="key">Current Balance</div>
            <div className="value">{loading ? <FontAwesomeIcon icon={faSpinner} spin/> : formatAmount(balance, 0)} {currency}</div>
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
            <div className="memo">After submiting transaction, you can check the wallet to see the result.</div>
          </div> :
          <div className="button-deposit" onClick={withdraw}>
            Withdraw
          </div>
          :
          <div className="button-deposit unavailable">
            Withdraw
          </div>
          }
          <div className="empty-gap"></div>
          </div>
        :
        <div className="loading"><FontAwesomeIcon icon={faFrown}/> This device don't have enough memory   for WebAssembly to calculate circuit, please use Desktop Browser such as Chrome or Firefox.
        </div>
        }
        </div>
        :
        <div>
          {/* <div className="connect-wallet">You have not connected to Wallet</div> */}
          <div className="button-connect-wallet" onClick={requestAccess}>Connect to wallet</div>
        </div>
        }
      </div>
    </div>
  )
}


