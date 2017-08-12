// import winston from 'winston';
import * as Rx from 'rxjs';
import * as RxExec from 'rxjs-exec';
import * as crypto from 'crypto';
import * as slaClock from '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import * as winston from 'winston';
import * as queue from '../src/queue';
import { assert } from 'chai';
import { Log } from '../src/log';
import * as cliHelper from '../src/cli-helper';

import * as PostgresSqlDaemon from '../helper/postgres-sql-daemon';
import { PgMyDb, addSequelize } from './test-helper';

class Entries {
  public idx: number;
  public entries: Log[];
  public entry: Log;
}

function add(sc: slaClock.Api, done: any): void {
  const my: Log[] = [];
  const entrieses: Rx.Observable<Entries>[] = [];
  const createLen = 10;
  for (let i = 0; i < createLen; ++i) {
    const entry = new Log();
    entry.url = 'url' + i;
    entry.freq = i / 10;
    entry.timeout = 1000 + i;
    my.push(entry);
    const entries = new Entries();
    entries.entries = my;
    entries.idx = i;
    entries.entry = entry;
    entrieses.push(Rx.Observable.create((observer: Rx.Observer<Entries>) => {
      // console.log(entry.url);
      sc.log.add(entry).subscribe((e: Log) => {
        assert.isTrue(entry.id.length > 0);
        assert.equal(entry.url, e.url);
        assert.equal(entry.freq, e.freq);
        assert.equal(entry.timeout, e.timeout);
        entries.entries[entries.idx] = e;
        sc.log.list().subscribe((lst: Log[]) => {
          // console.log(e.toJSON(), lst.map((a) => a.toJSON()));
          assert.deepEqual(lst.map((a) => a.toJSON()),
            entries.entries.slice(0, entries.idx + 1).map((a) => a.toJSON()));
          observer.complete();
        });
      });
    }));
  }
  Rx.Observable.concat.apply(Rx.Observable.concat, entrieses).subscribe(null, null, () => {
    sc.log.list().subscribe((lst: Log[]) => {
      assert.isTrue(lst.length == createLen);
      done();
    });
  });
}

describe('log', () => {
  before(function (done: MochaDone): void {
    this.timeout(30000);
    (global as any).postgresSql.ready(() => done());
  });

  it('list-empty', (done) => {
    PgMyDb('listEmpty').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.Api(sql);
      sc.log.list().subscribe((lst: Log[]) => {
        assert.deepEqual([], lst);
        done();
      });
    });
  });

  it('add', (done) => {
    PgMyDb('addAndList').subscribe((sql: SeqType.Sequelize) => {
      add(new slaClock.Api(sql), done);
    });
  });

  it('ctl-list-empty', (done) => {
    slaClock.cli(addSequelize('ctllistempty', ['log', 'list'])).subscribe((a) => {
      assert.equal('', a);
      slaClock.cli(addSequelize('ctllistempty', ['log', 'list', '--json']))
        .subscribe((b) => {
          assert.equal('[]', b);
          done();
        });
    });
  });

  it('ctl-add-list', (done) => {
    slaClock.cli(addSequelize('ctladdlist', ['log', 'add', '--json', '--url', 'add://url'])).subscribe((added) => {
      slaClock.cli(addSequelize('ctladdlist', ['log', 'list', '--json'])).subscribe((lst) => {
        assert.deepEqual(JSON.parse(added), JSON.parse(lst));
        slaClock.cli(addSequelize('ctladdlist', ['log', 'list', '--text'])).
          subscribe((text) => {
            if (!(text.includes('id') || text.includes(JSON.parse(added)[0].id))) {
              assert.isFalse(false, 'not ok');
            }
          }, null, done);
      });
    });
  });

});
