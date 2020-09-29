import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFrown, faLock, faBookmark, faTimes } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {addressConfig, netId, callRelayer, relayerURLs, decimals, simpleVersion, erc20ShakerVersion, logo } from "../config.js";
import {getNoteDetails, toWeiString, formatAmount, getNoteShortString, formatAccount, getGasPrice, validateAddress, fromWeiString} from "../utils/web3.js";
import {parseNote, generateProof} from "../utils/zksnark.js";
import {saveNoteString, eraseNoteString} from "../utils/localstorage.js";
import DateTimePicker from 'react-datetime-picker';
import {createDeposit, toHex, rbigint} from "../utils/zksnark.js";
import {CopyToClipboard} from 'react-copy-to-clipboard';
import { confirmAlert } from 'react-confirm-alert'; // Import
import * as request from 'request';

export default function Withdraw(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const web3 = lib;
  const [withdrawAmount, setWithdrawAmount] = useState(0);
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
  // const [endorseAmountStatus, setEndorseAmountStatus] = useState(0);
  const [endorseAmount, setEndorseAmount] = useState(0);
  // const [endorseAddressStatus, setEndorseAddressStatus] = useState(0);
  const [endorseAddress, setEndorseAddress] = useState('');
  const [endorseUI, setEndorseUI] = useState(false);

  const [gasPrice, setGasPrice] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);

  const erc20ShakerJson = erc20ShakerVersion === 'V1' ? require('../contracts/abi/ERC20Shaker.json') : require('../contracts/abi/ERC20Shaker' + erc20ShakerVersion + '.json');
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
      // console.log(accounts[0]);
      init();
      if(orderStatus === 0) setRecipient(accounts[0]);
      // console.log("Withdraw");
    }
  },[accounts])

  const init = async () => {
    setGasPrice(await getGasPrice());
    setEthBalance(web3.utils.fromWei(await web3.eth.getBalance(accounts[0])));

  }
  const requestAccess = useCallback(() => requestAuth(web3Context), []);

  const getWithdrawProof = async (deposit, recipient, fee, amount) => {
    // fee, amount must be wei or with decimal string
    const url = getUrl();
    const proving_key = await (await fetch(`${url}/circuits/withdraw_proving_key.bin`)).arrayBuffer();

    const { proof, args } = await generateProof({ 
      deposit, 
      recipient, 
      fee,
      refund: amount,
    }, 
      shaker, 
      proving_key,       
      accounts[0]
    );
    if(proof) return { proof, args };
    else {
      toast.error('Device Memory is exhausted, please reload.');
      return;
    }
  }

  const withdraw = async () => {
    if(!inputValidate()) return;
    
    if(!callRelayer) {
      // Operate from local
      setRunning(true);
      const { logo, deposit } = parseNote(note) //从NOTE中解析金额/币种/网络/证明
      const { proof, args } = await getWithdrawProof(deposit, recipient, 0, toWeiString(withdrawAmount, decimals));

      args.push(deposit.commitmentHex);
      const gas = await shaker.methods.withdraw(proof, ...args).estimateGas( { from: accounts[0], gas: 10e6});
      console.log("Estimate GAS", gas);
      try {
        await shaker.methods.withdraw(proof, ...args).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
        await onNoteChange();
        setRunning(false);
      } catch (err) {
        toast.error("#" + err.code + ", " + err.message);
        setRunning(false);
      }  
    } else {
      // Get estimate fee from relayer
      console.log("Call relayer...", relayerURLs[0], currency, withdrawAmount);
      try {
        request({
          url: relayerURLs[0] + "/estimatefee/",
          method: "POST",
          json: true,
          headers: {
              "content-type": "application/json",
          },
          body: {
            currency: currency.toLowerCase(),
            amount: withdrawAmount
          }
        }, function(error, response, body) {
          console.log(error, response, body);
            if (!error && response.statusCode == 200) {
              // console.log(body) // 请求成功的处理逻辑
              confirmAlert({
                customUI: ({ onClose }) => {
                  return (
                    <div className='confirm-box'>
                      <h1>WITHDRAW FEE</h1>
                      <p>Check the current withdraw fee carefully, the relayer will deduce fee from your withdrawal amount</p>
                      <div className='fee-line'>
                        <div className='fee-key'>Estimated Gas</div>
                        <div className='fee-value'>{body.gas}</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>Current Gas Price</div>
                        <div className='fee-value'>{body.gasPrice.fast} GWei</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>ETH Price</div>
                        <div className='fee-value'>{formatAmount(1000000000000000000 / body.ethPrices, 2)} USDT</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>Gas Fee by ETH</div>
                        <div className='fee-value'>{formatAmount(body.gasFeeEth, 6)} ETH</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>Gas Fee by USDT</div>
                        <div className='fee-value'>{formatAmount(body.gasFeeERC20, 6)} {currency.toUpperCase()}</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>Service Fee ({body.feeRate}%)</div>
                        <div className='fee-value'>{formatAmount(body.serviceFee, 2)} {currency.toUpperCase()}</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>Total Fee</div>
                        <div className='fee-value'>{formatAmount(body.totalFee, 2)} {currency.toUpperCase()}</div>
                      </div>
                      <div className='fee-line'>
                        <div className='fee-key'>You get</div>
                        <div className='fee-value'>{formatAmount(withdrawAmount - body.totalFee, 2)} {currency.toUpperCase()}</div>
                      </div>

                      <button className='confirm-button'
                        onClick={async () => {
                          // 判断提现金额是否大于费用
                          if(parseFloat(body.totalFee) > withdrawAmount) {
                            toast.error('Your withdrawal amount is smaller than fee.')
                            return
                          }

                          const { deposit } = parseNote(note)
                          const { proof, args } = await getWithdrawProof(
                            deposit, 
                            recipient, 
                            toWeiString(body.totalFee, decimals), 
                            toWeiString(withdrawAmount, decimals)
                          );
                          const params = {
                            proof, 
                            args,
                            extra: [deposit.commitmentHex],
                            currency: currency.toLowerCase(),
                            amount: withdrawAmount
                          }

                          if(!proof) {
                            toast.error('Device memory is exhausted, please reload.');
                            return;
                          }
                          // console.log(params);
                          console.log(toWeiString(body.totalFee, decimals), toWeiString(withdrawAmount, decimals));
                          try {
                            request({
                              url: relayerURLs[0] + "/withdraw/",
                              method: "POST",
                              json: true,
                              headers: {
                                  "content-type": "application/json",
                              },
                              body: params
                            }, function(error, response, body) {
                              // console.log('=====', error, response, body);
                              if (!error && response.statusCode == 200) {
                                // 处理服务器反馈
                                toast.success(body.msg);
                                // if(orderStatus === 0) setRecipient('');
                                setRunning(false);
                              } else {
                                toast.warning(body.msg);
                                // console.log(body)
                              }
                            })
                          } catch (err) {
                            setRunning(false)
                          }
                          
                          onClose();
                          setRunning(false);
                        }}>Continue</button>
                      <button className="cancel-button"
                        onClick={() => {
                          onClose();
                          setRunning(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }
              });

            } else {
              setRunning(false)
            }
        }); 
      } catch (err) {
        setRunning(false)
      }
    }
  }

  const endorse = async (currentNote) => {
    noteCopied = false;
    // console.log("背书开始", endorseAddress, endorseAmount, endorseEffectiveTime);
    if(!endorseInputValidate()) return;

    const withdrawAddr = endorseOrderStatus === 1 ? endorseAddress : accounts[0];
    setEndorsing(true);
    const { deposit } = parseNote(currentNote) //从NOTE中解析金额/币种/网络/证明
    const { proof, args } = await getWithdrawProof(
      deposit, 
      withdrawAddr, 
      endorseOrderStatus, 
      toWeiString(endorseAmount, decimals)
    );

    if(!proof) {
      toast.error('Device memory is exhausted, please reload.');
      return;
    }
    // Generate new commitment
    const newDeposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
    const note = toHex(newDeposit.preimage, 62) //获取零知识证明
    const noteString = `${logo}-${currency.toLowerCase()}-${endorseAmount}-${netId}-${note}` //零知识证明Note
    const et = endorseEffectiveTimeStatus === 1 ? endorseEffectiveTime : effectiveTime;
    args.push(deposit.commitmentHex, newDeposit.commitmentHex, et);
    // console.log("======", args);
    const gas = await shaker.methods.endorse(proof, ...args).estimateGas({ from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);

    const noteShortString = getNoteShortString(noteString);
    // console.log("note", noteShortString);

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
            {orderStatus === 1 ? <div><p>Recipient: {formatAccount(recipient)}</p></div> : ""}
            <button className='confirm-button'
              onClick={() => {
                if(!noteCopied) {
                  toast.warning('Please copy all the notes before you continue.');
                  return;
                }
                // Check eth for gas is enough?
                if(gas * gasPrice * 1.1 / 1e9 > parseFloat(ethBalance)) {
                  toast.error('Your ETH balance is not enough for the GAS Fee');
                  return;
                }
                doEndorse(proof, args, noteString, gas); 
                onClose();
              }}>Continue</button>
            <button className="cancel-button"
              onClick={() => {
                onClose();
                setLoading(false);
                setEndorsing(false);
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
      // console.log(err);
      toast.error("#" + err.code + ", " + err.message);
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
    if(orderStatus === 1 && accounts[0] !== recipient) {
      toast.warning("You must be the reciever of current cheque");
      return false;
    }

    if(endorseOrderStatus === 1 && endorseAddress === "") {
      toast.warning("Please input the right address of transfer to");
      return false;
    }
    if(endorseOrderStatus === 1 && !validateAddress(endorseAddress, web3)) {
      toast.warning("Address is not ETH address");
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
    if(parseInt(withdrawAmount) === 0 || recipient === "") {
      toast.warning("Please input right data");
      return false;
    }
    if( withdrawAmount > balance ) {
      toast.warning("Please inputWithdraw amount can not be more than current balance: " + balance + " " + currency);
      return false;
    }
    if( !intValidate(withdrawAmount) ) {
      toast.warning("Withdraw amount must be interger.");
      return false;
    }
    if( note.substring(0, note.length) === ".".repeat(note.length)) {
      toast.warning("Recipient is wrong, DON'T input the recipient manully, just paste it.");
      return false;
    }
    if(!validateAddress(recipient, web3)) {
      toast.warning("Address is invalid");
      return false;
    }
    return true;
  }
  useEffect(() => {
    if(note !== undefined && note !== "") onNoteChange();
  }, [note]);

  const onNoteChange = async () => {
    if(note.substring(0, note.indexOf('-')) !== logo) {
      setShowContent(false);
      return;
    }
    saveNotes();//Save the note automatically
    try {
      setLoading(true);
      const noteDetails = await getNoteDetails(0, note, shaker, web3, accounts[0]);
      // console.log(noteDetails);
      setDepositAmount(noteDetails.amount);
      setBalance(noteDetails.amount - noteDetails.totalWithdraw);
      setDepositTime(noteDetails.time);
      setCurrency(noteDetails.currency.toUpperCase());
      setOrderStatus(noteDetails.orderStatus * 1);
      setEffectiveTime(noteDetails.effectiveTime * 1);
      const dt = new Date(noteDetails.effectiveTime * 1000);
      setEffectiveTimeString(dt.toLocaleDateString() + " " + dt.toLocaleTimeString());
      setRecipient(noteDetails.orderStatus * 1 === 0 ? accounts[0] : noteDetails.recipient);
      setEndorseAmount(noteDetails.amount - noteDetails.totalWithdraw);
      setLoading(false);
      setShowContent(true);
    } catch (e) {
      toast.error("Note is wrong, can not get data");
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
  }

  const onEndorseEffectiveTimeChange = (datetime) => {
    const timeStamp = (new Date(datetime).getTime()) / 1000;
    setEndorseEffectiveTime(timeStamp);
  }
  const openEndorseNote = () => {
    setEndorseUI(!endorseUI);
  }

  const changeEndorseEffectiveTimeStatus = () => setEndorseEffectiveTimeStatus(endorseEffectiveTimeStatus === 0 ? 1 : 0);
  const changeEndorseOrderStatus = () => setEndorseOrderStatus(endorseOrderStatus === 0 ? 1 : 0)

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
            {simpleVersion ? '': 
            <div className="recipient-line">
              <div className="key">Type</div>
              <div className="value">{orderStatus === 2 ? '-': orderStatus === 1 ? 'Cheque to Order':'Cheque to Bearer'}</div>
            </div>
            }
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

            {simpleVersion ? '' :
              effectiveTime * 1000 > (new Date()).getTime() && orderStatus === 0 ? '' :
              <div>
                {orderStatus === 0 ? 
                  <div>
                  <div className="font1">Withdraw address</div>
                  <input className="withdraw-input withdraw-address" value={recipient} onChange={(e) => setRecipient(e.target.value)}/>
                  </div>
                  :
                  <div>
                  <div className="font1">Withdraw address (To order)</div>
                  <input className="withdraw-input withdraw-address" value={recipient} readOnly/>
                  </div>
                }
              </div>
            }
            {balance > 0 && withdrawAmount <= balance && !loading && withdrawAmount > 0 && intValidate(withdrawAmount) && recipient !== '' ?
            running ? 
            <div className="button-deposit unavailable">
              <FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Withdraw
              {/* <div className="memo">After submiting transaction, you can check the wallet to see the result.</div> */}
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
            {simpleVersion ? '' :
            balance <= 0 || (orderStatus === 1 && accounts[0] !== recipient) ? '' :
            <SelectBox 
              status={endorseUI}
              description="Open a new cheque without withdrawal"
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
                <div className="font1">Cheque Amount (Can open partially)</div>
                <input className="withdraw-input" value={endorseAmount} onChange={(e) => setEndorseAmount(e.target.value)}/>
              </div>
              {/* : ""} */}

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
                description="Open order cheque to address"
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
