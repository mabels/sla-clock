import * as slaClock from './sla-clock';
import * as Rx from 'rxjs';

process.argv.shift();
process.argv.shift();

// console.log(process.argv);
slaClock.ctl(process.argv).subscribe(console.log, console.error);
//slaClock.ctl(['--help']).subscribe(console.log, console.error);
