import React from 'react';
import './App.css';
import { useWeb3 } from '@openzeppelin/network/react';
import Deposit from './components/Deposit.js';
import Withdraw from './components/Withdraw.js';
import Cheques from './components/Cheques.js';
import Menu from './components/Menu.js';
import {HashRouter, Route, Switch} from 'react-router-dom';

const infuraProjectId = '3446259cb0e74d68b614f9a10328a368';
function App() {
  const web3Context = useWeb3(`wss://mainnet.infura.io/ws/v3/${infuraProjectId}`);
  return (
  <div className="App">
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/" render={(props) => <Deposit web3Context={web3Context} {...props}/>}/>
          <Route exact path="/withdraw" render={(props) => <Withdraw web3Context={web3Context} {...props}/>}/>
          <Route exact path="/cheques" render={(props) => <Cheques web3Context={web3Context} {...props}/>}/>        
        </Switch>
      </HashRouter>
      <Menu />
    </div>
  </div>
  );
}
export default App;