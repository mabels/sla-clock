// import winston from 'winston';
import * as Rx from 'rxjs';
import * as RxExec from 'rxjs-exec';
import * as crypto from 'crypto';
import * as SlaClock from  '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import { assert } from 'chai';

import * as PostgresSqlDaemon from '../helper/postgres-sql-daemon';

function PgMyDb(topic: string): Rx.Observable<SeqType.Sequelize> {
  topic = topic.toLocaleLowerCase();
  return Rx.Observable.create((observer: Rx.Observer<SeqType.Sequelize>) => {
    const s = (global as any).postgresSql.sequelize();
    const q = s.query(`SELECT * FROM pg_database where datname = '${topic}'`,
      { type: SeqType.Sequelize.QueryTypes.SELECT});
    q.then((res: any) => {
      if (res.length != 0) {
        s.close();
        observer.next((global as any).postgresSql.sequelize(topic));
        observer.complete();
        return;
      }
      console.log(`PgMyDb:CreateDb:`, topic);
      const qcdb = s.query(`create database ${topic}`, { type: SeqType.Sequelize.QueryTypes.SELECT});
      qcdb.then((_res: any) => {
        console.log(`PgMyDb:CreateDb:Created:`, topic, _res);
        s.close();
        observer.next((global as any).postgresSql.sequelize(topic));
        observer.complete();
      });
    });
  });
}

describe('sla-clock', () => {
  before(function(done: MochaDone): void  {
    this.timeout(30000);
    console.log('Before:');
    (global as any).postgresSql.ready(() => done());
  });
  it('list-empty', (done) => {
    PgMyDb('listEmpty').subscribe((sql: SeqType.Sequelize) => {
      SlaClock.list(sql).subscribe((lst: SlaClock.List[]) => {
        assert.deepEqual([], lst);
        done();
      });
    });
  });
  it('list-with-entry', () => {
    //SlaClock.list(PostgresSqlDaemon.connect('list-empty'));
  });
  /*
  it("add", () => {
  });
  it("del", () => {
  });
  */
});
