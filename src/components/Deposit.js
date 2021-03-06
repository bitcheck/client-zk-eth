import React, { useCallback, useState, useEffect } from 'react';
import {simpleVersion, notePrefix} from "../config.js";
import {createDeposit, toHex, rbigint} from "../utils/zksnark.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faTimes, faFrown } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {toWeiString, fromWeiString, formatAmount, formatAccount, getGasPrice, getERC20Symbol, getNoteShortStrings, connect} from "../utils/web3";
import {getCombination} from "../utils/devide.js";
import {depositAmounts, decimals} from "../config.js";
import {saveNoteString, eraseNoteString} from "../utils/localstorage";
import {CopyToClipboard} from 'react-copy-to-clipboard';
import { confirmAlert } from 'react-confirm-alert'; // Import
import DateTimePicker from 'react-datetime-picker';

import './react-confirm-alert.css'; // Import css
import "./style.css";

export default function Deposit(props) {
  const {web3Context} = props;
  const {accounts, lib: web3, networkId} = web3Context;
  const [selectedId, setSelectedId] = useState("0");
  const [depositAmount, setDepositAmount] = useState(depositAmounts[0]);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectStatus, setSelectStatus] = useState(0);
  const [orderStatus, setOrderStatus] = useState(0);//0- 无记名支票，1- 定向支票
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [effectiveTime, setEffectiveTime] = useState(parseInt((new Date()).valueOf() / 1000));
  const [effectiveTimeStatus, setEffectiveTimeStatus] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);
  const [symbol, setSymbol] = useState('USDT');
  const [gasPrice, setGasPrice] = useState(0);
  const [outOfGas, setOutOfGas] = useState(false);
  const [netId, setNetId] = useState(1);
  const [shaker, setShaker] = useState();
  const [erc20, setErc20] = useState();
  const [ERC20ShakerAddress, setERC20ShakerAddress] = useState('');
  let noteCopied = false;

  useEffect(() => {
    if(accounts && accounts.length > 0) {
      init();
    }
  },[accounts, networkId])

  const requestAuth = async web3Context => {
    try {
      await web3Context.requestAuth();
    } catch (e) {
      console.error(e);
    }
  };

  const init = async () => {
    setLoading(true);
    const conn = await connect(web3);
    if(!conn) {
      toast.error('Can only use Mainnet or Rinkeby Testnet');
      setOutOfGas(true);
      return;
    }
    const netId = conn.netId;
    setNetId(netId);
    setShaker(conn.shaker);
    const erc20 = conn.erc20;
    setErc20(conn.erc20);
    const ERC20ShakerAddress = conn.ERC20ShakerAddress;
    setERC20ShakerAddress(ERC20ShakerAddress);
  
    const ethBalance = web3.utils.fromWei(await web3.eth.getBalance(accounts[0]));
    if(parseFloat(ethBalance) < 0.1) {
      setOutOfGas(true);
      return;
    } else {
      setOutOfGas(false);
    }
    setIsApproved(await checkAllowance(depositAmount, ERC20ShakerAddress));
    setEthBalance(ethBalance);
    setUsdtBalance(fromWeiString(await erc20.methods.balanceOf(accounts[0]).call(), decimals));
    setGasPrice(await getGasPrice());
    setSymbol(await getERC20Symbol(erc20));
    setLoading(false);
  }
  
  const requestAccess = useCallback(() => requestAuth(web3Context), [web3Context]);

  const buttonSelected = async (e) => {
    setSelectedId(e.id);
    const amount = depositAmounts[parseInt(e.id)];
    setDepositAmount(amount);

    setIsApproved(await checkAllowance(amount, ERC20ShakerAddress));
  }

  const deposit = async () => {
    setLoading(true);
    noteCopied = false;
    // send to smart comtract
    if(usdtBalance < depositAmount) {
      toast.warning(symbol + " Balance is below deposit");
      setLoading(false);
      return;
    }

    if(!isApproved) {
      await setAllowance();
      return;
    }

    if((orderStatus === 0 || withdrawAddress === "") && orderStatus === 1) {
      toast.warning("You have choose to issue cheque for order, but the withdraw address is empty");
      setLoading(false);
      return;
    }

    // const netId = await web3.eth.net.getId();
    let combination;
    if(selectStatus === 1) {
      combination = getCombination(depositAmount);
    } else {
      combination = [depositAmount];
    }

    let noteStrings = [];
    let commitments = [];
    let amounts = [];
    for(let i = 0; i < combination.length; i++) {
      const deposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
      const note = toHex(deposit.preimage, 62) //获取零知识证明
      const noteString = `${notePrefix}-${symbol.toLowerCase()}-${combination[i]}-${netId}-${note}` //零知识证明Note
      // console.log(noteString);
      noteStrings.push(noteString);
      commitments.push(deposit.commitmentHex);
      amounts.push(toWeiString(combination[i], decimals));
    }
    // console.log(amounts, noteStrings, commitments);
    // this accounts[0] means nothing, just to be legal
    const withdrawAddr = orderStatus === 1 ? withdrawAddress : accounts[0];
    // console.log(amounts, commitments, orderStatus, withdrawAddr, effectiveTime);
    const et = effectiveTimeStatus === 1 ? effectiveTime : parseInt((new Date().getTime()) / 1000);
    // console.log(("------>", et));
    const gas = await shaker.methods.depositERC20Batch(amounts, commitments, orderStatus, withdrawAddr, et).estimateGas({ from: accounts[0], gas: 10e6});
    // console.log("Estimate GAS", gas);
    const noteShortStrings = getNoteShortStrings(noteStrings);

    // 弹出对话框，确认GAS费，拆分方案，与noteString，并要求复制后才能进行下一步
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>ATTENSION!!!</h1>
            <p>Here are cheques notes, you can send them to your reciever or keep with you in safe place. Anybody can use these notes to withdraw the deposit. </p>
            <div className='note-display'>{noteShortStrings}</div>
            <CopyToClipboard text={noteStrings} onCopy={()=>onCopyNoteClick()}>
              <div className='copy-notes-button'>Copy all notes and save</div>
            </CopyToClipboard>
            <p>Estimated GAS Fee: {(gas * gasPrice * 1.1 / 1e9).toFixed(6)} ETH</p>
            {orderStatus === 1 ? <div><p>Recipient: {formatAccount(withdrawAddress)}</p></div> : ""}
            <button className='confirm-button'
              onClick={() => {
                if(!noteCopied) {
                  toast.warning('Please copy all the notes before you continue.');
                  return;
                }
                // Check eth for gas is enough?
                if(gas * gasPrice * 1.1 / 1e9 > parseFloat(ethBalance)) {
                  toast.error('Network is not workable or your ETH balance is not enough for the GAS Fee');
                  return;
                }
                doDeposit(amounts, commitments, noteStrings, gas); 
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

  const onCopyNoteClick = () => {
    noteCopied = true;
    toast.success("Notes have been copied, please save it and continue.");
  }

  const doDeposit = async(amounts, commitments, noteStrings, gas) => {
    const withdrawAddr = orderStatus === 1 ? withdrawAddress : accounts[0];
    let keys = [];
    try {
      // Save to localStorage
      console.log('添加localstorage', noteStrings.length);
      for(let i = 0; i < noteStrings.length; i++) keys.push(saveNoteString(accounts[0], noteStrings[i]));
      const et = effectiveTimeStatus === 1 ? effectiveTime : parseInt((new Date().getTime()) / 1000);
      // console.log("=====> ", amounts);
      await shaker.methods.depositERC20Batch(amounts, commitments, orderStatus, withdrawAddr, et).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      setLoading(false);
    } catch (err) {
      // console.log(err);
      toast.error("#" + err.code + ", " + err.message);
      // 如果出错，删除刚刚生成的LocalStorage key
      console.log('删除localstorage');
      for(let i = 0; i < keys.length; i++) eraseNoteString(keys[i]);
      setLoading(false);
    }
  }

  const checkAllowance = async(depositAmount, ERC20ShakerAddress) => {
    try {
      let allowance = await erc20.methods.allowance(accounts[0], ERC20ShakerAddress).call({ from: accounts[0] });
      allowance = fromWeiString(allowance, decimals);
      return allowance >= depositAmount;
    } catch (err) {
      // Out of gas
      return -999;
    }
  }

  const setAllowance = async() => {
    // Approve 200000 once to avoid approve amount everytime.
    setLoading(true);
    console.log('====', ERC20ShakerAddress);
    try {
      await erc20.methods.approve(ERC20ShakerAddress, toWeiString(200000, decimals)).send({ from: accounts[0], gas: 2e6 })
      setIsApproved(true);
      setLoading(false);  
    } catch (err) {
      toast.error("#" + err.code + ", " + err.message);
      setLoading(false);
    }
  }
  const openOrderToCheque = () => {
    // console.log("Open order cheque");
    setOrderStatus(orderStatus === 0 ? 1 : 0);
  }

  const changeSelectStatus = (status) => {
    setSelectStatus(status);
  }
  const changeEffectiveTimeStatus = () => {
    setEffectiveTimeStatus(effectiveTimeStatus === 0 ? 1 : 0);
  }
  const onEffectiveTimeChange = (datetime) => {
    // console.log(datetime);
    const timeStamp = (new Date(datetime).getTime()) / 1000;
    // console.log(timeStamp);
    setEffectiveTime(timeStamp);
  }
  return(
    <div>
      <div className="deposit-background">
        <ToastContainer autoClose={3000}/>
        {accounts && accounts.length > 0 ? 
        <div>
        <div className="title-bar">
          Deposit
        </div>
        <div className="recipient-line">
          <div className="key">Account</div>
          <div className="value">{formatAccount(accounts[0])}</div>
        </div>
        <div className="recipient-line">
          <div className="key">ETH Balance</div>
          <div className="value">{formatAmount(ethBalance, 4)} ETH</div>
        </div>
        <div className="recipient-line">
          <div className="key">{symbol} Balance</div>
          <div className="value">{formatAmount(usdtBalance, 2)} {symbol}</div>
        </div>
        <div className="recipient-line">
          <div className="key">Gas Price</div>
          <div className="value">{formatAmount(gasPrice, 0)} GWei</div>
        </div>

        {outOfGas ? <div className="font1"><FontAwesomeIcon icon={faFrown}/> Network is unavailable or your ETH balance is not enough for Gas fee, suggest to have 0.1ETH at least</div>
: 
        <div>
          <div className="font1">Select deposit amount</div>
          <div className="button-line">
            <SelectButton id="0" symbol={symbol} amount={depositAmounts[0]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
            <SelectButton id="1" symbol={symbol} amount={depositAmounts[1]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
          </div>
          <div className="button-line">
            <SelectButton id="2" symbol={symbol} amount={depositAmounts[2]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
            <SelectButton id="3" symbol={symbol} amount={depositAmounts[3]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
          </div>
          <div className="button-line">
            <SelectButton id="4" symbol={symbol} amount={depositAmounts[4]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
            <SelectButton id="5" symbol={symbol} amount={depositAmounts[5]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
          </div>
          <div className="button-line">
            <SelectButton id="6" symbol={symbol} amount={depositAmounts[6]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
            <SelectButton id="7" symbol={symbol} amount={depositAmounts[7]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
          </div>
          <div className="button-line">
            <SelectButton id="8" symbol={symbol} amount={depositAmounts[8]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
            <SelectButton id="9" symbol={symbol} amount={depositAmounts[9]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
          </div>

          {isApproved ? 
          loading ? 
          <div>
            <div className="button-deposit unavailable"><FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Please wait...
          </div>
            <div className="memo">After submiting transaction, you can check the wallet to see the result.</div>
          </div> 
          :
          <div>
            {simpleVersion ? '' :
            <div>
            <SelectBox 
              status={effectiveTimeStatus}
              description="Set effective date and time"
              changeSelectStatus={changeEffectiveTimeStatus}
            />

            {effectiveTimeStatus === 1 ?
            <DateTimePicker 
              onChange={onEffectiveTimeChange} 
              value={new Date(effectiveTime * 1000)}
              calendarClassName="calendar"
              className="datetime-picker"
              clearIcon={null}
              disableClock={true}
            />
            : ""}

            <SelectBox 
              status={orderStatus}
              description="Open order cheque to address"
              changeSelectStatus={openOrderToCheque}
            />
            {orderStatus === 1 ?
            <div className="order-to-cheque">
              {/* <div className="font1">Withdraw address:</div> */}
              <input className="withdraw-input withdraw-address" value={withdrawAddress} onChange={(e) => setWithdrawAddress(e.target.value)}/>
            </div>
            : ""}
            </div>
            }
            <SelectBox 
              status={selectStatus}
              description="Separated into 3-5 parts to deposit"
              changeSelectStatus={changeSelectStatus}
            />

            <div className="button-deposit" onClick={deposit}>Deposit</div>
          </div>
          :
          loading ? 
          <div>
            <div className="button-approve unavailable"><FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Please wait...
            </div> 
            <div className="memo">After submiting transaction, you can check the wallet to see the result.
            </div>
          </div>
          :
          <div className="button-approve" onClick={setAllowance}>Approve</div>
          }
          <div className="empty-gap"></div>
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

function SelectButton(props) {
  const {amount, side, id, selectedId, symbol} = props;
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if(id === selectedId) setSelected(true);
    else setSelected(false);
  })

  const onClick = (e) => {
    props.onSelected(e.currentTarget);
    setSelected(!selected);
  }
  
  return (
      <div id={id} className={"select-button" + " button-" + side + (selected ? " button-selected" : "")}
        onClick={onClick}>
        <span className="select-amount">{amount}</span>
        <span className="usdt">{symbol}</span>
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
