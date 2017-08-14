import {
  Table, Column, Model, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey,
} from 'sequelize-typescript';
import * as uuid from 'uuid';
import * as Rx from 'rxjs';
import * as slaClock from './sla-clock';
import { dbConnect, output } from './cli-helper';
import * as fs from 'fs';

@Table
export class Target extends Model<Target> {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataType.UUID)
  public id: string;
  @PrimaryKey
  @Column(DataType.INTEGER)
  public seq: number;
  @Column(DataType.STRING)
  public method: string;
  @Column(DataType.STRING)
  public url: string;
  @Column(DataType.FLOAT)
  public freq: number; // 0.1hz = 10sec
  @Column(DataType.INTEGER)
  public timeout: number;
  @Column(DataType.STRING)
  public clientkey: string;
  @Column(DataType.STRING)
  public clientcert: string;
  @CreatedAt
  public creationDate: Date;
  @UpdatedAt
  public updatedOn: Date;
  @DeletedAt
  public deletionDate: Date;

  public compare(oth: Target): boolean {
    return [this.id, this.method, this.url, this.freq,
    this.timeout, this.clientkey, this.clientcert].join(':') ==
      [oth.id, oth.method, oth.url, oth.freq,
      oth.timeout, oth.clientkey, oth.clientcert].join(':');
  }
}

export class Api {
  public slaClock: slaClock.Api;

  constructor(api: slaClock.Api) {
    this.slaClock = api;
    this.slaClock.sequelize.addModels([Target]);
  }

  public list(all = false): Rx.Observable<Target[]> {
    // console.log('XXXX', Target.name);
    return Rx.Observable.create((observer: Rx.Observer<Target[]>) => {
      Target.sync().then(() => {
        Target.findAll({
          order: ['id', ['seq', 'DESC']]
        }).then((lst: Target[]) => {
          if (!all) {
            lst = lst.filter((v: Target, idx: number) => {
              return !(idx > 0 && v.id == lst[idx - 1].id);
            });
          }
          observer.next(lst);
          observer.complete();
        }).catch((e) => {
          observer.error(e);
          observer.complete();
        });
      });
    });
  }

  public get(id: string, options: any = {}): Rx.Observable<Target> {
    return Rx.Observable.create((observer: Rx.Observer<Target>) => {
      Target.sync().then(() => {
        Target.findAll(Object.assign({
          where: {
            id: id
          },
          order: [
            ['seq', 'DESC']
          ],
          limit: 1
        }, options)).then((value: Target[]) => {
          observer.next(value[0]);
          observer.complete();
        }).catch((e) => {
          observer.error(e);
          observer.complete();
        });
      });
    });
  }

  public add(e: Target): Rx.Observable<Target> {
    e.id = e.id || uuid.v4();
    return this.update(e);
  }

  public update(e: Target): Rx.Observable<Target> {
    return Rx.Observable.create((observer: Rx.Observer<Target>) => {
      Target.sync().then(() => {
        // looks not so nice
        this.slaClock.sequelize.transaction((t) => {
          return new Promise((resolve, reject) => {
            this.get(e.id, {
              transaction: t,
              lock: t.LOCK.UPDATE
            }).subscribe((val: Target) => {
              let newTarget: any = null;
              if (val) {
                newTarget = (Object.assign(val.toJSON(),
                  Object.assign(e.toJSON(), {
                  seq: val.seq + 1
                })));
                // console.log('val.length:', newTarget);
              } else {
                newTarget = (Object.assign(e.toJSON(), {
                  seq: 0
                }));
                // console.log('init:', newTarget);
              }
              Target.create(newTarget, { transaction: t }).then((value: Target) => {
                // t.commit();
                observer.next(value);
                observer.complete();
                resolve();
              }).catch((err: any) => {
                // t.rollback();
                observer.error(err);
                observer.complete();
                reject();
              });
            }, (err: any) => {
              // t.rollback();
              observer.error(err);
              observer.complete();
              reject();
            });
          });
        });
      });
    });
  }

