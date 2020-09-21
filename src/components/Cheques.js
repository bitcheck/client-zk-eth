import React, { useCallback, useState, useEffect } from 'react';
import {ERC20ShakerAddress} from "../config.js";
import {getNoteDetails, formatAmount} from "../utils/web3.js";
import {batchSaveNotes} from "../utils/localstorage.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faSpinner, faTrash, faFrown, faDownload, faUpload} from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {CopyToClipboard} from 'react-copy-to-clipboard';
import {getNoteStrings, eraseNoteString} from '../utils/localstorage';
import {compareDescSort} from '../utils/array.js';
import { confirmAlert } from 'react-confirm-alert'; // Import
import './react-confirm-alert.css'; // Import css
import "./style.css";

export default function Cheques(props) {
  const {web3Context} = props;
  const {accounts, lib} = web3Context;
  const [cheques, setCheques] = useState([]);
  const [chequeNotes, setChequeNotes] = useState('');
  const [isEmpty, setIsEmpty] = useState(false);
  const web3 = lib;

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new web3.eth.Contract(erc20ShakerJson.abi, ERC20ShakerAddress)

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
      console.log("Cheques");
      load();
    }
  }, [accounts])

  /**
   * Loading data from chain
   */
  const load = async()=> {
    setIsEmpty(false);
    setCheques([]);

    // 调用本地localStorage存储
    const [noteKeys, noteArray] = getNoteStrings(accounts[0]);

    if(noteArray.length === 0) {
      setCheques([]);
      setIsEmpty(true);
      return;
    }

    let depositArray = [];
    for (let i = 0; i < noteArray.length; i++) {
      const noteDetails = await getNoteDetails(noteKeys[i], noteArray[i], shaker, web3);
      // console.log(noteKeys[i], noteDetails);
      if(noteDetails !== null) depositArray.push(noteDetails);
    }
    if(depositArray.length === 0) {
      setCheques([]);
      setIsEmpty(true);
    } else {
      // 排序
      depositArray = depositArray.sort(compareDescSort('timestamp'));
      setCheques(depositArray);
      getExportCheques();
    }
  }

  /**
   * Erase the cheque note from the smart contract to keep it secret.
   */
  const eraseCheque = (key) => {
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>WARNING!!!</h1>
            <p>If you have not saved this cheque note in a safe place, after delete, you can not withdraw balance tokens of this cheque. Are you sure you want to erase this cheque?"</p>
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
  let importNotes = "";
  const importCheques = () => {
    confirmAlert({
      customUI: ({ onClose }) => {
        return (
          <div className='confirm-box'>
            <h1>IMPORT NOTES:</h1>
            <p>Input your cheque notes here:</p>
            <textarea className="recipient-input" onChange={(e) => onImportChequesChange(e.target.value)}></textarea>
            <button className='confirm-button'
              onClick={() => {
                if(importNotes === undefined || importNotes === "") return;
                const nums = batchSaveNotes(importNotes, accounts[0]);
                if(nums > 0) {
                  toast.success(`${nums} notes have been imported successfully.`);
                  load();
                } else {
                  toast.success(`No new notes imported.`);
                }
                onClose();
              }}>Import</button>
            <button className="cancel-button"
              onClick={() => {
                onClose();
              }}
            >
              Close
            </button>
          </div>
        );
      }
    });
  }

  const onImportChequesChange = (notes) => {
    if(notes !== "") importNotes = notes;
  }
  const getExportCheques = () => {
    const [noteKeys, noteArray] = getNoteStrings(accounts[0]);
    let re = [];
    for(let i = 0; i < noteKeys.length; i++) {
      re.push(noteKeys[i] + ":" + noteArray[i]);
    }
    setChequeNotes(re.join(','));
    // let arr = []
    // for(let i = 0; i < depositArray.length; i++) {
    //   arr.push(depositArray[i].note);
    // }
    // setChequeNotes(arr.join(','));
  }
  
  return(
    <div>
      <ToastContainer autoClose={3000}/>
      <div className="deposit-background">
        {accounts && accounts.length > 0 ? 
        <div>
          {/* 显示证明列表 */}
          <div className="title-bar">
            My Cheques
          </div>
          <div className="cheque-container">
            {cheques.length > 0 ?
              <div>
              {cheques.map((cheque, index) => 
                <Cheque 
                  key={index}
                  noteKey={cheque.noteKey}
                  balance={cheque.amount - cheque.totalWithdraw}
                  depositAmount={cheque.amount}
                  totalAmount={cheque.amount}
                  time={cheque.time}
                  note={cheque.note}
                  eraseCheque={eraseCheque}
                />
              )}
              <CopyToClipboard text={chequeNotes} onCopy={()=>{toast.success('All cheque notes have been copied.')}}>
              <div className="button-deposit"><FontAwesomeIcon icon={faUpload}/> Export cheques</div>
              </CopyToClipboard>
              <div className="button-deposit" onClick={importCheques}><FontAwesomeIcon icon={faDownload}/> Import cheques</div>
              </div>
              :
              !isEmpty ? 
                <div className="loading"><FontAwesomeIcon icon={faSpinner} spin/> Loading cheques...</div>
                : 
                <div>
                  <div className="loading">
                    <FontAwesomeIcon icon={faFrown}/> No deposits and cheques. Press the left-bottom 'Deposit' button to add your first cheque.
                  </div>
                  <div className="button-deposit" onClick={importCheques}><FontAwesomeIcon icon={faDownload}/> Import cheques</div>
                </div>
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


function Cheque(props) {

  return(
    <div>
      <div className="cheque-item">
        <div className="content">
        <div className="content-line">Balance <span className="font2">{formatAmount(props.balance, 0)}</span> USDT</div>
        <div className="content-line">Deposited {props.depositAmount} USDT</div>
        <div className="content-line">On {props.time}</div>
        </div>
        <div className="buttons">
          <CopyToClipboard text={props.note} onCopy={()=>{toast.success('The cheque note has been copied, you can send to the reciever.')}}>
            <div className="button"><FontAwesomeIcon icon={faCopy}/></div>
          </CopyToClipboard>
          <div className="button orange-background" onClick={() => props.eraseCheque(props.noteKey)}><FontAwesomeIcon icon={faTrash}/></div>
        </div>
      </div>
    </div>
  )
}