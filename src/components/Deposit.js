import React, { useCallback, useState, useEffect } from 'react';
import {ERC20ShakerAddress, USDTAddress} from "../config.js";
import {createDeposit, toHex, rbigint} from "../utils/zksnark.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCheck } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {toWeiString, long2Short, comdify, formatAccount, getGasPrice} from "../utils/web3";
import {getCombination} from "../utils/devide.js";
import {depositAmounts, decimals} from "../config.js";
import {saveNoteString, eraseNoteString} from "../utils/localstorage";
import {CopyToClipboard} from 'react-copy-to-clipboard';
import { confirmAlert } from 'react-confirm-alert'; // Import
import './react-confirm-alert.css'; // Import css
import "./style.css";

export default function Deposit(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const [selectedId, setSelectedId] = useState("0");
  const [depositAmount, setDepositAmount] = useState(depositAmounts[0]);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectStatus, setSelectStatus] = useState(0);
  const [usdtBalance, setUsdtBalance] = useState(0);
  const [gasPrice, setGasPrice] = useState(0);

  const erc20Json = require('../contracts/abi/ERC20.json')
  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new lib.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)
  const erc20 = new lib.eth.Contract(erc20Json, USDTAddress);

  let noteCopied = false;

  useEffect(() => {
    if(accounts && accounts.length > 0) {
      console.log(accounts[0]);
      console.log("Deposit");
      init();
    }
  },[accounts])

  const requestAuth = async web3Context => {
    try {
      await web3Context.requestAuth();
    } catch (e) {
      console.error(e);
    }
  };

  const init = async () => {
    setLoading(true);
    setIsApproved(await checkAllowance(depositAmount));
    let usdtBalance = await getERC20Balance(accounts[0]);
    usdtBalance = long2Short(usdtBalance, decimals);
    setUsdtBalance(usdtBalance);
    setGasPrice(await getGasPrice());
    setLoading(false);
}
  const getERC20Balance = async(account) => {
    return await erc20.methods.balanceOf(account).call();
  }
  const requestAccess = useCallback(() => requestAuth(web3Context), []);

  const buttonSelected = async (e) => {
    setSelectedId(e.id);
    const amount = depositAmounts[parseInt(e.id)];
    setDepositAmount(amount);

    setIsApproved(await checkAllowance(amount));
  }

  const deposit = async () => {
    setLoading(true);
    noteCopied = false;
    // send to smart comtract
    // console.log("USDT Balance", usdtBalance);
    if(usdtBalance < depositAmount) {
      toast.success("USDT Balance is below deposit");
      setLoading(false);
      return;
    }

    if(!isApproved) {
      await setAllowance();
      return;
    }

    const netId = await lib.eth.net.getId();
    let combination;
    if(selectStatus === 1) {
      combination = getCombination(depositAmount);
    } else {
      combination = [depositAmount];
    }
    // console.log("=======>", combination);
    let noteStrings = [];
    let commitments = [];
    let amounts = [];
    for(let i = 0; i < combination.length; i++) {
      const deposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
      const note = toHex(deposit.preimage, 62) //获取零知识证明
      const noteString = `shaker-usdt-${combination[i]}-${netId}-${note}` //零知识证明Note
      noteStrings.push(noteString);
      commitments.push(deposit.commitmentHex);
      amounts.push(toWeiString(combination[i]));
    }
    // console.log(amounts, noteStrings, commitments);
    const gas = await shaker.methods.depositERC20Batch(amounts, commitments).estimateGas({ from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);
    const noteShortStrings = getNoteShortStrings(noteStrings);

    // 弹出对话框，确认GAS费，拆分方案，与noteString，并要求复制后才能进行下一步
    // ######
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>ATTENSION!!!</h1>
            <p>Here are voucher notes, you can send them to your reciever or keep with you in safe place. Anybody can use these notes to withdraw the deposit. </p>
            <div className='note-display'>{noteShortStrings}</div>
            <CopyToClipboard text={noteStrings} onCopy={()=>onCopyNoteClick()}>
              <div className='copy-notes-button'>Copy all notes and save</div>
            </CopyToClipboard>
            <p>Estimated GAS Fee: {(gas * gasPrice * 1.1 / 1e9).toFixed(6)} ETH</p>
            <button className='confirm-button'
              onClick={() => {
                if(!noteCopied) {
                  toast.success('Please copy all the notes before you continue.');
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
  const getNoteShortStrings = (noteStrings) => {
    let re = [];
    for(let i = 0; i < noteStrings.length; i++) {
      re.push(noteStrings[i].substring(0, 40) + '...');
    }
    return re;
  }

  const doDeposit = async(amounts, commitments, noteStrings, gas) => {
    let keys = [];
    try {
      // Save to localStorage
      for(let i = 0; i < noteStrings.length; i++) keys.push(saveNoteString(accounts[0], noteStrings[i]));
      await shaker.methods.depositERC20Batch(amounts, commitments).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      setLoading(false);
    } catch (err) {
      console.log(err);
      // 如果出错，删除刚刚生成的LocalStorage key
      for(let i = 0; i < keys.length; i++) eraseNoteString(keys[i]);
      setLoading(false);
    }
  }

  const checkAllowance = async(depositAmount) => {
    let allowance = await erc20.methods.allowance(accounts[0], ERC20ShakerAddress).call({ from: accounts[0] });
    allowance = long2Short(allowance, decimals);
    return allowance >= depositAmount;
  }

  const setAllowance = async() => {
    // Approve 200000 once to avoid approve amount everytime.
    setLoading(true);
    try {
      await erc20.methods.approve(ERC20ShakerAddress, lib.utils.toBN(toWeiString(200000))).send({ from: accounts[0], gas: 2e6 })
      setIsApproved(true);
      setLoading(false);  
    } catch (e) {
      setLoading(false);
    }
  }

  const changeSelectStatus = (status) => {
    setSelectStatus(status);
  }
  return(
    <div>
      <div className="deposit-background">
        <ToastContainer autoClose={3000}/>
        {accounts && accounts.length> 0 ? 
        <div>
        <div className="title-bar">
          Deposit
        </div>
        <div className="recipient-line">
          <div className="key">Account</div>
          <div className="value">{formatAccount(accounts[0])}</div>
        </div>
        <div className="recipient-line">
          <div className="key">Balance</div>
          <div className="value">{comdify(usdtBalance)} USDT</div>
        </div>
        <div className="recipient-line">
          <div className="key">Gas Price</div>
          <div className="value">{gasPrice} GWei</div>
        </div>
        <div className="font1">Select deposit amount:</div>
        <div className="button-line">
          <SelectButton id="0" amount={depositAmounts[0]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
          <SelectButton id="1" amount={depositAmounts[1]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
        </div>
        <div className="button-line">
          <SelectButton id="2" amount={depositAmounts[2]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
          <SelectButton id="3" amount={depositAmounts[3]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
        </div>
        <div className="button-line">
          <SelectButton id="4" amount={depositAmounts[4]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
          <SelectButton id="5" amount={depositAmounts[5]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
        </div>
        <div className="button-line">
          <SelectButton id="6" amount={depositAmounts[6]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
          <SelectButton id="7" amount={depositAmounts[7]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
        </div>
        <div className="button-line">
          <SelectButton id="8" amount={depositAmounts[8]} side="left" selectedId={selectedId} onSelected={buttonSelected}/>
          <SelectButton id="9" amount={depositAmounts[9]} side="right" selectedId={selectedId} onSelected={buttonSelected}/>
        </div>

        {isApproved ? 
        loading ? 
        <div>
          <div className="button-deposit unavailable"><FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Please wait...
        </div>
          <div className="memo">After submiting transaction, you can check the wallet to see the result.</div>
        </div> 
        :
        <div className="button-deposit" onClick={deposit}>Deposit</div>
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
        <SelectBox 
          status={selectStatus}
          description="If divided into 3-5 parts to deposit."
          changeSelectStatus={changeSelectStatus}
        />
        <div className="empty-gap"></div>
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
  const {amount, side, id, selectedId} = props;
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
        <span className="usdt">USDT</span>
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
          <FontAwesomeIcon icon={faCheck}/>
          : ''}
          </div>
      </div>
      <div className="description">{props.description}</div>
    </div>
  )
}

