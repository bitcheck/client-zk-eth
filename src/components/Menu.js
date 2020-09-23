import React from 'react';
import "./style.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUniversity, faDownload, faUpload, faBookmark } from '@fortawesome/free-solid-svg-icons';

export default function Menu() {
  const openUrl = (key) => {
    window.location.href = `/#/${key}`;
  }
  return (
    <div className="menu">
      <div className="menu-button-1 menu-button-1of4" onClick={()=>openUrl("")}>
        <div className="menu-icon">
        <FontAwesomeIcon icon={faDownload} />
        </div>
        <div className="menu-text">Deposit</div>
      </div>
      <div className="menu-button-2 menu-button-1of4" onClick={()=>openUrl("withdraw")}>
        <div className="menu-icon">
        <FontAwesomeIcon icon={faUpload} />
        </div>
        <div className="menu-text">Withdraw</div>
      </div>
      <div className="menu-button-3 menu-button-1of4" onClick={()=>openUrl("cheques")}>
        <div className="menu-icon">
        <FontAwesomeIcon icon={faUniversity} />
        </div>
        <div className="menu-text">Cheques</div>
      </div>
      <div className="menu-button-4 menu-button-1of4" onClick={()=>openUrl("notes")}>
        <div className="menu-icon">
        <FontAwesomeIcon icon={faBookmark} />
        </div>
        <div className="menu-text">Wallet</div>
      </div>
    </div>
  )
}