import React from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUniversity, faDownload, faUpload } from '@fortawesome/free-solid-svg-icons';

export default function Menu() {
  const openUrl = (key) => {
    window.location.href = `/#/${key}`;
  }
  return (
    <div className="menu">
      <div className="menu-button-left" onClick={()=>openUrl("")}>
        <div className="menu-icon">
        <FontAwesomeIcon icon={faDownload} />
        </div>
        <div className="menu-text">Deposit</div>
      </div>
      <div className="menu-button-middle" onClick={()=>openUrl("withdraw")}>
      <div className="menu-icon">
        <FontAwesomeIcon icon={faUpload} />
        </div>
        <div className="menu-text">Withdraw</div>
      </div>
      <div className="menu-button-right" onClick={()=>openUrl("cheques")}>
      <div className="menu-icon">
        <FontAwesomeIcon icon={faUniversity} />
        </div>
        <div className="menu-text">Cheques</div>
      </div>
    </div>
  )
}