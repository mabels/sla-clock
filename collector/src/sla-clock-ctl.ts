import * as slaClock from './sla-clock';
import * as Rx from 'rxjs';

process.argv.shift();
process.argv.shift();
slaClock.cli(process.argv).subscribe(console.log, console.error);
