import React, { useCallback, useState, useEffect } from 'react';
import {ERC20ShakerAddress, addressConfig, netId} from "../config.js";
import {formatAmount, formatAccount, getNoteDetailsArray} from "../utils/web3.js";
import {batchSaveNotes} from "../utils/localstorage.js";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faSpinner, faTrash, faFrown, faDownload, faUpload, faLock } from '@fortawesome/free-solid-svg-icons';
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
  const type = 0;
  const web3 = lib;

  const erc20ShakerJson = require('../contracts/abi/ERC20Shaker.json')
  const shaker = new web3.eth.Contract(erc20ShakerJson.abi, addressConfig["net_"+netId].ERC20ShakerAddress)

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
      // console.log(accounts[0])
      // console.log("Cheques");
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
    const [noteKeys, noteArray] = getNoteStrings(accounts[0], netId, type);
    // console.log("0000", noteKeys, noteArray);
    if(noteArray.length === 0) {
      setCheques([]);
      setIsEmpty(true);
      return;
    }

    // 改成数组一次性获取
    let depositArray = await getNoteDetailsArray(noteKeys, noteArray, shaker, web3);
 
    // 老方法，需要一个一个从链上读取
    // let depositArray = [];
    // for (let i = 0; i < noteArray.length; i++) {
    //   const noteDetails = await getNoteDetails(noteKeys[i], noteArray[i], shaker, web3);
    //   console.log(noteKeys[i], noteDetails);
    //   if(noteDetails !== null) depositArray.push(noteDetails);
    // }
    if(depositArray.length === 0 || depositArray === null || depositArray === []) {
      setCheques([]);
      setIsEmpty(true);
    } else {
      // 排序
      depositArray = depositArray.sort(compareDescSort('timestamp'));
      setCheques(depositArray);
      getExportCheques();
    }
  }

  // const eraseNoteKeyFromArray = (key) => {
  //   let depositArray = cheques;
  //   const length = depositArray.length;
  //   for(let i = 0; i < depositArray.length; i++) {
  //     if(key === depositArray[i].noteKey) {
  //       if (i === 0) {
  //         depositArray.shift(); //删除并返回数组的第一个元素
  //         break;
  //         // return depositArray;
  //       }
  //       else if (i === length - 1) {
  //         depositArray.pop();  //删除并返回数组的最后一个元素
  //         break;
  //         // return depositArray;
  //       }
  //       else {
  //         depositArray.splice(i, 1); //删除下标为i的元素
  //         break;
  //         // return depositArray;
  //       }
  //     }
  //   }
  //   console.log(depositArray);
  //   setCheques(depositArray);
  //   // return depositArray;
  // }

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
                eraseNoteString(key); //Delete from localStorage
                // eraseNoteKeyFromArray(key);
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
                  toast.warning(`No new notes imported.`);
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
    const [noteKeys, noteArray] = getNoteStrings(accounts[0], netId, type);
    let re = [];
    for(let i = 0; i < noteKeys.length; i++) {
      re.push(noteKeys[i] + ":" + noteArray[i]);
    }
    setChequeNotes(re.join(','));
  }
  
  return(
    <div>
      <ToastContainer autoClose={3000}/>
      <div className="deposit-background">
        {accounts && accounts.length > 0 ? 
        <div>
          {/* 显示证明列表 */}
          <div className="title-bar">
            {type === 0 ? "Opened Cheques" : "My Notes"}
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
                  currency={cheque.currency}
                  orderStatus={cheque.orderStatus}
                  effectiveTime={cheque.effectiveTime}
                  recipient={cheque.recipient}
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
  let dt = new Date(props.effectiveTime * 1000);
  dt = dt.toLocaleDateString() + " " + dt.toLocaleTimeString();
  return(
    <div>
      <div className="cheque-item">
        <div className="content">
          <div className="content-line">Balance <span className="font2">{formatAmount(props.balance, 0)}</span> {props.currency.toUpperCase()}</div>
          <div className="content-line">Deposited {props.depositAmount} {props.currency.toUpperCase()}
          </div>
          <div className="content-line">On {props.time}</div>
          <div className="content-line">{props.orderStatus * 1 === 0 ? "To Bearer" : "To Order of " + formatAccount(props.recipient)}</div>
          <div className="content-line">
            {props.effectiveTime * 1 > (new Date().getTime()) / 1000 ? <div><FontAwesomeIcon icon={faLock}/> Until {dt}</div> : ''}
          </div>
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