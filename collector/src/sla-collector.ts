import * as Rx from 'rxjs';
import * as slaClock from './sla-clock';
import * as uuid from 'uuid';
import * as winston from 'winston';
import * as requestPromise from 'request-promise';
import * as queue from './queue';

const logger = new winston.Logger({
  level: 'debug',
  transports: [
    new (winston.transports.Console)(),
  ]
});

function dbCollector(argv: any): Rx.Observable<slaClock.Entry[]> {
  // console.log(argv.sequelizeMasterDbname);
  return Rx.Observable.create((observer: Rx.Observer<slaClock.Entry[]>) => {
    logger.info('dbCollector frequence:', argv.updateFreq,
      ' dbCollector dbname:', argv.sequelizeDbname);
    Rx.Observable.create((interval: Rx.Observer<void>) => {
      interval.next(null);
      setInterval(() => {
        interval.next(null);
      }, 1 / argv.updateFreq);
    }).subscribe(() => {
      logger.debug('dbCollector: tick');
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

interface SlaQEntry {
  state: queue.State;
  startTime: Date;
  entry: slaClock.Entry;
  response?: any;
  error?: any;
}

function action(entry: SlaQEntry): Rx.Observable<queue.QEntry<SlaQEntry>> {
  return Rx.Observable.create((observer: Rx.Observer<SlaQEntry>) => {
    return;
  });
}

class Started {
  public entry: slaClock.Entry;
  public running: boolean;
  public transaction: string;
  public collector: Rx.Observable<Date>;
  public queue: queue.Queue<SlaQEntry>;

  public stop(): Rx.Observable<Started> {
    return Rx.Observable.create((observer: Rx.Observer<Started>) => {
      this.collector.subscribe(null, null, () => {
        observer.next(this);
        observer.complete();
      });
      this.running = false;
    });
  }
  public restart(entry: slaClock.Entry): void {
    this.entry = entry;
  }

  private request(): Rx.Observable<any> {
    logger.debug('request:', this.entry.url, this.entry.method, this.entry.timeout, this.entry.id);
    return Rx.Observable.fromPromise(
      requestPromise(this.entry.url, {
        method: this.entry.method,
        timeout: this.entry.timeout,
        resolveWithFullResponse: true,
        time: true
      })
    );
  }

  public start(): void {
    if (this.running) {
      return;
    }
    this.collector = Rx.Observable.create((observer: Rx.Observer<Date>) => {
      this.running = true;
      logger.info('starting clock:', this.entry.id, this.entry.freq);
      const timer = () => {
        if (!this.running) {
          logger.info('clear interval for clock:', this.entry.id);
          observer.complete();
        } else {
          logger.debug('timer tick', this.entry.id, this.entry.freq);
          observer.next(new Date());
          setTimeout(timer, (1 / this.entry.freq) * 1000);
        }
      };
      timer();
    });
    this.collector.subscribe((tickTime: Date) => {
      this.request().subscribe((a) => {
        logger.debug('request:OK:', a.statusCode, a.elapsedTime);
        this.queue.push(action({
          state: queue.State.OK,
          startTime: tickTime,
          entry: this.entry,
          response: a
        }));
      }, (error) => {
        logger.debug('request:ERROR:');
        this.queue.push(action({
          state: queue.State.ERROR,
          startTime: tickTime,
          entry: this.entry,
          error: error
        }));
      });
    });
  }
}

export function starter(argv: any): void {
  logger.info('starting collector: loglevel', argv.logLevel);
  logger.level = argv.logLevel;
  const running = new Map<string, Started>();
  const q = queue.start(logger, argv);
  dbCollector(argv).subscribe((lst: slaClock.Entry[]) => {
    const transaction = uuid.v4();
    lst.forEach((e) => {
      if (running.has(e.id) && running.get(e.id).entry.compare(e)) {
        // nothing changed
      } else if (!running.has(e.id)) {
        // new
        const started = new Started();
        started.queue = q;
        started.entry = e;
        started.start();
        running.set(e.id, started);
      } else {
        // changed
        running.get(e.id).entry = e;
        logger.info('change clock:', e.id);
      }
      running.get(e.id).transaction = transaction;
      logger.info(e.url, running.get(e.id).entry.url, running.get(e.id).entry.compare(e));
    });
    running.forEach((e) => {
      if (e.transaction != transaction && e.running) {
        e.stop().subscribe((s) => {
          logger.info('stop clock:', s.entry.id);
          running.delete(s.entry.id);
        });
      }
    });
  });
}

export default starter;
