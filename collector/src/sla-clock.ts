// import * as Sequelize from 'sequelize';
//import * as SeqType from 'sequelize-typescript';
import {
  Table, Column, Model, HasMany, CreatedAt, IsUUID,
  UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey
} from 'sequelize-typescript';

import * as Rx from 'rxjs';
import * as uuid from 'uuid';

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

export class SlaClock {
  public sequelize: Sequelize;
  constructor(sequelize: Sequelize) {
    this.sequelize = sequelize;
  }

  public list(): Rx.Observable<Entry[]> {
    this.sequelize.addModels([Entry]);
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
    this.sequelize.addModels([Entry]);
    return Rx.Observable.create((observer: Rx.Observer<Entry>) => {
      Entry.sync().then(() => {
        e.save().then((value: Entry) => {
          observer.next(value);
          observer.complete();
        });
      });
    });
  }

  public update(e: Entry): Rx.Observable<Entry> {
    this.sequelize.addModels([Entry]);
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
    this.sequelize.addModels([Entry]);
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
