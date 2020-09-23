import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFrown, faLock, faBookmark, faTimes } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {addressConfig, netId} from "../config.js";
import {getNoteDetails, toWeiString, formatAmount} from "../utils/web3.js";
import {parseNote, generateProof} from "../utils/zksnark.js";
import {saveNoteString} from "../utils/localstorage.js";
import DateTimePicker from 'react-datetime-picker';

export default function Withdraw(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const web3 = lib;
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositTime, setDepositTime] = useState("-");
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState("");
  const [note, setNote] = useState("");
  const [hiddenNote, setHiddenNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [supportWebAssembly, setSupportWebAssembly] = useState(true);
  const [orderStatus, setOrderStatus] = useState(2);
  const [effectiveTime, setEffectiveTime] = useState(0);
  const [effectiveTimeString, setEffectiveTimeString] = useState('');
  const [recipient, setRecipient] = useState('');
  const [showContent, setShowContent] = useState(false);

  const [endorseEffectiveTimeStatus, setEndorseEffectiveTimeStatus] = useState(0);
  const [endorseEffectiveTime, setEndorseEffectiveTime] = useState(parseInt((new Date()).valueOf() / 1000));
  const [endorseOrderStatus, setEndorseOrderStatus] = useState(0);//0- 无记名支票，1- 记名支票
  const [endorseAmountStatus, setEndorseAmountStatus] = useState(0);
  const [endorseAmount, setEndorseAmount] = useState(0);
  const [endorseAddress, setEndorseAddress] = useState('');
  const [endorseUI, setEndorseUI] = useState(false);

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new web3.eth.Contract(erc20ShakerJson.abi, addressConfig["net_"+netId].ERC20ShakerAddress)
  let suportWebAssembly = false;

  const checkWebAssemblySupport = () => {
    try {
      new WebAssembly.Memory({initial: 5000});
    } catch (e) {
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
    // console.log("proving_key", proving_key);

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
    console.log("Estimate GAS", gas);
    try {
      await shaker.methods.withdraw(proof, ...args).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      await onNoteChange();
      // setShowContent(false);
      setRunning(false);
    } catch (err) {
      toast.success("#" + err.code + ", " + err.message);
      // setShowContent(false);
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
    if(note !== undefined && note !== "") onNoteChange();
  }, [note]);

  const onNoteChange = async () => {
    if(note.substring(0, 6) !== "shaker") {
      setShowContent(false);
      return;
    }
    saveNotes();//Save the note automatically
    try {
      setLoading(true);
      const noteDetails = await getNoteDetails(0, note, shaker, web3, accounts[0]);
      console.log(noteDetails);
      setDepositAmount(noteDetails.amount);
      setBalance(noteDetails.amount - noteDetails.totalWithdraw);
      setDepositTime(noteDetails.time);
      setCurrency(noteDetails.currency.toUpperCase());
      setOrderStatus(noteDetails.orderStatus * 1);
      setEffectiveTime(noteDetails.effectiveTime * 1);
      const dt = new Date(noteDetails.effectiveTime * 1000);
      setEffectiveTimeString(dt.toLocaleDateString() + " " + dt.toLocaleTimeString());
      setRecipient(noteDetails.recipient);
      setLoading(false);
      setShowContent(true);
    } catch (e) {
      toast.success("Note is wrong, can not get data");
      setDepositAmount(0);
      setBalance(0);
      setDepositTime('-');
      setLoading(false);
      setShowContent(false);
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

  const saveNotes = () => {
    saveNoteString(accounts[0], note, 1);
    // toast.success("Your note has been saved, you can find it by pressing Notes button");
  }

  const onEndorseEffectiveTimeChange = (datetime) => {
    console.log(datetime);
    const timeStamp = (new Date(datetime).getTime()) / 1000;
    console.log(timeStamp);
    setEndorseEffectiveTime(timeStamp);
  }
  const openEndorseNote = () => {
    setEndorseUI(!endorseUI);
  }

  //shaker-usdt-800-4-0xe2cdc32eb05c917940ec63042d5da5e6e079be9682e17c4262e9e8771e79f72bf7aefc3d4435027ee24f5b3e96545fb576a361f67bb9d8b4df08ba0fac21
  const endorse = () => {
    // #####
    console.log("背书开始", endorseAddress, endorseAmount, endorseEffectiveTime);

  }

  const changeEndorseEffectiveTimeStatus = () => setEndorseEffectiveTimeStatus(endorseEffectiveTimeStatus === 0 ? 1 : 0);
  const changeEndorseOrderStatus = () => setEndorseOrderStatus(endorseOrderStatus === 0 ? 1 : 0)
  const changeEndorseAmountStatus = () => setEndorseAmountStatus(endorseAmountStatus === 0 ? 1 : 0);
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
          {/* {!showContent ? "":
          <div className="save-note-button" onClick={saveNotes}><FontAwesomeIcon icon={faBookmark}/>  Save Notes</div>
          } */}
          <div className="font1">Paste your cheque note {loading ? <FontAwesomeIcon icon={faSpinner} spin/> : ''}</div>
          <textarea className="recipient-input" onChange={(e) => handleInput(e.target.value)} value={hiddenNote}></textarea>


          {!showContent ? '':
          <div>
            <div className="recipient-line">
              <div className="key">Type</div>
              <div className="value">{orderStatus === 2 ? '-': orderStatus === 1 ? 'Cheque to Order':'Cheque to Bearer'}</div>
            </div>

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

            {effectiveTime * 1000 > (new Date()).getTime() ? 
            <div className="recipient-line">
              <div className="key">Effective Time</div>
              <div className="value"><FontAwesomeIcon icon={faLock} className="orange"/>  {effectiveTimeString}</div>
            </div>
            : ''}

            {effectiveTime * 1000 < (new Date()).getTime() ? 
            <div>
            <div className="font1">Withdraw amount ({currency})</div>
            <input className="withdraw-input" onChange={(e) => setWithdrawAmount(e.target.value)}/>
            </div>
            : ''}

            {effectiveTime * 1000 > (new Date()).getTime() && orderStatus === 0 ? '' :
            <div>
              <div className="font1">Withdraw address</div>
              {orderStatus === 0 ? 
                <input className="withdraw-input withdraw-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}/>
                :
                <input className="withdraw-input withdraw-address" value={recipient} readOnly/>
              }
            </div>
            }

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

            {/* Endorsement Start */}
            {balance <= 0 ? '' :
            <SelectBox 
              status={endorseUI}
              description="Don't withdraw, transfer the note"
              changeSelectStatus={openEndorseNote}
            />
            }

            {!endorseUI || balance <= 0? '' : 
              <div>

              <SelectBox 
                status={endorseAmountStatus}
                description="Set transfer amount"
                changeSelectStatus={changeEndorseAmountStatus}
              />
              {endorseAmountStatus === 1 ?
              <div className="order-to-cheque">
                {/* <div className="font1">Endorsed Amount</div> */}
                <input className="withdraw-input" value={endorseAmount} onChange={(e) => setEndorseAmount(e.target.value)}/>
              </div>
              : ""}


              <SelectBox 
                status={endorseEffectiveTimeStatus}
                description="Set effective date and time"
                changeSelectStatus={changeEndorseEffectiveTimeStatus}
              />

              {endorseEffectiveTimeStatus === 1 ?
              <DateTimePicker 
                onChange={onEndorseEffectiveTimeChange} 
                value={new Date(endorseEffectiveTime * 1000)}
                calendarClassName="calendar"
                className="datetime-picker"
                clearIcon={null}
                disableClock={true}
              />
              : ""}

              <SelectBox 
                status={endorseOrderStatus}
                description="Transfer the cheque to order"
                changeSelectStatus={changeEndorseOrderStatus}
              />
              {endorseOrderStatus === 1 ?
              <div className="order-to-cheque">
                {/* <div className="font1">Withdraw address:</div> */}
                <input className="withdraw-input withdraw-address" value={endorseAddress} onChange={(e) => setEndorseAddress(e.target.value)}/>
              </div>
              : ""}

              <div className="button-deposit" onClick={endorse}>
                Transfer note
              </div>

              </div>
            }
            {/* Endorsement Start */}

            <div className="empty-gap"></div>
            </div>
          }
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


function SelectBox(props) {
  const [status, setStatus] = useState(props.status);

  const onClick = () => {
    const newStatus = status === 1 ? 0 : 1;
    props.changeSelectStatus(newStatus);
    setStatus(newStatus);
  }

  return (
    <div className="select-separate">
      <div className="select-box" onClick={onClick}>
        <div className="selector">
          {status === 1 ? 
          <FontAwesomeIcon icon={faTimes}/>
          : ''}
          </div>
      </div>
      <div className="description" onClick={onClick}>{props.description}</div>
    </div>
  )
}
