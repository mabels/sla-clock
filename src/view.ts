import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as express from 'express';
import * as ws from 'ws';
import * as path from 'path';
import * as winston from 'winston';
import * as Rx from 'rxjs';
import Ticker from './ticker';
import { dbConnect, output } from './cli-helper';
import { Sequelize } from 'sequelize-typescript';
import * as slaClock from './sla-clock';
import { Log } from './log';

let logger: winston.LoggerInstance;

export class Cli {
  private static sendTick(argv: any, httpServer: https.Server | http.Server): NodeJS.Timer[] {
    const wss = new ws.Server({ server: httpServer });
    let connections: any[] = [];
    wss.on('connection', (_ws) => {
      logger.debug('new connection');
      connections.push(_ws);
      _ws.on('close', () => {
        logger.debug('close connection');
        connections = connections.filter((a) => _ws != a);
      });
      _ws.on('message', (payload) => {
        // nothing
      });
    });
    let cnt = 0;
    let runningTimeout: NodeJS.Timer[] = [];
    const tick = () => {
      dbConnect(argv).subscribe((sql: Sequelize) => {
        const sc = new slaClock.Api(sql);
        const now = new Date();
        const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const month = `${now.getFullYear()}-${now.getMonth()}-01`;
        const year = `${now.getFullYear()}-01-01`;
        sc.sequelize.query(`
          SELECT
            state,
            count(*) as count,
            count(*)/EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${today}')) as slaDay,
            count(*)/EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${month}')) as slaMonth,
            count(*)/EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${year}')) as slaYear,
            EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${today}')) - count(*) as diffDay,
            EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${month}')) - count(*) as diffMonth,
            EXTRACT(EPOCH from age(clock_timestamp(), timestamp '${year}')) - count(*) as diffYear
          FROM
            "Log"
          GROUP BY
            state
        `).then((value: any) => {
          const msg: Ticker = {
            cnt: cnt++,
            now: now,
            value: value[0]
          };
          sc.close();
          logger.debug(`tick: ${msg.cnt} ${msg.now}`);
          connections.forEach((c) => c.send(JSON.stringify(msg)));
          runningTimeout[0] = setTimeout(tick, 1000 * (1 / parseFloat(argv.tickFreq)));
        });
      });

    };
    tick();
    return runningTimeout;
  }

  private static action(argv: any): void {
    let privateKey: string = null;
    let certificate: string = null;
    try {
      privateKey = fs.readFileSync(argv.privateKey, 'utf8');
      certificate = fs.readFileSync(argv.certificate, 'utf8');
    } catch (e) {
      // nothing
    }
    const credentials = { key: privateKey, cert: certificate };
    logger = new winston.Logger({
      level: argv.logLevel,
      transports: [
        new (winston.transports.Console)(),
      ]
    });

    const applicationPort = parseInt(argv.port, 10);

    let httpServer: https.Server | http.Server;
    const webRoot = path.join(process.cwd(), 'dist/client');
    if (privateKey) {
      httpServer = https.createServer(credentials);
      logger.info(`Listen on: https ${applicationPort} on ${webRoot} tickFreq: ${argv.tickFreq}`);
    } else {
      httpServer = http.createServer();
      logger.info(`Listen on: http ${applicationPort} on ${webRoot} tickFreq: ${argv.tickFreq}`);
    }

    const app = express();

    app.use(express.static(webRoot));

    app.get('/', (req: express.Request, res: express.Response) => res.redirect('/index.html'));

    Cli.sendTick(argv, httpServer);

    httpServer.on('request', app);
    httpServer.listen(applicationPort);
  }

  public static command(_yargs: any): any {
    return _yargs.command('view', 'view server', {
      'port': {
        describe: 'port to serve',
        default: '8443'
      },
      'tickFreq': {
        describe: 'tick send freq',
        default: '0.5'
      },
      'privateKey': {
        describe: 'privateKey filename',
      },
      'certificate': {
        describe: 'certificate filename',
      }
    }, Cli.action);
  }

}
