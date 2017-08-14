import * as React from 'react';
// import './normalize.css';
// import './skeleton.css';
import './app.less';
// import 'font-awesome/less/font-awesome.less';
// const Clavator = require('./clavator.png');

import * as Rx from 'rxjs';

// import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
// import { KeyChainList } from './key-chain-list';
// import { CardStatusList } from './card-status-list';
// // import { CreateKey } from './create-key';
// // import { Progressor } from './progressor';
// import { ChannelStatus } from './channel-status';
// import * as WsChannel from './ws-channel';
// import { CardStatusListState } from './card-status-list-state'
// import { KeyChainListState } from './key-chain-list-state'
// import DialogCreateKey from './dialog-create-key';
// import Assistent from './assistent';

// const channel = WsChannel.Dispatch.create();
// const cardStatusListState = new CardStatusListState(channel);
// const keyChainListState = new KeyChainListState(channel);

import Ticker from '../ticker';
import wsTicker from './ws-ticker';

interface AppState {
  ticker: Ticker;
}

export class App extends React.Component<{}, AppState> {

  constructor() {
    super();
    this.state = {
      ticker: { cnt: null, now: null, value: null }
    };
    wsTicker().subscribe((t: Ticker) => {
      this.setState({ ticker: t });
    });
  }

  public render(): JSX.Element {
    return (
      <div>Hello World {`${this.state.ticker.cnt} ${this.state.ticker.now}
        ${JSON.stringify(this.state.ticker.value)}`}</div>
    );
  }
}
