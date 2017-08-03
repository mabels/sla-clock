// import * as Sequelize from 'sequelize';
//import * as SeqType from 'sequelize-typescript';
import { Table, Column, Model, HasMany, CreatedAt, IsUUID,
    UpdatedAt, DeletedAt, Sequelize, DataType, PrimaryKey } from 'sequelize-typescript';

import * as Rx from 'rxjs';

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
export class List extends Model<List> {
  @IsUUID(4)
  @PrimaryKey
  @Column(DataType.STRING)
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

export function list(sequelize: Sequelize): Rx.Observable<List[]> {
  sequelize.addModels([List]);
  return Rx.Observable.create((observer: Rx.Observer<List[]>) => {
    List.sync().then(() => {
      List.findAll().then((lst: List[]) => {
        observer.next(lst);
        observer.complete();
      });
    });
  });
}
