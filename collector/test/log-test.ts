// import winston from 'winston';
import * as Rx from 'rxjs';
import * as slaClock from '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import * as uuid from 'uuid';
import { assert } from 'chai';
import { Log } from '../src/log';

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
    entry.targetId = uuid.v4();
    entry.targetSeq = i * 10;
    my.push(entry);
    const entries = new Entries();
    entries.entries = my;
    entries.idx = i;
    entries.entry = entry;
    entrieses.push(Rx.Observable.create((observer: Rx.Observer<Entries>) => {
      // console.log(entry.url);
      sc.log.add(entry).subscribe((e: Log) => {
        assert.isTrue(entry.id.length > 0);
        assert.equal(entry.targetId, e.targetId);
        assert.equal(entry.targetSeq, e.targetSeq);
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
    PgMyDb('logListEmpty').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.Api(sql);
      sc.log.list().subscribe((lst: Log[]) => {
        assert.deepEqual([], lst);
        done();
      });
    });
  });

  it('add', (done) => {
    PgMyDb('logAddAndList').subscribe((sql: SeqType.Sequelize) => {
      add(new slaClock.Api(sql), done);
    });
  });

  it('ctl-list-empty', (done) => {
    slaClock.cli(addSequelize('logctllistempty', ['log', 'list'])).subscribe((a) => {
      assert.equal('', a);
      slaClock.cli(addSequelize('logctllistempty', ['log', 'list', '--json']))
        .subscribe((b) => {
          assert.equal('[]', b);
          done();
        });
    });
  });

  it('ctl-add-list', (done) => {
    slaClock.cli(addSequelize('logctladdlist', ['log', 'add', '--json',
      '--targetId', uuid.v4(),
      '--targetSeq', '4711'
    ])).subscribe((added) => {
      slaClock.cli(addSequelize('logctladdlist', ['log', 'list', '--json'])).subscribe((lst) => {
        assert.deepEqual(JSON.parse(added), JSON.parse(lst));
        slaClock.cli(addSequelize('logctladdlist', ['log', 'list', '--text'])).
          subscribe((text) => {
            if (!(text.includes('id') || text.includes(JSON.parse(added)[0].id))) {
              assert.isFalse(false, 'not ok');
            }
          }, null, done);
      });
    });
  });

});
