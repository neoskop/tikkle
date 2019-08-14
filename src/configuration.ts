import * as fs from 'fs-extra';
import * as path from 'path';
import * as YAML from 'js-yaml';
import { TickspotRole } from './apis/tickspot.api';

export interface IConfiguration {
    tickspot: {
        role: TickspotRole;
        username: string;
        clients: [ string, string[] ][];
    };
    toggle: {
        token: string;
        workspace: number;
    };
    settings: {
        rounding: number;
        roundUpBy: number
    }
}

export class Configuration {
    getFilePath() {
        return path.join(process.env.HOME!, '.tikklerc');
    }
    
    async exists() {
        return fs.pathExists(this.getFilePath());
    }

    async read() : Promise<IConfiguration> {
        const file = await fs.readFile(this.getFilePath(), 'utf8');

        return YAML.safeLoad(file) as IConfiguration;
    }

    async write(config : IConfiguration) : Promise<void> {
        const content = YAML.dump(config);

        await fs.writeFile(this.getFilePath(), content);
    }
}