import {
  Table, Column, Model, HasMany, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey,
} from 'sequelize-typescript';
import * as Rx from 'rxjs';
import * as uuid from 'uuid';
import { dbConnect, output } from './cli-helper';
import * as slaClock from './sla-clock';
import * as queue from './queue';
import { Target } from './target';

@Table
export class Log extends Model<Log> {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataType.UUID)
  public id: string;
  @PrimaryKey
  @Column(DataType.INTEGER)
  public seq: number;
  @Column(DataType.STRING)
  public state: string;
  @Column(DataType.DATE)
  public startTime: Date;

  @Column(DataType.STRING)
  public method: string;
  @Column(DataType.STRING)
  public url: string;
  @Column(DataType.FLOAT)
  public freq: number;
  @Column(DataType.INTEGER)
  public timeout: number;

  @CreatedAt
  public creationDate: Date;
  @UpdatedAt
  public updatedOn: Date;
  @DeletedAt
  public deletionDate: Date;

  // public compare(oth: Entry): boolean {
  //   return [this.id, this.method, this.url, this.freq,
  //           this.timeout, this.clientkey, this.clientcert].join(':') ==
  //          [oth.id, oth.method, oth.url, oth.freq,
  //           oth.timeout, oth.clientkey, oth.clientcert].join(':');
  // }
}

export interface QEntry {
  state: queue.State;
  startTime: Date;
  entry: Target;
  response?: any;
  error?: any;
}

export class Api {
  public slaClock: slaClock.Api;

  public static qentry(qe: QEntry): Log {
    let log = new Log();
    log.id = uuid.v4();
    log.state = 'UNKLAR';
    log.startTime = qe.startTime;

    log.method = qe.entry.method;
    log.url = qe.entry.url;
    log.freq = qe.entry.freq;
    log.timeout = qe.entry.timeout;
    return log;
  }

  constructor(api: slaClock.Api) {
    this.slaClock = api;
    this.slaClock.sequelize.addModels([Log]);
  }

  public list(): Rx.Observable<Log[]> {
    return Rx.Observable.create((observer: Rx.Observer<Log[]>) => {
      Log.sync().then(() => {
        Log.findAll().then((lst: Log[]) => {
          observer.next(lst);
          observer.complete();
        });
      });
    });
  }

  public add(e: Log): Rx.Observable<Log> {
    e.id = e.id || uuid.v4();
    return Rx.Observable.create((observer: Rx.Observer<Log>) => {
      Log.sync().then(() => {
        e.save().then((value: Log) => {
          observer.next(value);
          observer.complete();
        });
      });
    });
  }

  public delete(id: string): Rx.Observable<Log> {
    return Rx.Observable.create((observer: Rx.Observer<Log>) => {
      Log.sync().then(() => {
        Log.findById(id).then((value: Log) => {
          Log.destroy({
            where: { id: id }
          }).then((count: number) => {
            observer.next(value);
            observer.complete();
          });
        });
      });
    });
  }
}

export class Cli {
  private static options(): any {
    return {
      url: {
        describe: 'url to observe',
        required: true
      },
      method: {
        describe: 'method request',
        default: 'GET'
      },
      freq: {
        describe: 'frequence of the observation',
        default: 1
      },
      timeout: {
        describe: 'timeout in msec',
        default: 1000
      },
      clientkey: {
        describe: 'clientkey file name',
      },
      clientcert: {
        describe: 'clientcert file name',
      }
    };
  }

  private static logFrom(argv: any, ret: Log = new Log()): Log {
    ret.id = argv.id || null;
    ret.url = argv.url;
    ret.method = argv.method;
    ret.freq = argv.freq;
    ret.timeout = argv.timeout;
    return ret;
  }

  private static addCommand(yargs: any, observer: Rx.Observer<string>): any {
    yargs.command('add', 'add log entry', {
    }, (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new slaClock.Api(sql);
        sc.log.add(Cli.logFrom(argv)).subscribe((e: Log) => {
          output(argv, [e]).forEach((a) => observer.next(a));
          sc.close();
          observer.complete();
        });
      });
    });
  }

  private static listCommand(yargs: any, observer: Rx.Observer<string>): any {
    return yargs.command('list', 'list log entry', {
      from: {
        describe: 'list from date',
      },
      to: {
        describe: 'list to date',
      }
    }, (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new slaClock.Api(sql);
        sc.log.list().subscribe((lst: Log[]) => {
          output(argv, lst).forEach((a) => observer.next(a));
          sc.close();
          observer.complete();
        });
      });
    });
  }

  public static command(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('log', 'manipulate with log entries', (__yargs: any) => {
      __yargs = Cli.listCommand(__yargs, observer);
      __yargs = Cli.addCommand(__yargs, observer);
      return __yargs;
    });
  }

}
