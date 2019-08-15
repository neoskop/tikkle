import * as Colors from 'colors/safe';
import { Argv } from 'yargs';

import { TickspotApi } from '../apis/tickspot.api';
import { TogglApi } from '../apis/toggl.api';
import { Configuration, IConfiguration } from '../configuration';
import { ICommand } from './interface';

export class Purge implements ICommand {
    readonly command = 'purge';
    readonly description = 'Purge all Tikkle entries in Toggl';

    constructor(protected readonly config: Configuration) { }

    declareArguments(args: Argv<{}>): Argv {
        return args;
    }

    async run(_args: {}, config: IConfiguration) {
        const tickspot = new TickspotApi(config.tickspot.role, config.tickspot.username);
        const toggl = new TogglApi(config.toggl.token, config.toggl.workspace);

        const tickspotClients = new Map((await Promise.all(config.tickspot.clients.map(([id]) => tickspot.getClient(id)))).map(client => [client.id.toString(), client]));
        const togglClients = await toggl.getClients();
        const tickspotProjects = new Map((await tickspot.getProjects()).map(project => [project.id.toString(), project]));

        for (const [clientId, projectIds] of config.tickspot.clients) {
            const client = tickspotClients.get(clientId)!;
            const projects = projectIds.map(id => tickspotProjects.get(id)!);

            let togglClient = togglClients.find(c => c.name === client.name);

            if(!togglClient) {
                continue;
            }

            console.log(Colors.bold('Client Project'), client.name)

            for (const project of projects) {               
                const tickspotTasks = await tickspot.getProjectTasks(project.id);
                const togglProjects = (await toggl.getClientProjects(togglClient.id)) || [];

                for (const tickspotTask of tickspotTasks) {
                    const togglProjectName = `${project.name} // ${tickspotTask.name}`;
                    let togglProject = togglProjects.find(p => p.name === togglProjectName);
                    if (togglProject) {
                        await toggl.deleteProject(togglProject.id);
                        console.log(' ', Colors.green('X'), togglProjectName)
                    } else {
                        console.log(' ', Colors.red('?'), togglProjectName)
                    }
                }
            }

            console.log();
            if(togglClient.notes && togglClient.notes.startsWith('@Tikkle')) {
                await toggl.deleteClient(togglClient.id);
                console.log(' ', Colors.green('X'), Colors.bold('Client'), togglClient.name)
            } else {
                console.log(' ', Colors.yellow('↷'), Colors.bold('Client'), togglClient.name)
            }
        }
    }
}