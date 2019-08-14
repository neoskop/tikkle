import * as yargs from 'yargs';
import { Setup } from './commands/setup';
import { Configuration } from './configuration';
import { Init } from './commands/init';
import { Clear } from './commands/clear';


const config = new Configuration();
const setup = new Setup(config);
const init = new Init(config);
const clear = new Clear(config);

yargs.command(setup.command, setup.description, args => setup.declareArguments(args));
yargs.command(init.command, init.description, args => init.declareArguments(args));
yargs.command(clear.command, clear.description, args => clear.declareArguments(args));

async function main() {
    const configuration = await config.exists() ? await config.read() : null;
    
    if(configuration === null) {
        await init.run(yargs.argv);
        console.log();
        await setup.run(yargs.argv, await config.read());
    } else if(yargs.argv._[0] === 'setup') {
        await setup.run(yargs.argv, configuration);
    } else if(yargs.argv._[0] === 'init') {
        await init.run(yargs.argv, configuration);
    } else if(yargs.argv._[0] === 'clear') {
        await clear.run(yargs.argv, configuration);
    } else {
        yargs.showHelp();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
})