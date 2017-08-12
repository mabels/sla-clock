import * as cliHelper from '../src/cli-helper';
import * as SeqType from 'sequelize-typescript';
import * as Rx from 'rxjs';

export let logger = (global as any).logger;

export function PgMyDb(dbName: string): Rx.Observable<SeqType.Sequelize> {
  return cliHelper.dbConnection('postgres', dbName,
    (global as any).postgresSql.sequelizeConfig());
}

export function addSequelize(dbName: string, option: string[]): string[] {
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
