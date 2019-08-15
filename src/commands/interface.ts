import { Argv, Arguments } from 'yargs';
import { IConfiguration } from '../configuration';

export interface ICommand<T = {}> {
    readonly command: string;
    readonly description: string;

    declareArguments(args: Argv): Argv<T>;
    run(args: Arguments<T>, config: IConfiguration) : Promise<void|IConfiguration>;
}