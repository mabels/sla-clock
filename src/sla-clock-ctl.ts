import * as slaClock from './sla-clock';

process.argv.shift();
process.argv.shift();
slaClock.cli(process.argv).subscribe((out) => {
  if (out != '') {
    console.log(out);
  }
}, console.error);
