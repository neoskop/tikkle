import * as Colors from 'colors/safe';
import { Argv } from 'yargs';

import { TickspotApi } from '../apis/tickspot.api';
import { ToggleApi } from '../apis/toggle.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

export class Clear implements ICommand {
    readonly command = 'clear';
    readonly description = 'Clear all Tikkle entries in Toggle';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv<{}>): Argv {
        return args;
    }

    async run(_args: {}, config: IConfiguration) {
        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggle = new ToggleApi(config.toggle.token, config.toggle.workspace);

        const tickspotClients = new Map((await Promise.all(config.tickspot.clients.map(([id]) => tickspot.getClient(id)))).map(client => [client.id.toString(), client]));
        const toggleClients = await toggle.getClients();
        const tickspotProjects = new Map((await tickspot.getProjects()).map(project => [project.id.toString(), project]));

        for (const [clientId, projectIds] of config.tickspot.clients) {
            const client = tickspotClients.get(clientId)!;
            const projects = projectIds.map(id => tickspotProjects.get(id)!);

            let toggleClient = toggleClients.find(c => c.name === client.name);

            if(!toggleClient) {
                continue;
            }

            console.log(Colors.bold('Client Project'), client.name)

            for (const project of projects) {               
                const tickspotTasks = await tickspot.getProjectTasks(project.id);
                const toggleProjects = (await toggle.getClientProjects(toggleClient.id)) || [];

                for (const tickspotTask of tickspotTasks) {
                    const toggleProjectName = `${project.name} // ${tickspotTask.name}`;
                    let toggleProject = toggleProjects.find(p => p.name === toggleProjectName);
                    if (toggleProject) {
                        await toggle.deleteProject(toggleProject.id);
                        console.log(' ', Colors.green('X'), toggleProjectName)
                    } else {
                        console.log(' ', Colors.red('?'), toggleProjectName)
                    }
                }
            }

            console.log();
            if(toggleClient.notes && toggleClient.notes.startsWith('@Tikkle')) {
                await toggle.deleteClient(toggleClient.id);
                console.log(' ', Colors.green('X'), Colors.bold('Client'), toggleClient.name)
            } else {
                console.log(' ', Colors.yellow('↷'), Colors.bold('Client'), toggleClient.name)
            }
        }
    }
}