// import winston from 'winston';
import * as Rx from 'rxjs';
import * as RxExec from 'rxjs-exec';
import * as crypto from 'crypto';
import * as slaClock from  '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import { assert } from 'chai';

import * as PostgresSqlDaemon from '../helper/postgres-sql-daemon';

class Entries {
  public idx: number;
  public entries: slaClock.Entry[];
  public entry: slaClock.Entry;
}

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
      // console.log(`PgMyDb:CreateDb:`, topic);
      const qcdb = s.query(`create database ${topic}`, { type: SeqType.Sequelize.QueryTypes.SELECT});
      qcdb.then((_res: any) => {
        // console.log(`PgMyDb:CreateDb:Created:`, topic, _res);
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
      const sc = new slaClock.SlaClock(sql);
      sc.list().subscribe((lst: slaClock.Entry[]) => {
        assert.deepEqual([], lst);
        done();
      });
    });
  });
  function add(sc: slaClock.SlaClock, done: any): void {
      const my: slaClock.Entry[] = [];
      const entrieses: Rx.Observable<Entries>[] = [];
      const createLen = 10;
      for (let i = 0; i < createLen; ++i) {
        const entry = new slaClock.Entry();
        entry.url = 'url' + i;
        entry.freq = i / 10;
        entry.timeout = 1000 + i;
        entry.clientkey = 'clientkey' + i;
        entry.clientcert = 'clientcert' + i;
        my.push(entry);
        const entries = new Entries();
        entries.entries = my;
        entries.idx = i;
        entries.entry = entry;
        entrieses.push(Rx.Observable.create((observer: Rx.Observer<Entries>) => {
            // console.log(entry.url);
            sc.add(entry).subscribe((e: slaClock.Entry) => {
              assert.isTrue(entry.id.length > 0);
              assert.equal(entry.url, e.url);
              assert.equal(entry.freq, e.freq);
              assert.equal(entry.timeout, e.timeout);
              assert.equal(entry.clientcert, e.clientcert);
              assert.equal(entry.clientkey, e.clientkey);
              entries.entries[entries.idx] = e;
              sc.list().subscribe((lst: slaClock.Entry[]) => {
                // console.log(e.toJSON(), lst.map((a) => a.toJSON()));
                assert.deepEqual(lst.map((a) => a.toJSON()),
                  entries.entries.slice(0, entries.idx + 1).map((a) => a.toJSON()));
                observer.complete();
              });
            });
          }));
      }
      Rx.Observable.concat.apply(Rx.Observable.concat, entrieses).subscribe(null, null, () => {
        sc.list().subscribe((lst: slaClock.Entry[]) => {
          assert.isTrue(lst.length == createLen);
          done();
        });
      });
  }
  it('add', (done) => {
    PgMyDb('addAndList').subscribe((sql: SeqType.Sequelize) => {
      add(new slaClock.SlaClock(sql), done);
    });
  });

  it('update', (done) => {
    PgMyDb('update').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.SlaClock(sql);
      add(sc, () => {
        sc.list().subscribe((lst: slaClock.Entry[]) => {
          const updated: slaClock.Entry[] = [];
          const update = (idx: number) => {
            if (idx == lst.length) {
              sc.list().subscribe((_lst: slaClock.Entry[]) => {
                assert.deepEqual(_lst.map((a) => a.toJSON()), updated.map((a) => a.toJSON()));
                done();
              });
            } else {
              const my = lst[idx];
              my.url = my.url + ':' + idx;
              my.freq = idx; // 0.1hz = 10sec
              my.timeout = idx;
              my.clientkey += ':' + idx;
              my.clientcert += ':' + idx;
              sc.update(my).subscribe((e: slaClock.Entry) => {
                assert.isTrue(lst[idx].id == e.id, 'id missmatch');
                updated.push(e);
                update(1 + idx);
              });
            }
          };
          update(0);
        });
      });
    });
  });

  it('delete', (done) => {
    PgMyDb('delete').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.SlaClock(sql);
      add(sc, () => {
        sc.list().subscribe((lst: slaClock.Entry[]) => {
          const del = (idx: number) => {
            if (idx == lst.length) {
              sc.list().subscribe((_lst: slaClock.Entry[]) => {
                assert.isTrue(_lst.length == 0, 'length error');
                done();
              });
            } else {
              sc.delete(lst[idx].id).subscribe((e: slaClock.Entry) => {
                assert.isTrue(lst[idx].id == e.id, 'id missmatch');
                del(1 + idx);
              });
            }
          };
          del(0);
        });
      });
    });
  });
});
