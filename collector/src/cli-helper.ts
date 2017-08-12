import {
  Table, Column, Model, HasMany, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey,
} from 'sequelize-typescript';
import * as Rx from 'rxjs';

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

export function dbConnect(argv: any): Rx.Observable<Sequelize> {
  return dbConnection(argv.sequelizeMasterDbname,
    argv.sequelizeDbname, buildSequelizeConfig(argv));
}

export function sequelizeOptions(_yargs: any): any {
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

export function jsonOrText(_yargs: any): any {
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

function textOutput<T extends Model<T>>(argv: any, elst: T[]): string[] {
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

export function output<T extends Model<T>>(argv: any, lst: T[]): string[] {
  // console.log(argv.json);
  if (argv.json) {
    return [JSON.stringify(lst.map(i => i.toJSON()))];
  } else {
    return textOutput(argv, lst);
  }
}
