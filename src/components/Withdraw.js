import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFrown, faLock, faBookmark, faTimes } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {addressConfig, netId} from "../config.js";
import {getNoteDetails, toWeiString, formatAmount, getNoteShortString, formatAccount, getGasPrice} from "../utils/web3.js";
import {parseNote, generateProof} from "../utils/zksnark.js";
import {saveNoteString, eraseNoteString} from "../utils/localstorage.js";
import DateTimePicker from 'react-datetime-picker';
import {createDeposit, toHex, rbigint} from "../utils/zksnark.js";
import {CopyToClipboard} from 'react-copy-to-clipboard';
import { confirmAlert } from 'react-confirm-alert'; // Import

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
  const [endorsing, setEndorsing] = useState(false);
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
  const [endorseAddressStatus, setEndorseAddressStatus] = useState(0);
  const [endorseAddress, setEndorseAddress] = useState('');
  const [endorseUI, setEndorseUI] = useState(false);

  const [gasPrice, setGasPrice] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new web3.eth.Contract(erc20ShakerJson.abi, addressConfig["net_"+netId].ERC20ShakerAddress)
  let suportWebAssembly = false;
  let noteCopied = false;

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
      init();
      console.log("Withdraw");
    }
  },[accounts])

  const init = async () => {
    setGasPrice(await getGasPrice());
    setEthBalance(web3.utils.fromWei(await web3.eth.getBalance(accounts[0])));

  }
  const requestAccess = useCallback(() => requestAuth(web3Context), []);

  const getWithdrawProof = async (deposit, recipient, fee, amount) => {
    const url = getUrl();
    const proving_key = await (await fetch(`${url}/circuits/withdraw_proving_key.bin`)).arrayBuffer();
    // console.log("proving_key", proving_key);

    const { proof, args } = await generateProof({ 
      deposit, 
      recipient, 
      fee,
      refund: toWeiString(parseInt(amount)),
    }, 
      shaker, 
      proving_key,       
      accounts[0]
    );
    return { proof, args };
  }
  const withdraw = async () => {
    // console.log(withdrawAmount, withdrawAddress, currency);
    if(!inputValidate()) return;
    setRunning(true);
    const { deposit } = parseNote(note) //从NOTE中解析金额/币种/网络/证明
    const { proof, args } = await getWithdrawProof(deposit, withdrawAddress, 0, withdrawAmount);
    args.push(deposit.commitmentHex);
    const gas = await shaker.methods.withdraw(proof, ...args).estimateGas( { from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);
    try {
      await shaker.methods.withdraw(proof, ...args).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      await onNoteChange();
      setRunning(false);
    } catch (err) {
      toast.success("#" + err.code + ", " + err.message);
      setRunning(false);
    }
  }
// 0x6ebbc3d0Ac2553Cbe610359f4ffbBdddB8Cbeaed
  const endorse = async (currentNote) => {
    noteCopied = false;
    console.log("背书开始", endorseAddress, endorseAmount, endorseEffectiveTime);
    if(!endorseInputValidate()) return;

    const withdrawAddr = endorseOrderStatus === 1 ? endorseAddress : accounts[0];
    setEndorsing(true);
    const { deposit } = parseNote(currentNote) //从NOTE中解析金额/币种/网络/证明
    const { proof, args } = await getWithdrawProof(deposit, withdrawAddr, endorseOrderStatus, endorseAmount);

    // Generate new commitment
    const newDeposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
    const note = toHex(newDeposit.preimage, 62) //获取零知识证明
    const noteString = `shaker-${currency.toLowerCase()}-${endorseAmount}-${netId}-${note}` //零知识证明Note
    const et = endorseEffectiveTimeStatus === 1 ? endorseEffectiveTime : effectiveTime;
    args.push(deposit.commitmentHex, newDeposit.commitmentHex, et);
    console.log("======", args);
    const gas = await shaker.methods.endorse(proof, ...args).estimateGas({ from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);

    const noteShortString = getNoteShortString(noteString);
    console.log("note", noteShortString);

    // Open dialog confirm
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>ATTENSION!!!</h1>
            <p>Here are new cheques notes, you can send them to your reciever or keep with you in safe place. Anybody can use these notes to withdraw the deposit. </p>
            <div className='note-display'>{noteShortString}</div>
            <CopyToClipboard text={noteString} onCopy={()=>onCopyNoteClick()}>
              <div className='copy-notes-button'>Copy all notes and save</div>
            </CopyToClipboard>
            <p>Estimated GAS Fee: {(gas * gasPrice * 1.1 / 1e9).toFixed(6)} ETH</p>
            {orderStatus === 1 ? <div><p>Recipient: {formatAccount(withdrawAddress)}</p></div> : ""}
            <button className='confirm-button'
              onClick={() => {
                if(!noteCopied) {
                  toast.success('Please copy all the notes before you continue.');
                  return;
                }
                // Check eth for gas is enough?
                if(gas * gasPrice * 1.1 / 1e9 > parseFloat(ethBalance)) {
                  toast.success('Your ETH balance is not enough for the GAS Fee');
                  return;
                }
                doEndorse(proof, args, noteString, gas); 
                onClose();
              }}>Continue</button>
            <button className="cancel-button"
              onClick={() => {
                onClose();
                setLoading(false);
              }}
            >
              Cancel
            </button>
          </div>
        );
      }
    });
  }
  
  const doEndorse = async (proof, args, noteString, gas) => {
    let key;
    try {
      key = saveNoteString(accounts[0], noteString);
      await shaker.methods.endorse(proof, ...args).send({ from: accounts[0], gas: parseInt(gas * 1.1)});
      // setLoading(false);
      await onNoteChange();
      setEndorsing(false);
    } catch (err) {
      console.log(err);
      toast.success("#" + err.code + ", " + err.message);
      // 如果出错，删除刚刚生成的LocalStorage key
      eraseNoteString(key);
      setEndorsing(false);
      // setLoading(false);
    }

  }

  const onCopyNoteClick = () => {
    noteCopied = true;
    toast.success("Notes have been copied, please save it and continue.");
  }

  const endorseInputValidate = () => {
    // ######
    console.log("&&&&&", orderStatus, accounts[0], recipient);
    if(orderStatus === 1 && accounts[0] !== recipient) {
      toast.success("You must be the reciever of current cheque");
      return false;
    }

    if(endorseOrderStatus === 1 && endorseAddress === "") {
      toast.success("Please input the right address of transfer to");
      return false;
    }
    return true;
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
      setEndorseAmount(noteDetails.amount - noteDetails.totalWithdraw);
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

  const changeEndorseEffectiveTimeStatus = () => setEndorseEffectiveTimeStatus(endorseEffectiveTimeStatus === 0 ? 1 : 0);
  const changeEndorseOrderStatus = () => setEndorseOrderStatus(endorseOrderStatus === 0 ? 1 : 0)
  // const changeEndorseAddressStatus = () => setEndorseAddressStatus(endorseAddressStatus === 0 ? 1 : 0);
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

            {!endorseUI || balance <= 0 ? '' : 
              <div>

              {/* <SelectBox 
                status={endorseAmountStatus}
                description="Set transfer amount"
                changeSelectStatus={changeEndorseAmountStatus}
              />
              {endorseAmountStatus === 1 ? */}
              <div className="order-to-cheque">
                <div className="font1">Endorsed Amount</div>
                <input className="withdraw-input" value={endorseAmount} onChange={(e) => setEndorseAmount(e.target.value)}/>
              </div>
              {/* : ""} */}

              {/* ###### */}
              {effectiveTime * 1000 > (new Date()).getTime() ? "" :
              <SelectBox 
                status={endorseEffectiveTimeStatus}
                description="Set effective date and time"
                changeSelectStatus={changeEndorseEffectiveTimeStatus}
              />
              }
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


              {balance > 0 && endorseAmount <= balance && !loading && endorseAmount > 0 && intValidate(endorseAmount) ?
              endorsing ? 
              <div className="button-deposit unavailable">
                <FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Transferring
                <div className="memo">After submiting transaction, you can check the wallet to see the result.</div>
              </div> :
              <div className="button-deposit" onClick={() => endorse(note)}>
                  Transfer note
              </div>
              :
              <div className="button-deposit unavailable">Transfer</div>
              }
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
