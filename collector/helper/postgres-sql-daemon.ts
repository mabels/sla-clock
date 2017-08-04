import * as Rx from 'rxjs';
import * as RxExec from 'rxjs-exec';
import * as crypto from 'crypto';
import * as cp from 'child_process';
import * as pg from 'pg';
import { Sequelize } from 'sequelize-typescript';

const PGTOOLS = '';

export class Cdb {
  public dir: string;
  public port: number;
  public constructor(dir: string, port: number) {
    this.dir = dir;
    this.port = port;
  }
}

interface ReadyCB {
  (cdb: Cdb): void;
}

export class PostgresSqlDaemon {
  public readyQ: ReadyCB[] = [];
  public cdb: Cdb = null;
  public static start(): PostgresSqlDaemon {
    const ret = new PostgresSqlDaemon();
    ret.createDb('pg').subscribe(null, null, () => true);
    return ret;
  }
  public ready(cb?: ReadyCB): void {
    if (cb) {
      this.readyQ.push(cb);
    }
    if (this.cdb) {
      const q = this.readyQ;
      this.readyQ = [];
      q.forEach(i => i(this.cdb));
    }
  }
  public createDb(dbName: string): Rx.Observable<Cdb> {
    const random = Math.random();
    const mac = crypto.createHmac('sha1', `${dbName}:${random}`).digest('hex');
    const dir = `./${dbName}.${mac}.pgdb`;
    const cdb = new Cdb(dir,
      parseInt(mac.substr(0, 4), 16) % (0x10000 - 1024) + 1024);
    return Rx.Observable.create((observer: Rx.Observer<Cdb>) => {
      Rx.Observable.concat.apply(Rx.Observable.concat, [
        RxExec.exec(`mkdir -p ${cdb.dir}`),
        RxExec.exec(`${PGTOOLS}initdb -U postgres ${cdb.dir} 2>&1`),
        RxExec.exec(`${PGTOOLS}pg_ctl start -D ${cdb.dir} -o "-p ${cdb.port}" 2>&1 > /dev/null`),
      ]).subscribe(null, null, () => {
            this.cdb = cdb;
            this.ready();
            process.on('exit', () => {
              console.log('EXIT: Postgres:');
              this.removeDbSync();
            });
            observer.complete();
          });
    });
  }

  public sequelize(dbName?: string): Sequelize {
    const sequelizeConfig = {
      dialect: 'postgres',
      host: '/tmp',
      port: this.cdb.port,
      name: (dbName && dbName.toLowerCase()) || 'postgres',
      username: 'postgres',
      password: '',
      logging: false
    };
    // console.log('sequelize', sequelizeConfig);
    return new Sequelize(sequelizeConfig);
  }

  // public connect(dbName?: string): Rx.Observable<pg.Client> {
  //   let pgUrl = `socket:${this.cdb.dir}`;
  //   if (dbName) {
  //     pgUrl += `?db=${dbName}`;
  //   }
  //   console.log('connect:', pgUrl);
  //   const client = new pg.Client(pgUrl);
  //   return Rx.Observable.create((observer: Rx.Observer<pg.Client>) => {
  //     client.connect((err) => {
  //       if (err) {
  //         console.log('connected:err', pgUrl, err);
  //         observer.error(err);
  //       } else {
  //         console.log('connected:', pgUrl);
  //         observer.next(client);
  //         observer.complete();
  //       }
  //     });
  //   });
  // }

  public removeDbSync(): void {
    cp.spawnSync('sh', ['-c', `${PGTOOLS}pg_ctl stop -D ${this.cdb.dir}`]);
    cp.spawnSync('sh', ['-c', `rm -r ${this.cdb.dir}`]);
  }

}

// export default PostgresSqlDaemon;
