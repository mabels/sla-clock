import {
  Table, Column, Model, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey,
} from 'sequelize-typescript';
import * as Rx from 'rxjs';
import * as uuid from 'uuid';
import { dbConnect, output } from './cli-helper';
import * as slaClock from './sla-clock';
import { Target } from './target';

@Table
export class Log extends Model<Log> {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataType.UUID)
  public id: string;
  @Column(DataType.STRING)
  public state: string;
  @Column(DataType.INTEGER)
  public statusCode: number;
  @Column(DataType.DATE)
  public startTime: Date;
  @Column(DataType.INTEGER)
  public elapsedTime: number;

  @Column(DataType.UUID)
  public targetId: string;
  @Column(DataType.INTEGER)
  public targetSeq: number;

  @Column(DataType.FLOAT)
  public timingsWait: number;
  @Column(DataType.FLOAT)
  public timingsDns: number;
  @Column(DataType.FLOAT)
  public timingsTcp: number;
  @Column(DataType.FLOAT)
  public timingsFirstByte: number;
  @Column(DataType.FLOAT)
  public timingsDownload: number;
  @Column(DataType.FLOAT)
  public timingsTotal: number;

  @Column(DataType.INTEGER)
  public bodySize: number;

  @Column(DataType.STRING)
  public errorName: string;
  @Column(DataType.STRING)
  public errorMsg: string;

  @CreatedAt
  public creationDate: Date;
  @UpdatedAt
  public updatedOn: Date;
  @DeletedAt
  public deletionDate: Date;

}

export interface QEntry {
  state: string;
  startTime: Date;
  entry: Target;
  response?: any;
  error?: any;
}

export class Api {
  public slaClock: slaClock.Api;
  public Log: any;

  public static qentry(qe: QEntry): Log {
    let log = new Log();
    log.id = uuid.v4();
    log.state = qe.state;
    log.startTime = qe.startTime;
    if (qe.response) {
      try {
        log.statusCode = qe.response.statusCode;
        log.elapsedTime = qe.response.elapsedTime;

        log.timingsWait = qe.response.timingPhases.wait;
        log.timingsDns = qe.response.timingPhases.dns;
        log.timingsTcp = qe.response.timingPhases.tcp;
        log.timingsFirstByte = qe.response.timingPhases.firstByte;
        log.timingsDownload = qe.response.timingPhases.download;
        log.timingsTotal = qe.response.timingPhases.total;

        log.bodySize = qe.response.body.length;
      } catch (e) {
        // nothing
      }
    }
    if (qe.error) {
      log.errorName = qe.error.name;
      log.errorMsg = qe.error.message;
    }

    log.targetId = qe.entry.id;
    log.targetSeq = qe.entry.seq;
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
        }).catch((err) => {
          observer.error(err);
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
      targetId: {
        describe: 'targetId',
        required: true
      },
      targetSeq: {
        describe: 'targetSeq',
        required: true
      }
    };
  }

  private static logFrom(argv: any, ret: Log = new Log()): Log {
    ret.id = argv.id || null;
    ret.targetId = argv.targetId;
    ret.targetSeq = argv.targetSeq;
    return ret;
  }

  private static addCommand(yargs: any, observer: Rx.Observer<string>): any {
    yargs.command('add', 'add log entry', Cli.options(),
      (argv: any) => {
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
