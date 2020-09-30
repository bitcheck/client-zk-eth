import React, {useEffect} from 'react';
import './App.css';
import { useWeb3 } from '@openzeppelin/network/react';
import Deposit from './components/Deposit.js';
import Withdraw from './components/Withdraw.js';
import Cheques from './components/Cheques.js';
import Notes from './components/Notes.js';
import Menu from './components/Menu.js';
import {HashRouter, Route, Switch} from 'react-router-dom';
import {defaultRPC, infuraId, appName, erc20ShakerVersion, simpleVersion} from './config.js';

function App() {
  const web3Context = useWeb3(`wss://${defaultRPC}${infuraId}`);

  useEffect(() => {
    document.title = appName + " " + (simpleVersion ? "": "Pro ") + erc20ShakerVersion
    let loading = document.getElementById('i-loading')
    if (loading) {
      loading.setAttribute('class', 'i-loading-out')
      setTimeout(() => {
        loading.style.display = 'none'
      }, 1000)
    }
  }, [])

  return (
  <div className="App">
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/" render={(props) => <Deposit web3Context={web3Context} {...props}/>}/>
          <Route exact path="/withdraw" render={(props) => <Withdraw web3Context={web3Context} {...props}/>}/>
          <Route exact path="/cheques" render={(props) => <Cheques web3Context={web3Context} {...props}/>}/>
          <Route exact path="/notes" render={(props) => <Notes web3Context={web3Context} {...props}/>}/>
        </Switch>
      </HashRouter>
      <Menu />
    </div>
  </div>
  );
}
export default App;