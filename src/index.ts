import * as yargs from 'yargs';
import { Setup } from './commands/setup';
import { Configuration } from './configuration';
import { Init } from './commands/init';
import { Clear } from './commands/clear';
import { Sync } from './commands/sync';
import { ICommand } from './commands/interface';


const config = new Configuration();
const setup = new Setup(config);
const init = new Init(config);
const clear = new Clear(config);
const sync = new Sync(config);

yargs.command(init.command, init.description, args => init.declareArguments(args), args => run(init, args));
yargs.command(setup.command, setup.description, args => setup.declareArguments(args), args => run(setup, args));
yargs.command(clear.command, clear.description, args => clear.declareArguments(args), args => run(clear, args));
yargs.command(sync.command, sync.description, args => sync.declareArguments(args as any), args => run(sync, args));

async function main() {
    // const configuration = await config.exists() ? await config.read() : null;
    
    const args = yargs.parse();

    if(!(await config.exists())) {
        await init.run(yargs.argv);
        console.log();
        await setup.run(yargs.argv, await config.read());
    } else if(!args._[0]) {
        yargs.showHelp();
    }
}

async function run(cmd : ICommand<any>, args : any) {
    if(!(await config.exists())) {
        return
    }

    await cmd.run(args, await config.read());
}

main().catch(err => {
    console.error(err);
    process.exit(1);
})