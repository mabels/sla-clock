import * as Rx from 'rxjs';
import Ticker from '../ticker';

interface Ticking {
  (t: Ticker): void;
}

function connector(msg: Ticking[]): void {
  let wsproto = 'ws';
  if (window.location.protocol == 'https:') {
    wsproto = 'wss';
  }
  console.log('connector', `${wsproto}://${window.location.host}/`);
  const ws = new WebSocket(`${wsproto}://${window.location.host}/`);
  ws.onopen = (e: Event) => {
    // debugger
  };
  ws.onclose = (e: CloseEvent) => {
    // debugger
    setTimeout(() => connector(msg), 1000);
  };
  ws.onmessage = (e: MessageEvent) => {
    if (msg[0]) {
      msg[0](JSON.parse(e.data));
    }
  };
}

export function wsTicker(): Rx.Observable<Ticker> {
  const msgFuncs: Ticking[] = [];
  connector(msgFuncs);
  return Rx.Observable.create((observer: Rx.Observer<Ticker>) => {
    // this is hard
    if (msgFuncs.length == 0) {
      msgFuncs.push((t: Ticker) => {
        observer.next(t);
      });
    }
  });
}

export default wsTicker;
