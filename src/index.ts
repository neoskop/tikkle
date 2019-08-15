import { UpdateNotifier } from 'update-notifier';
import * as yargs from 'yargs';
import { Cache } from './commands/cache';
import { Init } from './commands/init';
import { ICommand } from './commands/interface';
import { Purge } from './commands/purge';
import { Setup } from './commands/setup';
import { Sync } from './commands/sync';
import { Configuration } from './configuration';
import { Arguments } from 'yargs';
import { Configure } from './commands/configure';

const config = new Configuration();
const setup = new Setup(config);
const init = new Init(config);
const purge = new Purge(config);
const sync = new Sync(config);
const cache = new Cache(config);
const configure = new Configure(config);


yargs.command(init.command, init.description, args => init.declareArguments(args), args => run(init, args));
yargs.command(setup.command, setup.description, args => setup.declareArguments(args), args => run(setup, args));
yargs.command(purge.command, purge.description, args => purge.declareArguments(args), args => run(purge, args));
yargs.command(sync.command, sync.description, args => sync.declareArguments(args), args => run(sync, args));
yargs.command(cache.command, cache.description, args => cache.declareArguments(args), args => run(cache, args));
yargs.command(configure.command, configure.description, args => configure.declareArguments(args), args => run(configure, args));

export async function main() {
    const notifier = new UpdateNotifier({ pkg: require('../package') });
    notifier.check();
    notifier.notify();

    const args = yargs.parse();

    if (!(await config.exists())) {
        await init.run(yargs.argv);
        console.log();
        await setup.run(yargs.argv, await config.read());
    } else if (!args._[0]) {
        yargs.showHelp();
    }
}

async function run<T>(cmd: ICommand<T>, args: Arguments<T>) {
    if (!(await config.exists())) {
        return
    }

    await cmd.run(args, await config.read());
}


if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}