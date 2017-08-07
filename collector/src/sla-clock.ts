import {
  Table, Column, Model, HasMany, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey,
} from 'sequelize-typescript';

import * as Rx from 'rxjs';
import * as uuid from 'uuid';
import * as yargs from 'yargs';
import * as fs from 'fs';

import collector from './sla-collector';

/*
 *
 * sla-clock list
 *    lists all collable connections
 *
 * sla-clock add url [freq] [timeout] [clientkey] [clientcert]
 *    add a new sla-clock
 *      - url to query
 *      - frequence to query
 *      - timeout of the query
 *      - clientkey file (pem)
 *      - clientcert file (pem)
 *
 * sla-clock del sha
 *
 */

@Table
export class Entry extends Model<Entry> {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataType.UUID)
  public id: string;
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
}

export function dbConnection(masterDbName: string, dbName: string, cfg: any): Rx.Observable<Sequelize> {
  return Rx.Observable.create((observer: Rx.Observer<Sequelize>) => {
    const s = new Sequelize(Object.assign({ name: masterDbName.toLowerCase() }, cfg));
    const q = s.query(`SELECT * FROM pg_database where datname = '${dbName}'`,
      { type: Sequelize.QueryTypes.SELECT });
    q.then((res: any) => {
      if (res.length != 0) {
        s.close();
        observer.next(new Sequelize(Object.assign({ name: dbName.toLowerCase() }, cfg)));
        observer.complete();
        return;
      }
      // console.log(`PgMyDb:CreateDb:`, topic);
      const qcdb = s.query(`create database ${dbName}`, { type: Sequelize.QueryTypes.SELECT });
      qcdb.then((_res: any) => {
        // console.log(`PgMyDb:CreateDb:Created:`, topic, _res);
        s.close();
        observer.next(new Sequelize(Object.assign({ name: dbName.toLowerCase() }, cfg)));
        observer.complete();
      });
    });
  });
}

export class SlaClock {
  public sequelize: Sequelize;

  constructor(sequelize: Sequelize) {
    this.sequelize = sequelize;
    this.sequelize.addModels([Entry]);
  }

  public close(): void {
    this.sequelize.close();
  }


  public list(): Rx.Observable<Entry[]> {
    return Rx.Observable.create((observer: Rx.Observer<Entry[]>) => {
      Entry.sync().then(() => {
        Entry.findAll().then((lst: Entry[]) => {
          observer.next(lst);
          observer.complete();
        });
      });
    });
  }

  public add(e: Entry): Rx.Observable<Entry> {
    e.id = e.id || uuid.v4();
    return this.update(e);
  }

  public get(id: string): Rx.Observable<Entry> {
    return Rx.Observable.create((observer: Rx.Observer<Entry>) => {
      Entry.sync().then(() => {
        Entry.findById(id).then((value: Entry) => {
          observer.next(value);
          observer.complete();
        });
      });
    });
  }

  public update(e: Entry): Rx.Observable<Entry> {
    return Rx.Observable.create((observer: Rx.Observer<Entry>) => {
      Entry.sync().then(() => {
        e.save().then((value: Entry) => {
          observer.next(value);
          observer.complete();
        });
      });
    });
  }

