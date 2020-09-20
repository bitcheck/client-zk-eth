import React, { useCallback, useState, useEffect } from 'react';
import {ERC20ShakerAddress} from "../config.js";
import {getNoteDetails} from "../utils/web3.js";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faSpinner, faTrash, faFrown} from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {CopyToClipboard} from 'react-copy-to-clipboard';
import {getNoteStrings, eraseNoteString} from '../utils/localstorage';

import { confirmAlert } from 'react-confirm-alert'; // Import
import './react-confirm-alert.css'; // Import css
import "./style.css";

export default function Vouchers(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const [vouchers, setVouchers] = useState([]);
  const [isEmpty, setIsEmpty] = useState(false);

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new lib.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)

 const requestAccess = useCallback(() => requestAuth(web3Context), []);
  const requestAuth = async web3Context => {
    try {
      await web3Context.requestAuth();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(()=>{
    if(accounts && accounts.length > 0) {
      console.log(accounts[0])
      console.log("Vouchers");
      load();
    }
  }, [accounts])

  /**
   * Loading data from chain
   */
  const load = async()=> {
    setIsEmpty(false);
    setVouchers([]);

    // 调用本地localStorage存储
    const [noteKeys, noteArray] = getNoteStrings(accounts[0]);

    if(noteArray.length === 0) {
      setVouchers([]);
      setIsEmpty(true);
      return;
    }

    let depositArray = [];
    for (let i = 0; i < noteArray.length; i++) {
      const noteDetails = await getNoteDetails(noteKeys[i], noteArray[i], shaker, lib);
      // console.log(noteKeys[i], noteDetails);
      if(noteDetails !== null) depositArray.push(noteDetails);
    }
    if(depositArray.length === 0) {
      setVouchers([]);
      setIsEmpty(true);
    } else {
      setVouchers(depositArray);
    }
  }

  /**
   * Erase the voucher note from the smart contract to keep it secret.
   */
  const eraseVoucher = (key) => {
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>WARNING!!!</h1>
            <p>If you have not saved this voucher in a safe place, after delete, you can not withdraw balance tokens of this voucher. Are you sure you want to erase this voucher?"</p>
            <button className='confirm-button'
              onClick={onClose}>No</button>
            <button className="cancel-button"
              onClick={() => {
                eraseNoteString(key);
                onClose();
                load();
              }}
            >
              Yes, Delete it!
            </button>
          </div>
        );
      }
    });
  }
  
  return(
    <div>
      <ToastContainer autoClose={3000}/>
      <div className="deposit-background">
        {accounts && accounts.length > 0 ? 
        <div>
          {/* <div className="separate-line"></div> */}
          {/* 显示证明列表 */}
          <div className="title-bar">
            My Vouchers
          </div>
          <div className="voucher-container">
          {vouchers.length > 0 ?
          vouchers.map((voucher, index) => 
            <Voucher 
              key={index}
              noteKey={voucher.noteKey}
              balance={voucher.amount - voucher.totalWithdraw}
              depositAmount={voucher.amount}
              totalAmount={voucher.amount}
              time={voucher.time}
              note={voucher.note}
              eraseVoucher={eraseVoucher}
            />
          )
          :
          !isEmpty ? 
          <div className="loading"><FontAwesomeIcon icon={faSpinner} spin/> Loading vouchers...</div>
          : <div className="loading"><FontAwesomeIcon icon={faFrown}/> No deposits and vouchers. Press the left-bottom 'Deposit' button to add your first vouchers.</div>
          }
          <div className="empty-gap"></div>
          </div>
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


function Voucher(props) {

  return(
    <div>
      <div className="voucher-item">
        <div className="content">
        {/* <div className="content-line">Voucher No.#{props.id}</div> */}
        <div className="content-line">Balance <span className="font2">{props.balance}</span> USDT</div>
        <div className="content-line">Deposited {props.depositAmount} USDT</div>
        <div className="content-line">On {props.time}</div>
        </div>
        <div className="buttons">
          <CopyToClipboard text={props.note} onCopy={()=>{toast.success('The voucher note has been copied, you can send to the reciever.')}}>
            <div className="button"><FontAwesomeIcon icon={faCopy}/></div>
          </CopyToClipboard>
          <div className="button orange-background" onClick={() => props.eraseVoucher(props.noteKey)}><FontAwesomeIcon icon={faTrash}/></div>
        </div>
      </div>
    </div>
  )
}