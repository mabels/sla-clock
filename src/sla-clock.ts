import { Sequelize } from 'sequelize-typescript';

import * as Rx from 'rxjs';
import * as yargs from 'yargs';

import * as collector from './collector';
import * as view from './view';
import * as target from './target';
import * as log from './log';
import * as cliHelper from './cli-helper';

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
export class Api {
  public sequelize: Sequelize;
  public log: log.Api;
  public target: target.Api ;

  constructor(sequelize: Sequelize) {
    this.sequelize = sequelize;
    this.log = new log.Api(this);
    this.target = new target.Api(this);
  }

  public close(): void {
    this.sequelize.close();
  }

}

export function cli(args: string[]): Rx.Observable<string> {
  return Rx.Observable.create((observer: Rx.Observer<string>) => {
    let y = yargs.usage('$0 <cmd> [args]');
    y.option('logLevel', {
      describe: 'logLevel ala winston',
      default: 'info'
    });
    y = cliHelper.sequelizeOptions(y);
    y = cliHelper.jsonOrText(y);
    y = log.Cli.command(y, observer);
    y = target.Cli.command(y, observer);
    y = collector.Cli.command(y);
    y = view.Cli.command(y);
    y.help().parse(args);
  });
}
