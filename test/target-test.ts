// import winston from 'winston';
import * as Rx from 'rxjs';
import * as slaClock from '../src/sla-clock';
import * as SeqType from 'sequelize-typescript';
import { assert } from 'chai';
import { Target } from '../src/target';

import { PgMyDb, addSequelize } from './test-helper';

class Entries {
  public idx: number;
  public entries: Target[];
  public entry: Target;
}

function add(sc: slaClock.Api, done: any): void {
  const my: Target[] = [];
  const entrieses: Rx.Observable<Entries>[] = [];
  const createLen = 10;
  for (let i = 0; i < createLen; ++i) {
    const entry = new Target();
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
      sc.target.add(entry).subscribe((e: Target) => {
        assert.isTrue(entry.id.length > 0);
        assert.equal(entry.url, e.url);
        assert.equal(entry.freq, e.freq);
        assert.equal(entry.timeout, e.timeout);
        assert.equal(entry.clientcert, e.clientcert);
        assert.equal(entry.clientkey, e.clientkey);
        entries.entries[entries.idx] = e;
        entries.entries = entries.entries.sort((a, b) => {
          if (a.id < b.id) { return -1; }
          if (a.id > b.id) { return 1; }
          return 0;
        });
        sc.target.list().subscribe((lst: Target[]) => {
          try {
            // console.log(lst.map(a => a.id));
            assert.deepEqual(lst.map((a) => a.toJSON()),
              entries.entries.slice(0, entries.idx + 1).map((a) => a.toJSON()));
          } catch (e) {
            console.error(e);
          }
          observer.complete();
        });
      });
    }));
  }
  Rx.Observable.concat.apply(Rx.Observable.concat, entrieses).subscribe(null, null, () => {
    sc.target.list().subscribe((lst: Target[]) => {
      assert.isTrue(lst.length == createLen);
      done();
    });
  });
}

describe('target', () => {
  before(function (done: MochaDone): void {
    this.timeout(30000);
    (global as any).postgresSql.ready(() => done());
  });

  it('list-empty', (done) => {
    PgMyDb('targetListEmpty').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.Api(sql);
      sc.target.list().subscribe((lst: Target[]) => {
        assert.deepEqual([], lst);
        done();
      });
    });
  });

  it('add', (done) => {
    PgMyDb('targetAddAndList').subscribe((sql: SeqType.Sequelize) => {
      add(new slaClock.Api(sql), done);
    });
  });

  it('update', (done) => {
    PgMyDb('targetUpdate').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.Api(sql);
      add(sc, () => {
        sc.target.list().subscribe((lst: Target[]) => {
          const updated: Target[] = [];
          const update = (idx: number) => {
            if (idx == lst.length) {
              sc.target.list().subscribe((_lst: Target[]) => {
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
              sc.target.update(my).subscribe((e: Target) => {
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
    PgMyDb('targetDelete').subscribe((sql: SeqType.Sequelize) => {
      const sc = new slaClock.Api(sql);
      add(sc, () => {
        sc.target.list().subscribe((lst: Target[]) => {
          const del = (idx: number) => {
            if (idx == lst.length) {
              sc.target.list().subscribe((_lst: Target[]) => {
                assert.isTrue(_lst.length == 0, 'length error');
                done();
              });
            } else {
              sc.target.delete(lst[idx].id).subscribe((e: Target) => {
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
    slaClock.cli(addSequelize('targetctllistempty', ['target', 'list'])).subscribe((a) => {
      assert.equal('', a);
      slaClock.cli(addSequelize('targetctllistempty', ['target', 'list', '--json']))
        .subscribe((b) => {
          assert.equal('[]', b);
          done();
        });
    });
  });

  it('ctl-add-list', (done) => {
    slaClock.cli(addSequelize('targetctladdlist', ['target', 'add', '--json',
      '--url', 'add://url'])).subscribe((added) => {
      slaClock.cli(addSequelize('targetctladdlist', ['target', 'list', '--json'])).subscribe((lst) => {
        assert.deepEqual(JSON.parse(added), JSON.parse(lst));
        slaClock.cli(addSequelize('targetctladdlist', ['target', 'list', '--text'])).
          subscribe((text) => {
            if (!(text.includes('id') || text.includes(JSON.parse(added)[0].id))) {
              assert.isFalse(false, 'not ok');
            }
          }, null, done);
      });
    });
  });

  it('ctl-add-update', (done) => {
    slaClock.cli(addSequelize('targetctladdupdate', ['target', 'add', '--json',
      '--url', 'add://url'])).subscribe((added) => {
      const oadded = JSON.parse(added);
      oadded[0].url = 'update';
      slaClock.cli(addSequelize('targetctladdupdate', ['target', 'update', '--json',
        '--url', oadded[0].url, '--id', JSON.parse(added)[0].id]))
        .subscribe((updated) => {
          assert.equal(oadded[0].id, JSON.parse(updated)[0].id);
          assert.equal(oadded[0].url, JSON.parse(updated)[0].url);
        }, null, done);
    });
  });

  it('ctl-del-list', (done) => {
    slaClock.cli(addSequelize('targetctldellist', ['target', 'add', '--json',
      '--url', 'add://url'])).subscribe((added) => {
      slaClock.cli(addSequelize('targetctldellist', ['target', 'del', '--json',
        '--id', JSON.parse(added)[0].id]))
        .subscribe((deleted) => {
          assert.deepEqual(JSON.parse(added), JSON.parse(deleted));
        }, null, done);
    });
  });

});
