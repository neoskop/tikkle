import { Arguments, Argv } from 'yargs';

import { Cache as _Cache } from '../cache';
import { Configuration } from '../configuration';
import { ICommand } from './interface';


export class Cache implements ICommand<{ command: 'clear' }> {
    readonly command = 'cache <command>';
    readonly description = 'Cache operations';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv<{ command: 'clear' }>): Argv {
        return args.positional('command', {
            description: 'A command for the cache, currently only "clear" is supported.'
        });
    }

    async run({ command } : Arguments<{ command: 'clear' }>) {
        switch(command) {
            case 'clear':
            default:
                _Cache.create().clear();
                console.log('Cache cleared');
        }
    }
}