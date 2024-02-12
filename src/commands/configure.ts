import prompts from 'prompts';
import { Arguments, Argv } from 'yargs';

import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

export class Configure implements ICommand {
    readonly command = 'configure';
    readonly description = 'Configure tikkle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv): Argv {
        return args;
    }

    async run(_args: Arguments, config: IConfiguration) {
        while(true) {
            const { command } = await prompts({
                name: 'command',
                message: 'Configure',
                type: 'select',
                choices: [
                    { title: 'Exit', value: 'exit' },
                    { title: 'Round To', value: 'rounding' },
                    { title: 'Round Up By', value: 'roundUpBy' },
                    { title: 'Grouping', value: 'grouping' }
                ]
            });

            switch(command) {
                case 'exit':
                default: return;
                case 'rounding':
                    const { rounding } = await prompts({
                        name: 'rounding',
                        message: 'Round To',
                        type: 'number',
                        initial: config.settings.rounding
                    });
                    if(rounding) {
                        config.settings.rounding = rounding;
                        this.config.write(config);
                    } else {
                        return;
                    }
                    break
                case 'roundUpBy':
                    const { roundUpBy } = await prompts({
                        name: 'roundUpBy',
                        message: 'Round Up By',
                        type: 'number',
                        float: true,
                        increment: 0.01,
                        initial: config.settings.roundUpBy
                    });
                    if(roundUpBy) {
                        config.settings.roundUpBy = roundUpBy;
                        this.config.write(config);
                    } else {
                        return
                    }
                    break;
                case 'grouping':
                    const { grouping } = await prompts({
                        name: 'grouping',
                        message: 'Group Time Entries by Task',
                        type: 'toggle',
                        initial: config.settings.grouping
                    });
                    if(grouping != null) {
                        config.settings.grouping = grouping;
                        this.config.write(config);
                    } else {
                        return
                    }
                    break;
            }
        }
    }
}