  public delete(id: string): Rx.Observable<Target> {
    return Rx.Observable.create((observer: Rx.Observer<Target>) => {
      Target.sync().then(() => {
        this.get(id).subscribe((value: Target) => {
          Target.destroy({
            where: { id: id }
          }).then((count: number) => {
            observer.next(value);
            observer.complete();
          });
        }, (err) => {
          observer.error(err);
          observer.complete();
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

  private static targetFrom(argv: any, ret: Target = new Target()): Target {
    ret.id = argv.id || null;
    ret.url = argv.url;
    ret.method = argv.method;
    ret.freq = argv.freq;
    ret.timeout = argv.timeout;
    ret.clientkey = (argv.clientkey && fs.readFileSync(argv.clientkey).toString()) || null;
    ret.clientcert = (argv.clientkey && fs.readFileSync(argv.clientcert).toString()) || null;
    // console.log(ret.toJSON());
    return ret;
  }

  private static listCommand(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('list', 'list registered urls to test',
      {
        'all': {
          describe: 'show all',
          default: false
        }
      },
      (argv: any) => {
        dbConnect(argv).subscribe((sql: Sequelize) => {
          const sc = new slaClock.Api(sql);
          sc.target.list(argv.all).subscribe((lst: Target[]) => {
            output(argv, lst).forEach((a) => observer.next(a));
            sc.close();
            observer.complete();
          }, (e) => {
            sc.close();
            observer.error(e);
            observer.complete();
          });
        });
      });
  }

  private static addCommand(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('add', 'add url to test',
      Cli.options(),
      (argv: any) => {
        dbConnect(argv).subscribe((sql: Sequelize) => {
          const sc = new slaClock.Api(sql);
          sc.target.add(Cli.targetFrom(argv)).subscribe((e: Target) => {
            output(argv, [e]).forEach((a) => observer.next(a));
            sc.close();
            observer.complete();
          }, (err) => {
            observer.error(err);
            sc.close();
            observer.complete();
          });
        });
      });
  }

  private static delCommand(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('del', 'del url by id', {
      'id': {
        describe: 'id to delete',
        required: true
      }
    },
      (argv: any) => {
        dbConnect(argv).subscribe((sql: Sequelize) => {
          const sc = new slaClock.Api(sql);
          sc.target.delete(argv.id).subscribe((e: Target) => {
            if (!e) {
              observer.error(`did not found id: ${argv.id}`);
              sc.close();
              observer.complete();
              return;
            }
            output(argv, [e]).forEach((a) => observer.next(a));
            sc.close();
            observer.complete();
          }, (err) => {
            observer.error(err);
            sc.close();
            observer.complete();
          });
        });
      });
  }

  private static updateCommand(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('update', 'update by id',
      Object.assign(Cli.options(), {
        'id': {
          describe: 'id to update',
          required: true
        }
      }),
      (argv: any) => {
        dbConnect(argv).subscribe((sql: Sequelize) => {
          const sc = new slaClock.Api(sql);
          sc.target.get(argv.id).subscribe((got: Target) => {
            if (!got) {
              observer.error(`did not found id: ${argv.id}`);
              sc.close();
              observer.complete();
              return;
            }
            sc.target.update(Cli.targetFrom(argv, got)).subscribe((e: Target) => {
              output(argv, [e]).forEach((a) => observer.next(a));
              sc.close();
              observer.complete();
            });
          }, (err) => {
            observer.error(err);
            sc.close();
            observer.complete();
          });
        });
      });
  }

  public static command(_yargs: any, observer: Rx.Observer<string>): any {
    return _yargs.command('target', 'manipulate with target entries', (__yargs: any) => {
      __yargs = Cli.listCommand(__yargs, observer);
      __yargs = Cli.addCommand(__yargs, observer);
      __yargs = Cli.updateCommand(__yargs, observer);
      __yargs = Cli.delCommand(__yargs, observer);
      return __yargs;
    });
  }
}
