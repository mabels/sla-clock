// import winston from 'winston';
import * as Rx from 'rxjs';
import * as RxExec from 'rxjs-exec';
import * as crypto from 'crypto';
import * as slaClock from '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import * as winston from 'winston';
import * as queue from '../src/queue';
import { assert } from 'chai';

import * as PostgresSqlDaemon from '../helper/postgres-sql-daemon';

const logger = new winston.Logger({
  level: 'info',
  transports: [
    new (winston.transports.Console)(),
  ]
});

class Entries {
  public idx: number;
  public entries: slaClock.Entry[];
  public entry: slaClock.Entry;
}

function PgMyDb(dbName: string): Rx.Observable<SeqType.Sequelize> {
  return slaClock.dbConnection('postgres', dbName,
    (global as any).postgresSql.sequelizeConfig());
}

function addSequelize(dbName: string, option: string[]): string[] {
  const sqc = (global as any).postgresSql.sequelizeConfig();
  const ret = [
    '--sequelize-dialect', 'postgres',
    '--sequelize-host', '/tmp',
    '--sequelize-port', '' + sqc.port,
    '--sequelize-dbname', dbName
  ].concat(option);
  // console.log(ret);
  return ret;
}

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

describe('sla-clock', () => {
  before(function (done: MochaDone): void {
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

  it('ctl-list-empty', (done) => {
    slaClock.ctl(addSequelize('ctllistempty', ['list'])).subscribe((a) => {
      assert.equal('', a);
      slaClock.ctl(addSequelize('ctllistempty', ['list', '--json']))
        .subscribe((b) => {
          assert.equal('[]', b);
          done();
        });
    });
  });

  it('ctl-add-list', (done) => {
    slaClock.ctl(addSequelize('ctladdlist', ['add', '--json', '--url', 'add://url'])).subscribe((added) => {
      slaClock.ctl(addSequelize('ctladdlist', ['list', '--json'])).subscribe((lst) => {
        assert.deepEqual(JSON.parse(added), JSON.parse(lst));
        slaClock.ctl(addSequelize('ctladdlist', ['list', '--text'])).
          subscribe((text) => {
            if (!(text.includes('id') || text.includes(JSON.parse(added)[0].id))) {
              assert.isFalse(false, 'not ok');
            }
          }, null, done);
      });
    });
  });

  it('ctl-add-update', (done) => {
    slaClock.ctl(addSequelize('ctladdupdate', ['add', '--json', '--url', 'add://url'])).subscribe((added) => {
      const oadded = JSON.parse(added);
      oadded[0].url = 'update';
      slaClock.ctl(addSequelize('ctladdupdate', ['update', '--json',
        '--url', oadded[0].url, '--id', JSON.parse(added)[0].id]))
        .subscribe((updated) => {
          assert.equal(oadded[0].id, JSON.parse(updated)[0].id);
          assert.equal(oadded[0].url, JSON.parse(updated)[0].url);
        }, null, done);
    });
  });

  it('ctl-del-list', (done) => {
    slaClock.ctl(addSequelize('ctldellist', ['add', '--json', '--url', 'add://url'])).subscribe((added) => {
      slaClock.ctl(addSequelize('ctldellist', ['del', '--json', '--id', JSON.parse(added)[0].id]))
        .subscribe((deleted) => {
          assert.deepEqual(JSON.parse(added), JSON.parse(deleted));
        }, null, done);
    });
  });

  it('queue-simple', (done) => {
    // simple
    const q = queue.start<number>(logger, {});
    let calls = 10;
    (Array(calls).fill(0)).forEach((_: any, idx: number) => {
      // console.log('simple:', idx);
      q.push(Rx.Observable.create((obs: Rx.Observer<number>) => {
        --calls;
        obs.next(idx);
        obs.complete();
      }));
    });
    setTimeout(() => {
      // console.log('queue-simple done');
      assert.equal(0, calls);
      q.stop().subscribe(done);
    }, 800);
  });

  it('queue-retries', (done) => {
    // simple 2 retries than ok with measure retryWaittime
    const q = queue.start<number>(logger, {
      reclaimTimeout: 100,
      retryWaitTime: 50,
      maxExecuteCnt: 5,
      taskTimer: 10
    });
    const idxTimer = new Map<number, number[]>();
    let calls = 10;
    const retrys = 2;
    (Array(calls).fill(0)).forEach((_: any, idx: number) => {
      // console.log('simple:', idx);
      idxTimer.set(idx, []);
      let cnt = 0;
      q.push(Rx.Observable.create((obs: Rx.Observer<number>) => {
        idxTimer.get(idx).push((new Date()).getTime());
        if (cnt++ < retrys) {
          obs.error(idx);
        } else {
          obs.next(idx);
          obs.complete();
        }
      }));
    });
    let deadLetters = 0;
    q.deadLetter.subscribe(() => { ++deadLetters; });
    setTimeout(() => {
      assert.equal(0, deadLetters, 'calls != deadletter');
      idxTimer.forEach((v, k) => {
        assert.equal(retrys + 1, v.length);
        const diff = v.map((x, i, vas) => {
          if (i < 1) { return 0; }
          return x - vas[i - 1];
        }).slice(1);
        // console.log('diff:', diff, v);
        diff.forEach((d) => {
          assert.isTrue(q.retryWaitTime <= d && d <= (q.retryWaitTime * 1.5));
        });
      });
      // assert.equal(0, calls);
      q.stop().subscribe(done);
    }, 400);
  });

  it('queue-reclaim', (done) => {
    // simple 2 retries than ok with measure retryWaittime
    const q = queue.start<number>(logger, {
      reclaimTimeout: 100,
      retryWaitTime: 50,
      maxExecuteCnt: 5,
      taskTimer: 10
    });
    const idxTimer = new Map<number, number[]>();
    let calls = 10;
    const retrys = 2;
    (Array(calls).fill(0)).forEach((_: any, idx: number) => {
      // console.log('simple:', idx);
      idxTimer.set(idx, []);
      let cnt = 0;
      q.push(Rx.Observable.create((obs: Rx.Observer<number>) => {
        idxTimer.get(idx).push((new Date()).getTime());
        if (cnt++ >= retrys) {
          obs.next(idx);
        }
      }));
    });
    let deadLetters = 0;
    q.deadLetter.subscribe(() => { ++deadLetters; });
    setTimeout(() => {
      assert.equal(0, deadLetters, 'calls != deadletter');
      idxTimer.forEach((v, k) => {
        assert.equal(retrys + 1, v.length);
        const diff = v.map((x, i, vas) => {
          if (i < 1) { return 0; }
          return x - vas[i - 1];
        }).slice(1);
        // console.log('diff:', diff, v);
        diff.forEach((d) => {
          assert.isTrue(q.reclaimTimeout <= d && d <= (q.reclaimTimeout * 1.5));
        });
      });
      // assert.equal(0, calls);
      q.stop().subscribe(done);
    }, 500);
  });

  it('queue-error', (done) => {
    // simple 5 error remove
    const q = queue.start<number>(logger, {
      reclaimTimeout: 100,
      retryWaitTime: 50,
      maxExecuteCnt: 5,
      taskTimer: 10
    });
    const idxTimer = new Map<number, number[]>();
    let calls = 10;
    (Array(calls).fill(0)).forEach((_: any, idx: number) => {
      // console.log('simple:', idx);
      idxTimer.set(idx, []);
      q.push(Rx.Observable.create((obs: Rx.Observer<number>) => {
        // --calls;
        idxTimer.get(idx).push((new Date()).getTime());
        obs.error(idx);
        // obs.complete();
      }));
    });
    let deadLetters = 0;
    q.deadLetter.subscribe(() => { ++deadLetters; });
    setTimeout(() => {
      assert.equal(calls, deadLetters, 'calls != deadletter');
      idxTimer.forEach((v, k) => {
        assert.equal(q.maxExecuteCnt, v.length);
        const diff = v.map((x, i, vas) => {
          if (i < 1) { return 0; }
          return x - vas[i - 1];
        }).slice(1);
        // console.log('diff:', diff, v);
        diff.forEach((d) => {
          assert.isTrue(q.retryWaitTime <= d && d <= (q.retryWaitTime * 1.5));
        });
      });
      // assert.equal(0, calls);
      q.stop().subscribe(done);
    }, 800);
  });

});
