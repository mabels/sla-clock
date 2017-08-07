import * as Rx from 'rxjs';
import * as slaClock from './sla-clock';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as requestPromise from 'request-promise';

function dbCollector(argv: any): Rx.Observable<slaClock.Entry[]> {
  // console.log(argv.sequelizeMasterDbname);
  return Rx.Observable.create((observer: Rx.Observer<slaClock.Entry[]>) => {
    winston.info('dbCollector frequence:', argv.updateFreq,
                 ' dbCollector dbname:', argv.sequelizeDbname);
    Rx.Observable.interval(1 / argv.updateFreq).subscribe(() => {
      winston.debug('dbCollector: tick');
      slaClock.dbConnect(argv).subscribe((sql) => {
          const sc = new slaClock.SlaClock(sql);
          sc.list().subscribe((lst) => {
            observer.next(lst);
            sc.close();
          });
        }, observer.error);
    });
  });
}

class Started {
  public entry: slaClock.Entry;
  public running: boolean;
  public transaction: string;
  public collector: Rx.Observable<number>;

  public stop(): Rx.Observable<Started> {
    return Rx.Observable.create((observer: Rx.Observer<Started>) => {
      this.collector.subscribe(null, null, () => {
        observer.next(this);
        observer.complete();
      });
      this.running = false;
    });
  }

  private request(): Rx.Observable<any> {
    winston.info('request:', this.entry.url, this.entry.method, this.entry.timeout, this.entry.id);
    return Rx.Observable.fromPromise(
      requestPromise(this.entry.url, {
        method: this.entry.method,
        timeout: this.entry.timeout,
        resolveWithFullResponse: true,
        time : true
      })
    );
  }

  public start(): void {
    if (this.running) {
      return;
    }
    this.collector = Rx.Observable.create((observer: Rx.Observer<number>) => {
      this.running = true;
      let cnt = 0;
      observer.next(++cnt);
      winston.info('starting clock:', this.entry.id, this.entry.freq);
      const interval = setInterval(() => {
        if (!this.running) {
          clearInterval(interval);
          winston.info('clear interval for clock:', this.entry.id);
          observer.complete();
        } else {
          observer.next(++cnt);
        }
      }, (1 / this.entry.freq) * 1000);
    });
    this.collector.subscribe((cnt: number) => {
      this.request().subscribe((a) => {
        console.log('OK', a.statusCode, a.elapsedTime);
      }, (error) => {
        console.log('ERROR');
      });
    });
  }
}

export function starter(argv: any): void {
  winston.info('starting collector');
  const running = new Map<string, Started>();
  dbCollector(argv).subscribe((lst: slaClock.Entry[]) => {
    const transaction = uuid.v4();
    lst.forEach((e) => {
      if (running.has(e.id) && running.get(e.id).entry.equals(e)) {
        // nothing changed
        running.get(e.id).transaction = transaction;
      } else if (!running.has(e.id)) {
        // new
        const started = new Started();
        started.entry = e;
        started.transaction = transaction;
        started.start();
        running.set(e.id, started);
      } else {
        // changed
        running.get(e.id).transaction = transaction;
        winston.info('change clock:', e.id);
      }
    });
    running.forEach((e) => {
      if (e.transaction != transaction && e.running) {
        e.stop().subscribe((s) => {
          winston.info('stop clock:', s.entry.id);
          running.delete(s.entry.id);
        });
      }
    });
  });
}

export default starter;