  public delete(id: string): Rx.Observable<Entry> {
    return Rx.Observable.create((observer: Rx.Observer<Entry>) => {
      Entry.sync().then(() => {
        Entry.findById(id).then((value: Entry) => {
          Entry.destroy({
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

function buildSequelizeConfig(argv: any): any {
  return {
    dialect: argv.sequelizeDialect,
    host: argv.sequelizeHost,
    port: argv.sequelizePort,
    username: argv.sequelizeUsername,
    password: argv.sequelizePassword,
    logging: (argv.sequelizeLogging && console.log) || false
  };
}

export function dbConnect(argv: any): Rx.Observable<Sequelize> {
  return dbConnection(argv.sequelizeMasterDbname,
    argv.sequelizeDbname, buildSequelizeConfig(argv));
}

function sequelizeOptions(_yargs: any): any {
  return _yargs.option('sequelize-dialect', {
    alias: 'D',
    describe: 'sql dialect: postgres|mysql',
    default: 'postgres'
  })
    .option('sequelize-host', {
      alias: 'H',
      describe: 'sql host: default /tmp',
      default: '/tmp'
    })
    .option('sequelize-port', {
      alias: 'p',
      describe: 'sql port:',
      default: '5432'
    })
    .option('sequelize-dbname', {
      alias: 'N',
      describe: 'sql database name: default postgres',
      default: 'slaclock'
    })
    .option('sequelize-master-dbname', {
      alias: 'M',
      describe: 'sql database name: default postgres',
      default: 'postgres'
    })
    .option('sequelize-logging', {
      alias: 'L',
      describe: 'sql database logging',
      default: false
    })
    .option('sequelize-username', {
      alias: 'U',
      describe: 'sql database username: default postgres',
      default: 'postgres'
    })
    .option('sequelize-password', {
      alias: 'P',
      describe: 'sql database password:',
      default: ''
    });
}

function jsonOrText(_yargs: any): any {
  return _yargs.option('json', {
    default: false,
    describe: 'json output'
  })
    .option('text', {
      default: true,
      describe: 'text output'
    })
    .option('notitle', {
      default: false,
      describe: 'suppress text title line'
    });
}

function textOutput(argv: any, elst: Entry[]): string[] {
  const cols = new Map<string, number>();
  const lst = elst.map(e => e.toJSON());
  lst.forEach(e => {
    for (let k in e) {
      const v = e[k];
      const maxLen = cols.get(k) || k.length;
      const len = ('' + v).length;
      cols.set(k, Math.max(maxLen, len));
    }
  });
  const ret: string[] = [];
  if (!argv.notitle) {
    // title
    let title: string[] = [];
    cols.forEach((v, k) => {
      title.push(k + (new Array(v - (k.length - 1)).join(' ')));
    });
    ret.push(title.join(' '));
  }
  lst.forEach(e => {
    let line: string[] = [];
    for (let k in e) {
      const v = '' + e[k];
      // console.log(e, k, v);
      line.push(v + (new Array(cols.get(k) - (v.length - 1)).join(' ')));
    }
    ret.push(line.join(' '));
  });
  return ret;
}

function output(argv: any, lst: Entry[]): string[] {
  // console.log(argv.json);
  if (argv.json) {
    return [JSON.stringify(lst.map(i => i.toJSON()))];
  } else {
    return textOutput(argv, lst);
  }
}

function listCommand(_yargs: any, observer: Rx.Observer<string>): any {
  return _yargs.command('list', 'list registered urls to test',
    {},
    (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new SlaClock(sql);
        sc.list().subscribe((lst: Entry[]) => {
          output(argv, lst).forEach((a) => observer.next(a));
          sc.close();
          observer.complete();
        });
      });
    });
}

function entryOptions(): any {
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

function entryFrom(argv: any, ret: Entry = new Entry()): Entry {
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

function addCommand(_yargs: any, observer: Rx.Observer<string>): any {
  return _yargs.command('add', 'add url to test',
    entryOptions(),
    (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new SlaClock(sql);
        sc.add(entryFrom(argv)).subscribe((e: Entry) => {
          output(argv, [e]).forEach((a) => observer.next(a));
          sc.close();
          observer.complete();
        });
      });
    });
}

function delCommand(_yargs: any, observer: Rx.Observer<string>): any {
  return _yargs.command('del', 'del url by id', {
    'id': {
      describe: 'id to delete',
      required: true
    }
  },
    (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new SlaClock(sql);
        sc.delete(argv.id).subscribe((e: Entry) => {
          if (!e) {
            observer.error(`did not found id: ${argv.id}`);
            sc.close();
            observer.complete();
            return;
          }
          output(argv, [e]).forEach((a) => observer.next(a));
          sc.close();
          observer.complete();
        });
      });
    });
}

function updateCommand(_yargs: any, observer: Rx.Observer<string>): any {
  return _yargs.command('update', 'update by id',
    Object.assign(entryOptions(), {
      'id': {
        describe: 'id to update',
        required: true
      }
    }),
    (argv: any) => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new SlaClock(sql);
        sc.get(argv.id).subscribe((got: Entry) => {
          if (!got) {
            observer.error(`did not found id: ${argv.id}`);
            sc.close();
            observer.complete();
            return;
          }
          sc.update(entryFrom(argv, got)).subscribe((e: Entry) => {
            output(argv, [e]).forEach((a) => observer.next(a));
            sc.close();
            observer.complete();
          });
        });
      });
    });
}

function collectorCommand(_yargs: any): any {
  return _yargs.command('collector', 'collector command', {
      'updateFreq': {
        describe: 'update from sql',
        default: 0.0001
      }
    }, collector);
}

export function ctl(args: string[]): Rx.Observable<string> {
  return Rx.Observable.create((observer: Rx.Observer<string>) => {
    let y = yargs.usage('$0 <cmd> [args]');
    y = sequelizeOptions(y);
    y = jsonOrText(y);
    y = listCommand(y, observer);
    y = addCommand(y, observer);
    y = updateCommand(y, observer);
    y = delCommand(y, observer);
    y = collectorCommand(y);
    y.help().parse(args);
  });
}
