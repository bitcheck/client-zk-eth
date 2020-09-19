import React, { useCallback, useState, useEffect } from 'react';
import "./style.css";
import {ERC20ShakerAddress, USDTAddress} from "../config.js";
import {createDeposit, toHex, rbigint} from "../utils/zksnark.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCheck } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {toWeiString, long2Short} from "../utils/web3";
import {getCombination} from "../utils/devide.js";
import {depositAmounts, decimals} from "../config.js";
import {saveNoteString} from "../utils/localstorage";

export default function Deposit(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const [selectedId, setSelectedId] = useState("0");
  const [depositAmount, setDepositAmount] = useState(depositAmounts[0]);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectStatus, setSelectStatus] = useState(0);
  

  const erc20Json = require('../contracts/abi/ERC20.json')
  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new lib.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)
  const erc20 = new lib.eth.Contract(erc20Json, USDTAddress);

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
    console.log("divided", selectStatus);
    // send to smart comtract
    let usdtBalance = await getERC20Balance(accounts[0]);
    usdtBalance = long2Short(usdtBalance, decimals);
    console.log("USDT Balance", usdtBalance);
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
    console.log("=======>", combination);
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

    console.log(amounts, noteStrings, commitments);
    const gas = await shaker.methods.depositERC20Batch(amounts, commitments).estimateGas({ from: accounts[0], gas: 10e6});
    console.log("Estimate GAS", gas);

    try {
      await shaker.methods.depositERC20Batch(amounts, commitments).send({ from: accounts[0], gas: parseInt(gas * 1.1) });
      // Save to localStorage
      for(let i = 0; i < noteStrings.length; i++) saveNoteString(accounts[0], noteStrings[i]);
      setLoading(false);
    } catch (err) {
      console.log(err);
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
        loading ? <div className="button-deposit unavailable"><FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Please wait...</div> :
        <div className="button-deposit" onClick={deposit}>Deposit</div>
        :
        loading ? <div className="button-approve unavailable"><FontAwesomeIcon icon={faSpinner} spin/>&nbsp;Please wait...</div> :
        <div className="button-approve" onClick={setAllowance}>Approve</div>
        }
        <SelectSeparate 
          status={selectStatus}
          description="If divided into 3-5 parts to deposit."
          changeSelectStatus={changeSelectStatus}
        />
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

export function SelectButton(props) {
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

export function SelectSeparate(props) {
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